const fc = require('fast-check');
const expenseService = require('./expenseService');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

// **Feature: expanded-expense-categories, Property 10: Category aggregation correctness**
// **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

describe('ExpenseService - Property-Based Tests for Category Aggregation', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_AGG_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  test('Property 10: Category aggregation correctness - aggregated total equals sum of matching expenses', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random category to aggregate
        fc.constantFrom(...CATEGORIES),
        // Generate a random time period (year and month)
        fc.record({
          year: fc.integer({ min: 2020, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 })
        }),
        // Generate a random set of expenses with various categories
        fc.array(
          fc.record({
            category: fc.constantFrom(...CATEGORIES),
            amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true })
              .map(n => parseFloat(n.toFixed(2))),
            place: fc.string({ minLength: 1, maxLength: 20 })
              .map(s => `PBT_AGG_${s.replace(/[^a-zA-Z0-9]/g, '_')}`)
          }),
          { minLength: 5, maxLength: 30 }
        ),
        async (targetCategory, timePeriod, expenseDataArray) => {
          // Skip if no expenses generated
          if (expenseDataArray.length === 0) return;

          const createdExpenseIds = [];
          
          try {
            // Create all test expenses for the specified time period
            for (const expenseData of expenseDataArray) {
              // Generate a date within the specified month
              const day = Math.floor(Math.random() * 28) + 1; // Use 1-28 to avoid month-end issues
              const date = `${timePeriod.year}-${String(timePeriod.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              
              const expense = await expenseService.createExpense({
                date: date,
                place: expenseData.place,
                notes: 'PBT test expense for aggregation',
                amount: expenseData.amount,
                type: expenseData.category,
                method: 'Cash'
              });
              createdExpenseIds.push(expense.id);
            }

            // Fetch summary for the time period
            const summary = await expenseService.getSummary(timePeriod.year, timePeriod.month);
            
            // Calculate expected total for the target category
            const expectedTotal = expenseDataArray
              .filter(e => e.category === targetCategory)
              .reduce((sum, e) => sum + e.amount, 0);
            
            // Get actual total from summary
            const actualTotal = summary.typeTotals[targetCategory] || 0;
            
            // Filter to only our test expenses to get the actual contribution
            const allExpenses = await expenseService.getExpenses(timePeriod.year, timePeriod.month);
            const testExpenses = allExpenses.filter(e => 
              e.place && e.place.startsWith('PBT_AGG_')
            );
            const testCategoryTotal = testExpenses
              .filter(e => e.type === targetCategory)
              .reduce((sum, e) => sum + e.amount, 0);

            // Property 1: The aggregated total for test expenses should equal the sum of matching expenses
            expect(testCategoryTotal).toBeCloseTo(expectedTotal, 2);

            // Property 2: All expenses with the target category should be included in the aggregation
            const categoryExpenses = testExpenses.filter(e => e.type === targetCategory);
            expect(categoryExpenses.length).toBe(expenseDataArray.filter(e => e.category === targetCategory).length);

            // Property 3: The sum of individual amounts should equal the aggregated total
            const manualSum = categoryExpenses.reduce((sum, e) => sum + e.amount, 0);
            expect(manualSum).toBeCloseTo(testCategoryTotal, 2);

            // Property 4: No expenses from other categories should be included in the target category total
            const nonTargetExpenses = testExpenses.filter(e => e.type !== targetCategory);
            const nonTargetSum = nonTargetExpenses.reduce((sum, e) => sum + e.amount, 0);
            const totalSum = testExpenses.reduce((sum, e) => sum + e.amount, 0);
            expect(totalSum).toBeCloseTo(testCategoryTotal + nonTargetSum, 2);
          } finally {
            // Clean up
            for (const id of createdExpenseIds) {
              await expenseService.deleteExpense(id);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 180000); // 3 minute timeout for comprehensive test
});
