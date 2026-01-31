const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const expenseRepository = require('../repositories/expenseRepository');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

// Use safe default payment methods that should always exist in the database
// These are the core payment methods created during migration
const SAFE_PAYMENT_METHODS = ['Cash', 'Debit', 'Cheque'];

describe('ExpenseService - Property-Based Tests for Creation Atomicity', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_ATOM_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  /**
   * Helper to generate valid expense data for testing
   */
  const expenseArbitrary = fc.record({
    date: fc.integer({ min: 2020, max: 2028 }).chain(year =>
      fc.integer({ min: 1, max: 12 }).chain(month =>
        fc.integer({ min: 1, max: 28 }).map(day =>
          `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        )
      )
    ),
    place: fc.string({ minLength: 1, maxLength: 30 }).map(s => `PBT_ATOM_${s.replace(/[^a-zA-Z0-9]/g, '_')}`),
    notes: fc.option(fc.string({ maxLength: 50 }), { nil: null }),
    amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true })
      .map(n => parseFloat(n.toFixed(2))),
    type: fc.constantFrom(...CATEGORIES),
    method: fc.constantFrom(...SAFE_PAYMENT_METHODS)
  });

  // **Feature: recurring-expenses-v2, Property 6: Creation Atomicity**
  // **Validates: Requirements 4.3**
  describe('Property 6: Creation Atomicity', () => {
    test('successful creation should create all expenses atomically', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          fc.integer({ min: 1, max: 6 }),
          async (expenseData, futureMonths) => {
            // Count expenses before creation
            const countBefore = await countExpensesWithPlace(db, expenseData.place);
            
            // Create expense with futureMonths
            const result = await expenseService.createExpense(expenseData, futureMonths);
            
            // Count expenses after creation
            const countAfter = await countExpensesWithPlace(db, expenseData.place);
            
            // Property: All expenses should be created (N+1 total)
            expect(countAfter - countBefore).toBe(futureMonths + 1);
            
            // Property: All created expenses should be retrievable
            const sourceExpense = await expenseService.getExpenseById(result.expense.id);
            expect(sourceExpense).not.toBeNull();
            
            for (const futureExpense of result.futureExpenses) {
              const retrieved = await expenseService.getExpenseById(futureExpense.id);
              expect(retrieved).not.toBeNull();
            }
          }
        ),
        pbtOptions()
      );
    }, 120000);

    test('if error occurs during future expense creation, all expenses should be rolled back', async () => {
      // This test verifies the rollback mechanism by mocking the repository
      // to fail after creating some expenses
      
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          fc.integer({ min: 2, max: 6 }),
          fc.integer({ min: 1, max: 5 }), // Which expense to fail on
          async (expenseData, futureMonths, failOnExpense) => {
            // Ensure failOnExpense is within range
            const failIndex = Math.min(failOnExpense, futureMonths);
            
            // Store original create method
            const originalCreate = expenseRepository.create.bind(expenseRepository);
            let createCallCount = 0;
            
            // Count expenses before
            const countBefore = await countExpensesWithPlace(db, expenseData.place);
            
            // Mock create to fail on specific call
            expenseRepository.create = async (expense) => {
              createCallCount++;
              if (createCallCount === failIndex + 1) { // +1 because first call is source expense
                throw new Error('Simulated database error');
              }
              return originalCreate(expense);
            };
            
            try {
              // Attempt to create expense with futureMonths
              await expenseService.createExpense(expenseData, futureMonths);
              
              // If we get here, the mock didn't trigger (failIndex > futureMonths)
              // This is acceptable - just verify all expenses were created
              const countAfter = await countExpensesWithPlace(db, expenseData.place);
              expect(countAfter - countBefore).toBe(futureMonths + 1);
            } catch (error) {
              // Property: Error should be thrown with appropriate message
              expect(error.message).toBe('Failed to create future expenses. Please try again.');
              
              // Property: All expenses should be rolled back (none should exist)
              const countAfter = await countExpensesWithPlace(db, expenseData.place);
              expect(countAfter).toBe(countBefore);
            } finally {
              // Restore original method
              expenseRepository.create = originalCreate;
            }
          }
        ),
        pbtOptions()
      );
    }, 180000);

    test('validation errors should prevent any expense creation', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          fc.integer({ min: 1, max: 6 }),
          async (expenseData, futureMonths) => {
            // Create invalid expense data (negative amount)
            const invalidData = {
              ...expenseData,
              amount: -100
            };
            
            // Count expenses before
            const countBefore = await countExpensesWithPlace(db, invalidData.place);
            
            try {
              await expenseService.createExpense(invalidData, futureMonths);
              // Should not reach here
              expect(true).toBe(false);
            } catch (error) {
              // Property: Validation error should be thrown
              expect(error.message).toContain('positive number');
              
              // Property: No expenses should be created
              const countAfter = await countExpensesWithPlace(db, invalidData.place);
              expect(countAfter).toBe(countBefore);
            }
          }
        ),
        pbtOptions()
      );
    }, 60000);

    test('invalid futureMonths should prevent any expense creation', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          fc.integer({ min: 13, max: 100 }), // Invalid futureMonths (> 12)
          async (expenseData, invalidFutureMonths) => {
            // Count expenses before
            const countBefore = await countExpensesWithPlace(db, expenseData.place);
            
            try {
              await expenseService.createExpense(expenseData, invalidFutureMonths);
              // Should not reach here
              expect(true).toBe(false);
            } catch (error) {
              // Property: Validation error should be thrown
              expect(error.message).toContain('between 0 and 12');
              
              // Property: No expenses should be created
              const countAfter = await countExpensesWithPlace(db, expenseData.place);
              expect(countAfter).toBe(countBefore);
            }
          }
        ),
        pbtOptions()
      );
    }, 60000);
  });
});

/**
 * Helper function to count expenses with a specific place prefix
 */
async function countExpensesWithPlace(db, place) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM expenses WHERE place = ?', [place], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.count : 0);
    });
  });
}
