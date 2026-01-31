const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const budgetEvents = require('../events/budgetEvents');
const { getDatabase } = require('../database/db');
const { BUDGETABLE_CATEGORIES } = require('../utils/categories');

// Use safe default payment methods that should always exist in the database
const SAFE_PAYMENT_METHODS = ['Cash', 'Debit', 'Cheque'];

describe('ExpenseService - Property-Based Tests for Budget Integration', () => {
  let db;
  let emitSpy;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(() => {
    // Spy on the budget event emitter
    emitSpy = jest.spyOn(budgetEvents, 'emitBudgetRecalculation');
  });

  afterEach(async () => {
    // Restore the spy
    emitSpy.mockRestore();
    
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_BI_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  /**
   * Helper to generate valid expense data with budgetable category
   */
  const budgetableExpenseArbitrary = fc.record({
    date: fc.integer({ min: 2020, max: 2028 }).chain(year =>
      fc.integer({ min: 1, max: 12 }).chain(month =>
        fc.integer({ min: 1, max: 28 }).map(day =>
          `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        )
      )
    ),
    place: fc.string({ minLength: 1, maxLength: 30 }).map(s => `PBT_BI_${s.replace(/[^a-zA-Z0-9]/g, '_')}`),
    notes: fc.option(fc.string({ maxLength: 50 }), { nil: null }),
    amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true })
      .map(n => parseFloat(n.toFixed(2))),
    type: fc.constantFrom(...BUDGETABLE_CATEGORIES),
    method: fc.constantFrom(...SAFE_PAYMENT_METHODS)
  });

  // **Feature: recurring-expenses-v2, Property 7: Budget Integration**
  // **Validates: Requirements 5.1, 5.2**
  describe('Property 7: Budget Integration', () => {
    test('should trigger budget recalculation for source expense', async () => {
      await fc.assert(
        fc.asyncProperty(
          budgetableExpenseArbitrary,
          async (expenseData) => {
            emitSpy.mockClear();
            
            // Create expense without future months
            await expenseService.createExpense(expenseData, 0);
            
            // Property: Budget recalculation should be triggered once for the source expense
            expect(emitSpy).toHaveBeenCalledTimes(1);
            expect(emitSpy).toHaveBeenCalledWith(expenseData.date, expenseData.type);
          }
        ),
        pbtOptions()
      );
    }, 60000);

    test('should trigger budget recalculation for each future expense', async () => {
      await fc.assert(
        fc.asyncProperty(
          budgetableExpenseArbitrary,
          fc.integer({ min: 1, max: 6 }),
          async (expenseData, futureMonths) => {
            emitSpy.mockClear();
            
            // Create expense with futureMonths
            const result = await expenseService.createExpense(expenseData, futureMonths);
            
            // Property: Budget recalculation should be triggered N+1 times
            // (1 for source + N for future expenses)
            expect(emitSpy).toHaveBeenCalledTimes(futureMonths + 1);
            
            // Property: First call should be for the source expense
            expect(emitSpy).toHaveBeenNthCalledWith(1, expenseData.date, expenseData.type);
            
            // Property: Each future expense should trigger budget recalculation
            // with its own date but the same category
            for (let i = 0; i < futureMonths; i++) {
              const futureExpense = result.futureExpenses[i];
              expect(emitSpy).toHaveBeenNthCalledWith(i + 2, futureExpense.date, expenseData.type);
            }
          }
        ),
        pbtOptions()
      );
    }, 120000);

    test('should trigger budget recalculation for correct month of each future expense', async () => {
      await fc.assert(
        fc.asyncProperty(
          budgetableExpenseArbitrary,
          fc.integer({ min: 1, max: 12 }),
          async (expenseData, futureMonths) => {
            emitSpy.mockClear();
            
            // Create expense with futureMonths
            const result = await expenseService.createExpense(expenseData, futureMonths);
            
            // Collect all dates that budget recalculation was called with
            const calledDates = emitSpy.mock.calls.map(call => call[0]);
            
            // Property: All expense dates should have triggered budget recalculation
            const allExpenseDates = [
              result.expense.date,
              ...result.futureExpenses.map(e => e.date)
            ];
            
            expect(calledDates.sort()).toEqual(allExpenseDates.sort());
            
            // Property: All calls should be for the same category
            const calledCategories = emitSpy.mock.calls.map(call => call[1]);
            expect(calledCategories.every(cat => cat === expenseData.type)).toBe(true);
          }
        ),
        pbtOptions()
      );
    }, 120000);
  });
});
