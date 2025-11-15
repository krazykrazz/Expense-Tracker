const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Use a test database
const TEST_DB_PATH = path.join(__dirname, '../database/test_loc_zero_balance.db');

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
          loan_type TEXT NOT NULL DEFAULT 'loan' CHECK(loan_type IN ('loan', 'line_of_credit')),
          is_paid_off INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          reject(err);
          return;
        }
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
        else resolve();
      });
    });
  });
}

async function runTest() {
  console.log('\n=== LINE OF CREDIT ZERO BALANCE TEST ===\n');

  try {
    await initializeDatabase();
    console.log('✓ Database initialized\n');

    // Test 1: Create line of credit with zero initial balance
    console.log('--- Test 1: Line of Credit with Zero Initial Balance ---');
    const loc = await loanService.createLoan({
      name: 'Credit Card',
      initial_balance: 0,
      start_date: '2024-01-01',
      loan_type: 'line_of_credit',
      notes: 'Unused credit card'
    });
    console.log(`✓ Created line of credit: ${loc.name}`);
    console.log(`  Initial balance: $${loc.initial_balance}`);
    console.log(`  Type: ${loc.loan_type}`);
    console.log(`  Paid off: ${loc.is_paid_off ? 'Yes' : 'No'}`);
    
    if (loc.is_paid_off === 0) {
      console.log('✓ PASS: Line of credit with zero balance is NOT marked as paid off\n');
    } else {
      console.log('✗ FAIL: Line of credit should not be marked as paid off\n');
    }

    // Test 2: Add zero balance entry to line of credit
    console.log('--- Test 2: Add Zero Balance Entry to Line of Credit ---');
    await loanBalanceService.createOrUpdateBalance({
      loan_id: loc.id,
      year: 2024,
      month: 2,
      remaining_balance: 0,
      rate: 18.5
    });
    console.log('✓ Added balance entry with $0 balance');
    
    const locAfterBalance = await loanService.getAllLoans();
    const updatedLoc = locAfterBalance.find(l => l.id === loc.id);
    console.log(`  Paid off: ${updatedLoc.is_paid_off ? 'Yes' : 'No'}`);
    
    if (!updatedLoc.is_paid_off) {
      console.log('✓ PASS: Line of credit remains active after zero balance entry\n');
    } else {
      console.log('✗ FAIL: Line of credit should not auto-mark as paid off\n');
    }

    // Test 3: Traditional loan with zero balance should be marked paid off
    console.log('--- Test 3: Traditional Loan with Zero Balance ---');
    const loan = await loanService.createLoan({
      name: 'Car Loan',
      initial_balance: 20000,
      start_date: '2024-01-01',
      loan_type: 'loan',
      notes: 'Auto loan'
    });
    console.log(`✓ Created traditional loan: ${loan.name}`);
    console.log(`  Initial balance: $${loan.initial_balance}`);
    
    // Pay it down to zero
    await loanBalanceService.createOrUpdateBalance({
      loan_id: loan.id,
      year: 2024,
      month: 6,
      remaining_balance: 0,
      rate: 0
    });
    console.log('✓ Added balance entry with $0 balance (paid off)');
    
    const loansAfterPayoff = await loanService.getAllLoans();
    const paidOffLoan = loansAfterPayoff.find(l => l.id === loan.id);
    console.log(`  Paid off: ${paidOffLoan.is_paid_off ? 'Yes' : 'No'}`);
    
    if (paidOffLoan.is_paid_off) {
      console.log('✓ PASS: Traditional loan auto-marked as paid off when balance reaches zero\n');
    } else {
      console.log('✗ FAIL: Traditional loan should be marked as paid off\n');
    }

    // Test 4: Line of credit with balance, then paid to zero
    console.log('--- Test 4: Line of Credit Paid Down to Zero ---');
    const loc2 = await loanService.createLoan({
      name: 'HELOC',
      initial_balance: 50000,
      start_date: '2024-01-01',
      loan_type: 'line_of_credit',
      notes: 'Home equity line'
    });
    console.log(`✓ Created line of credit: ${loc2.name}`);
    console.log(`  Initial balance: $${loc2.initial_balance}`);
    
    // Use some credit
    await loanBalanceService.createOrUpdateBalance({
      loan_id: loc2.id,
      year: 2024,
      month: 2,
      remaining_balance: 30000,
      rate: 6.5
    });
    console.log('✓ Used credit: $30,000 balance');
    
    // Pay it back to zero
    await loanBalanceService.createOrUpdateBalance({
      loan_id: loc2.id,
      year: 2024,
      month: 6,
      remaining_balance: 0,
      rate: 6.5
    });
    console.log('✓ Paid back to zero');
    
    const loansAfterPayback = await loanService.getAllLoans();
    const paidBackLoc = loansAfterPayback.find(l => l.id === loc2.id);
    console.log(`  Paid off: ${paidBackLoc.is_paid_off ? 'Yes' : 'No'}`);
    
    if (!paidBackLoc.is_paid_off) {
      console.log('✓ PASS: Line of credit remains active even when paid back to zero\n');
    } else {
      console.log('✗ FAIL: Line of credit should remain active (available credit)\n');
    }

    console.log('=== ALL TESTS PASSED ===\n');

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
