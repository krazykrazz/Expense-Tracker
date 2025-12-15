const fc = require('fast-check');
const merchantAnalyticsService = require('./merchantAnalyticsService');
const { getDatabase } = require('../database/db');

/**
 * **Feature: merchant-analytics, Property 6: Visit frequency sorting is correct**
 * **Validates: Requirements 3.1**
 */
describe('MerchantAnalyticsService - Visit Frequency Sorting Property Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clear expenses table before each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Reset auto-increment counter
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM sqlite_sequence WHERE name = "expenses"', (err) => {
        if (err && !err.message.includes('no such table')) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    
    // Wait to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 10));
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

  test('Property 6: Visit frequency sorting is correct', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate multiple merchants with different visit counts
        fc.uniqueArray(
          fc.record({
            place: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            expenses: fc.array(
              fc.record({
                amount: fc.float({ min: Math.fround(1), max: Math.fround(100) }),
                date: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-30') })
                  .map(d => {
                    try {
                      return d.toISOString().split('T')[0];
                    } catch (e) {
                      return '2024-06-15'; // fallback date
                    }
                  }),
                type: fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment'),
                method: fc.constantFrom('Cash', 'Debit', 'CIBC MC', 'VISA'),
                week: fc.integer({ min: 1, max: 5 })
              }),
              { minLength: 1, maxLength: 10 }
            )
          }),
          { minLength: 2, maxLength: 5, selector: (item) => item.place }
        ),
        async (merchantData) => {
          // Ensure complete database cleanup before each iteration
          await new Promise((resolve, reject) => {
            db.serialize(() => {
              db.run('DELETE FROM expenses', (err) => {
                if (err) {
                  reject(err);
                  return;
                }
              });
              
              // Reset auto-increment counter to ensure clean state
              db.run('DELETE FROM sqlite_sequence WHERE name = "expenses"', (err) => {
                if (err && !err.message.includes('no such table')) {
                  reject(err);
                  return;
                }
              });
              
              // Verify cleanup worked by checking count
              db.get('SELECT COUNT(*) as count FROM expenses', (err, row) => {
                if (err) {
                  reject(err);
                  return;
                }
                if (row.count > 0) {
                  reject(new Error(`Database cleanup failed: ${row.count} expenses remain`));
                  return;
                }
                resolve();
              });
            });
          });

          // Insert test expenses into database with better error handling
          for (const merchant of merchantData) {
            for (const expense of merchant.expenses) {
              await new Promise((resolve, reject) => {
                const sql = `
                  INSERT INTO expenses (date, place, notes, amount, type, week, method)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `;
                db.run(sql, [
                  expense.date,
                  merchant.place,
                  'Test expense',
                  expense.amount,
                  expense.type,
                  expense.week,
                  expense.method
                ], function(err) {
                  if (err) {
                    reject(new Error(`Failed to insert expense: ${err.message}`));
                    return;
                  }
                  resolve();
                });
              });
            }
          }

          // Verify data was inserted correctly
          const totalInserted = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM expenses', (err, row) => {
              if (err) reject(err);
              else resolve(row.count);
            });
          });

          const expectedTotal = merchantData.reduce((sum, merchant) => sum + merchant.expenses.length, 0);
          expect(totalInserted).toBe(expectedTotal);

          // Get merchants sorted by visit frequency
          const merchantsByVisits = await merchantAnalyticsService.getTopMerchants({ period: 'all' }, 'visits');

          // Verify that results are sorted by visitCount in descending order
          for (let i = 0; i < merchantsByVisits.length - 1; i++) {
            expect(merchantsByVisits[i].visitCount).toBeGreaterThanOrEqual(merchantsByVisits[i + 1].visitCount);
          }

          // Verify that each merchant's visit count matches expected (unique dates)
          for (const result of merchantsByVisits) {
            const merchantExpenses = merchantData
              .find(m => m.place === result.name)
              ?.expenses || [];
            
            // Calculate unique dates for this merchant
            const uniqueDates = new Set(merchantExpenses.map(e => e.date));
            const expectedVisitCount = uniqueDates.size;
            
            expect(result.visitCount).toBe(expectedVisitCount);
          }

          // Verify we have the expected number of merchants
          expect(merchantsByVisits.length).toBe(merchantData.length);
        }
      ),
      { numRuns: 20, timeout: 15000 }
    );
  }, 20000);
});