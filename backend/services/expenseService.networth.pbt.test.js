const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const { getDatabase } = require('../database/db');

describe('ExpenseService - Net Worth Property-Based Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM investment_values WHERE year IN (9997, 9998)', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loan_balances WHERE year IN (9997, 9998)', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM investments WHERE name LIKE "PBT_NetWorth_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loans WHERE name LIKE "PBT_NetWorth_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  // **Feature: net-worth-card, Property 1: Net worth calculation correctness**
  // **Validates: Requirements 1.2**
  test('Property 1: Net worth should equal total assets minus total liabilities', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random investment data (assets)
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }).map(s => `PBT_NetWorth_Inv_${s.replace(/[^a-zA-Z0-9]/g, '_')}`),
            value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => parseFloat(n.toFixed(2))),
            month: fc.integer({ min: 1, max: 12 })
          }),
          { minLength: 0, maxLength: 5 }
        ),
        // Generate random loan data (liabilities)
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }).map(s => `PBT_NetWorth_Loan_${s.replace(/[^a-zA-Z0-9]/g, '_')}`),
            balance: fc.float({ min: 0, max: 500000, noNaN: true }).map(n => parseFloat(n.toFixed(2))),
            month: fc.integer({ min: 1, max: 12 })
          }),
          { minLength: 0, maxLength: 5 }
        ),
        async (investments, loans) => {
          const testYear = 9997;
          
          // Track expected totals
          let expectedTotalAssets = 0;
          let expectedTotalLiabilities = 0;
          
          // Insert investment data
          for (const inv of investments) {
            // Create investment first
            const investmentId = await new Promise((resolve, reject) => {
              db.run(
                'INSERT INTO investments (name, type, initial_value) VALUES (?, ?, ?)',
                [inv.name, 'TFSA', inv.value],
                function(err) {
                  if (err) reject(err);
                  else resolve(this.lastID);
                }
              );
            });
            
            // Insert investment value
            await new Promise((resolve, reject) => {
              db.run(
                'INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)',
                [investmentId, testYear, inv.month, inv.value],
                (err) => err ? reject(err) : resolve()
              );
            });
            
            // Track expected assets (only count December or latest month)
            expectedTotalAssets += inv.value;
          }
          
          // Insert loan data
          for (const loan of loans) {
            // Create loan first
            const loanId = await new Promise((resolve, reject) => {
              db.run(
                'INSERT INTO loans (name, loan_type, is_paid_off, initial_balance, start_date) VALUES (?, ?, ?, ?, ?)',
                [loan.name, 'loan', 0, loan.balance, `${testYear}-01-01`],
                function(err) {
                  if (err) reject(err);
                  else resolve(this.lastID);
                }
              );
            });
            
            // Insert loan balance
            await new Promise((resolve, reject) => {
              db.run(
                'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
                [loanId, testYear, loan.month, loan.balance, 5.0],
                (err) => err ? reject(err) : resolve()
              );
            });
            
            // Track expected liabilities
            expectedTotalLiabilities += loan.balance;
          }
          
          // Get annual summary with net worth
          const summary = await expenseService.getAnnualSummary(testYear);
          
          // Property: netWorth should equal totalAssets - totalLiabilities
          const expectedNetWorth = summary.totalAssets - summary.totalLiabilities;
          
          // Verify the calculation is correct
          expect(Math.abs(summary.netWorth - expectedNetWorth)).toBeLessThan(0.01);
          
          // Also verify the formula holds
          expect(Math.abs(summary.netWorth - (summary.totalAssets - summary.totalLiabilities))).toBeLessThan(0.01);
        }
      ),
      pbtOptions()
    );
  }, 60000);

  // **Feature: net-worth-card, Property 2: Non-negative assets and liabilities**
  // **Validates: Requirements 2.4, 2.5**
  test('Property 2: Total assets and total liabilities should always be non-negative', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random investment data (assets)
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }).map(s => `PBT_NetWorth_NonNeg_Inv_${s.replace(/[^a-zA-Z0-9]/g, '_')}`),
            value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => parseFloat(n.toFixed(2))),
            month: fc.integer({ min: 1, max: 12 })
          }),
          { minLength: 0, maxLength: 5 }
        ),
        // Generate random loan data (liabilities)
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }).map(s => `PBT_NetWorth_NonNeg_Loan_${s.replace(/[^a-zA-Z0-9]/g, '_')}`),
            balance: fc.float({ min: 0, max: 500000, noNaN: true }).map(n => parseFloat(n.toFixed(2))),
            month: fc.integer({ min: 1, max: 12 })
          }),
          { minLength: 0, maxLength: 5 }
        ),
        async (investments, loans) => {
          const testYear = 9998; // Different year to avoid conflicts
          
          // Insert investment data
          for (const inv of investments) {
            // Create investment first
            const investmentId = await new Promise((resolve, reject) => {
              db.run(
                'INSERT INTO investments (name, type, initial_value) VALUES (?, ?, ?)',
                [inv.name, 'RRSP', inv.value],
                function(err) {
                  if (err) reject(err);
                  else resolve(this.lastID);
                }
              );
            });
            
            // Insert investment value
            await new Promise((resolve, reject) => {
              db.run(
                'INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)',
                [investmentId, testYear, inv.month, inv.value],
                (err) => err ? reject(err) : resolve()
              );
            });
          }
          
          // Insert loan data
          for (const loan of loans) {
            // Create loan first
            const loanId = await new Promise((resolve, reject) => {
              db.run(
                'INSERT INTO loans (name, loan_type, is_paid_off, initial_balance, start_date) VALUES (?, ?, ?, ?, ?)',
                [loan.name, 'line_of_credit', 0, loan.balance, `${testYear}-01-01`],
                function(err) {
                  if (err) reject(err);
                  else resolve(this.lastID);
                }
              );
            });
            
            // Insert loan balance
            await new Promise((resolve, reject) => {
              db.run(
                'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
                [loanId, testYear, loan.month, loan.balance, 3.5],
                (err) => err ? reject(err) : resolve()
              );
            });
          }
          
          // Get annual summary with net worth
          const summary = await expenseService.getAnnualSummary(testYear);
          
          // Property: totalAssets should always be >= 0
          expect(summary.totalAssets).toBeGreaterThanOrEqual(0);
          
          // Property: totalLiabilities should always be >= 0
          expect(summary.totalLiabilities).toBeGreaterThanOrEqual(0);
        }
      ),
      pbtOptions()
    );
  }, 60000);
});
