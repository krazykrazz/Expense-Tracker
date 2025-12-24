const fc = require('fast-check');
const expenseRepository = require('./expenseRepository');
const { getDatabase } = require('../database/db');

/**
 * **Feature: merchant-analytics, Property 1: Merchant ranking by total spend is correctly sorted**
 * **Validates: Requirements 1.1**
 */
describe('ExpenseRepository - Merchant Ranking Property Tests', () => {
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
    // Insert test data
    await new Promise((resolve, reject) => {
      const sql = `INSERT INTO expenses (date, place, notes, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      db.run(sql, ['2024-01-01', 'Store A', 'Test', 100.00, 'Groceries', 1, 'Cash'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      const sql = `INSERT INTO expenses (date, place, notes, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      db.run(sql, ['2024-01-02', 'Store B', 'Test', 50.00, 'Groceries', 1, 'Cash'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const results = await expenseRepository.getMerchantAnalytics();
    
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('Store A');
    expect(results[0].totalSpend).toBe(100.00);
    expect(results[1].name).toBe('Store B');
    expect(results[1].totalSpend).toBe(50.00);
  });

  test('Property 1: Merchant ranking by total spend is correctly sorted', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate array of merchants with unique names and expenses
        fc.uniqueArray(
          fc.record({
            place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            expenses: fc.array(
              fc.record({
                amount: fc.float({ min: Math.fround(0.01), max: Math.fround(100) }),
                date: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') })
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
              { minLength: 1, maxLength: 5 }
            )
          }),
          { minLength: 2, maxLength: 5, selector: (item) => item.place }
        ),
        async (merchantData) => {
          // Insert test expenses into database
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
                ], (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });
            }
          }

          // Get merchant analytics (should be sorted by total spend descending)
          const results = await expenseRepository.getMerchantAnalytics();

          // Verify that results are sorted by totalSpend in descending order
          for (let i = 0; i < results.length - 1; i++) {
            expect(results[i].totalSpend).toBeGreaterThanOrEqual(results[i + 1].totalSpend);
          }

          // Verify that our test merchants are present and correctly ordered among themselves
          const testMerchants = results.filter(r => merchantData.some(m => m.place === r.name));
          
          // Check that test merchants are sorted correctly relative to each other
          for (let i = 0; i < testMerchants.length - 1; i++) {
            expect(testMerchants[i].totalSpend).toBeGreaterThanOrEqual(testMerchants[i + 1].totalSpend);
          }

          // Verify that we have at least our test merchants
          expect(testMerchants.length).toBe(merchantData.length);
        }
      ),
      { numRuns: 10 }
    );
  });
});