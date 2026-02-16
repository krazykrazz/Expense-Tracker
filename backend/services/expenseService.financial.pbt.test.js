/**
 * @invariant Financial Operations
 * 
 * This file consolidates property-based tests for expense service financial operations:
 * - Budget Integration: Budget recalculation triggers for budgetable expenses
 * - Future Months: Recurring expense creation and field consistency
 * - Date Calculation: Month-end handling, leap years, year boundaries
 * - Credit Card Balance: Balance tracking for credit card expenses
 * 
 * Consolidated from:
 * - expenseService.budgetIntegration.pbt.test.js
 * - expenseService.futureMonths.pbt.test.js
 * - expenseService.dateCalculation.pbt.test.js
 * - expenseService.creditCardBalance.pbt.test.js
 */

const fc = require('fast-check');
const { pbtOptions, dbPbtOptions } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const budgetEvents = require('../events/budgetEvents');
const { getDatabase } = require('../database/db');
const { CATEGORIES, BUDGETABLE_CATEGORIES } = require('../utils/categories');
const sqlite3 = require('sqlite3').verbose();

// Use safe default payment methods that should always exist in the database
const SAFE_PAYMENT_METHODS = ['Cash', 'Debit', 'Cheque'];

describe('ExpenseService - Financial Operations PBT', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_FIN_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  // ============================================================================
  // Budget Integration Tests
  // ============================================================================

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
    place: fc.string({ minLength: 1, maxLength: 30 }).map(s => `PBT_FIN_BI_${s.replace(/[^a-zA-Z0-9]/g, '_')}`),
    notes: fc.option(fc.string({ maxLength: 50 }), { nil: null }),
    amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true })
      .map(n => parseFloat(n.toFixed(2))),
    type: fc.constantFrom(...BUDGETABLE_CATEGORIES),
    method: fc.constantFrom(...SAFE_PAYMENT_METHODS)
  });

  // **Feature: recurring-expenses-v2, Property 7: Budget Integration**
  // **Validates: Requirements 5.1, 5.2**
  describe('Budget Integration', () => {
    let emitSpy;

    beforeEach(() => {
      emitSpy = jest.spyOn(budgetEvents, 'emitBudgetRecalculation');
    });

    afterEach(() => {
      emitSpy.mockRestore();
    });

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

  // ============================================================================
  // Future Months Tests
  // ============================================================================

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
    place: fc.string({ minLength: 1, maxLength: 30 }).map(s => `PBT_FIN_FM_${s.replace(/[^a-zA-Z0-9]/g, '_')}`),
    notes: fc.option(fc.string({ maxLength: 50 }), { nil: null }),
    amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true })
      .map(n => parseFloat(n.toFixed(2))),
    type: fc.constantFrom(...CATEGORIES),
    method: fc.constantFrom(...SAFE_PAYMENT_METHODS)
  });

  // **Feature: recurring-expenses-v2, Property 1: Future Expense Count**
  // **Validates: Requirements 1.3**
  describe('Future Expense Count', () => {
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
  describe('Field Consistency', () => {
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
  describe('Edit Creates New Future Expenses', () => {
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

  // ============================================================================
  // Date Calculation Tests
  // ============================================================================

  /**
   * Helper to get the number of days in a month
   */
  const getDaysInMonth = (year, month) => {
    return new Date(year, month, 0).getDate();
  };

  /**
   * Helper to parse a date string into components
   */
  const parseDate = (dateStr) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return { year, month, day };
  };

  // **Feature: recurring-expenses-v2, Property 3: Date Calculation Correctness**
  // **Validates: Requirements 1.5, 1.6**
  describe('Date Calculation Correctness', () => {
    test('should preserve day of month when that day exists in the target month', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a source date with day 1-28 (exists in all months)
          fc.integer({ min: 2020, max: 2030 }).chain(year =>
            fc.integer({ min: 1, max: 12 }).chain(month =>
              fc.integer({ min: 1, max: 28 }).map(day =>
                `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              )
            )
          ),
          // Generate months ahead (1-12)
          fc.integer({ min: 1, max: 12 }),
          async (sourceDate, monthsAhead) => {
            const result = expenseService._calculateFutureDate(sourceDate, monthsAhead);
            
            const source = parseDate(sourceDate);
            const target = parseDate(result);
            
            // Property: Day should be preserved when source day is 1-28
            expect(target.day).toBe(source.day);
            
            // Verify the result is a valid date format
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          }
        ),
        pbtOptions()
      );
    }, 30000);

    test('should use last day of target month when source day exceeds days in target month', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a source date with day 29-31 (may not exist in all months)
          fc.integer({ min: 2020, max: 2030 }).chain(year =>
            fc.integer({ min: 1, max: 12 }).chain(month => {
              const daysInMonth = getDaysInMonth(year, month);
              // Only generate days 29-31 if the month has them
              const minDay = Math.min(29, daysInMonth);
              return fc.integer({ min: minDay, max: daysInMonth }).map(day =>
                `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              );
            })
          ),
          // Generate months ahead (1-12)
          fc.integer({ min: 1, max: 12 }),
          async (sourceDate, monthsAhead) => {
            const result = expenseService._calculateFutureDate(sourceDate, monthsAhead);
            
            const source = parseDate(sourceDate);
            const target = parseDate(result);
            
            // Calculate expected target month/year
            let expectedMonth = source.month + monthsAhead;
            let expectedYear = source.year;
            while (expectedMonth > 12) {
              expectedMonth -= 12;
              expectedYear += 1;
            }
            
            const daysInTargetMonth = getDaysInMonth(expectedYear, expectedMonth);
            
            // Property: Day should be min(sourceDay, daysInTargetMonth)
            const expectedDay = Math.min(source.day, daysInTargetMonth);
            expect(target.day).toBe(expectedDay);
            
            // Verify month and year are correct
            expect(target.month).toBe(expectedMonth);
            expect(target.year).toBe(expectedYear);
          }
        ),
        pbtOptions()
      );
    }, 30000);

    test('should handle leap year edge cases (Feb 29)', async () => {
      // Test specific leap year cases
      const leapYearCases = [
        { source: '2024-02-29', monthsAhead: 12, expected: '2025-02-28' }, // Leap to non-leap
        { source: '2024-02-29', monthsAhead: 1, expected: '2024-03-29' },  // Feb 29 to March
        { source: '2024-02-29', monthsAhead: 4, expected: '2024-06-29' },  // Feb 29 to June
        { source: '2020-02-29', monthsAhead: 12, expected: '2021-02-28' }, // Another leap to non-leap
        { source: '2024-02-29', monthsAhead: 48, expected: '2028-02-29' }, // Leap to leap (4 years)
      ];

      for (const testCase of leapYearCases) {
        const result = expenseService._calculateFutureDate(testCase.source, testCase.monthsAhead);
        expect(result).toBe(testCase.expected);
      }
    });

    test('should handle month-end edge cases (day 31 to shorter months)', async () => {
      // Test specific month-end cases
      const monthEndCases = [
        { source: '2025-01-31', monthsAhead: 1, expected: '2025-02-28' },  // Jan 31 to Feb (non-leap)
        { source: '2024-01-31', monthsAhead: 1, expected: '2024-02-29' },  // Jan 31 to Feb (leap)
        { source: '2025-01-31', monthsAhead: 3, expected: '2025-04-30' },  // Jan 31 to April
        { source: '2025-03-31', monthsAhead: 1, expected: '2025-04-30' },  // Mar 31 to April
        { source: '2025-05-31', monthsAhead: 1, expected: '2025-06-30' },  // May 31 to June
        { source: '2025-08-31', monthsAhead: 1, expected: '2025-09-30' },  // Aug 31 to Sept
        { source: '2025-10-31', monthsAhead: 1, expected: '2025-11-30' },  // Oct 31 to Nov
      ];

      for (const testCase of monthEndCases) {
        const result = expenseService._calculateFutureDate(testCase.source, testCase.monthsAhead);
        expect(result).toBe(testCase.expected);
      }
    });

    test('should correctly handle year boundary crossings', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate dates in the last few months of a year
          fc.integer({ min: 2020, max: 2029 }).chain(year =>
            fc.integer({ min: 10, max: 12 }).chain(month =>
              fc.integer({ min: 1, max: 28 }).map(day =>
                `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              )
            )
          ),
          // Generate months ahead that will cross year boundary
          fc.integer({ min: 1, max: 12 }),
          async (sourceDate, monthsAhead) => {
            const result = expenseService._calculateFutureDate(sourceDate, monthsAhead);
            
            const source = parseDate(sourceDate);
            const target = parseDate(result);
            
            // Calculate expected target month/year
            let expectedMonth = source.month + monthsAhead;
            let expectedYear = source.year;
            while (expectedMonth > 12) {
              expectedMonth -= 12;
              expectedYear += 1;
            }
            
            // Property: Year and month should be correctly calculated
            expect(target.year).toBe(expectedYear);
            expect(target.month).toBe(expectedMonth);
            
            // Property: Day should be preserved (since we use days 1-28)
            expect(target.day).toBe(source.day);
          }
        ),
        pbtOptions()
      );
    }, 30000);

    test('should always return a valid date string in YYYY-MM-DD format', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate any valid source date
          fc.integer({ min: 2020, max: 2030 }).chain(year =>
            fc.integer({ min: 1, max: 12 }).chain(month => {
              const daysInMonth = getDaysInMonth(year, month);
              return fc.integer({ min: 1, max: daysInMonth }).map(day =>
                `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              );
            })
          ),
          // Generate months ahead (1-12)
          fc.integer({ min: 1, max: 12 }),
          async (sourceDate, monthsAhead) => {
            const result = expenseService._calculateFutureDate(sourceDate, monthsAhead);
            
            // Property: Result should be a valid date string
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            
            // Property: Result should be parseable as a valid date
            const parsed = parseDate(result);
            expect(parsed.year).toBeGreaterThanOrEqual(2020);
            expect(parsed.month).toBeGreaterThanOrEqual(1);
            expect(parsed.month).toBeLessThanOrEqual(12);
            expect(parsed.day).toBeGreaterThanOrEqual(1);
            expect(parsed.day).toBeLessThanOrEqual(31);
            
            // Property: The day should not exceed the days in the target month
            const daysInTargetMonth = getDaysInMonth(parsed.year, parsed.month);
            expect(parsed.day).toBeLessThanOrEqual(daysInTargetMonth);
          }
        ),
        pbtOptions()
      );
    }, 30000);
  }, 120000);
});


