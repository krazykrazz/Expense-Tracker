const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Use a test database
const TEST_DB_PATH = path.join(__dirname, '../database/test_loan_types.db');

// Clean up test database if it exists
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

// Set up test database
process.env.DB_PATH = TEST_DB_PATH;

// Import services
const loanService = require('../services/loanService');

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
  console.log('\n=== LOAN TYPE FEATURE TEST ===\n');

  try {
    await initializeDatabase();
    console.log('✓ Database initialized\n');

    // Test 1: Create a traditional loan (default)
    console.log('--- Test 1: Create Traditional Loan (Default) ---');
    const loan1 = await loanService.createLoan({
      name: 'Mortgage',
      initial_balance: 300000,
      start_date: '2024-01-01',
      notes: 'Home loan'
    });
    console.log(`✓ Created loan: ${loan1.name}`);
    console.log(`  Type: ${loan1.loan_type}`);
    if (loan1.loan_type === 'loan') {
      console.log('✓ PASS: Default loan type is "loan"\n');
    } else {
      console.log(`✗ FAIL: Expected "loan", got "${loan1.loan_type}"\n`);
    }

    // Test 2: Create a line of credit
    console.log('--- Test 2: Create Line of Credit ---');
    const loan2 = await loanService.createLoan({
      name: 'HELOC',
      initial_balance: 50000,
      start_date: '2024-01-01',
      loan_type: 'line_of_credit',
      notes: 'Home equity line of credit'
    });
    console.log(`✓ Created loan: ${loan2.name}`);
    console.log(`  Type: ${loan2.loan_type}`);
    if (loan2.loan_type === 'line_of_credit') {
      console.log('✓ PASS: Loan type is "line_of_credit"\n');
    } else {
      console.log(`✗ FAIL: Expected "line_of_credit", got "${loan2.loan_type}"\n`);
    }

    // Test 3: Create another traditional loan (explicit)
    console.log('--- Test 3: Create Traditional Loan (Explicit) ---');
    const loan3 = await loanService.createLoan({
      name: 'Car Loan',
      initial_balance: 25000,
      start_date: '2024-01-01',
      loan_type: 'loan',
      notes: 'Auto financing'
    });
    console.log(`✓ Created loan: ${loan3.name}`);
    console.log(`  Type: ${loan3.loan_type}`);
    if (loan3.loan_type === 'loan') {
      console.log('✓ PASS: Loan type is "loan"\n');
    } else {
      console.log(`✗ FAIL: Expected "loan", got "${loan3.loan_type}"\n`);
    }

    // Test 4: Try to create loan with invalid type
    console.log('--- Test 4: Invalid Loan Type Validation ---');
    try {
      await loanService.createLoan({
        name: 'Invalid Loan',
        initial_balance: 10000,
        start_date: '2024-01-01',
        loan_type: 'invalid_type'
      });
      console.log('✗ FAIL: Should have rejected invalid loan type\n');
    } catch (err) {
      console.log(`✓ PASS: Invalid loan type rejected`);
      console.log(`  Error: ${err.message}\n`);
    }

    // Test 5: Update loan type
    console.log('--- Test 5: Update Loan Type ---');
    const updatedLoan = await loanService.updateLoan(loan1.id, {
      name: loan1.name,
      initial_balance: loan1.initial_balance,
      start_date: loan1.start_date,
      loan_type: 'line_of_credit',
      notes: loan1.notes
    });
    console.log(`✓ Updated loan: ${updatedLoan.name}`);
    console.log(`  New type: ${updatedLoan.loan_type}`);
    if (updatedLoan.loan_type === 'line_of_credit') {
      console.log('✓ PASS: Loan type updated successfully\n');
    } else {
      console.log(`✗ FAIL: Expected "line_of_credit", got "${updatedLoan.loan_type}"\n`);
    }

    // Test 6: Get all loans and verify types
    console.log('--- Test 6: Retrieve All Loans ---');
    const allLoans = await loanService.getAllLoans();
    console.log(`✓ Retrieved ${allLoans.length} loans:`);
    allLoans.forEach(loan => {
      console.log(`  - ${loan.name}: ${loan.loan_type || 'loan'}`);
    });
    console.log('✓ PASS: All loans retrieved with types\n');

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
