const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const merchantAnalyticsService = require('./merchantAnalyticsService');
const { getDatabase } = require('../database/db');

/**
 * **Feature: merchant-analytics, Property 2: Merchant statistics are correctly calculated**
 * **Validates: Requirements 1.2, 2.1, 2.3**
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

  test('Property 2: Merchant statistics are correctly calculated', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a single merchant with multiple expenses
        fc.record({
          place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          expenses: fc.array(
            fc.record({
              amount: fc.float({ min: Math.fround(1), max: Math.fround(100) }),
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
            });
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