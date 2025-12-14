const fc = require('fast-check');
const expenseService = require('./expenseService');
const peopleService = require('./peopleService');

/**
 * Property-Based Tests for Expense Service Backward Compatibility
 * 
 * **Feature: medical-expense-people-tracking, Property 9: Backward compatibility preservation**
 * **Validates: Requirements 5.1, 5.3**
 * 
 * Tests that existing medical expenses without people associations remain functional
 * after the people tracking feature is deployed.
 */

describe('ExpenseService Backward Compatibility Property Tests', () => {
  jest.setTimeout(30000); // 30 second timeout
  /**
   * Property 9: Backward compatibility preservation
   * **Validates: Requirements 5.1, 5.3**
   * 
   * For any existing medical expense without people associations, the expense should 
   * remain displayable and editable after the feature deployment
   */
  test('Property 9: Backward compatibility preservation - existing expenses remain functional', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test year
        fc.integer({ min: 2020, max: 2030 }),
        // Generate number of existing medical expenses (2-5)
        fc.integer({ min: 2, max: 5 }),
        async (year, numExpenses) => {
          // Clean up any existing test data for this iteration
          await new Promise((resolve, reject) => {
            const db = require('../database/db').getDatabase();
            db.then(database => {
              database.run(
                "DELETE FROM expenses WHERE place LIKE 'PBT_BACKWARD_%'",
                [],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            }).catch(reject);
          });

          // Create existing medical expenses WITHOUT people associations
          // This simulates expenses that existed before the people tracking feature
          const existingExpenses = [];
          let totalAmount = 0;

          for (let i = 0; i < numExpenses; i++) {
            // Generate random month (1-12) and day (1-28)
            const month = Math.floor(Math.random() * 12) + 1;
            const day = Math.floor(Math.random() * 28) + 1;
            const date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            
            // Generate random amount between $10 and $500
            const amount = Math.round((Math.random() * 490 + 10) * 100) / 100;
            
            const expense = {
              date,
              place: `PBT_BACKWARD_Provider_${i % 3}`, // Use 3 different providers
              notes: `Existing medical expense ${i}`,
              amount,
              type: 'Tax - Medical',
              method: 'VISA'
            };
            
            // Create expense WITHOUT people associations (simulating pre-feature expenses)
            const created = await expenseService.createExpense(expense);
            existingExpenses.push(created);
            totalAmount += amount;
          }

          // Property 1: Existing expenses should remain displayable in regular tax summary
          const regularSummary = await expenseService.getTaxDeductibleSummary(year);
          
          // Filter to only our test expenses
          const testMedicalExpenses = regularSummary.expenses.medical.filter(e => 
            e.place && e.place.startsWith('PBT_BACKWARD_')
          );
          
          // All existing expenses should be present in regular summary
          expect(testMedicalExpenses.length).toBe(numExpenses);
          
          // Total should match
          const regularTotal = testMedicalExpenses.reduce((sum, e) => sum + e.amount, 0);
          expect(regularTotal).toBeCloseTo(totalAmount, 2);

          // Property 2: Existing expenses should appear as "Unassigned" in people-grouped view
          const peopleGroupedSummary = await expenseService.getTaxDeductibleWithPeople(year);
          
          // All existing expenses should appear in unassigned section
          let foundUnassignedAmount = 0;
          let foundUnassignedCount = 0;
          
          for (const provider of peopleGroupedSummary.unassignedExpenses.providers) {
            for (const expense of provider.expenses) {
              if (expense.place && expense.place.startsWith('PBT_BACKWARD_')) {
                foundUnassignedAmount += expense.amount;
                foundUnassignedCount++;
              }
            }
          }
          
          expect(foundUnassignedCount).toBe(numExpenses);
          expect(foundUnassignedAmount).toBeCloseTo(totalAmount, 2);

          // Property 3: Existing expenses should be editable (can add people retroactively)
          if (existingExpenses.length > 0) {
            const expenseToEdit = existingExpenses[0];
            
            // Create a test person
            const testPerson = await peopleService.createPerson('PBT_Test_Person', '1990-01-01');
            
            // Update the expense to add people association
            const updatedExpense = await expenseService.updateExpenseWithPeople(
              expenseToEdit.id,
              {
                date: expenseToEdit.date,
                place: expenseToEdit.place,
                notes: expenseToEdit.notes,
                amount: expenseToEdit.amount,
                type: expenseToEdit.type,
                method: 'VISA'
              },
              [{ personId: testPerson.id, amount: expenseToEdit.amount }]
            );
            
            // Should successfully update with people association
            expect(updatedExpense).toBeTruthy();
            expect(updatedExpense.people).toBeDefined();
            expect(updatedExpense.people.length).toBe(1);
            expect(updatedExpense.people[0].personId).toBe(testPerson.id);
            expect(updatedExpense.people[0].amount).toBeCloseTo(expenseToEdit.amount, 2);
            
            // Clean up test person
            await peopleService.deletePerson(testPerson.id);
          }

          // Property 4: Both assigned and unassigned expenses should be included in totals
          const testMedicalInPeopleView = peopleGroupedSummary.expenses.medical.filter(e => 
            e.place && e.place.startsWith('PBT_BACKWARD_')
          );
          
          expect(testMedicalInPeopleView.length).toBe(numExpenses);
          
          const peopleViewTotal = testMedicalInPeopleView.reduce((sum, e) => sum + e.amount, 0);
          expect(peopleViewTotal).toBeCloseTo(totalAmount, 2);

          // Property 5: Medical total should be consistent between regular and people-grouped views
          expect(regularSummary.medicalTotal).toBeCloseTo(peopleGroupedSummary.medicalTotal, 2);

          // Clean up test data
          for (const expense of existingExpenses) {
            await expenseService.deleteExpense(expense.id);
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});