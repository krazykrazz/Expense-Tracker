const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const peopleService = require('./peopleService');

/**
 * Property-Based Tests for Unassigned Expense Identification
 * 
 * **Feature: medical-expense-people-tracking, Property 11: Unassigned expense identification**
 * **Validates: Requirements 6.1, 6.5**
 * 
 * Tests that medical expenses without people associations are clearly identified
 * as unassigned in person-grouped views and expense lists.
 */

describe('ExpenseService Unassigned Expense Identification Property Tests', () => {
  jest.setTimeout(120000); // 120 second timeout for complex PBT with database operations

  /**
   * Property 11: Unassigned expense identification
   * **Validates: Requirements 6.1, 6.5**
   * 
   * For any medical expense without people associations, the system should clearly 
   * indicate its unassigned status in person-grouped views
   */
  test('Property 11: Unassigned expense identification - clearly indicates unassigned status', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test year
        fc.integer({ min: 2020, max: 2030 }),
        // Generate number of unassigned medical expenses (2-6)
        fc.integer({ min: 2, max: 6 }),
        // Generate number of assigned medical expenses (1-4)
        fc.integer({ min: 1, max: 4 }),
        async (year, numUnassigned, numAssigned) => {
          // Clean up any existing test data for this iteration
          await new Promise((resolve, reject) => {
            const db = require('../database/db').getDatabase();
            db.then(database => {
              database.run(
                "DELETE FROM expenses WHERE place LIKE 'PBT_UNASSIGNED_%'",
                [],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            }).catch(reject);
          });

          // Clean up any test people
          await new Promise((resolve, reject) => {
            const db = require('../database/db').getDatabase();
            db.then(database => {
              database.run(
                "DELETE FROM people WHERE name LIKE 'PBT_UNASSIGNED_%'",
                [],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            }).catch(reject);
          });

          // Create test people for assigned expenses
          const testPeople = [];
          for (let i = 0; i < Math.min(numAssigned, 3); i++) {
            const person = await peopleService.createPerson(
              `PBT_UNASSIGNED_Person_${i}`,
              `199${i}-01-01`
            );
            testPeople.push(person);
          }

          // Create unassigned medical expenses (without people associations)
          const unassignedExpenses = [];
          let totalUnassignedAmount = 0;

          for (let i = 0; i < numUnassigned; i++) {
            // Generate random month (1-12) and day (1-28)
            const month = Math.floor(Math.random() * 12) + 1;
            const day = Math.floor(Math.random() * 28) + 1;
            const date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            
            // Generate random amount between $20 and $300
            const amount = Math.round((Math.random() * 280 + 20) * 100) / 100;
            
            const expense = {
              date,
              place: `PBT_UNASSIGNED_Provider_${i % 2}`, // Use 2 different providers
              notes: `Unassigned medical expense ${i}`,
              amount,
              type: 'Tax - Medical',
              method: 'VISA'
            };
            
            // Create expense WITHOUT people associations
            const created = await expenseService.createExpense(expense);
            unassignedExpenses.push(created);
            totalUnassignedAmount += amount;
          }

          // Create assigned medical expenses (with people associations)
          const assignedExpenses = [];
          let totalAssignedAmount = 0;

          for (let i = 0; i < numAssigned && testPeople.length > 0; i++) {
            // Generate random month (1-12) and day (1-28)
            const month = Math.floor(Math.random() * 12) + 1;
            const day = Math.floor(Math.random() * 28) + 1;
            const date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            
            // Generate random amount between $30 and $400
            const amount = Math.round((Math.random() * 370 + 30) * 100) / 100;
            
            const expense = {
              date,
              place: `PBT_UNASSIGNED_Assigned_Provider_${i % 2}`,
              notes: `Assigned medical expense ${i}`,
              amount,
              type: 'Tax - Medical',
              method: 'VISA'
            };
            
            // Create expense WITH people association
            const person = testPeople[i % testPeople.length];
            const created = await expenseService.createExpenseWithPeople(
              expense,
              [{ personId: person.id, amount: amount }]
            );
            assignedExpenses.push(created);
            totalAssignedAmount += amount;
          }

          // Get people-grouped tax deductible summary
          const summary = await expenseService.getTaxDeductibleWithPeople(year);

          // Property 1: All unassigned expenses should appear in unassignedExpenses section
          let foundUnassignedAmount = 0;
          let foundUnassignedCount = 0;
          
          for (const provider of summary.unassignedExpenses.providers) {
            for (const expense of provider.expenses) {
              if (expense.place && expense.place.startsWith('PBT_UNASSIGNED_Provider_')) {
                foundUnassignedAmount += expense.amount;
                foundUnassignedCount++;
              }
            }
          }
          
          expect(foundUnassignedCount).toBe(numUnassigned);
          expect(foundUnassignedAmount).toBeCloseTo(totalUnassignedAmount, 2);

          // Property 2: Unassigned expenses should NOT appear in person groups
          let unassignedInPersonGroups = 0;
          Object.values(summary.groupedByPerson).forEach(personGroup => {
            personGroup.providers.forEach(provider => {
              provider.expenses.forEach(expense => {
                if (expense.place && expense.place.startsWith('PBT_UNASSIGNED_Provider_')) {
                  unassignedInPersonGroups++;
                }
              });
            });
          });
          
          expect(unassignedInPersonGroups).toBe(0);

          // Property 3: Assigned expenses should NOT appear in unassigned section
          let assignedInUnassigned = 0;
          for (const provider of summary.unassignedExpenses.providers) {
            for (const expense of provider.expenses) {
              if (expense.place && expense.place.startsWith('PBT_UNASSIGNED_Assigned_Provider_')) {
                assignedInUnassigned++;
              }
            }
          }
          
          expect(assignedInUnassigned).toBe(0);

          // Property 4: Assigned expenses should appear in person groups
          let foundAssignedAmount = 0;
          let foundAssignedCount = 0;
          
          Object.values(summary.groupedByPerson).forEach(personGroup => {
            personGroup.providers.forEach(provider => {
              provider.expenses.forEach(expense => {
                if (expense.place && expense.place.startsWith('PBT_UNASSIGNED_Assigned_Provider_')) {
                  foundAssignedAmount += expense.allocatedAmount;
                  foundAssignedCount++;
                }
              });
            });
          });
          
          expect(foundAssignedCount).toBe(numAssigned);
          expect(foundAssignedAmount).toBeCloseTo(totalAssignedAmount, 2);

          // Property 5: Unassigned section should have correct metadata
          expect(summary.unassignedExpenses.count).toBeGreaterThanOrEqual(numUnassigned);
          expect(summary.unassignedExpenses.total).toBeGreaterThanOrEqual(totalUnassignedAmount - 0.01);

          // Property 6: Total medical amount should include both assigned and unassigned
          const testMedicalExpenses = summary.expenses.medical.filter(e => 
            e.place && (
              e.place.startsWith('PBT_UNASSIGNED_Provider_') || 
              e.place.startsWith('PBT_UNASSIGNED_Assigned_Provider_')
            )
          );
          
          expect(testMedicalExpenses.length).toBe(numUnassigned + numAssigned);
          
          const testMedicalTotal = testMedicalExpenses.reduce((sum, e) => sum + e.amount, 0);
          const expectedTotal = totalUnassignedAmount + totalAssignedAmount;
          expect(testMedicalTotal).toBeCloseTo(expectedTotal, 2);

          // Property 7: Unassigned expenses should be grouped by provider correctly
          const unassignedProviders = new Set();
          unassignedExpenses.forEach(expense => {
            unassignedProviders.add(expense.place);
          });
          
          const foundProviders = new Set();
          summary.unassignedExpenses.providers.forEach(provider => {
            provider.expenses.forEach(expense => {
              if (expense.place && expense.place.startsWith('PBT_UNASSIGNED_Provider_')) {
                foundProviders.add(expense.place);
              }
            });
          });
          
          // All unassigned providers should be represented
          unassignedProviders.forEach(provider => {
            expect(foundProviders.has(provider)).toBe(true);
          });

          // Clean up test data
          for (const expense of unassignedExpenses) {
            await expenseService.deleteExpense(expense.id);
          }
          for (const expense of assignedExpenses) {
            await expenseService.deleteExpense(expense.id);
          }
          for (const person of testPeople) {
            await peopleService.deletePerson(person.id);
          }
        }
      ),
      pbtOptions()
    );
  });
});