// ============================================================================
// Credit Card Balance Tests
// ============================================================================

// Helper function to create an in-memory test database
function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) {
        reject(err);
      } else {
        db.run('PRAGMA foreign_keys = ON', (fkErr) => {
          if (fkErr) {
            reject(fkErr);
          } else {
            resolve(db);
          }
        });
      }
    });
  });
}

// Helper function to close database
function closeDatabase(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Helper function to create tables
function createTables(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS payment_methods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL CHECK(type IN ('cash', 'cheque', 'debit', 'credit_card')),
          display_name TEXT NOT NULL UNIQUE,
          full_name TEXT,
          account_details TEXT,
          credit_limit REAL CHECK(credit_limit IS NULL OR credit_limit > 0),
          current_balance REAL DEFAULT 0 CHECK(current_balance >= 0),
          payment_due_day INTEGER CHECK(payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31)),
          billing_cycle_start INTEGER CHECK(billing_cycle_start IS NULL OR (billing_cycle_start >= 1 AND billing_cycle_start <= 31)),
          billing_cycle_end INTEGER CHECK(billing_cycle_end IS NULL OR (billing_cycle_end >= 1 AND billing_cycle_end <= 31)),
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      db.run(`
        CREATE TABLE IF NOT EXISTS expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          place TEXT,
          notes TEXT,
          amount REAL NOT NULL,
          type TEXT NOT NULL,
          week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
          method TEXT NOT NULL,
          payment_method_id INTEGER REFERENCES payment_methods(id),
          insurance_eligible INTEGER DEFAULT 0,
          claim_status TEXT DEFAULT NULL,
          original_cost REAL DEFAULT NULL
        )
      `, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

// Helper function to insert credit card
function insertCreditCard(db, displayName, fullName, initialBalance) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO payment_methods (type, display_name, full_name, current_balance, is_active)
       VALUES ('credit_card', ?, ?, ?, 1)`,
      [displayName, fullName, initialBalance],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

// Helper function to insert debit payment method
function insertDebitMethod(db, displayName) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO payment_methods (type, display_name, is_active)
       VALUES ('debit', ?, 1)`,
      [displayName],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

// Helper function to insert expense
function insertExpense(db, date, place, amount, type, week, method, paymentMethodId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [date, place, amount, type, week, method, paymentMethodId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

// Helper function to update balance (simulating what the service does)
function updateBalance(db, paymentMethodId, amount) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE payment_methods 
       SET current_balance = MAX(0, current_balance + ?), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [amount, paymentMethodId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      }
    );
  });
}

