const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const merchantAnalyticsService = require('./merchantAnalyticsService');
const { getDatabase } = require('../database/db');

/**
 * **Feature: merchant-analytics, Property 5: Primary category and payment method are most frequent**
 * **Validates: Requirements 2.4**
 */
describe('MerchantAnalyticsService - Primary Fields Property Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clear all related tables before each test
    const tables = ['expense_people', 'expenses', 'monthly_gross', 'income_sources', 'fixed_expenses', 'loans', 'loan_balances', 'budgets', 'investments', 'investment_values', 'people'];
    
    for (const table of tables) {
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM ${table}`, (err) => {
          if (err && !err.message.includes('no such table')) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
    
    // Reset auto-increment counters
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM sqlite_sequence', (err) => {
        if (err && !err.message.includes('no such table')) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    
    // Verify cleanup worked by checking count
    await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM expenses', (err, row) => {
        if (err) reject(err);
        else if (row.count !== 0) reject(new Error(`Expected 0 expenses, found ${row.count}`));
        else resolve();
      });
    });
    
    // Wait to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  afterAll(async () => {
    // Clean up after tests
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  test('Property 5: Primary category and payment method are most frequent', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a merchant with expenses that have a clear most frequent category and method
        fc.record({
          place: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          primaryCategory: fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment'),
          primaryMethod: fc.constantFrom('Cash', 'Debit', 'CIBC MC', 'VISA'),
          primaryExpenses: fc.array(
            fc.record({
              amount: fc.float({ min: Math.fround(50), max: Math.fround(100), noNaN: true }), // Higher amounts
              date: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-30') })
                .map(d => {
                  try {
                    return d.toISOString().split('T')[0];
                  } catch (e) {
                    return '2024-06-15'; // fallback date
                  }
                }),
              week: fc.integer({ min: 1, max: 5 })
            }),
            { minLength: 4, maxLength: 6 } // More of the primary type
          ),
          otherExpenses: fc.array(
            fc.record({
              amount: fc.float({ min: Math.fround(1), max: Math.fround(10), noNaN: true }), // Much lower amounts
              date: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-30') })
                .map(d => {
                  try {
                    return d.toISOString().split('T')[0];
                  } catch (e) {
                    return '2024-06-15'; // fallback date
                  }
                }),
              type: fc.constantFrom('Utilities', 'Insurance'), // Different categories
              method: fc.constantFrom('Cheque', 'WS VISA'), // Different methods
              week: fc.integer({ min: 1, max: 5 })
            }),
            { minLength: 0, maxLength: 1 } // Fewer of other types
          )
        }),
        async (testData) => {
          // Clean database before each iteration - more thorough cleanup
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expense_people', (err) => {
              if (err && !err.message.includes('no such table')) reject(err);
              else resolve();
            });
          });
          
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          
          // Reset auto-increment
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM sqlite_sequence WHERE name = "expenses"', (err) => {
              if (err && !err.message.includes('no such table')) reject(err);
              else resolve();
            });
          });
          
          // Verify cleanup
          await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM expenses', (err, row) => {
              if (err) reject(err);
              else if (row.count !== 0) reject(new Error(`Database not clean: ${row.count} expenses remain`));
              else resolve();
            });
          });

          // Insert primary expenses (all with same category and method)
          for (const expense of testData.primaryExpenses) {
            await new Promise((resolve, reject) => {
              const sql = `
                INSERT INTO expenses (date, place, notes, amount, type, week, method)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `;
              db.run(sql, [
                expense.date,
                testData.place,
                'Primary expense',
                expense.amount,
                testData.primaryCategory,
                expense.week,
                testData.primaryMethod
              ], (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          }

          // Insert other expenses (with different categories and methods)
          for (const expense of testData.otherExpenses) {
            await new Promise((resolve, reject) => {
              const sql = `
                INSERT INTO expenses (date, place, notes, amount, type, week, method)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `;
              db.run(sql, [
                expense.date,
                testData.place,
                'Other expense',
                expense.amount,
                expense.type,
                expense.week,
                expense.method
              ], (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          }

          // Get merchant details
          const details = await merchantAnalyticsService.getMerchantDetails(testData.place, { period: 'all' });
          
          expect(details).not.toBeNull();

          // Verify primary category is the most frequent
          expect(details.primaryCategory).toBe(testData.primaryCategory);
          
          // Verify primary payment method is the most frequent
          expect(details.primaryPaymentMethod).toBe(testData.primaryMethod);

          // Verify category breakdown shows primary category with highest count
          const primaryCategoryBreakdown = details.categoryBreakdown.find(cat => cat.category === testData.primaryCategory);
          expect(primaryCategoryBreakdown).toBeDefined();
          expect(primaryCategoryBreakdown.count).toBeGreaterThanOrEqual(testData.primaryExpenses.length);

          // Verify payment method breakdown shows primary method with highest count
          const primaryMethodBreakdown = details.paymentMethodBreakdown.find(method => method.method === testData.primaryMethod);
          expect(primaryMethodBreakdown).toBeDefined();
          expect(primaryMethodBreakdown.count).toBeGreaterThanOrEqual(testData.primaryExpenses.length);

          // Verify that primary category has the highest count among all categories
          for (const categoryData of details.categoryBreakdown) {
            if (categoryData.category !== testData.primaryCategory) {
              expect(primaryCategoryBreakdown.count).toBeGreaterThanOrEqual(categoryData.count);
            }
          }

          // Verify that primary method has the highest count among all methods
          for (const methodData of details.paymentMethodBreakdown) {
            if (methodData.method !== testData.primaryMethod) {
              expect(primaryMethodBreakdown.count).toBeGreaterThanOrEqual(methodData.count);
            }
          }
        }
      ),
      pbtOptions({ timeout: 10000 })
    );
  }, 15000);
});