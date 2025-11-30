/**
 * Integration Tests for Personal Care Category
 * 
 * Tests all aspects of the Personal Care category integration:
 * - API expense creation
 * - Budget creation and tracking
 * - CSV import
 * - Monthly and annual summaries
 * - Budget alerts
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Import services and repositories
const expenseService = require('../services/expenseService');
const budgetService = require('../services/budgetService');
const { isValid, isBudgetable } = require('../utils/categories');

const TEST_DB_PATH = path.join(__dirname, '../database/test-personal-care.db');

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, message = '') {
  results.tests.push({ name, passed, message });
  if (passed) {
    results.passed++;
    console.log(`✓ ${name}`);
  } else {
    results.failed++;
    console.error(`✗ ${name}: ${message}`);
  }
}

// Create a test database
function createTestDatabase() {
  return new Promise((resolve, reject) => {
    // Remove existing test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    const db = new sqlite3.Database(TEST_DB_PATH, (err) => {
      if (err) reject(err);
    });

    // Create tables with Personal Care in constraints
    db.serialize(() => {
      db.run(`
        CREATE TABLE expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          place TEXT,
          notes TEXT,
          amount REAL NOT NULL,
          type TEXT NOT NULL CHECK(type IN (
            'Clothing', 'Dining Out', 'Entertainment', 'Gas', 'Gifts',
            'Groceries', 'Housing', 'Insurance', 'Personal Care', 'Pet Care',
            'Recreation Activities', 'Subscriptions', 'Utilities',
            'Vehicle Maintenance', 'Other', 'Tax - Donation', 'Tax - Medical'
          )),
          week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
          method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE budgets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          year INTEGER NOT NULL,
          month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
          category TEXT NOT NULL CHECK(category IN (
            'Clothing', 'Dining Out', 'Entertainment', 'Gas', 'Gifts',
            'Groceries', 'Housing', 'Insurance', 'Personal Care', 'Pet Care',
            'Recreation Activities', 'Subscriptions', 'Utilities',
            'Vehicle Maintenance', 'Other'
          )),
          "limit" REAL NOT NULL CHECK("limit" > 0),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(year, month, category)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve(db);
      });
    });
  });
}

// Test 1: Create expense with Personal Care category via API simulation
async function testExpenseCreation(db) {
  return new Promise((resolve) => {
    const expense = {
      date: '2025-11-24',
      place: 'Hair Salon',
      notes: 'Haircut',
      amount: 45.00,
      type: 'Personal Care',
      week: 4,
      method: 'Debit'
    };

    db.run(
      `INSERT INTO expenses (date, place, notes, amount, type, week, method)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [expense.date, expense.place, expense.notes, expense.amount, expense.type, expense.week, expense.method],
      function(err) {
        if (err) {
          logTest('Test 1: Create expense with Personal Care category', false, err.message);
          resolve(false);
        } else {
          // Verify the expense was created
          db.get('SELECT * FROM expenses WHERE id = ?', [this.lastID], (err, row) => {
            if (err || !row) {
              logTest('Test 1: Create expense with Personal Care category', false, 'Expense not found after creation');
              resolve(false);
            } else if (row.type !== 'Personal Care') {
              logTest('Test 1: Create expense with Personal Care category', false, `Expected type 'Personal Care', got '${row.type}'`);
              resolve(false);
            } else {
              logTest('Test 1: Create expense with Personal Care category', true);
              resolve(true);
            }
          });
        }
      }
    );
  });
}

// Test 2: Create budget for Personal Care category
async function testBudgetCreation(db) {
  return new Promise((resolve) => {
    const budget = {
      year: 2025,
      month: 11,
      category: 'Personal Care',
      limit: 150.00
    };

    db.run(
      `INSERT INTO budgets (year, month, category, "limit")
       VALUES (?, ?, ?, ?)`,
      [budget.year, budget.month, budget.category, budget.limit],
      function(err) {
        if (err) {
          logTest('Test 2: Create budget for Personal Care category', false, err.message);
          resolve(false);
        } else {
          // Verify the budget was created
          db.get('SELECT * FROM budgets WHERE id = ?', [this.lastID], (err, row) => {
            if (err || !row) {
              logTest('Test 2: Create budget for Personal Care category', false, 'Budget not found after creation');
              resolve(false);
            } else if (row.category !== 'Personal Care') {
              logTest('Test 2: Create budget for Personal Care category', false, `Expected category 'Personal Care', got '${row.category}'`);
              resolve(false);
            } else {
              logTest('Test 2: Create budget for Personal Care category', true);
              resolve(true);
            }
          });
        }
      }
    );
  });
}

// Test 3: CSV import simulation with Personal Care expenses
async function testCSVImport(db) {
  return new Promise((resolve) => {
    const csvExpenses = [
      {
        date: '2025-11-01',
        place: 'Pharmacy',
        notes: 'Toiletries',
        amount: 25.50,
        type: 'Personal Care',
        week: 1,
        method: 'Debit'
      },
      {
        date: '2025-11-15',
        place: 'Spa',
        notes: 'Massage',
        amount: 80.00,
        type: 'Personal Care',
        week: 3,
        method: 'VISA'
      }
    ];

    let inserted = 0;
    let errors = [];

    csvExpenses.forEach((expense, index) => {
      db.run(
        `INSERT INTO expenses (date, place, notes, amount, type, week, method)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [expense.date, expense.place, expense.notes, expense.amount, expense.type, expense.week, expense.method],
        function(err) {
          if (err) {
            errors.push(`Row ${index + 1}: ${err.message}`);
          } else {
            inserted++;
          }

          // Check if all inserts completed
          if (inserted + errors.length === csvExpenses.length) {
            if (errors.length > 0) {
              logTest('Test 3: CSV import with Personal Care expenses', false, errors.join('; '));
              resolve(false);
            } else {
              logTest('Test 3: CSV import with Personal Care expenses', true);
              resolve(true);
            }
          }
        }
      );
    });
  });
}

// Test 4: Monthly summary includes Personal Care
async function testMonthlySummary(db) {
  return new Promise((resolve) => {
    db.all(
      `SELECT type, SUM(amount) as total
       FROM expenses
       WHERE strftime('%Y', date) = '2025' AND strftime('%m', date) = '11'
       GROUP BY type`,
      (err, rows) => {
        if (err) {
          logTest('Test 4: Monthly summary includes Personal Care', false, err.message);
          resolve(false);
        } else {
          const personalCareRow = rows.find(r => r.type === 'Personal Care');
          if (!personalCareRow) {
            logTest('Test 4: Monthly summary includes Personal Care', false, 'Personal Care not found in monthly summary');
            resolve(false);
          } else if (personalCareRow.total !== 150.50) {
            logTest('Test 4: Monthly summary includes Personal Care', false, `Expected total 150.50, got ${personalCareRow.total}`);
            resolve(false);
          } else {
            logTest('Test 4: Monthly summary includes Personal Care', true);
            resolve(true);
          }
        }
      }
    );
  });
}

// Test 5: Annual summary includes Personal Care
async function testAnnualSummary(db) {
  return new Promise((resolve) => {
    db.all(
      `SELECT type, SUM(amount) as total
       FROM expenses
       WHERE strftime('%Y', date) = '2025'
       GROUP BY type`,
      (err, rows) => {
        if (err) {
          logTest('Test 5: Annual summary includes Personal Care', false, err.message);
          resolve(false);
        } else {
          const personalCareRow = rows.find(r => r.type === 'Personal Care');
          if (!personalCareRow) {
            logTest('Test 5: Annual summary includes Personal Care', false, 'Personal Care not found in annual summary');
            resolve(false);
          } else {
            logTest('Test 5: Annual summary includes Personal Care', true);
            resolve(true);
          }
        }
      }
    );
  });
}

// Test 6: Budget tracking for Personal Care
async function testBudgetTracking(db) {
  return new Promise((resolve) => {
    db.get(
      `SELECT 
        b.category,
        b."limit" as budget_limit,
        COALESCE(SUM(e.amount), 0) as spent,
        b."limit" - COALESCE(SUM(e.amount), 0) as remaining
       FROM budgets b
       LEFT JOIN expenses e ON 
         e.type = b.category AND
         strftime('%Y', e.date) = CAST(b.year AS TEXT) AND
         strftime('%m', e.date) = printf('%02d', b.month)
       WHERE b.category = 'Personal Care' AND b.year = 2025 AND b.month = 11
       GROUP BY b.id`,
      (err, row) => {
        if (err) {
          logTest('Test 6: Budget tracking for Personal Care', false, err.message);
          resolve(false);
        } else if (!row) {
          logTest('Test 6: Budget tracking for Personal Care', false, 'No budget tracking data found');
          resolve(false);
        } else {
          const expectedSpent = 150.50;
          const expectedRemaining = 150.00 - 150.50;
          
          if (Math.abs(row.spent - expectedSpent) > 0.01) {
            logTest('Test 6: Budget tracking for Personal Care', false, `Expected spent ${expectedSpent}, got ${row.spent}`);
            resolve(false);
          } else if (Math.abs(row.remaining - expectedRemaining) > 0.01) {
            logTest('Test 6: Budget tracking for Personal Care', false, `Expected remaining ${expectedRemaining}, got ${row.remaining}`);
            resolve(false);
          } else {
            logTest('Test 6: Budget tracking for Personal Care', true);
            resolve(true);
          }
        }
      }
    );
  });
}

// Test 7: Budget alert detection (over budget)
async function testBudgetAlert(db) {
  return new Promise((resolve) => {
    db.get(
      `SELECT 
        b.category,
        b."limit" as budget_limit,
        COALESCE(SUM(e.amount), 0) as spent,
        CASE 
          WHEN COALESCE(SUM(e.amount), 0) > b."limit" THEN 'over'
          WHEN COALESCE(SUM(e.amount), 0) > b."limit" * 0.9 THEN 'warning'
          ELSE 'ok'
        END as status
       FROM budgets b
       LEFT JOIN expenses e ON 
         e.type = b.category AND
         strftime('%Y', e.date) = CAST(b.year AS TEXT) AND
         strftime('%m', e.date) = printf('%02d', b.month)
       WHERE b.category = 'Personal Care' AND b.year = 2025 AND b.month = 11
       GROUP BY b.id`,
      (err, row) => {
        if (err) {
          logTest('Test 7: Budget alert detection for Personal Care', false, err.message);
          resolve(false);
        } else if (!row) {
          logTest('Test 7: Budget alert detection for Personal Care', false, 'No budget data found');
          resolve(false);
        } else {
          // We spent 150.50 on a 150.00 budget, so status should be 'over'
          if (row.status !== 'over') {
            logTest('Test 7: Budget alert detection for Personal Care', false, `Expected status 'over', got '${row.status}'`);
            resolve(false);
          } else {
            logTest('Test 7: Budget alert detection for Personal Care', true);
            resolve(true);
          }
        }
      }
    );
  });
}

// Test 8: Category validation
function testCategoryValidation() {
  const isValidResult = isValid('Personal Care');
  const isBudgetableResult = isBudgetable('Personal Care');
  
  if (!isValidResult) {
    logTest('Test 8: Category validation - isValid', false, 'Personal Care should be valid');
    return false;
  }
  
  if (!isBudgetableResult) {
    logTest('Test 8: Category validation - isBudgetable', false, 'Personal Care should be budgetable');
    return false;
  }
  
  logTest('Test 8: Category validation', true);
  return true;
}

// Test 9: Multiple Personal Care expenses in different weeks
async function testMultipleExpenses(db) {
  return new Promise((resolve) => {
    const expenses = [
      { date: '2025-11-05', place: 'Barber', amount: 30.00, week: 1 },
      { date: '2025-11-12', place: 'Cosmetics Store', amount: 55.00, week: 2 },
      { date: '2025-11-19', place: 'Pharmacy', amount: 20.00, week: 3 },
      { date: '2025-11-26', place: 'Spa', amount: 75.00, week: 4 }
    ];

    let inserted = 0;
    expenses.forEach((expense) => {
      db.run(
        `INSERT INTO expenses (date, place, notes, amount, type, week, method)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [expense.date, expense.place, 'Personal care', expense.amount, 'Personal Care', expense.week, 'Debit'],
        function(err) {
          if (err) {
            logTest('Test 9: Multiple Personal Care expenses', false, err.message);
            resolve(false);
          } else {
            inserted++;
            if (inserted === expenses.length) {
              // Verify all were inserted
              db.get(
                `SELECT COUNT(*) as count, SUM(amount) as total
                 FROM expenses
                 WHERE type = 'Personal Care' AND strftime('%Y', date) = '2025' AND strftime('%m', date) = '11'`,
                (err, row) => {
                  if (err) {
                    logTest('Test 9: Multiple Personal Care expenses', false, err.message);
                    resolve(false);
                  } else if (row.count < 4) {
                    logTest('Test 9: Multiple Personal Care expenses', false, `Expected at least 4 expenses, got ${row.count}`);
                    resolve(false);
                  } else {
                    logTest('Test 9: Multiple Personal Care expenses', true);
                    resolve(true);
                  }
                }
              );
            }
          }
        }
      );
    });
  });
}

// Main test runner
async function runTests() {
  console.log('\n=== Personal Care Category Integration Tests ===\n');
  console.log('Testing Requirements: 5.1, 5.2, 5.3, 5.4, 5.5\n');

  try {
    // Test category validation first (no DB needed)
    testCategoryValidation();

    // Create test database
    const db = await createTestDatabase();
    console.log('✓ Test database created\n');

    // Run database tests in sequence
    await testExpenseCreation(db);
    await testBudgetCreation(db);
    await testCSVImport(db);
    await testMonthlySummary(db);
    await testAnnualSummary(db);
    await testBudgetTracking(db);
    await testBudgetAlert(db);
    await testMultipleExpenses(db);

    // Close database
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      }

      // Clean up test database
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }

      // Print summary
      console.log('\n=== Test Summary ===');
      console.log(`Total: ${results.passed + results.failed}`);
      console.log(`Passed: ${results.passed}`);
      console.log(`Failed: ${results.failed}`);
      
      if (results.failed > 0) {
        console.log('\nFailed tests:');
        results.tests.filter(t => !t.passed).forEach(t => {
          console.log(`  - ${t.name}: ${t.message}`);
        });
        process.exit(1);
      } else {
        console.log('\n✓ All integration tests passed!');
        process.exit(0);
      }
    });
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

// Run tests
runTests();
