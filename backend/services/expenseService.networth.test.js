const expenseService = require('./expenseService');
const { getDatabase } = require('../database/db');

describe('ExpenseService - Net Worth Calculation Unit Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM investment_values WHERE year = 9996', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loan_balances WHERE year = 9996', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM investments WHERE name LIKE "NetWorth_Test_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loans WHERE name LIKE "NetWorth_Test_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  // Test correct calculation of net worth
  // Requirements: 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5
  test('should calculate net worth correctly as totalAssets - totalLiabilities', async () => {
    const testYear = 9996;
    
    // Create test investment
    const investmentId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO investments (name, type, initial_value) VALUES (?, ?, ?)',
        ['NetWorth_Test_TFSA', 'TFSA', 50000],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    // Insert investment value for December
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)',
        [investmentId, testYear, 12, 75000],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    // Create test loan
    const loanId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loans (name, loan_type, is_paid_off, initial_balance, start_date) VALUES (?, ?, ?, ?, ?)',
        ['NetWorth_Test_Mortgage', 'loan', 0, 300000, `${testYear}-01-01`],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    // Insert loan balance for December
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
        [loanId, testYear, 12, 250000, 4.5],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    // Get annual summary
    const summary = await expenseService.getAnnualSummary(testYear);
    
    // Verify net worth calculation
    expect(summary.totalAssets).toBe(75000);
    expect(summary.totalLiabilities).toBe(250000);
    expect(summary.netWorth).toBe(-175000); // 75000 - 250000
  });

  // Test year-end value selection (December preference)
  // Requirements: 3.1, 3.3
  test('should prefer December values for investments and loans when available', async () => {
    const testYear = 9996;
    
    // Create test investment
    const investmentId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO investments (name, type, initial_value) VALUES (?, ?, ?)',
        ['NetWorth_Test_RRSP', 'RRSP', 40000],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    // Insert investment values for multiple months
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)',
        [investmentId, testYear, 6, 45000],
        (err) => err ? reject(err) : resolve()
      );
    });
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)',
        [investmentId, testYear, 9, 48000],
        (err) => err ? reject(err) : resolve()
      );
    });
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)',
        [investmentId, testYear, 12, 50000], // December value
        (err) => err ? reject(err) : resolve()
      );
    });
    
    // Create test loan
    const loanId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loans (name, loan_type, is_paid_off, initial_balance, start_date) VALUES (?, ?, ?, ?, ?)',
        ['NetWorth_Test_CarLoan', 'loan', 0, 25000, `${testYear}-01-01`],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    // Insert loan balances for multiple months
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
        [loanId, testYear, 6, 20000, 5.0],
        (err) => err ? reject(err) : resolve()
      );
    });
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
        [loanId, testYear, 9, 18000, 5.0],
        (err) => err ? reject(err) : resolve()
      );
    });
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
        [loanId, testYear, 12, 15000, 5.0], // December value
        (err) => err ? reject(err) : resolve()
      );
    });
    
    // Get annual summary
    const summary = await expenseService.getAnnualSummary(testYear);
    
    // Verify December values are used
    expect(summary.totalAssets).toBe(50000); // December investment value
    expect(summary.totalLiabilities).toBe(15000); // December loan balance
    expect(summary.netWorth).toBe(35000); // 50000 - 15000
  });

  // Test fallback to latest month when December missing
  // Requirements: 3.2, 3.4
  test('should fallback to latest month when December data is missing', async () => {
    const testYear = 9996;
    
    // Create test investment
    const investmentId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO investments (name, type, initial_value) VALUES (?, ?, ?)',
        ['NetWorth_Test_TFSA_NoDecember', 'TFSA', 30000],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    // Insert investment values for months before December (no December data)
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)',
        [investmentId, testYear, 6, 35000],
        (err) => err ? reject(err) : resolve()
      );
    });
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)',
        [investmentId, testYear, 10, 38000], // Latest month (October)
        (err) => err ? reject(err) : resolve()
      );
    });
    
    // Create test loan
    const loanId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loans (name, loan_type, is_paid_off, initial_balance, start_date) VALUES (?, ?, ?, ?, ?)',
        ['NetWorth_Test_LineOfCredit_NoDecember', 'line_of_credit', 0, 10000, `${testYear}-01-01`],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    // Insert loan balances for months before December (no December data)
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
        [loanId, testYear, 6, 8000, 6.0],
        (err) => err ? reject(err) : resolve()
      );
    });
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
        [loanId, testYear, 11, 7000, 6.0], // Latest month (November)
        (err) => err ? reject(err) : resolve()
      );
    });
    
    // Get annual summary
    const summary = await expenseService.getAnnualSummary(testYear);
    
    // Verify latest month values are used (October for investment, November for loan)
    expect(summary.totalAssets).toBe(38000); // October investment value
    expect(summary.totalLiabilities).toBe(7000); // November loan balance
    expect(summary.netWorth).toBe(31000); // 38000 - 7000
  });

  // Test handling of no investment data
  // Requirements: 2.4, 3.5
  test('should handle case with no investment data (assets = 0)', async () => {
    const testYear = 9996;
    
    // Create test loan only (no investments)
    const loanId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loans (name, loan_type, is_paid_off, initial_balance, start_date) VALUES (?, ?, ?, ?, ?)',
        ['NetWorth_Test_OnlyLoan', 'loan', 0, 100000, `${testYear}-01-01`],
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
        [loanId, testYear, 12, 95000, 4.0],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    // Get annual summary
    const summary = await expenseService.getAnnualSummary(testYear);
    
    // Verify assets are 0 and net worth is negative
    expect(summary.totalAssets).toBe(0);
    expect(summary.totalLiabilities).toBe(95000);
    expect(summary.netWorth).toBe(-95000); // 0 - 95000
  });

  // Test handling of no loan data
  // Requirements: 2.5, 3.5
  test('should handle case with no loan data (liabilities = 0)', async () => {
    const testYear = 9996;
    
    // Create test investment only (no loans)
    const investmentId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO investments (name, type, initial_value) VALUES (?, ?, ?)',
        ['NetWorth_Test_OnlyInvestment', 'TFSA', 60000],
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
        [investmentId, testYear, 12, 65000],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    // Get annual summary
    const summary = await expenseService.getAnnualSummary(testYear);
    
    // Verify liabilities are 0 and net worth equals assets
    expect(summary.totalAssets).toBe(65000);
    expect(summary.totalLiabilities).toBe(0);
    expect(summary.netWorth).toBe(65000); // 65000 - 0
  });

  // Test exclusion of paid-off loans
  // Requirements: 3.5
  test('should exclude paid-off loans from liabilities calculation', async () => {
    const testYear = 9996;
    
    // Create test investment
    const investmentId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO investments (name, type, initial_value) VALUES (?, ?, ?)',
        ['NetWorth_Test_Investment_PaidOff', 'RRSP', 80000],
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
        [investmentId, testYear, 12, 85000],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    // Create active loan
    const activeLoanId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loans (name, loan_type, is_paid_off, initial_balance, start_date) VALUES (?, ?, ?, ?, ?)',
        ['NetWorth_Test_ActiveLoan', 'loan', 0, 50000, `${testYear}-01-01`],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    // Insert active loan balance
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
        [activeLoanId, testYear, 12, 45000, 5.0],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    // Create paid-off loan
    const paidOffLoanId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loans (name, loan_type, is_paid_off, initial_balance, start_date) VALUES (?, ?, ?, ?, ?)',
        ['NetWorth_Test_PaidOffLoan', 'loan', 1, 30000, `${testYear - 2}-01-01`], // Paid off
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    // Insert paid-off loan balance (should be ignored)
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
        [paidOffLoanId, testYear, 12, 0, 5.0],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    // Get annual summary
    const summary = await expenseService.getAnnualSummary(testYear);
    
    // Verify only active loan is included in liabilities
    expect(summary.totalAssets).toBe(85000);
    expect(summary.totalLiabilities).toBe(45000); // Only active loan, paid-off loan excluded
    expect(summary.netWorth).toBe(40000); // 85000 - 45000
  });

  // Test with multiple investments and loans
  test('should correctly aggregate multiple investments and loans', async () => {
    const testYear = 9996;
    
    // Create multiple investments
    const tfsa = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO investments (name, type, initial_value) VALUES (?, ?, ?)',
        ['NetWorth_Test_TFSA_Multi', 'TFSA', 40000],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    const rrsp = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO investments (name, type, initial_value) VALUES (?, ?, ?)',
        ['NetWorth_Test_RRSP_Multi', 'RRSP', 60000],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    // Insert investment values
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)',
        [tfsa, testYear, 12, 45000],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)',
        [rrsp, testYear, 12, 65000],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    // Create multiple loans
    const mortgage = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loans (name, loan_type, is_paid_off, initial_balance, start_date) VALUES (?, ?, ?, ?, ?)',
        ['NetWorth_Test_Mortgage_Multi', 'loan', 0, 300000, `${testYear}-01-01`],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    const carLoan = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loans (name, loan_type, is_paid_off, initial_balance, start_date) VALUES (?, ?, ?, ?, ?)',
        ['NetWorth_Test_CarLoan_Multi', 'loan', 0, 25000, `${testYear}-01-01`],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    // Insert loan balances
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
        [mortgage, testYear, 12, 280000, 4.5],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
        [carLoan, testYear, 12, 20000, 6.0],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    // Get annual summary
    const summary = await expenseService.getAnnualSummary(testYear);
    
    // Verify aggregation
    expect(summary.totalAssets).toBe(110000); // 45000 + 65000
    expect(summary.totalLiabilities).toBe(300000); // 280000 + 20000
    expect(summary.netWorth).toBe(-190000); // 110000 - 300000
  });

  // Test with no data at all
  test('should handle year with no investment or loan data', async () => {
    const testYear = 9996;
    
    // Get annual summary (no data inserted)
    const summary = await expenseService.getAnnualSummary(testYear);
    
    // Verify all values are 0
    expect(summary.totalAssets).toBe(0);
    expect(summary.totalLiabilities).toBe(0);
    expect(summary.netWorth).toBe(0);
  });
});
