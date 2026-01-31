const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const expenseRepository = require('../repositories/expenseRepository');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

// Use safe default payment methods that should always exist in the database
const SAFE_PAYMENT_METHODS = ['Cash', 'Debit', 'Cheque'];

describe('ExpenseService - Property-Based Tests for Future Months', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_FM_%"', (err) => {
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
    place: fc.string({ minLength: 1, maxLength: 30 }).map(s => `PBT_FM_${s.replace(/[^a-zA-Z0-9]/g, '_')}`),
    notes: fc.option(fc.string({ maxLength: 50 }), { nil: null }),
    amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true })
      .map(n => parseFloat(n.toFixed(2))),
    type: fc.constantFrom(...CATEGORIES),
    method: fc.constantFrom(...SAFE_PAYMENT_METHODS)
  });

  // **Feature: recurring-expenses-v2, Property 1: Future Expense Count**
  // **Validates: Requirements 1.3**
  describe('Property 1: Future Expense Count', () => {
    test('should create exactly N+1 total expenses when futureMonths=N (1 source + N future)', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          fc.integer({ min: 1, max: 12 }),
          async (expenseData, futureMonths) => {
            // Create expense with futureMonths
            const result = await expenseService.createExpense(expenseData, futureMonths);
            
            // Property: Result should have expense and futureExpenses array
            expect(result).toHaveProperty('expense');
            expect(result).toHaveProperty('futureExpenses');
            expect(Array.isArray(result.futureExpenses)).toBe(true);
            
            // Property: Should create exactly N future expenses
            expect(result.futureExpenses.length).toBe(futureMonths);
            
            // Property: Total expenses created = 1 source + N future = N+1
            const totalCreated = 1 + result.futureExpenses.length;
            expect(totalCreated).toBe(futureMonths + 1);
            
            // Property: Source expense should have an ID
            expect(result.expense.id).toBeDefined();
            expect(typeof result.expense.id).toBe('number');
            
            // Property: All future expenses should have unique IDs
            const allIds = [result.expense.id, ...result.futureExpenses.map(e => e.id)];
            const uniqueIds = new Set(allIds);
            expect(uniqueIds.size).toBe(allIds.length);
          }
        ),
        pbtOptions()
      );
    }, 120000);

    test('should return simple expense object when futureMonths=0 (backward compatibility)', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          async (expenseData) => {
            // Create expense with futureMonths=0 (default)
            const result = await expenseService.createExpense(expenseData, 0);
            
            // Property: Result should be a simple expense object (backward compatible)
            expect(result).toHaveProperty('id');
            expect(result).toHaveProperty('date');
            expect(result).toHaveProperty('amount');
            expect(result).not.toHaveProperty('futureExpenses');
            
            // Property: ID should be a valid number
            expect(typeof result.id).toBe('number');
            expect(result.id).toBeGreaterThan(0);
          }
        ),
        pbtOptions()
      );
    }, 60000);
  });

  // **Feature: recurring-expenses-v2, Property 2: Field Consistency**
  // **Validates: Requirements 1.4, 2.4**
  describe('Property 2: Field Consistency', () => {
    test('should copy place, amount, type, method, and notes to all future expenses', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          fc.integer({ min: 1, max: 12 }),
          async (expenseData, futureMonths) => {
            // Create expense with futureMonths
            const result = await expenseService.createExpense(expenseData, futureMonths);
            
            // Helper to normalize notes (empty string becomes null in the service)
            const normalizeNotes = (notes) => notes === '' ? null : notes;
            const expectedNotes = normalizeNotes(expenseData.notes);
            
            // Property: Source expense should have the original values
            expect(result.expense.place).toBe(expenseData.place);
            expect(result.expense.amount).toBe(expenseData.amount);
            expect(result.expense.type).toBe(expenseData.type);
            expect(result.expense.method).toBe(expenseData.method);
            expect(result.expense.notes).toBe(expectedNotes);
            
            // Property: All future expenses should have identical field values (except date)
            for (const futureExpense of result.futureExpenses) {
              expect(futureExpense.place).toBe(expenseData.place);
              expect(futureExpense.amount).toBe(expenseData.amount);
              expect(futureExpense.type).toBe(expenseData.type);
              expect(futureExpense.method).toBe(expenseData.method);
              expect(futureExpense.notes).toBe(expectedNotes);
              
              // Property: Date should be different from source
              expect(futureExpense.date).not.toBe(result.expense.date);
            }
          }
        ),
        pbtOptions()
      );
    }, 120000);

    test('should have unique dates for each future expense', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          fc.integer({ min: 2, max: 12 }),
          async (expenseData, futureMonths) => {
            // Create expense with futureMonths
            const result = await expenseService.createExpense(expenseData, futureMonths);
            
            // Collect all dates
            const allDates = [
              result.expense.date,
              ...result.futureExpenses.map(e => e.date)
            ];
            
            // Property: All dates should be unique
            const uniqueDates = new Set(allDates);
            expect(uniqueDates.size).toBe(allDates.length);
          }
        ),
        pbtOptions()
      );
    }, 120000);

    test('should preserve field values in returned objects', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          fc.integer({ min: 1, max: 6 }),
          async (expenseData, futureMonths) => {
            // Create expense with futureMonths
            const result = await expenseService.createExpense(expenseData, futureMonths);
            
            // Property: Source expense should have correct values
            expect(result.expense.place).toBe(expenseData.place);
            expect(result.expense.amount).toBe(expenseData.amount);
            expect(result.expense.type).toBe(expenseData.type);
            expect(result.expense.method).toBe(expenseData.method);
            
            // Property: All future expenses should have correct values
            for (const futureExpense of result.futureExpenses) {
              expect(futureExpense.place).toBe(expenseData.place);
              expect(futureExpense.amount).toBe(expenseData.amount);
              expect(futureExpense.type).toBe(expenseData.type);
              expect(futureExpense.method).toBe(expenseData.method);
            }
          }
        ),
        pbtOptions()
      );
    }, 120000);
  });

  // **Feature: recurring-expenses-v2, Property 4: Edit Creates New Future Expenses**
  // **Validates: Requirements 2.3**
  describe('Property 4: Edit Creates New Future Expenses', () => {
    test('should update existing expense and create exactly N new future expenses when editing with futureMonths=N', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          expenseArbitrary,
          fc.integer({ min: 1, max: 12 }),
          async (originalData, updatedData, futureMonths) => {
            // First create an expense to update
            const createdExpense = await expenseService.createExpense(originalData, 0);
            const expenseId = createdExpense.id;
            
            // Update the expense with futureMonths
            const result = await expenseService.updateExpense(expenseId, updatedData, futureMonths);
            
            // Property: Result should have expense and futureExpenses array
            expect(result).toHaveProperty('expense');
            expect(result).toHaveProperty('futureExpenses');
            expect(Array.isArray(result.futureExpenses)).toBe(true);
            
            // Property: Should create exactly N new future expenses
            expect(result.futureExpenses.length).toBe(futureMonths);
            
            // Property: Updated expense should have the same ID as the original
            expect(result.expense.id).toBe(expenseId);
            
            // Property: Updated expense should have the new values
            expect(result.expense.place).toBe(updatedData.place);
            expect(result.expense.amount).toBe(updatedData.amount);
            expect(result.expense.type).toBe(updatedData.type);
            expect(result.expense.method).toBe(updatedData.method);
            
            // Property: All future expenses should have unique IDs different from the updated expense
            const allIds = [result.expense.id, ...result.futureExpenses.map(e => e.id)];
            const uniqueIds = new Set(allIds);
            expect(uniqueIds.size).toBe(allIds.length);
          }
        ),
        pbtOptions()
      );
    }, 120000);

    test('should return simple expense object when editing with futureMonths=0 (backward compatibility)', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          expenseArbitrary,
          async (originalData, updatedData) => {
            // First create an expense to update
            const createdExpense = await expenseService.createExpense(originalData, 0);
            const expenseId = createdExpense.id;
            
            // Update the expense with futureMonths=0 (default)
            const result = await expenseService.updateExpense(expenseId, updatedData, 0);
            
            // Property: Result should be a simple expense object (backward compatible)
            expect(result).toHaveProperty('id');
            expect(result).toHaveProperty('date');
            expect(result).toHaveProperty('amount');
            expect(result).not.toHaveProperty('futureExpenses');
            
            // Property: ID should be the same as the original
            expect(result.id).toBe(expenseId);
            
            // Property: Values should be updated
            expect(result.place).toBe(updatedData.place);
            expect(result.amount).toBe(updatedData.amount);
            expect(result.type).toBe(updatedData.type);
            expect(result.method).toBe(updatedData.method);
          }
        ),
        pbtOptions()
      );
    }, 60000);

    test('should create future expenses with updated values (not original values)', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          expenseArbitrary,
          fc.integer({ min: 1, max: 6 }),
          async (originalData, updatedData, futureMonths) => {
            // First create an expense to update
            const createdExpense = await expenseService.createExpense(originalData, 0);
            const expenseId = createdExpense.id;
            
            // Update the expense with futureMonths
            const result = await expenseService.updateExpense(expenseId, updatedData, futureMonths);
            
            // Helper to normalize notes (empty string becomes null in the service)
            const normalizeNotes = (notes) => notes === '' ? null : notes;
            const expectedNotes = normalizeNotes(updatedData.notes);
            
            // Property: All future expenses should have the UPDATED values (not original)
            for (const futureExpense of result.futureExpenses) {
              expect(futureExpense.place).toBe(updatedData.place);
              expect(futureExpense.amount).toBe(updatedData.amount);
              expect(futureExpense.type).toBe(updatedData.type);
              expect(futureExpense.method).toBe(updatedData.method);
              expect(futureExpense.notes).toBe(expectedNotes);
              
              // Property: Future expenses should NOT have the original values (unless they happen to be the same)
              // This is implicitly tested by checking they match updatedData
            }
          }
        ),
        pbtOptions()
      );
    }, 120000);

    test('should not modify any other existing expenses when editing with futureMonths', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArbitrary,
          expenseArbitrary,
          expenseArbitrary,
          fc.integer({ min: 1, max: 6 }),
          async (expense1Data, expense2Data, updatedData, futureMonths) => {
            // Create two separate expenses
            const expense1 = await expenseService.createExpense(expense1Data, 0);
            const expense2 = await expenseService.createExpense(expense2Data, 0);
            
            // Update expense1 with futureMonths
            await expenseService.updateExpense(expense1.id, updatedData, futureMonths);
            
            // Property: expense2 should remain unchanged
            const expense2After = await expenseService.getExpenseById(expense2.id);
            expect(expense2After.place).toBe(expense2Data.place);
            expect(expense2After.amount).toBe(expense2Data.amount);
            expect(expense2After.type).toBe(expense2Data.type);
            expect(expense2After.method).toBe(expense2Data.method);
          }
        ),
        pbtOptions()
      );
    }, 120000);
  });
});
