/**
 * Property-Based Tests for Budget Service
 * Using fast-check library for property-based testing
  *
 * @invariant Budget CRUD and Threshold Logic: For any valid budget with a category and amount, storing and retrieving it returns equivalent data; budget utilization percentages are calculated correctly relative to actual spending. Randomization covers diverse budget amounts and spending patterns.
 */

const fc = require('fast-check');
const { dbPbtOptions } = require('../test/pbtArbitraries');
const budgetService = require('./budgetService');
const { getDatabase } = require('../database/db');
const { BUDGETABLE_CATEGORIES } = require('../utils/categories');

describe('BudgetService - Property-Based Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_BUDGET_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Only clean up budgets if the table exists
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM budgets WHERE year >= 2026 AND year <= 2030', (err) => {
        // Ignore "no such table" errors
        if (err && !err.message.includes('no such table')) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });

  /**
   * Feature: expanded-expense-categories, Property 5: Budget calculation accuracy
   * Validates: Requirements 3.2, 3.3, 3.5
   * 
   * For any budgetable category and any set of expenses, the calculated spending 
   * for that category should equal the sum of all expense amounts where type matches that category
   */
  test('Property 5: Budget calculation accuracy - spending calculation matches sum of expenses', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random budgetable category
        fc.constantFrom(...BUDGETABLE_CATEGORIES),
        // Generate random year and month (use future dates to avoid existing data)
        fc.record({
          year: fc.integer({ min: 2026, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 })
        }),
        // Generate random set of expenses (1-10 expenses to ensure we have data)
        fc.array(
          fc.record({
            amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true })
              .map(n => parseFloat(n.toFixed(2))),
            day: fc.integer({ min: 1, max: 28 }) // Use day 1-28 to avoid month-end issues
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (category, dateInfo, expenses) => {
          const { year, month } = dateInfo;
          
          // Get the spending BEFORE we add our test expenses
          const spentBefore = await budgetService.getSpentAmount(year, month, category);
          
          // Calculate expected total for our new expenses
          const expectedAdditional = expenses.reduce((sum, exp) => sum + exp.amount, 0);
          
          // Create expenses in the database
          for (const expense of expenses) {
            const date = `${year}-${String(month).padStart(2, '0')}-${String(expense.day).padStart(2, '0')}`;
            
            await new Promise((resolve, reject) => {
              db.run(
                `INSERT INTO expenses (date, place, notes, amount, type, week, method) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [date, `PBT_BUDGET_${category}`, 'Property test', expense.amount, category, 1, 'Cash'],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
          }
          
          // Get spent amount AFTER adding our expenses
          const spentAfter = await budgetService.getSpentAmount(year, month, category);
          
          // Property: The increase in spending should equal the sum of our added expenses
          // Allow for small floating point differences
          const actualIncrease = spentAfter - spentBefore;
          expect(Math.abs(actualIncrease - expectedAdditional)).toBeLessThan(0.01);
        }
      ),
      dbPbtOptions()
    );
  }, 120000); // 2 minute timeout for database operations

  /**
   * Feature: expanded-expense-categories, Property 6: Budget status indication
   * Validates: Requirements 3.4
   * 
   * For any budget, if the calculated spending exceeds the limit, 
   * the budget status should indicate "over budget"
   */
  test('Property 6: Budget status indication - status is critical when spending exceeds limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random budgetable category
        fc.constantFrom(...BUDGETABLE_CATEGORIES),
        // Generate random year and month (use future dates to avoid existing data)
        fc.record({
          year: fc.integer({ min: 2026, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 })
        }),
        // Generate budget limit
        fc.float({ min: Math.fround(100), max: Math.fround(1000), noNaN: true })
          .map(n => parseFloat(n.toFixed(2))),
        // Generate spending that exceeds the limit
        fc.float({ min: Math.fround(1.01), max: Math.fround(2.0), noNaN: true }), // Multiplier > 1
        async (category, dateInfo, budgetLimit, spendingMultiplier) => {
          const { year, month } = dateInfo;
          
          // Clean up any existing budget for this category/month from previous iterations
          await new Promise((resolve, reject) => {
            db.run(
              'DELETE FROM budgets WHERE year = ? AND month = ? AND category = ?',
              [year, month, category],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          
          // Calculate spending amount that exceeds the budget
          const spendingAmount = parseFloat((budgetLimit * spendingMultiplier).toFixed(2));
          
          // Create a budget
          const budget = await budgetService.createBudget(year, month, category, budgetLimit);
          
          // Create an expense that exceeds the budget
          const date = `${year}-${String(month).padStart(2, '0')}-15`;
          await new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO expenses (date, place, notes, amount, type, week, method) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [date, `PBT_BUDGET_OVER_${category}`, 'Over budget test', spendingAmount, category, 3, 'Cash'],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          
          // Get budget progress
          const progress = await budgetService.getBudgetProgress(budget.id);
          
          // Property: When spending exceeds limit, status should be 'critical'
          expect(progress.spent).toBeGreaterThan(budgetLimit);
          expect(progress.progress).toBeGreaterThanOrEqual(100);
          expect(progress.status).toBe('critical');
          expect(progress.remaining).toBeLessThan(0);
        }
      ),
      dbPbtOptions()
    );
  }, 120000); // 2 minute timeout for database operations
});
