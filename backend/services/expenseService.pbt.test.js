const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const { getDatabase, recreateTestDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

describe('ExpenseService - Property-Based Tests for Category Persistence', () => {
  let db;

  beforeAll(async () => {
    // Get a fresh database connection
    db = await getDatabase();
  });

  afterAll(async () => {
    // Clean up test data
    if (db) {
      try {
        await new Promise((resolve) => {
          db.run('DELETE FROM expenses WHERE place LIKE "PBT_%"', () => resolve());
        });
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  });

  // **Feature: expanded-expense-categories, Property 2: Category persistence round-trip**
  // **Validates: Requirements 1.2, 1.3**
  test('Property 2: Category persistence round-trip - creating and retrieving expense should preserve category', async () => {
    // Track created expense IDs for cleanup
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
            method: fc.constantFrom('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')
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
        pbtOptions() // Reduced from 100 to minimize database stress
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
});
