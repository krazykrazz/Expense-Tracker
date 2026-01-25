const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const merchantAnalyticsService = require('./merchantAnalyticsService');
const { getDatabase } = require('../database/db');

/**
 * **Feature: merchant-analytics, Property 4: First and last visit dates are correctly identified**
 * **Validates: Requirements 2.2**
 */
describe('MerchantAnalyticsService - Visit Dates Property Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clear all related tables before each test
    const tables = ['expenses', 'monthly_gross', 'income_sources', 'fixed_expenses', 'loans', 'loan_balances', 'budgets', 'investments', 'investment_values'];
    
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
    
    // Reset all auto-increment counters
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM sqlite_sequence', (err) => {
        if (err && !err.message.includes('no such table')) {
          reject(err);
        } else {
          resolve();
        }
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

  test('Simple test to verify basic functionality', async () => {
    const testPlace = 'TestStore123';
    
    // Insert test data
    await new Promise((resolve, reject) => {
      const sql = `INSERT INTO expenses (date, place, notes, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      db.run(sql, ['2024-01-01', testPlace, 'Test', 100.00, 'Groceries', 1, 'Cash'], (err) => {
        if (err) reject(err);
        else resolve();
      });
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

  test('Property 4: First and last visit dates are correctly identified', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a merchant with multiple expenses on different dates
        fc.record({
          place: fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length > 4 && !s.includes('!') && !s.includes('"')).map(s => `TEST_${Date.now()}_${s}`),
          expenses: fc.array(
            fc.record({
              amount: fc.float({ min: Math.fround(1), max: Math.fround(100) }),
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
            });
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
          
          // Debug: Check if there are unexpected expenses in the database
          const allExpenses = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM expenses WHERE place = ?', [merchantData.place], (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            });
          });
          
          if (allExpenses.length !== merchantData.expenses.length) {
            console.log(`Expected ${merchantData.expenses.length} expenses, found ${allExpenses.length} for merchant ${merchantData.place}`);
            console.log('All expenses:', allExpenses);
          }

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