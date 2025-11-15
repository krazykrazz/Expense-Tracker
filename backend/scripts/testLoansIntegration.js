const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Use a test database
const TEST_DB_PATH = path.join(__dirname, '../database/test_loans_integration.db');

// Clean up test database if it exists
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

// Set up test database
process.env.DB_PATH = TEST_DB_PATH;

// Import repositories and services (they use singleton pattern)
const loanRepo = require('../repositories/loanRepository');
const loanBalanceRepo = require('../repositories/loanBalanceRepository');
const loanService = require('../services/loanService');
const loanBalanceService = require('../services/loanBalanceService');

// Initialize database schema
async function initializeDatabase() {
  const { getDatabase } = require('../database/db');
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create loans table
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

      // Create loan_balances table
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

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`✗ ${message}`);
    testsFailed++;
  }
}

function assertEquals(actual, expected, message) {
  if (actual === expected) {
    console.log(`✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`✗ ${message}`);
    console.error(`  Expected: ${expected}`);
    console.error(`  Actual: ${actual}`);
    testsFailed++;
  }
}

// Test scenarios
async function runTests() {
  console.log('\n=== LOANS INTEGRATION TESTS ===\n');

  try {
    await initializeDatabase();
    console.log('✓ Database initialized\n');

    // Test 1: Complete flow - create loan → add balance entries → view → mark paid off
    console.log('--- Test 1: Complete Flow ---');
    const loan1 = await loanService.createLoan({
      name: 'Car Loan',
      initial_balance: 20000,
      start_date: '2024-01-01',
      notes: 'Honda Civic'
    });
    assert(loan1.id, 'Loan created successfully');
    assertEquals(loan1.name, 'Car Loan', 'Loan name is correct');
    assertEquals(loan1.initial_balance, 20000, 'Initial balance is correct');

    // Add balance entries
    const balance1 = await loanBalanceService.createOrUpdateBalance({
      loan_id: loan1.id,
      year: 2024,
      month: 2,
      remaining_balance: 19500,
      rate: 5.5
    });
    assert(balance1.id, 'Balance entry 1 created');

    const balance2 = await loanBalanceService.createOrUpdateBalance({
      loan_id: loan1.id,
      year: 2024,
      month: 3,
      remaining_balance: 19000,
      rate: 5.5
    });
    assert(balance2.id, 'Balance entry 2 created');

    // Get balance history
    const history = await loanBalanceService.getBalanceHistory(loan1.id);
    assertEquals(history.length, 2, 'Balance history has 2 entries');
    // history[0] is March (most recent): 19000, compared to Feb (19500) = -500
    // history[1] is Feb (oldest): 19500, no previous entry = null
    assertEquals(history[0].balanceChange, -500, 'First balance change calculated correctly (March vs Feb)');
    assertEquals(history[1].balanceChange, null, 'Second balance change is null (Feb has no previous)');

    // Mark as paid off
    const paidOffLoan = await loanService.markPaidOff(loan1.id, true);
    assertEquals(paidOffLoan.is_paid_off, 1, 'Loan marked as paid off');

    console.log('');

    // Test 2: Start date filtering
    console.log('--- Test 2: Start Date Filtering ---');
    const loan2 = await loanService.createLoan({
      name: 'Mortgage',
      initial_balance: 300000,
      start_date: '2024-06-01',
      notes: 'House loan'
    });

    // Should appear in June 2024 and later
    const loansJune = await loanService.getLoansForMonth(2024, 6);
    assert(loansJune.some(l => l.id === loan2.id), 'Loan appears in June 2024 (start month)');

    const loansJuly = await loanService.getLoansForMonth(2024, 7);
    assert(loansJuly.some(l => l.id === loan2.id), 'Loan appears in July 2024 (after start)');

    // Should NOT appear before June 2024
    const loansMay = await loanService.getLoansForMonth(2024, 5);
    assert(!loansMay.some(l => l.id === loan2.id), 'Loan does NOT appear in May 2024 (before start)');

    console.log('');

    // Test 3: Paid off behavior
    console.log('--- Test 3: Paid Off Behavior ---');
    const loan3 = await loanService.createLoan({
      name: 'Personal Loan',
      initial_balance: 5000,
      start_date: '2024-01-01'
    });

    // Add balance entry with zero balance
    await loanBalanceService.createOrUpdateBalance({
      loan_id: loan3.id,
      year: 2024,
      month: 3,
      remaining_balance: 0,
      rate: 0
    });

    // Check if auto-marked as paid off
    const updatedLoan3 = await loanRepo.findById(loan3.id);
    assertEquals(updatedLoan3.is_paid_off, 1, 'Loan auto-marked as paid off when balance reaches 0');

    // Verify it's excluded from active loans
    const allLoans = await loanService.getAllLoans();
    const activeLoan3 = allLoans.find(l => l.id === loan3.id && !l.is_paid_off);
    assert(!activeLoan3, 'Paid off loan excluded from active loans list');

    console.log('');

    // Test 4: Cascade delete
    console.log('--- Test 4: Cascade Delete ---');
    const loan4 = await loanService.createLoan({
      name: 'Student Loan',
      initial_balance: 15000,
      start_date: '2024-01-01'
    });

    // Add multiple balance entries
    await loanBalanceService.createOrUpdateBalance({
      loan_id: loan4.id,
      year: 2024,
      month: 1,
      remaining_balance: 14500,
      rate: 4.5
    });
    await loanBalanceService.createOrUpdateBalance({
      loan_id: loan4.id,
      year: 2024,
      month: 2,
      remaining_balance: 14000,
      rate: 4.5
    });

    const balancesBeforeDelete = await loanBalanceRepo.findByLoan(loan4.id);
    assertEquals(balancesBeforeDelete.length, 2, 'Two balance entries exist before delete');

    // Delete the loan
    await loanService.deleteLoan(loan4.id);

    // Verify balance entries are also deleted
    const balancesAfterDelete = await loanBalanceRepo.findByLoan(loan4.id);
    assertEquals(balancesAfterDelete.length, 0, 'Balance entries cascade deleted with loan');

    // Verify loan is actually deleted
    const deletedLoan = await loanRepo.findById(loan4.id);
    assert(deletedLoan === null, 'Loan is deleted from database');

    console.log('');

    // Test 5: Upsert functionality
    console.log('--- Test 5: Upsert Functionality ---');
    const loan5 = await loanService.createLoan({
      name: 'Credit Card',
      initial_balance: 3000,
      start_date: '2024-01-01'
    });

    // Create initial balance entry
    const initialBalance = await loanBalanceService.createOrUpdateBalance({
      loan_id: loan5.id,
      year: 2024,
      month: 4,
      remaining_balance: 2800,
      rate: 18.5
    });
    assertEquals(initialBalance.remaining_balance, 2800, 'Initial balance created');
    assertEquals(initialBalance.rate, 18.5, 'Initial rate created');

    // Upsert with same month/year (should update)
    const updatedBalance = await loanBalanceService.createOrUpdateBalance({
      loan_id: loan5.id,
      year: 2024,
      month: 4,
      remaining_balance: 2500,
      rate: 17.9
    });
    assertEquals(updatedBalance.remaining_balance, 2500, 'Balance updated via upsert');
    assertEquals(updatedBalance.rate, 17.9, 'Rate updated via upsert');

    // Verify only one entry exists for that month
    const allBalances = await loanBalanceRepo.findByLoan(loan5.id);
    assertEquals(allBalances.length, 1, 'Only one balance entry exists after upsert');

    console.log('');

    // Test 5.5: Future balance entries should not affect current month display
    console.log('--- Test 5.5: Future Balance Entries ---');
    const loan5b = await loanService.createLoan({
      name: 'Future Test Loan',
      initial_balance: 5000,
      start_date: '2024-01-01'
    });

    // Add current balance
    await loanBalanceService.createOrUpdateBalance({
      loan_id: loan5b.id,
      year: 2024,
      month: 3,
      remaining_balance: 4500,
      rate: 6.0
    });

    // Add future balance
    await loanBalanceService.createOrUpdateBalance({
      loan_id: loan5b.id,
      year: 2024,
      month: 6,
      remaining_balance: 4000,
      rate: 6.0
    });

    // Check March shows March balance, not June
    const loansMarch = await loanService.getLoansForMonth(2024, 3);
    const loan5bMarch = loansMarch.find(l => l.id === loan5b.id);
    assertEquals(loan5bMarch.currentBalance, 4500, 'March shows March balance (not future June)');

    // Check April shows March balance (most recent past)
    const loansApril = await loanService.getLoansForMonth(2024, 4);
    const loan5bApril = loansApril.find(l => l.id === loan5b.id);
    assertEquals(loan5bApril.currentBalance, 4500, 'April shows most recent past balance (March)');

    // Check June shows June balance
    const loansJune2 = await loanService.getLoansForMonth(2024, 6);
    const loan5bJune = loansJune2.find(l => l.id === loan5b.id);
    assertEquals(loan5bJune.currentBalance, 4000, 'June shows June balance');

    console.log('');

    // Test 6: Edge cases
    console.log('--- Test 6: Edge Cases ---');

    // No loans scenario
    const { getDatabase } = require('../database/db');
    const db = await getDatabase();
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loans', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    const noLoans = await loanService.getAllLoans();
    assertEquals(noLoans.length, 0, 'Empty loans list handled correctly');

    // Loan with no balance entries (should show initial balance)
    const loan6 = await loanService.createLoan({
      name: 'New Loan',
      initial_balance: 10000,
      start_date: '2024-01-01'
    });
    const loansWithBalances = await loanRepo.getAllWithCurrentBalances();
    const loan6WithBalance = loansWithBalances.find(l => l.id === loan6.id);
    assertEquals(loan6WithBalance.currentBalance, 10000, 'Loan without balance entries shows initial balance');
    assertEquals(loan6WithBalance.currentRate, 0, 'Loan without balance entries shows 0 rate');

    // Invalid date format
    try {
      await loanService.createLoan({
        name: 'Bad Date Loan',
        initial_balance: 5000,
        start_date: 'invalid-date'
      });
      assert(false, 'Invalid date should throw error');
    } catch (error) {
      assert(true, 'Invalid date format rejected');
    }

    // Negative balance
    try {
      await loanService.createLoan({
        name: 'Negative Loan',
        initial_balance: -1000,
        start_date: '2024-01-01'
      });
      assert(false, 'Negative balance should throw error');
    } catch (error) {
      assert(true, 'Negative initial balance rejected');
    }

    // Negative balance entry
    try {
      await loanBalanceService.createOrUpdateBalance({
        loan_id: loan6.id,
        year: 2024,
        month: 1,
        remaining_balance: -500,
        rate: 5.0
      });
      assert(false, 'Negative balance entry should throw error');
    } catch (error) {
      assert(true, 'Negative balance entry rejected');
    }

    // Negative rate
    try {
      await loanBalanceService.createOrUpdateBalance({
        loan_id: loan6.id,
        year: 2024,
        month: 1,
        remaining_balance: 9000,
        rate: -5.0
      });
      assert(false, 'Negative rate should throw error');
    } catch (error) {
      assert(true, 'Negative rate rejected');
    }

    // Invalid month
    try {
      await loanBalanceService.createOrUpdateBalance({
        loan_id: loan6.id,
        year: 2024,
        month: 13,
        remaining_balance: 9000,
        rate: 5.0
      });
      assert(false, 'Invalid month should throw error');
    } catch (error) {
      assert(true, 'Invalid month (13) rejected');
    }

    console.log('');

  } catch (error) {
    console.error('Test error:', error);
    testsFailed++;
  } finally {
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.unlinkSync(TEST_DB_PATH);
      } catch (err) {
        console.error('Error cleaning up test database:', err);
      }
    }

    console.log('\n=== TEST SUMMARY ===');
    console.log(`Tests Passed: ${testsPassed}`);
    console.log(`Tests Failed: ${testsFailed}`);
    console.log(`Total Tests: ${testsPassed + testsFailed}`);
    
    if (testsFailed === 0) {
      console.log('\n✓ All integration tests passed!\n');
      process.exit(0);
    } else {
      console.log('\n✗ Some tests failed\n');
      process.exit(1);
    }
  }
}

// Run tests
runTests();