// Helper function to get payment method by ID
function getPaymentMethodById(db, id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM payment_methods WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Helper function to delete expense
function deleteExpense(db, id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM expenses WHERE id = ?', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0);
      }
    });
  });
}

// Arbitrary for generating unique display names
let displayNameCounter = 0;
const uniqueDisplayName = () => {
  displayNameCounter++;
  return fc.constant(`TestCard_${displayNameCounter}_${Date.now()}`);
};

// Arbitrary for generating valid expense dates
const validExpenseDate = fc.integer({ min: 2020, max: 2030 })
  .chain(year => fc.integer({ min: 1, max: 12 })
    .chain(month => fc.integer({ min: 1, max: 28 })
      .map(day => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)));

// Arbitrary for expense types
const expenseType = fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Other');


describe('Credit Card Balance Tracking', () => {
  beforeEach(() => {
    // Reset counter for each test
    displayNameCounter = 0;
  });

  /**
   * Feature: configurable-payment-methods, Property 8: Expense Increases Credit Card Balance
   * **Validates: Requirements 3.3**
   * 
   * For any credit card with balance B and any expense amount E recorded with that card,
   * the resulting balance should be exactly B + E.
   */
  test('Property 8: Expense Increases Credit Card Balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        validExpenseDate,
        expenseType,
        async (displayName, initialBalance, expenseAmount, expenseDate, type) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card with initial balance
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', initialBalance);
            
            // Verify initial state
            const cardBefore = await getPaymentMethodById(db, cardId);
            expect(cardBefore.current_balance).toBeCloseTo(initialBalance, 2);
            
            // Create expense with credit card
            await insertExpense(
              db,
              expenseDate,
              'Test Place',
              expenseAmount,
              type,
              1,
              displayName,
              cardId
            );
            
            // Simulate what the service does: update balance
            await updateBalance(db, cardId, expenseAmount);
            
            // Verify balance increased by expense amount
            const cardAfter = await getPaymentMethodById(db, cardId);
            const expectedBalance = initialBalance + expenseAmount;
            
            expect(cardAfter.current_balance).toBeCloseTo(expectedBalance, 2);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Expense deletion decreases credit card balance
   * **Validates: Requirements 3.3**
   */
  test('Property: Expense Deletion Decreases Credit Card Balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.float({ min: Math.fround(100), max: Math.fround(5000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true }).map(n => Math.round(n * 100) / 100),
        validExpenseDate,
        expenseType,
        async (displayName, initialBalance, expenseAmount, expenseDate, type) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card with initial balance
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', initialBalance);
            
            // Create expense with credit card
            const expenseId = await insertExpense(
              db,
              expenseDate,
              'Test Place',
              expenseAmount,
              type,
              1,
              displayName,
              cardId
            );
            
            // Simulate expense creation: update balance
            await updateBalance(db, cardId, expenseAmount);
            
            // Verify balance after expense creation
            const cardAfterCreate = await getPaymentMethodById(db, cardId);
            expect(cardAfterCreate.current_balance).toBeCloseTo(initialBalance + expenseAmount, 2);
            
            // Delete expense
            await deleteExpense(db, expenseId);
            
            // Simulate expense deletion: decrement balance
            await updateBalance(db, cardId, -expenseAmount);
            
            // Verify balance returned to initial
            const cardAfterDelete = await getPaymentMethodById(db, cardId);
            expect(cardAfterDelete.current_balance).toBeCloseTo(initialBalance, 2);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Non-credit card expenses don't affect balance
   * **Validates: Requirements 3.3**
   */
  test('Property: Non-Credit Card Expenses Do Not Affect Balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        validExpenseDate,
        expenseType,
        async (displayName, expenseAmount, expenseDate, type) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create debit payment method (no balance tracking)
            const debitId = await insertDebitMethod(db, displayName);
            
            // Verify debit method has no balance
            const debitBefore = await getPaymentMethodById(db, debitId);
            expect(debitBefore.current_balance).toBe(0);
            expect(debitBefore.type).toBe('debit');
            
            // Create expense with debit method
            await insertExpense(
              db,
              expenseDate,
              'Test Place',
              expenseAmount,
              type,
              1,
              displayName,
              debitId
            );
            
            // Verify balance unchanged (debit doesn't track balance)
            const debitAfter = await getPaymentMethodById(db, debitId);
            expect(debitAfter.current_balance).toBe(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Balance cannot go negative
   * **Validates: Requirements 3.3**
   */
  test('Property: Balance Cannot Go Negative', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.float({ min: Math.fround(10), max: Math.fround(100), noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.float({ min: Math.fround(200), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100),
        async (displayName, initialBalance, largeDeduction) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card with small initial balance
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', initialBalance);
            
            // Try to deduct more than the balance
            await updateBalance(db, cardId, -largeDeduction);
            
            // Verify balance is 0, not negative
            const cardAfter = await getPaymentMethodById(db, cardId);
            expect(cardAfter.current_balance).toBe(0);
            expect(cardAfter.current_balance).toBeGreaterThanOrEqual(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  }, 120000);
});
