const fc = require('fast-check');
const { pbtOptions, dbPbtOptions } = require('../test/pbtArbitraries');
const merchantAnalyticsService = require('./merchantAnalyticsService');
const { getDatabase } = require('../database/db');

/**
 * @invariant Merchant statistics (total spend, visit count, averages, percentages) must be 
 * internally consistent and correctly calculated across randomized expense data.
 * 
 * Randomness adds value by testing calculation correctness across varying expense amounts,
 * dates, categories, and visit patterns that would be impractical to enumerate manually.
 * 
 * **Feature: merchant-analytics**
 * **Validates: Requirements 1.2, 2.1, 2.2, 2.3, 3.1, 3.2**
 */
describe('MerchantAnalyticsService - Statistics Calculation Property Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clear expenses table
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Reset auto-increment counter for expenses table
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM sqlite_sequence WHERE name = ?', ['expenses'], (err) => {
        if (err && !err.message.includes('no such table')) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });

  afterEach(async () => {
    // Clean up after each test to ensure isolation
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterAll(async () => {
    // Final cleanup after all tests
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  describe('Property 2: Merchant statistics are correctly calculated', () => {
    test('Statistics internal consistency', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a single merchant with multiple expenses
          fc.record({
            place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            expenses: fc.array(
              fc.record({
                amount: fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }),
                date: fc.constantFrom('2024-01-01', '2024-02-15', '2024-06-30', '2024-12-31'),
                type: fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment'),
                method: fc.constantFrom('Cash', 'Debit', 'CIBC MC', 'VISA'),
                week: fc.integer({ min: 1, max: 5 })
              }),
              { minLength: 1, maxLength: 10 }
            )
          }),
          async (merchantData) => {
            // Clean up any existing data at the start of each iteration
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });, 120000
            });
            
            // Verify database is clean before starting
            const initialCount = await new Promise((resolve, reject) => {
              db.get('SELECT COUNT(*) as count FROM expenses', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
              });
            });
            expect(initialCount).toBe(0);

            // Insert test expenses into database
            for (const expense of merchantData.expenses) {
              await new Promise((resolve, reject) => {
                const sql = `
                  INSERT INTO expenses (date, place, notes, amount, type, week, method)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `;
                db.run(sql, [
                  expense.date,
                  merchantData.place,
                  'Test expense',
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

            // Get merchant analytics
            const merchants = await merchantAnalyticsService.getTopMerchants({ period: 'all' });
            
            // Verify we only have our test merchant
            expect(merchants).toHaveLength(1);
            expect(merchants[0].name).toBe(merchantData.place);
            
            const merchant = merchants[0];

            // Verify statistics are internally consistent for our test merchant
            expect(merchant.name).toBe(merchantData.place);
            
            // Verify that average spend is calculated correctly (total / visits)
            expect(Math.abs(merchant.averageSpend - (merchant.totalSpend / merchant.visitCount))).toBeLessThan(0.01);
            
            // Verify that percentage is reasonable (should be > 0 and <= 100)
            expect(merchant.percentOfTotal).toBeGreaterThan(0);
            expect(merchant.percentOfTotal).toBeLessThanOrEqual(100);
            
            // Verify that visit count is positive
            expect(merchant.visitCount).toBeGreaterThan(0);
            
            // Verify that total spend is positive
            expect(merchant.totalSpend).toBeGreaterThan(0);

            // Get detailed merchant information
            const details = await merchantAnalyticsService.getMerchantDetails(merchantData.place, { period: 'all' });
            
            expect(details).not.toBeNull();
            expect(details.totalSpend).toBe(merchant.totalSpend);
            expect(details.visitCount).toBe(merchant.visitCount);
            expect(details.averageSpend).toBe(merchant.averageSpend);
            expect(details.percentOfTotal).toBe(merchant.percentOfTotal);

            // Verify category breakdown internal consistency (allow for floating point precision)
            const categoryTotal = details.categoryBreakdown.reduce((sum, cat) => sum + cat.amount, 0);
            expect(Math.abs(categoryTotal - details.totalSpend)).toBeLessThan(0.1);

            // Verify category percentages sum to approximately 100% (allow for floating point precision)
            const percentageTotal = details.categoryBreakdown.reduce((sum, cat) => sum + cat.percentage, 0);
            expect(Math.abs(percentageTotal - 100)).toBeLessThan(1);
          }
        ),
        pbtOptions()
      );
    });
  });

  describe('Property 7: Average days between visits is correctly calculated', () => {
    test('Average days calculation', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a merchant with expenses on specific dates
          fc.record({
            place: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            dates: fc.uniqueArray(
              fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') })
                .map(d => {
                  try {
                    return d.toISOString().split('T')[0];
                  } catch (e) {
                    // Fallback to a valid date if conversion fails
                    return '2024-01-01';
                  }
                }),
              { minLength: 2, maxLength: 5 }
            ).map(dates => dates.sort()) // Sort dates chronologically
          }),
          async (testData) => {
            // Clear database for this iteration
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });, 120000
            });
            
            // Insert test expenses into database
            for (const date of testData.dates) {
              await new Promise((resolve, reject) => {
                const sql = `
                  INSERT INTO expenses (date, place, notes, amount, type, week, method)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `;
                db.run(sql, [
                  date,
                  testData.place,
                  'Test expense',
                  50.00,
                  'Groceries',
                  1,
                  'Cash'
                ], (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });
            }

            // Get merchant details
            const details = await merchantAnalyticsService.getMerchantDetails(testData.place, { period: 'all' });
            
            expect(details).not.toBeNull();

            if (testData.dates.length === 1) {
              // Single visit should have null average days between visits
              expect(details.avgDaysBetweenVisits).toBeNull();
            } else {
              // Multiple visits should have calculated average days
              const firstDate = new Date(testData.dates[0]);
              const lastDate = new Date(testData.dates[testData.dates.length - 1]);
              const totalDays = Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24));
              const expectedAvgDays = parseFloat((totalDays / (testData.dates.length - 1)).toFixed(1));
              
              expect(details.avgDaysBetweenVisits).toBe(expectedAvgDays);
            }

            // Verify visit count matches number of dates
            expect(details.visitCount).toBe(testData.dates.length);

            // Verify first and last visit dates
            expect(details.firstVisit).toBe(testData.dates[0]);
            expect(details.lastVisit).toBe(testData.dates[testData.dates.length - 1]);
          }
        ),
        pbtOptions()
      );
    });
  });

  describe('Property 6: Visit frequency sorting is correct', () => {
    test('Visit frequency sorting', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate multiple merchants with different visit counts
          fc.uniqueArray(
            fc.record({
              place: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              expenses: fc.array(
                fc.record({
                  amount: fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }),
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
                });, 120000
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
        dbPbtOptions({ timeout: 25000 })
      );
    }, 30000);
  });

  describe('Property 4: First and last visit dates are correctly identified', () => {
    test('Simple test to verify basic functionality', async () => {
      const testPlace = 'TestStore123';
      
      // Insert test data
      await new Promise((resolve, reject) => {
        const sql = `INSERT INTO expenses (date, place, notes, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        db.run(sql, ['2024-01-01', testPlace, 'Test', 100.00, 'Groceries', 1, 'Cash'], (err) => {
          if (err) reject(err);
          else resolve();
        });, 120000
      });

      await new Promise((resolve, reject) => {
        const sql = `INSERT INTO expenses (date, place, notes, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        db.run(sql, ['2024-01-05', testPlace, 'Test', 50.00, 'Groceries', 1, 'Cash'], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const details = await merchantAnalyticsService.getMerchantDetails(testPlace, { period: 'all' });
      
      expect(details).not.toBeNull();
      expect(details.firstVisit).toBe('2024-01-01');
      expect(details.lastVisit).toBe('2024-01-05');
      expect(details.visitCount).toBe(2);
      expect(details.avgDaysBetweenVisits).toBe(4.0);
    });

    test('Visit dates identification', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a merchant with multiple expenses on different dates
          fc.record({
            place: fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length > 4 && !s.includes('!') && !s.includes('"')).map(s => `TEST_${Date.now()}_${s}`),
            expenses: fc.array(
              fc.record({
                amount: fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }),
                date: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') })
                  .map(d => {
                    try {
                      return d.toISOString().split('T')[0];
                    } catch (e) {
                      // Fallback to a valid date if conversion fails
                      return '2024-01-01';
                    }
                  }),
                type: fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment'),
                method: fc.constantFrom('Cash', 'Debit', 'CIBC MC', 'VISA'),
                week: fc.integer({ min: 1, max: 5 })
              }),
              { minLength: 2, maxLength: 10 }
            )
          }),
          async (merchantData) => {
            // Clear database for this iteration
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });, 120000
            });
            
            // Insert test expenses into database
            for (const expense of merchantData.expenses) {
              await new Promise((resolve, reject) => {
                const sql = `
                  INSERT INTO expenses (date, place, notes, amount, type, week, method)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `;
                db.run(sql, [
                  expense.date,
                  merchantData.place,
                  'Test expense',
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
            const details = await merchantAnalyticsService.getMerchantDetails(merchantData.place, { period: 'all' });
            
            expect(details).not.toBeNull();
            
            // Calculate expected first and last visit dates from unique dates
            const uniqueDates = [...new Set(merchantData.expenses.map(exp => exp.date))].sort();
            const expectedFirstVisit = uniqueDates[0];
            const expectedLastVisit = uniqueDates[uniqueDates.length - 1];

            // Verify first and last visit dates are correctly identified
            expect(details.firstVisit).toBe(expectedFirstVisit);
            expect(details.lastVisit).toBe(expectedLastVisit);

            // Verify visit count matches number of unique dates
            expect(details.visitCount).toBe(uniqueDates.length);

            // If there are multiple unique visit dates, verify average days between visits calculation
            if (uniqueDates.length > 1) {
              const firstDate = new Date(expectedFirstVisit);
              const lastDate = new Date(expectedLastVisit);
              const daysDiff = Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24));
              const expectedAvgDays = parseFloat((daysDiff / (uniqueDates.length - 1)).toFixed(1));
              
              expect(details.avgDaysBetweenVisits).toBe(expectedAvgDays);
            } else {
              expect(details.avgDaysBetweenVisits).toBeNull();
            }
          }
        ),
        pbtOptions()
      );
    });
  });
});
