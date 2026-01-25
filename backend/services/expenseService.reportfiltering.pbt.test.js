const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const expenseRepository = require('../repositories/expenseRepository');
const expensePeopleRepository = require('../repositories/expensePeopleRepository');
const peopleRepository = require('../repositories/peopleRepository');
const db = require('../database/db');
const { PAYMENT_METHODS } = require('../utils/constants');

/**
 * Property-Based Tests for Expense Service - Report Filtering
 * **Feature: medical-expense-people-tracking, Property 13: Report filtering accuracy**
 * **Validates: Requirements 6.4**
 */

describe('ExpenseService - Report Filtering Properties', () => {
  let testPeople = [];
  let testExpenses = [];
  
  // Use a valid payment method from the constants
  const validPaymentMethod = PAYMENT_METHODS[0]; // 'Cash'

  beforeAll(async () => {
    // Ensure database is initialized
    await db.getDatabase();
  });

  beforeEach(async () => {
    // Clean up test data
    testPeople = [];
    testExpenses = [];
  });

  afterEach(async () => {
    // Clean up created test data
    for (const expense of testExpenses) {
      try {
        await expenseRepository.delete(expense.id);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    for (const person of testPeople) {
      try {
        await peopleRepository.delete(person.id);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Property 13: Report filtering accuracy', () => {
    test('For any tax report, grouped totals should only include expenses with people associations', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate number of assigned expenses (1-3)
          fc.integer({ min: 1, max: 3 }),
          // Generate number of unassigned expenses (1-3)
          fc.integer({ min: 1, max: 3 }),
          // Generate expense amounts (positive, 2 decimal places)
          fc.array(fc.integer({ min: 100, max: 5000 }).map(cents => cents / 100), { minLength: 6, maxLength: 6 }),
          async (numAssigned, numUnassigned, amounts) => {
            // Create a test person with unique name
            const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const person = await peopleRepository.create({
              name: `Test Person ${uniqueSuffix}`,
              date_of_birth: null
            });
            testPeople.push(person);

            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            const year = today.getFullYear();

            // Get baseline report before creating test expenses
            const baselineReport = await expenseService.getTaxDeductibleWithPeople(year);
            const baselineUnassignedTotal = baselineReport.unassignedExpenses?.total || 0;
            const baselineUnassignedCount = baselineReport.unassignedExpenses?.count || 0;
            const baselineMedicalTotal = baselineReport.medicalTotal || 0;

            let assignedTotal = 0;
            let unassignedTotal = 0;

            // Create assigned expenses
            for (let i = 0; i < numAssigned; i++) {
              const amount = amounts[i];
              const expense = await expenseService.createExpenseWithPeople(
                {
                  date: dateStr,
                  place: `Assigned Clinic ${i}`,
                  notes: null,
                  amount: amount,
                  type: 'Tax - Medical',
                  method: validPaymentMethod
                },
                [{ personId: person.id, amount: amount }]
              );
              testExpenses.push(expense);
              assignedTotal += amount;
            }

            // Create unassigned expenses
            for (let i = 0; i < numUnassigned; i++) {
              const amount = amounts[numAssigned + i];
              const expense = await expenseService.createExpense({
                date: dateStr,
                place: `Unassigned Clinic ${i}`,
                notes: null,
                amount: amount,
                type: 'Tax - Medical',
                method: validPaymentMethod
              });
              testExpenses.push(expense);
              unassignedTotal += amount;
            }

            // Get tax deductible report with people grouping
            const report = await expenseService.getTaxDeductibleWithPeople(year);

            // Verify person-grouped totals only include assigned expenses
            const personGroup = report.groupedByPerson[person.id];
            expect(personGroup).toBeDefined();
            
            // The person's total should equal the sum of assigned expenses
            expect(personGroup.total).toBeCloseTo(assignedTotal, 2);

            // Verify unassigned expenses increased by the expected amount
            const expectedUnassignedTotal = baselineUnassignedTotal + unassignedTotal;
            const expectedUnassignedCount = baselineUnassignedCount + numUnassigned;
            expect(report.unassignedExpenses.total).toBeCloseTo(expectedUnassignedTotal, 2);
            expect(report.unassignedExpenses.count).toBe(expectedUnassignedCount);

            // Verify the overall medical total increased by both assigned and unassigned
            const expectedMedicalTotal = baselineMedicalTotal + assignedTotal + unassignedTotal;
            expect(report.medicalTotal).toBeCloseTo(expectedMedicalTotal, 2);
          }
        ),
        pbtOptions()
      );
    });

    test('Filtered per-person totals exclude unassigned expenses', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate expense amounts for two people
          fc.integer({ min: 100, max: 5000 }).map(cents => cents / 100),
          fc.integer({ min: 100, max: 5000 }).map(cents => cents / 100),
          fc.integer({ min: 100, max: 5000 }).map(cents => cents / 100),
          async (amount1, amount2, unassignedAmount) => {
            // Create two test people with unique names
            const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const person1 = await peopleRepository.create({
              name: `Person One ${uniqueSuffix}`,
              date_of_birth: null
            });
            testPeople.push(person1);

            const person2 = await peopleRepository.create({
              name: `Person Two ${uniqueSuffix}`,
              date_of_birth: null
            });
            testPeople.push(person2);

            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            const year = today.getFullYear();

            // Get baseline report before creating test expenses
            const baselineReport = await expenseService.getTaxDeductibleWithPeople(year);
            const baselineMedicalTotal = baselineReport.medicalTotal || 0;

            // Create expense for person 1
            const expense1 = await expenseService.createExpenseWithPeople(
              {
                date: dateStr,
                place: 'Clinic A',
                notes: null,
                amount: amount1,
                type: 'Tax - Medical',
                method: validPaymentMethod
              },
              [{ personId: person1.id, amount: amount1 }]
            );
            testExpenses.push(expense1);

            // Create expense for person 2
            const expense2 = await expenseService.createExpenseWithPeople(
              {
                date: dateStr,
                place: 'Clinic B',
                notes: null,
                amount: amount2,
                type: 'Tax - Medical',
                method: validPaymentMethod
              },
              [{ personId: person2.id, amount: amount2 }]
            );
            testExpenses.push(expense2);

            // Create unassigned expense
            const unassignedExpense = await expenseService.createExpense({
              date: dateStr,
              place: 'Clinic C',
              notes: null,
              amount: unassignedAmount,
              type: 'Tax - Medical',
              method: validPaymentMethod
            });
            testExpenses.push(unassignedExpense);

            // Get tax deductible report with people grouping
            const report = await expenseService.getTaxDeductibleWithPeople(year);

            // Verify person totals are accurate and don't include unassigned
            const personTotals = report.personTotals;
            
            expect(personTotals[person1.id]).toBeDefined();
            expect(personTotals[person1.id].medicalTotal).toBeCloseTo(amount1, 2);
            
            expect(personTotals[person2.id]).toBeDefined();
            expect(personTotals[person2.id].medicalTotal).toBeCloseTo(amount2, 2);

            // The newly created test people's totals should only include their assigned amounts
            // (not affected by other existing data in the database)
            const testPersonTotals = personTotals[person1.id].medicalTotal + personTotals[person2.id].medicalTotal;
            expect(testPersonTotals).toBeCloseTo(amount1 + amount2, 2);
            
            // Overall medical total should include baseline plus all new expenses
            const expectedMedicalTotal = baselineMedicalTotal + amount1 + amount2 + unassignedAmount;
            expect(report.medicalTotal).toBeCloseTo(expectedMedicalTotal, 2);
          }
        ),
        pbtOptions()
      );
    });

    test('Multi-person expense allocations are correctly reflected in per-person totals', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate total expense amount
          fc.integer({ min: 200, max: 10000 }).filter(cents => cents % 2 === 0).map(cents => cents / 100),
          async (totalAmount) => {
            // Create two test people with unique names
            const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const person1 = await peopleRepository.create({
              name: `Person A ${uniqueSuffix}`,
              date_of_birth: null
            });
            testPeople.push(person1);

            const person2 = await peopleRepository.create({
              name: `Person B ${uniqueSuffix}`,
              date_of_birth: null
            });
            testPeople.push(person2);

            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            const year = today.getFullYear();

            // Split amount between two people
            const amount1 = Math.round(totalAmount * 60) / 100; // 60%
            const amount2 = Math.round((totalAmount - amount1) * 100) / 100; // 40%

            // Create multi-person expense
            const expense = await expenseService.createExpenseWithPeople(
              {
                date: dateStr,
                place: 'Shared Clinic',
                notes: null,
                amount: totalAmount,
                type: 'Tax - Medical',
                method: validPaymentMethod
              },
              [
                { personId: person1.id, amount: amount1 },
                { personId: person2.id, amount: amount2 }
              ]
            );
            testExpenses.push(expense);

            // Get tax deductible report with people grouping
            const report = await expenseService.getTaxDeductibleWithPeople(year);

            // Verify each person's total reflects their allocation
            const personTotals = report.personTotals;
            
            expect(personTotals[person1.id]).toBeDefined();
            expect(personTotals[person1.id].medicalTotal).toBeCloseTo(amount1, 2);
            
            expect(personTotals[person2.id]).toBeDefined();
            expect(personTotals[person2.id].medicalTotal).toBeCloseTo(amount2, 2);

            // Sum of allocations should equal total expense
            const sumOfAllocations = personTotals[person1.id].medicalTotal + 
                                     personTotals[person2.id].medicalTotal;
            expect(sumOfAllocations).toBeCloseTo(totalAmount, 2);
          }
        ),
        pbtOptions()
      );
    });
  });
});
