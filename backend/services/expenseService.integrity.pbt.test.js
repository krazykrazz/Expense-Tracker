/**
 * @invariant Data Integrity
 * 
 * This file consolidates property-based tests for expense service data integrity:
 * - Atomicity: Atomic operations succeed or fail completely
 * - Independence: Operations are independent and don't affect unrelated data
 * - Category Persistence: Round-trip data integrity for expense categories
 * 
 * Randomization validates that atomic operations maintain consistency, operations
 * are independent across different expenses, and data persists correctly through
 * create-retrieve cycles.
 * 
 * Consolidated from:
 * - expenseService.atomicity.pbt.test.js
 * - expenseService.independence.pbt.test.js
 * - expenseService.pbt.test.js (general)
 */

const fc = require('fast-check');
const { pbtOptions, dbPbtOptions } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

// Use safe default payment methods that should always exist in the database
const SAFE_PAYMENT_METHODS = ['Cash', 'Debit', 'Cheque'];

describe('ExpenseService - Data Integrity PBT', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_ATOM_%" OR place LIKE "PBT_IND_%" OR place LIKE "PBT_%"', (err) => {
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

  // ============================================================================
  // Creation Atomicity Tests
  // ============================================================================

  /**
   * Feature: recurring-expenses-v2, Property 6: Creation Atomicity
   * Validates: Requirements 4.3
   */
  describe('Creation Atomicity', () => {
    /**
     * Helper to count expenses with a specific place
     */
    const countExpensesWithPlace = async (db, place) => {
      return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM expenses WHERE place = ?', [place], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
    };

    test('Property 6: successful creation should create all expenses atomically', async () => {
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
  });

  // ============================================================================
  // Expense Independence Tests
  // ============================================================================

  /**
   * Feature: recurring-expenses-v2, Property 5: Expense Independence
   * Validates: Requirements 3.1, 3.2, 3.3, 3.4
   */
  describe('Expense Independence', () => {
    const independenceExpenseArbitrary = fc.record({
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
      method: fc.constantFrom(...SAFE_PAYMENT_METHODS)
    });

    test('Property 5: future expenses should be completely independent with no link to source expense', async () => {
      await fc.assert(
        fc.asyncProperty(
          independenceExpenseArbitrary,
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
        pbtOptions()
      );
    }, 120000);

    test('editing a future expense should not affect source expense or other future expenses', async () => {
      await fc.assert(
        fc.asyncProperty(
          independenceExpenseArbitrary,
          independenceExpenseArbitrary,
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
            const firstFutureExpense = result.futureExpenses[0];
            await expenseService.updateExpense(firstFutureExpense.id, updatedData);
            
            // Property: Source expense should remain unchanged
            const sourceAfterEdit = await expenseService.getExpenseById(sourceId);
            expect(sourceAfterEdit.place).toBe(sourceOriginalPlace);
            expect(sourceAfterEdit.amount).toBe(sourceOriginalAmount);
            
            // Property: Other future expenses should remain unchanged
            for (let i = 0; i < otherFutureExpenses.length; i++) {
              const retrieved = await expenseService.getExpenseById(otherOriginalValues[i].id);
              expect(retrieved.place).toBe(otherOriginalValues[i].place);
              expect(retrieved.amount).toBe(otherOriginalValues[i].amount);
            }
            
            // Property: The edited expense should have the new values
            const editedExpense = await expenseService.getExpenseById(firstFutureExpense.id);
            expect(editedExpense.place).toBe(updatedData.place);
            expect(editedExpense.amount).toBe(updatedData.amount);
          }
        ),
        pbtOptions()
      );
    }, 120000);
  });

  // ============================================================================
  // Category Persistence Tests
  // ============================================================================

  /**
   * Feature: expanded-expense-categories, Property 2: Category persistence round-trip
   * Validates: Requirements 1.2, 1.3
   */
  describe('Category Persistence Round-Trip', () => {
    test('Property 2: creating and retrieving expense should preserve category', async () => {
      const createdIds = [];
      
      try {
        await fc.assert(
          fc.asyncProperty(
            // Generate random valid category
            fc.constantFrom(...CATEGORIES),
            // Generate random expense data
            fc.record({
              date: fc.integer({ min: 2020, max: 2030 }).chain(year =>
                fc.integer({ min: 1, max: 12 }).chain(month =>
                  fc.integer({ min: 1, max: 28 }).map(day =>
                    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  )
                )
              ),
              place: fc.string({ minLength: 1, maxLength: 50 }).map(s => `PBT_${s.replace(/[^a-zA-Z0-9]/g, '_')}`),
              notes: fc.option(fc.string({ maxLength: 100 }), { nil: null }),
              amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
                .map(n => parseFloat(n.toFixed(2))),
              method: fc.constantFrom(...SAFE_PAYMENT_METHODS)
            }),
            async (category, expenseData) => {
              // Create expense with the generated category
              const expenseToCreate = {
                ...expenseData,
                type: category
              };

              // Create the expense
              const createdExpense = await expenseService.createExpense(expenseToCreate);
              createdIds.push(createdExpense.id);
              
              // Retrieve the expense by ID
              const retrievedExpense = await expenseService.getExpenseById(createdExpense.id);
              
              // Property: The retrieved expense should have the same category as the created one
              expect(retrievedExpense).not.toBeNull();
              expect(retrievedExpense.type).toBe(category);
              expect(retrievedExpense.type).toBe(createdExpense.type);
            }
          ),
          pbtOptions()
        );
      } finally {
        // Clean up created expenses
        for (const id of createdIds) {
          try {
            await expenseService.deleteExpense(id);
          } catch (err) {
            // Ignore cleanup errors
          }
        }
      }
    }, 60000);
  });, 120000
});
