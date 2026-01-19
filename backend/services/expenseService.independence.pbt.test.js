const fc = require('fast-check');
const expenseService = require('./expenseService');
const expenseRepository = require('../repositories/expenseRepository');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');
const { PAYMENT_METHODS } = require('../utils/constants');

describe('ExpenseService - Property-Based Tests for Independence and Atomicity', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_IND_%"', (err) => {
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
    place: fc.string({ minLength: 1, maxLength: 30 }).map(s => `PBT_IND_${s.replace(/[^a-zA-Z0-9]/g, '_')}`),
    notes: fc.option(fc.string({ maxLength: 50 }), { nil: null }),
    amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true })
      .map(n => parseFloat(n.toFixed(2))),
    type: fc.constantFrom(...CATEGORIES),
    method: fc.constantFrom(...PAYMENT_METHODS)
  });

  // **Feature: recurring-expenses-v2, Property 5: Expense Independence**
  // **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
  describe('Property 5: Expense Independence', () => {
    test('future expenses should be completely independent with no link to source expense', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          fc.integer({ min: 1, max: 6 }),
          async (expenseData, futureMonths) => {
            // Create expense with futureMonths
            const result = await expenseService.createExpense(expenseData, futureMonths);
            
            // Property: All expenses should have unique IDs (no foreign key references)
            const allIds = [result.expense.id, ...result.futureExpenses.map(e => e.id)];
            const uniqueIds = new Set(allIds);
            expect(uniqueIds.size).toBe(allIds.length);
            
            // Property: Each expense should be independently retrievable
            for (const futureExpense of result.futureExpenses) {
              const retrieved = await expenseService.getExpenseById(futureExpense.id);
              expect(retrieved).not.toBeNull();
              expect(retrieved.id).toBe(futureExpense.id);
            }
            
            // Property: Source expense should be independently retrievable
            const sourceRetrieved = await expenseService.getExpenseById(result.expense.id);
            expect(sourceRetrieved).not.toBeNull();
            expect(sourceRetrieved.id).toBe(result.expense.id);
          }
        ),
        { numRuns: 50 }
      );
    }, 120000);

    test('editing a future expense should not affect source expense or other future expenses', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          expenseArbitrary,
          fc.integer({ min: 2, max: 6 }),
          async (originalData, updatedData, futureMonths) => {
            // Create expense with futureMonths
            const result = await expenseService.createExpense(originalData, futureMonths);
            
            // Store original values for comparison
            const sourceId = result.expense.id;
            const sourceOriginalPlace = result.expense.place;
            const sourceOriginalAmount = result.expense.amount;
            
            const otherFutureExpenses = result.futureExpenses.slice(1);
            const otherOriginalValues = otherFutureExpenses.map(e => ({
              id: e.id,
              place: e.place,
              amount: e.amount
            }));
            
            // Edit the first future expense
            const futureExpenseToEdit = result.futureExpenses[0];
            await expenseService.updateExpense(futureExpenseToEdit.id, updatedData, 0);
            
            // Property: Source expense should remain unchanged
            const sourceAfterEdit = await expenseService.getExpenseById(sourceId);
            expect(sourceAfterEdit.place).toBe(sourceOriginalPlace);
            expect(sourceAfterEdit.amount).toBe(sourceOriginalAmount);
            
            // Property: Other future expenses should remain unchanged
            for (const original of otherOriginalValues) {
              const afterEdit = await expenseService.getExpenseById(original.id);
              expect(afterEdit.place).toBe(original.place);
              expect(afterEdit.amount).toBe(original.amount);
            }
          }
        ),
        { numRuns: 50 }
      );
    }, 120000);

    test('deleting a future expense should not affect source expense or other future expenses', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          fc.integer({ min: 2, max: 6 }),
          async (expenseData, futureMonths) => {
            // Create expense with futureMonths
            const result = await expenseService.createExpense(expenseData, futureMonths);
            
            // Store IDs for verification
            const sourceId = result.expense.id;
            const futureExpenseToDelete = result.futureExpenses[0];
            const otherFutureIds = result.futureExpenses.slice(1).map(e => e.id);
            
            // Delete the first future expense
            const deleted = await expenseService.deleteExpense(futureExpenseToDelete.id);
            expect(deleted).toBe(true);
            
            // Property: Source expense should still exist
            const sourceAfterDelete = await expenseService.getExpenseById(sourceId);
            expect(sourceAfterDelete).not.toBeNull();
            expect(sourceAfterDelete.id).toBe(sourceId);
            
            // Property: Other future expenses should still exist
            for (const futureId of otherFutureIds) {
              const futureAfterDelete = await expenseService.getExpenseById(futureId);
              expect(futureAfterDelete).not.toBeNull();
              expect(futureAfterDelete.id).toBe(futureId);
            }
            
            // Property: Deleted expense should no longer exist
            const deletedExpense = await expenseService.getExpenseById(futureExpenseToDelete.id);
            expect(deletedExpense).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    }, 120000);

    test('deleting source expense should not affect any future expenses', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          fc.integer({ min: 1, max: 6 }),
          async (expenseData, futureMonths) => {
            // Create expense with futureMonths
            const result = await expenseService.createExpense(expenseData, futureMonths);
            
            // Store future expense IDs for verification
            const sourceId = result.expense.id;
            const futureIds = result.futureExpenses.map(e => e.id);
            
            // Delete the source expense
            const deleted = await expenseService.deleteExpense(sourceId);
            expect(deleted).toBe(true);
            
            // Property: All future expenses should still exist
            for (const futureId of futureIds) {
              const futureAfterDelete = await expenseService.getExpenseById(futureId);
              expect(futureAfterDelete).not.toBeNull();
              expect(futureAfterDelete.id).toBe(futureId);
            }
            
            // Property: Source expense should no longer exist
            const sourceAfterDelete = await expenseService.getExpenseById(sourceId);
            expect(sourceAfterDelete).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    }, 120000);
  });
});
