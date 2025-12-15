/**
 * Property-Based Tests for Medical Expense People Grouping
 * Using fast-check library for property-based testing
 */

const fc = require('fast-check');
const expenseService = require('./expenseService');
const peopleService = require('./peopleService');
const expensePeopleRepository = require('../repositories/expensePeopleRepository');
const { getDatabase } = require('../database/db');

describe('ExpenseService - Property-Based Tests for People Grouping', () => {
  let db;

  // Helper function to clean up test data in correct order (associations first, then expenses, then people)
  const cleanupTestData = async () => {
    // Delete expense_people associations for test people first
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM expense_people WHERE person_id IN (
        SELECT id FROM people WHERE name LIKE "PBT_Person_%" OR name LIKE "PBT_Tax_Person_%" OR name LIKE "PBT_Mixed_Person_%"
      )`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // Also delete associations for test expenses
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM expense_people WHERE expense_id IN (
        SELECT id FROM expenses WHERE place LIKE "PBT_PEOPLE_%" OR place LIKE "PBT_TAX_%" OR place LIKE "PBT_MIXED_%"
      )`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // Delete expenses
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_PEOPLE_%" OR place LIKE "PBT_TAX_%" OR place LIKE "PBT_MIXED_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // Delete people
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM people WHERE name LIKE "PBT_Person_%" OR name LIKE "PBT_Tax_Person_%" OR name LIKE "PBT_Mixed_Person_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };

  beforeAll(async () => {
    db = await getDatabase();
    // Clean up any leftover test data from previous runs
    await cleanupTestData();
  });

  beforeEach(async () => {
    // Clean up test data before each test to ensure isolation
    await cleanupTestData();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await cleanupTestData();
  });

  /**
   * Feature: medical-expense-people-tracking, Property 7: Person-grouped expense aggregation
   * Validates: Requirements 3.2
   * 
   * For any set of medical expenses with people associations, grouping by person should 
   * correctly sum amounts per person per provider
   */
  test('Property 7: Person-grouped expense aggregation - correct sums per person per provider', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random year
        fc.integer({ min: 2020, max: 2030 }),
        // Generate 2-5 people
        fc.integer({ min: 2, max: 5 }),
        // Generate 3-10 medical expenses
        fc.integer({ min: 3, max: 10 }),
        async (year, numPeople, numExpenses) => {
          // Clean up any existing test data for this iteration
          await cleanupTestData();
          
          // Create test people
          const createdPeople = [];
          for (let i = 0; i < numPeople; i++) {
            const person = await peopleService.createPerson(`PBT_Person_${i}`, null);
            createdPeople.push(person);
          }
          
          // Create medical expenses with people associations
          const createdExpenses = [];
          const expectedPersonTotals = {}; // Track expected totals per person per provider
          
          for (let i = 0; i < numExpenses; i++) {
            // Generate random month (1-12) and day (1-28)
            const month = Math.floor(Math.random() * 12) + 1;
            const day = Math.floor(Math.random() * 28) + 1;
            const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Generate random amount
            const amount = parseFloat((Math.random() * 500 + 10).toFixed(2));
            
            // Random provider
            const providers = ['PBT_PEOPLE_Hospital_A', 'PBT_PEOPLE_Clinic_B', 'PBT_PEOPLE_Pharmacy_C'];
            const provider = providers[i % providers.length];
            
            const expense = {
              date,
              place: provider,
              notes: `Test medical expense ${i}`,
              amount,
              type: 'Tax - Medical',
              method: 'Cash'
            };
            
            const created = await expenseService.createExpense(expense);
            
            // Randomly assign to 1-3 people with allocations
            const numAssignedPeople = Math.floor(Math.random() * Math.min(3, numPeople)) + 1;
            const assignedPeople = [];
            const shuffledPeople = [...createdPeople].sort(() => Math.random() - 0.5);
            
            let remainingAmount = amount;
            for (let j = 0; j < numAssignedPeople; j++) {
              const person = shuffledPeople[j];
              let allocatedAmount;
              
              if (j === numAssignedPeople - 1) {
                // Last person gets remaining amount
                allocatedAmount = remainingAmount;
              } else {
                // Random allocation (10-80% of remaining)
                const percentage = Math.random() * 0.7 + 0.1; // 10-80%
                allocatedAmount = parseFloat((remainingAmount * percentage).toFixed(2));
                remainingAmount -= allocatedAmount;
              }
              
              assignedPeople.push({
                personId: person.id,
                amount: allocatedAmount
              });
              
              // Track expected totals
              if (!expectedPersonTotals[person.id]) {
                expectedPersonTotals[person.id] = {};
              }
              if (!expectedPersonTotals[person.id][provider]) {
                expectedPersonTotals[person.id][provider] = 0;
              }
              expectedPersonTotals[person.id][provider] += allocatedAmount;
            }
            
            // Create expense-people associations
            await expensePeopleRepository.createAssociations(created.id, assignedPeople);
            
            createdExpenses.push({
              ...created,
              assignedPeople
            });
          }
          
          // Get tax deductible summary with people grouping
          const summary = await expenseService.getTaxDeductibleWithPeople(year);
          
          // Property 1: All created people should appear in groupedByPerson if they have expenses
          const peopleWithExpenses = Object.keys(expectedPersonTotals).map(id => parseInt(id));
          for (const personId of peopleWithExpenses) {
            expect(summary.groupedByPerson[personId]).toBeDefined();
            expect(summary.groupedByPerson[personId].personId).toBe(personId);
          }
          
          // Property 2: Provider totals should match expected totals
          for (const personId of peopleWithExpenses) {
            const personGroup = summary.groupedByPerson[personId];
            const expectedProviders = expectedPersonTotals[personId];
            
            for (const providerName of Object.keys(expectedProviders)) {
              const providerGroup = personGroup.providers.find(p => p.providerName === providerName);
              expect(providerGroup).toBeDefined();
              expect(providerGroup.total).toBeCloseTo(expectedProviders[providerName], 2);
            }
          }
          
          // Property 3: Person totals should equal sum of their provider totals
          for (const personId of peopleWithExpenses) {
            const personGroup = summary.groupedByPerson[personId];
            const expectedPersonTotal = Object.values(expectedPersonTotals[personId])
              .reduce((sum, amount) => sum + amount, 0);
            
            expect(personGroup.total).toBeCloseTo(expectedPersonTotal, 2);
            
            // Also verify it matches the sum of provider totals
            const calculatedTotal = personGroup.providers.reduce((sum, p) => sum + p.total, 0);
            expect(personGroup.total).toBeCloseTo(calculatedTotal, 2);
          }
          
          // Property 4: Each expense should appear in exactly one provider group per assigned person
          for (const expense of createdExpenses) {
            for (const assignment of expense.assignedPeople) {
              const personGroup = summary.groupedByPerson[assignment.personId];
              expect(personGroup).toBeDefined();
              
              const providerGroup = personGroup.providers.find(p => p.providerName === expense.place);
              expect(providerGroup).toBeDefined();
              
              const expenseInGroup = providerGroup.expenses.find(e => e.id === expense.id);
              expect(expenseInGroup).toBeDefined();
              expect(expenseInGroup.allocatedAmount).toBeCloseTo(assignment.amount, 2);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000); // Increased timeout for multiple database operations

  /**
   * Feature: medical-expense-people-tracking, Property 8: Tax summary calculation accuracy
   * Validates: Requirements 3.5
   * 
   * For any collection of medical expenses with people associations, per-person totals 
   * should equal the sum of that person's allocated amounts
   */
  test('Property 8: Tax summary calculation accuracy - per-person totals match allocated amounts', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random year
        fc.integer({ min: 2020, max: 2030 }),
        // Generate 2-4 people
        fc.integer({ min: 2, max: 4 }),
        // Generate 5-15 medical expenses
        fc.integer({ min: 5, max: 15 }),
        async (year, numPeople, numExpenses) => {
          // Clean up any existing test data for this iteration
          await cleanupTestData();
          
          // Create test people
          const createdPeople = [];
          for (let i = 0; i < numPeople; i++) {
            const person = await peopleService.createPerson(`PBT_Tax_Person_${i}`, null);
            createdPeople.push(person);
          }
          
          // Track expected totals per person
          const expectedPersonTotals = {};
          createdPeople.forEach(person => {
            expectedPersonTotals[person.id] = {
              medicalTotal: 0,
              donationTotal: 0,
              total: 0
            };
          });
          
          // Create medical and donation expenses with people associations
          const createdExpenses = [];
          
          for (let i = 0; i < numExpenses; i++) {
            // Generate random month (1-12) and day (1-28)
            const month = Math.floor(Math.random() * 12) + 1;
            const day = Math.floor(Math.random() * 28) + 1;
            const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Generate random amount
            const amount = parseFloat((Math.random() * 300 + 5).toFixed(2));
            
            // Randomly choose between medical and donation
            const expenseType = Math.random() < 0.7 ? 'Tax - Medical' : 'Tax - Donation';
            
            const expense = {
              date,
              place: `PBT_TAX_Provider_${i % 3}`,
              notes: `Test ${expenseType} expense ${i}`,
              amount,
              type: expenseType,
              method: 'Cash'
            };
            
            const created = await expenseService.createExpense(expense);
            
            // Randomly assign to 1-2 people with allocations
            const numAssignedPeople = Math.floor(Math.random() * 2) + 1;
            const assignedPeople = [];
            const shuffledPeople = [...createdPeople].sort(() => Math.random() - 0.5);
            
            let remainingAmount = amount;
            for (let j = 0; j < numAssignedPeople; j++) {
              const person = shuffledPeople[j];
              let allocatedAmount;
              
              if (j === numAssignedPeople - 1) {
                // Last person gets remaining amount
                allocatedAmount = remainingAmount;
              } else {
                // Random allocation (20-80% of remaining)
                const percentage = Math.random() * 0.6 + 0.2; // 20-80%
                allocatedAmount = parseFloat((remainingAmount * percentage).toFixed(2));
                remainingAmount -= allocatedAmount;
              }
              
              assignedPeople.push({
                personId: person.id,
                amount: allocatedAmount
              });
              
              // Track expected totals
              if (expenseType === 'Tax - Medical') {
                expectedPersonTotals[person.id].medicalTotal += allocatedAmount;
              } else if (expenseType === 'Tax - Donation') {
                expectedPersonTotals[person.id].donationTotal += allocatedAmount;
              }
              expectedPersonTotals[person.id].total += allocatedAmount;
            }
            
            // Create expense-people associations
            await expensePeopleRepository.createAssociations(created.id, assignedPeople);
            
            createdExpenses.push({
              ...created,
              assignedPeople
            });
          }
          
          // Get tax deductible summary with people grouping
          const summary = await expenseService.getTaxDeductibleWithPeople(year);
          
          // Property 1: Person totals should match expected totals
          for (const personId of Object.keys(expectedPersonTotals)) {
            const personIdNum = parseInt(personId);
            const expectedTotals = expectedPersonTotals[personId];
            
            if (expectedTotals.total > 0) {
              // Person should appear in personTotals
              expect(summary.personTotals[personIdNum]).toBeDefined();
              const actualTotals = summary.personTotals[personIdNum];
              
              expect(actualTotals.medicalTotal).toBeCloseTo(expectedTotals.medicalTotal, 2);
              expect(actualTotals.donationTotal).toBeCloseTo(expectedTotals.donationTotal, 2);
              expect(actualTotals.total).toBeCloseTo(expectedTotals.total, 2);
              
              // Property 2: Total should equal sum of medical and donation totals
              const calculatedTotal = actualTotals.medicalTotal + actualTotals.donationTotal;
              expect(actualTotals.total).toBeCloseTo(calculatedTotal, 2);
            }
          }
          
          // Property 3: Sum of all person totals should equal sum of all allocated amounts
          const totalAllocatedAmount = createdExpenses.reduce((sum, expense) => {
            return sum + expense.assignedPeople.reduce((expSum, person) => expSum + person.amount, 0);
          }, 0);
          
          // Only sum totals for our test people
          const testPeopleIds = Object.keys(expectedPersonTotals).map(id => parseInt(id));
          const totalFromPersonTotals = testPeopleIds.reduce((sum, personId) => {
            if (summary.personTotals[personId]) {
              return sum + summary.personTotals[personId].total;
            }
            return sum;
          }, 0);
          
          expect(totalFromPersonTotals).toBeCloseTo(totalAllocatedAmount, 2);
          
          // Property 4: Medical and donation totals should be consistent
          const totalMedicalFromPersons = testPeopleIds.reduce((sum, personId) => {
            if (summary.personTotals[personId]) {
              return sum + summary.personTotals[personId].medicalTotal;
            }
            return sum;
          }, 0);
          const totalDonationFromPersons = testPeopleIds.reduce((sum, personId) => {
            if (summary.personTotals[personId]) {
              return sum + summary.personTotals[personId].donationTotal;
            }
            return sum;
          }, 0);
          
          // Calculate expected totals from created expenses
          const expectedMedicalTotal = createdExpenses
            .filter(exp => exp.type === 'Tax - Medical')
            .reduce((sum, exp) => sum + exp.assignedPeople.reduce((expSum, p) => expSum + p.amount, 0), 0);
          const expectedDonationTotal = createdExpenses
            .filter(exp => exp.type === 'Tax - Donation')
            .reduce((sum, exp) => sum + exp.assignedPeople.reduce((expSum, p) => expSum + p.amount, 0), 0);
          
          expect(totalMedicalFromPersons).toBeCloseTo(expectedMedicalTotal, 2);
          expect(totalDonationFromPersons).toBeCloseTo(expectedDonationTotal, 2);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000); // Increased timeout for multiple database operations

  /**
   * Feature: medical-expense-people-tracking, Property 10: Mixed data handling
   * Validates: Requirements 5.4, 5.5
   * 
   * For any combination of assigned and unassigned medical expenses, reports should 
   * correctly include both types and show unassigned expenses in appropriate sections
   */
  test('Property 10: Mixed data handling - correctly handles assigned and unassigned expenses', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random year
        fc.integer({ min: 2020, max: 2030 }),
        // Generate 2-3 people
        fc.integer({ min: 2, max: 3 }),
        // Generate 3-8 assigned medical expenses
        fc.integer({ min: 3, max: 8 }),
        // Generate 2-5 unassigned medical expenses
        fc.integer({ min: 2, max: 5 }),
        async (year, numPeople, numAssignedExpenses, numUnassignedExpenses) => {
          // Clean up any existing test data for this iteration
          await cleanupTestData();
          
          // Create test people
          const createdPeople = [];
          for (let i = 0; i < numPeople; i++) {
            const person = await peopleService.createPerson(`PBT_Mixed_Person_${i}`, null);
            createdPeople.push(person);
          }
          
          // Create assigned medical expenses (with people associations)
          const assignedExpenses = [];
          let totalAssignedAmount = 0;
          
          for (let i = 0; i < numAssignedExpenses; i++) {
            // Generate random month (1-12) and day (1-28)
            const month = Math.floor(Math.random() * 12) + 1;
            const day = Math.floor(Math.random() * 28) + 1;
            const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Generate random amount
            const amount = parseFloat((Math.random() * 200 + 10).toFixed(2));
            
            const expense = {
              date,
              place: `PBT_MIXED_Assigned_Provider_${i % 2}`,
              notes: `Assigned medical expense ${i}`,
              amount,
              type: 'Tax - Medical',
              method: 'Cash'
            };
            
            const created = await expenseService.createExpense(expense);
            
            // Assign to 1-2 people
            const numAssignedPeople = Math.floor(Math.random() * 2) + 1;
            const assignedPeople = [];
            const shuffledPeople = [...createdPeople].sort(() => Math.random() - 0.5);
            
            let remainingAmount = amount;
            for (let j = 0; j < numAssignedPeople; j++) {
              const person = shuffledPeople[j];
              let allocatedAmount;
              
              if (j === numAssignedPeople - 1) {
                // Last person gets remaining amount
                allocatedAmount = remainingAmount;
              } else {
                // Random allocation (30-70% of remaining)
                const percentage = Math.random() * 0.4 + 0.3; // 30-70%
                allocatedAmount = parseFloat((remainingAmount * percentage).toFixed(2));
                remainingAmount -= allocatedAmount;
              }
              
              assignedPeople.push({
                personId: person.id,
                amount: allocatedAmount
              });
            }
            
            // Create expense-people associations
            await expensePeopleRepository.createAssociations(created.id, assignedPeople);
            
            assignedExpenses.push({
              ...created,
              assignedPeople
            });
            
            totalAssignedAmount += amount;
          }
          
          // Create unassigned medical expenses (without people associations)
          const unassignedExpenses = [];
          let totalUnassignedAmount = 0;
          
          for (let i = 0; i < numUnassignedExpenses; i++) {
            // Generate random month (1-12) and day (1-28)
            const month = Math.floor(Math.random() * 12) + 1;
            const day = Math.floor(Math.random() * 28) + 1;
            const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Generate random amount
            const amount = parseFloat((Math.random() * 150 + 5).toFixed(2));
            
            const expense = {
              date,
              place: `PBT_MIXED_Unassigned_Provider_${i % 2}`,
              notes: `Unassigned medical expense ${i}`,
              amount,
              type: 'Tax - Medical',
              method: 'Cash'
            };
            
            const created = await expenseService.createExpense(expense);
            unassignedExpenses.push(created);
            totalUnassignedAmount += amount;
          }
          
          // Get tax deductible summary with people grouping
          const summary = await expenseService.getTaxDeductibleWithPeople(year);
          
          // Property 1: All assigned expenses should appear in groupedByPerson
          // Only check for people who have our test expenses
          const testPeopleIds = new Set();
          assignedExpenses.forEach(expense => {
            expense.assignedPeople.forEach(assignment => {
              testPeopleIds.add(assignment.personId);
            });
          });
          
          let totalFoundInGroups = 0;
          for (const expense of assignedExpenses) {
            for (const assignment of expense.assignedPeople) {
              const personGroup = summary.groupedByPerson[assignment.personId];
              expect(personGroup).toBeDefined();
              
              // Find the expense in the person's provider groups
              let foundInProvider = false;
              for (const provider of personGroup.providers) {
                const expenseInProvider = provider.expenses.find(e => e.id === expense.id);
                if (expenseInProvider) {
                  expect(expenseInProvider.allocatedAmount).toBeCloseTo(assignment.amount, 2);
                  totalFoundInGroups += assignment.amount;
                  foundInProvider = true;
                  break;
                }
              }
              expect(foundInProvider).toBe(true);
            }
          }
          
          // Property 2: All unassigned expenses should appear in unassignedExpenses
          // Filter to only count test-specific unassigned expenses (place starts with PBT_MIXED_Unassigned_)
          let testUnassignedCount = 0;
          let testUnassignedTotal = 0;
          for (const provider of summary.unassignedExpenses.providers) {
            for (const expense of provider.expenses) {
              if (expense.place && expense.place.startsWith('PBT_MIXED_Unassigned_')) {
                testUnassignedCount++;
                testUnassignedTotal += expense.amount;
              }
            }
          }
          expect(testUnassignedCount).toBe(numUnassignedExpenses);
          expect(testUnassignedTotal).toBeCloseTo(totalUnassignedAmount, 2);
          
          let totalFoundUnassigned = 0;
          for (const provider of summary.unassignedExpenses.providers) {
            for (const expense of provider.expenses) {
              if (expense.place && expense.place.startsWith('PBT_MIXED_Unassigned_')) {
                const originalExpense = unassignedExpenses.find(e => e.id === expense.id);
                expect(originalExpense).toBeDefined();
                totalFoundUnassigned += expense.amount;
              }
            }
          }
          expect(totalFoundUnassigned).toBeCloseTo(totalUnassignedAmount, 2);
          
          // Property 3: No expense should appear in both assigned and unassigned sections
          const assignedExpenseIds = new Set();
          Object.values(summary.groupedByPerson).forEach(personGroup => {
            personGroup.providers.forEach(provider => {
              provider.expenses.forEach(expense => {
                assignedExpenseIds.add(expense.id);
              });
            });
          });
          
          const unassignedExpenseIds = new Set();
          summary.unassignedExpenses.providers.forEach(provider => {
            provider.expenses.forEach(expense => {
              unassignedExpenseIds.add(expense.id);
            });
          });
          
          // Check for no overlap
          const intersection = [...assignedExpenseIds].filter(id => unassignedExpenseIds.has(id));
          expect(intersection.length).toBe(0);
          
          // Property 4: Total medical amount should equal sum of assigned + unassigned
          // Calculate totals only from our test expenses
          let totalFromPersonGroups = 0;
          Object.values(summary.groupedByPerson).forEach(personGroup => {
            personGroup.providers.forEach(provider => {
              provider.expenses.forEach(expense => {
                if (expense.place && expense.place.startsWith('PBT_MIXED_')) {
                  totalFromPersonGroups += expense.allocatedAmount;
                }
              });
            });
          });
          
          let totalFromUnassigned = 0;
          summary.unassignedExpenses.providers.forEach(provider => {
            provider.expenses.forEach(expense => {
              if (expense.place && expense.place.startsWith('PBT_MIXED_')) {
                totalFromUnassigned += expense.amount;
              }
            });
          });
          
          const expectedTotal = totalAssignedAmount + totalUnassignedAmount;
          const actualTotal = totalFromPersonGroups + totalFromUnassigned;
          
          expect(actualTotal).toBeCloseTo(expectedTotal, 2);
          
          // Property 5: Medical total in summary should include both assigned and unassigned
          // Filter to only our test expenses
          const testMedicalExpenses = summary.expenses.medical.filter(e => 
            e.place && e.place.startsWith('PBT_MIXED_')
          );
          const testMedicalTotal = testMedicalExpenses.reduce((sum, e) => sum + e.amount, 0);
          
          expect(testMedicalTotal).toBeCloseTo(expectedTotal, 2);
          
          // Property 6: Verify that the person groups only contain our test expenses
          const allPersonGroupExpenses = [];
          // Only check person groups for our test people
          testPeopleIds.forEach(personId => {
            if (summary.groupedByPerson[personId]) {
              const personGroup = summary.groupedByPerson[personId];
              personGroup.providers.forEach(provider => {
                provider.expenses.forEach(expense => {
                  if (expense.place && expense.place.startsWith('PBT_MIXED_')) {
                    allPersonGroupExpenses.push(expense);
                  }
                });
              });
            }
          });
          
          // Verify that all assigned expenses are accounted for in person groups
          // Note: Each expense may appear multiple times (once per person assignment)
          const uniqueExpenseIds = new Set(allPersonGroupExpenses.map(e => e.id));
          expect(uniqueExpenseIds.size).toBe(assignedExpenses.length);
          
          // Property 7: Verify unassigned expenses only contain our test data
          const allUnassignedExpenses = [];
          summary.unassignedExpenses.providers.forEach(provider => {
            provider.expenses.forEach(expense => {
              if (expense.place && expense.place.startsWith('PBT_MIXED_')) {
                allUnassignedExpenses.push(expense);
              }
            });
          });
          
          expect(allUnassignedExpenses.length).toBe(unassignedExpenses.length);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000); // Increased timeout for multiple database operations
});