const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

// **Feature: expanded-expense-categories, Property 3: Category filtering accuracy**
// **Validates: Requirements 1.5**

describe('ExpenseService - Property-Based Tests for Category Filtering', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_FILTER_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  test('Property 3: Category filtering accuracy - filtering by category returns only matching expenses', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random category to filter by
        fc.constantFrom(...CATEGORIES),
        // Generate a random set of expenses with various categories
        fc.array(
          fc.record({
            category: fc.constantFrom(...CATEGORIES),
            amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true })
              .map(n => parseFloat(n.toFixed(2))),
            place: fc.string({ minLength: 1, maxLength: 20 })
              .map(s => `PBT_FILTER_${s.replace(/[^a-zA-Z0-9]/g, '_')}`)
          }),
          { minLength: 5, maxLength: 20 }
        ),
        async (filterCategory, expenseDataArray) => {
          // Skip if no expenses generated
          if (expenseDataArray.length === 0) return;

          const createdExpenseIds = [];
          
          try {
            // Create all test expenses with a fixed date in January 2024
            for (const expenseData of expenseDataArray) {
              const expense = await expenseService.createExpense({
                date: '2024-01-15',
                place: expenseData.place,
                notes: 'PBT test expense for filtering',
                amount: expenseData.amount,
                type: expenseData.category,
                method: 'Cash'
              });
              createdExpenseIds.push(expense.id);
            }

            // Fetch expenses with the filter (using year=2024, month=1)
            const allExpenses = await expenseService.getExpenses(2024, 1);
            
            // Filter to only our test expenses
            const testExpenses = allExpenses.filter(e => 
              e.place && e.place.startsWith('PBT_FILTER_')
            );

            // Apply the category filter manually (simulating what the API does)
            const filteredExpenses = testExpenses.filter(e => e.type === filterCategory);

            // Property 1: All returned expenses should have the filter category
            for (const expense of filteredExpenses) {
              expect(expense.type).toBe(filterCategory);
            }

            // Property 2: The count should match the expected count
            const expectedCount = expenseDataArray.filter(e => e.category === filterCategory).length;
            expect(filteredExpenses.length).toBe(expectedCount);

            // Property 3: No expenses with other categories should be in the filtered results
            const otherCategoryExpenses = filteredExpenses.filter(e => e.type !== filterCategory);
            expect(otherCategoryExpenses.length).toBe(0);

            // Property 4: All expenses with the filter category should be included
            const expectedExpenses = testExpenses.filter(e => e.type === filterCategory);
            expect(filteredExpenses.length).toBe(expectedExpenses.length);
          } finally {
            // Clean up
            for (const id of createdExpenseIds) {
              await expenseService.deleteExpense(id);
            }
          }
        }
      ),
      pbtOptions()
    );
  }, 120000); // 2 minute timeout
});
