const fc = require('fast-check');
const merchantAnalyticsService = require('./merchantAnalyticsService');
const { getDatabase } = require('../database/db');

/**
 * **Feature: merchant-analytics, Property 3: Date range filtering includes only expenses within the period**
 * **Validates: Requirements 1.3, 4.2, 4.3, 4.4, 4.5**
 */
describe('MerchantAnalyticsService - Date Range Filtering Property Tests', () => {
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

  test('Property 3: Date range filtering includes only expenses within the period', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate expenses with dates both inside and outside a specific year
        fc.record({
          targetYear: fc.integer({ min: 2020, max: 2024 }),
          insideExpenses: fc.array(
            fc.record({
              place: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0).map(s => `INSIDE_${s}`),
              amount: fc.float({ min: Math.fround(1), max: Math.fround(100) }),
              month: fc.integer({ min: 1, max: 12 }),
              day: fc.integer({ min: 1, max: 28 }),
              type: fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment'),
              method: fc.constantFrom('Cash', 'Debit', 'CIBC MC', 'VISA'),
              week: fc.integer({ min: 1, max: 5 })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          outsideExpenses: fc.array(
            fc.record({
              place: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0).map(s => `OUTSIDE_${s}`),
              amount: fc.float({ min: Math.fround(1), max: Math.fround(100) }),
              year: fc.integer({ min: 2015, max: 2019 }), // Years outside target range
              month: fc.integer({ min: 1, max: 12 }),
              day: fc.integer({ min: 1, max: 28 }),
              type: fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment'),
              method: fc.constantFrom('Cash', 'Debit', 'CIBC MC', 'VISA'),
              week: fc.integer({ min: 1, max: 5 })
            }),
            { minLength: 0, maxLength: 3 }
          )
        }),
        async (testData) => {
          // Clean database before each iteration
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // Insert expenses inside the target year
          for (const expense of testData.insideExpenses) {
            const date = `${testData.targetYear}-${expense.month.toString().padStart(2, '0')}-${expense.day.toString().padStart(2, '0')}`;
            await new Promise((resolve, reject) => {
              const sql = `
                INSERT INTO expenses (date, place, notes, amount, type, week, method)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `;
              db.run(sql, [
                date,
                expense.place,
                'Inside target year',
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

          // Insert expenses outside the target year
          for (const expense of testData.outsideExpenses) {
            const date = `${expense.year}-${expense.month.toString().padStart(2, '0')}-${expense.day.toString().padStart(2, '0')}`;
            await new Promise((resolve, reject) => {
              const sql = `
                INSERT INTO expenses (date, place, notes, amount, type, week, method)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `;
              db.run(sql, [
                date,
                expense.place,
                'Outside target year',
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

          // Test year filtering
          const yearFiltered = await merchantAnalyticsService.getTopMerchants({ 
            period: 'year', 
            year: testData.targetYear 
          });

          // All returned merchants should only have expenses from the target year
          for (const merchant of yearFiltered) {
            const merchantExpenses = await merchantAnalyticsService.getMerchantExpenses(
              merchant.name, 
              { period: 'year', year: testData.targetYear }
            );
            
            for (const expense of merchantExpenses) {
              // Use string comparison to avoid timezone issues
              const expenseYear = parseInt(expense.date.split('-')[0]);
              expect(expenseYear).toBe(testData.targetYear);
            }
          }

          // Test 'all' period should include all expenses
          const allFiltered = await merchantAnalyticsService.getTopMerchants({ period: 'all' });
          const totalExpensesInAll = allFiltered.reduce((sum, m) => sum + m.visitCount, 0);
          const expectedTotal = testData.insideExpenses.length + testData.outsideExpenses.length;
          expect(totalExpensesInAll).toBe(expectedTotal);

          // Test month filtering (using first month of target year)
          const monthFiltered = await merchantAnalyticsService.getTopMerchants({ 
            period: 'month', 
            year: testData.targetYear,
            month: 1
          });

          for (const merchant of monthFiltered) {
            const merchantExpenses = await merchantAnalyticsService.getMerchantExpenses(
              merchant.name, 
              { period: 'month', year: testData.targetYear, month: 1 }
            );
            
            for (const expense of merchantExpenses) {
              // Use string comparison to avoid timezone issues
              const dateParts = expense.date.split('-');
              const expenseYear = parseInt(dateParts[0]);
              const expenseMonth = parseInt(dateParts[1]);
              expect(expenseYear).toBe(testData.targetYear);
              expect(expenseMonth).toBe(1); // January
            }
          }
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  }, 10000);
});