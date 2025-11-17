const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Use a test database
const TEST_DB_PATH = path.join(__dirname, '../database/test_future_balance.db');

// Clean up test database if it exists
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

// Set up test database
process.env.DB_PATH = TEST_DB_PATH;

// Import services
const loanService = require('../services/loanService');
const loanBalanceService = require('../services/loanBalanceService');

// Initialize database schema
async function initializeDatabase() {
  const { getDatabase } = require('../database/db');
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS loans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          initial_balance REAL NOT NULL CHECK(initial_balance >= 0),
          start_date TEXT NOT NULL,
          notes TEXT,
          is_paid_off INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) reject(err);
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_loans_paid_off ON loans(is_paid_off)`, (err) => {
        if (err) reject(err);
      });

      db.run(`
        CREATE TABLE IF NOT EXISTS loan_balances (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          loan_id INTEGER NOT NULL,
          year INTEGER NOT NULL,
          month INTEGER NOT NULL,
          remaining_balance REAL NOT NULL CHECK(remaining_balance >= 0),
          rate REAL NOT NULL CHECK(rate >= 0),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
          UNIQUE(loan_id, year, month)
        )
      `, (err) => {
        if (err) reject(err);
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_loan_balances_loan_id ON loan_balances(loan_id)`, (err) => {
        if (err) reject(err);
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_loan_balances_year_month ON loan_balances(year, month)`, (err) => {
        if (err) reject(err);
        resolve();
      });
    });
  });
}

async function runTest() {
  console.log('\n=== FUTURE BALANCE BUG TEST ===\n');

  try {
    await initializeDatabase();
    console.log('✓ Database initialized\n');

    // Create a loan starting in January 2024
    const loan = await loanService.createLoan({
      name: 'Test Loan',
      initial_balance: 10000,
      start_date: '2024-01-01',
      notes: 'Testing future balance bug'
    });
    console.log(`✓ Created loan with ID ${loan.id} and initial balance $${loan.initial_balance}`);

    // Add balance entry for February 2024 (past)
    await loanBalanceService.createOrUpdateBalance({
      loan_id: loan.id,
      year: 2024,
      month: 2,
      remaining_balance: 9500,
      rate: 5.0
    });
    console.log('✓ Added balance entry for Feb 2024: $9,500');

    // Add balance entry for March 2024 (past)
    await loanBalanceService.createOrUpdateBalance({
      loan_id: loan.id,
      year: 2024,
      month: 3,
      remaining_balance: 9000,
      rate: 5.0
    });
    console.log('✓ Added balance entry for Mar 2024: $9,000');

    // Add balance entry for June 2024 (future from March perspective)
    await loanBalanceService.createOrUpdateBalance({
      loan_id: loan.id,
      year: 2024,
      month: 6,
      remaining_balance: 8000,
      rate: 5.0
    });
    console.log('✓ Added balance entry for Jun 2024: $8,000 (future)');

    console.log('\n--- Testing Balance Display for Different Months ---\n');

    // Test January 2024 (should show initial balance)
    const loansJan = await loanService.getLoansForMonth(2024, 1);
    const loanJan = loansJan.find(l => l.id === loan.id);
    console.log(`January 2024: $${loanJan.currentBalance}`);
    if (loanJan.currentBalance === 10000) {
      console.log('✓ PASS: Shows initial balance (no entries yet)');
    } else {
      console.log(`✗ FAIL: Expected $10,000, got $${loanJan.currentBalance}`);
    }

    // Test February 2024 (should show Feb balance)
    const loansFeb = await loanService.getLoansForMonth(2024, 2);
    const loanFeb = loansFeb.find(l => l.id === loan.id);
    console.log(`\nFebruary 2024: $${loanFeb.currentBalance}`);
    if (loanFeb.currentBalance === 9500) {
      console.log('✓ PASS: Shows February balance');
    } else {
      console.log(`✗ FAIL: Expected $9,500, got $${loanFeb.currentBalance}`);
    }

    // Test March 2024 (should show March balance, NOT June)
    const loansMar = await loanService.getLoansForMonth(2024, 3);
    const loanMar = loansMar.find(l => l.id === loan.id);
    console.log(`\nMarch 2024: $${loanMar.currentBalance}`);
    if (loanMar.currentBalance === 9000) {
      console.log('✓ PASS: Shows March balance (ignores future June entry)');
    } else {
      console.log(`✗ FAIL: Expected $9,000, got $${loanMar.currentBalance}`);
      console.log('  This is the bug - showing future balance instead of current!');
    }

    // Test April 2024 (should show March balance, the most recent past entry)
    const loansApr = await loanService.getLoansForMonth(2024, 4);
    const loanApr = loansApr.find(l => l.id === loan.id);
    console.log(`\nApril 2024: $${loanApr.currentBalance}`);
    if (loanApr.currentBalance === 9000) {
      console.log('✓ PASS: Shows most recent past balance (March)');
    } else {
      console.log(`✗ FAIL: Expected $9,000, got $${loanApr.currentBalance}`);
    }

    // Test May 2024 (should still show March balance)
    const loansMay = await loanService.getLoansForMonth(2024, 5);
    const loanMay = loansMay.find(l => l.id === loan.id);
    console.log(`\nMay 2024: $${loanMay.currentBalance}`);
    if (loanMay.currentBalance === 9000) {
      console.log('✓ PASS: Shows most recent past balance (March)');
    } else {
      console.log(`✗ FAIL: Expected $9,000, got $${loanMay.currentBalance}`);
    }

    // Test June 2024 (should now show June balance)
    const loansJun = await loanService.getLoansForMonth(2024, 6);
    const loanJun = loansJun.find(l => l.id === loan.id);
    console.log(`\nJune 2024: $${loanJun.currentBalance}`);
    if (loanJun.currentBalance === 8000) {
      console.log('✓ PASS: Shows June balance when viewing June');
    } else {
      console.log(`✗ FAIL: Expected $8,000, got $${loanJun.currentBalance}`);
    }

    console.log('\n=== TEST COMPLETE ===\n');

  } catch (error) {
    console.error('Test error:', error);
  } finally {
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.unlinkSync(TEST_DB_PATH);
      } catch (err) {
        console.error('Error cleaning up test database:', err);
      }
    }
    process.exit(0);
  }
}

runTest();
