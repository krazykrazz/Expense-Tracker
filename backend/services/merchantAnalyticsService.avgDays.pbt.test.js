const fc = require('fast-check');
const merchantAnalyticsService = require('./merchantAnalyticsService');
const { getDatabase } = require('../database/db');

/**
 * **Feature: merchant-analytics, Property 7: Average days between visits is correctly calculated**
 * **Validates: Requirements 3.2**
 */
describe('MerchantAnalyticsService - Average Days Between Visits Property Tests', () => {
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

  test('Property 7: Average days between visits is correctly calculated', async () => {
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
            });
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
      { numRuns: 50 }
    );
  });
});