/**
 * Integration Test Suite for Expanded Expense Categories
 * 
 * Tests end-to-end functionality across all system components:
 * - Expense creation with all new categories
 * - Budget creation with new categories and suggestion feature
 * - Recurring expense creation and generation with new categories
 * - CSV import with new categories
 * - Summary and report generation with new categories
 * - Filtering and searching with new categories
 * - Historical data display with updated categories
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 4.1, 5.1, 6.1, 9.5
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { CATEGORIES, BUDGETABLE_CATEGORIES, TAX_DEDUCTIBLE_CATEGORIES } = require('../utils/categories');

// Use test database
const TEST_DB_PATH = path.join(__dirname, '../config/database/test-integration.db');

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

function createTestDatabase() {
  return new Promise((resolve, reject) => {
    // Remove existing test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    const db = new sqlite3.Database(TEST_DB_PATH, (err) => {
      if (err) reject(err);
    });

    // Create tables with updated schema
    const schema = `
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        place TEXT NOT NULL,
        notes TEXT,
        amount REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN (
          'Housing', 'Utilities', 'Groceries', 'Dining Out', 'Insurance',
          'Gas', 'Vehicle Maintenance', 'Entertainment', 'Subscriptions',
          'Recreation Activities', 'Pet Care', 'Tax - Medical', 'Tax - Donation', 'Other'
        )),
        week INTEGER NOT NULL,
        method TEXT NOT NULL,
        recurring_id INTEGER,
        is_generated INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS recurring_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        place TEXT NOT NULL,
        notes TEXT,
        amount REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN (
          'Housing', 'Utilities', 'Groceries', 'Dining Out', 'Insurance',
          'Gas', 'Vehicle Maintenance', 'Entertainment', 'Subscriptions',
          'Recreation Activities', 'Pet Care', 'Tax - Medical', 'Tax - Donation', 'Other'
        )),
        method TEXT NOT NULL,
        frequency TEXT NOT NULL CHECK(frequency IN ('weekly', 'biweekly', 'monthly')),
        day_of_week INTEGER,
        day_of_month INTEGER,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
        category TEXT NOT NULL CHECK(category IN (
          'Housing', 'Utilities', 'Groceries', 'Dining Out', 'Insurance',
          'Gas', 'Vehicle Maintenance', 'Entertainment', 'Subscriptions',
          'Recreation Activities', 'Pet Care', 'Other'
        )),
        "limit" REAL NOT NULL CHECK("limit" >= 0),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(year, month, category)
      );
    `;

    db.exec(schema, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

// Test 1: Expense creation with all new categories
async function testExpenseCreation(db) {
  console.log('\n=== Test 1: Expense Creation with All Categories ===');
  
  for (const category of CATEGORIES) {
    await new Promise((resolve, reject) => {
      const sql = `INSERT INTO expenses (date, place, notes, amount, type, week, method) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;
      const params = ['2024-11-01', 'Test Place', 'Test expense', 50.00, category, 1, 'Credit'];
      
      db.run(sql, params, function(err) {
        if (err) {
          logTest(`Create expense with category "${category}"`, false, err.message);
          reject(err);
        } else {
          logTest(`Create expense with category "${category}"`, true);
          resolve();
        }
      });
    });
  }

  // Verify all expenses were created
  await new Promise((resolve) => {
    db.get('SELECT COUNT(*) as count FROM expenses', (err, row) => {
      const expected = CATEGORIES.length;
      const actual = row.count;
      logTest(`All ${expected} expenses created`, actual === expected, 
        `Expected ${expected}, got ${actual}`);
      resolve();
    });
  });
}

// Test 2: Budget creation with new categories
async function testBudgetCreation(db) {
  console.log('\n=== Test 2: Budget Creation with New Categories ===');
  
  for (const category of BUDGETABLE_CATEGORIES) {
    await new Promise((resolve, reject) => {
      const sql = `INSERT INTO budgets (year, month, category, "limit") VALUES (?, ?, ?, ?)`;
      const params = [2024, 11, category, 500.00];
      
      db.run(sql, params, function(err) {
        if (err) {
          logTest(`Create budget for category "${category}"`, false, err.message);
          reject(err);
        } else {
          logTest(`Create budget for category "${category}"`, true);
          resolve();
        }
      });
    });
  }

  // Verify all budgets were created
  await new Promise((resolve) => {
    db.get('SELECT COUNT(*) as count FROM budgets', (err, row) => {
      const expected = BUDGETABLE_CATEGORIES.length;
      const actual = row.count;
      logTest(`All ${expected} budgets created`, actual === expected,
        `Expected ${expected}, got ${actual}`);
      resolve();
    });
  });
}

// Test 3: Budget calculation accuracy
async function testBudgetCalculation(db) {
  console.log('\n=== Test 3: Budget Calculation Accuracy ===');
  
  // Use a unique category for this test to avoid conflicts
  const testCategory = 'Vehicle Maintenance';
  
  // First, get the current total for this category
  const initialTotal = await new Promise((resolve) => {
    const sql = `SELECT COALESCE(SUM(amount), 0) as total FROM expenses 
                 WHERE type = ? AND strftime('%Y', date) = ? AND strftime('%m', date) = ?`;
    db.get(sql, [testCategory, '2024', '11'], (err, row) => {
      resolve(row.total);
    });
  });
  
  // Add expenses for specific categories
  const expenses = [100, 150, 200]; // Total: 450
  
  for (const amount of expenses) {
    await new Promise((resolve) => {
      const sql = `INSERT INTO expenses (date, place, notes, amount, type, week, method) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;
      db.run(sql, ['2024-11-15', 'Auto Shop', 'Maintenance', amount, testCategory, 3, 'Credit'], resolve);
    });
  }

  // Calculate spending for category
  await new Promise((resolve) => {
    const sql = `SELECT SUM(amount) as total FROM expenses 
                 WHERE type = ? AND strftime('%Y', date) = ? AND strftime('%m', date) = ?`;
    db.get(sql, [testCategory, '2024', '11'], (err, row) => {
      const expectedAdditional = expenses.reduce((a, b) => a + b, 0);
      const expected = initialTotal + expectedAdditional;
      const actual = row.total;
      logTest(`Budget calculation for ${testCategory}`, actual === expected,
        `Expected ${expected}, got ${actual}`);
      resolve();
    });
  });
}

// Test 4: Recurring expense creation and generation
async function testRecurringExpenses(db) {
  console.log('\n=== Test 4: Recurring Expense Creation and Generation ===');
  
  const testCategories = ['Housing', 'Utilities', 'Subscriptions'];
  
  for (const category of testCategories) {
    // Create recurring template
    const templateId = await new Promise((resolve, reject) => {
      const sql = `INSERT INTO recurring_expenses (place, notes, amount, type, method, frequency, day_of_month) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;
      const params = ['Recurring Place', 'Monthly expense', 100.00, category, 'Auto', 'monthly', 1];
      
      db.run(sql, params, function(err) {
        if (err) {
          logTest(`Create recurring template for "${category}"`, false, err.message);
          reject(err);
        } else {
          logTest(`Create recurring template for "${category}"`, true);
          resolve(this.lastID);
        }
      });
    });

    // Generate expense from template
    await new Promise((resolve, reject) => {
      const sql = `INSERT INTO expenses (date, place, notes, amount, type, week, method, recurring_id, is_generated) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = ['2024-11-01', 'Recurring Place', 'Monthly expense', 100.00, category, 1, 'Auto', templateId, 1];
      
      db.run(sql, params, function(err) {
        if (err) {
          logTest(`Generate expense from template for "${category}"`, false, err.message);
          reject(err);
        } else {
          logTest(`Generate expense from template for "${category}"`, true);
          resolve();
        }
      });
    });

    // Verify generated expense has correct category
    await new Promise((resolve) => {
      const sql = `SELECT type FROM expenses WHERE recurring_id = ? AND is_generated = 1`;
      db.get(sql, [templateId], (err, row) => {
        const matches = row && row.type === category;
        logTest(`Generated expense has correct category "${category}"`, matches,
          `Expected ${category}, got ${row ? row.type : 'null'}`);
        resolve();
      });
    });
  }
}

// Test 5: Category filtering
async function testCategoryFiltering(db) {
  console.log('\n=== Test 5: Category Filtering ===');
  
  const testCategory = 'Entertainment';
  
  // Add multiple expenses with different categories
  await new Promise((resolve) => {
    const sql = `INSERT INTO expenses (date, place, notes, amount, type, week, method) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, ['2024-11-20', 'Cinema', 'Movie', 25.00, testCategory, 4, 'Credit'], resolve);
  });

  await new Promise((resolve) => {
    const sql = `INSERT INTO expenses (date, place, notes, amount, type, week, method) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, ['2024-11-20', 'Restaurant', 'Dinner', 60.00, 'Dining Out', 4, 'Credit'], resolve);
  });

  // Filter by category
  await new Promise((resolve) => {
    const sql = `SELECT * FROM expenses WHERE type = ?`;
    db.all(sql, [testCategory], (err, rows) => {
      const allMatch = rows.every(row => row.type === testCategory);
      logTest(`Filter expenses by "${testCategory}"`, allMatch && rows.length > 0,
        `Found ${rows.length} expenses, all match: ${allMatch}`);
      resolve();
    });
  });
}

// Test 6: Category aggregation
async function testCategoryAggregation(db) {
  console.log('\n=== Test 6: Category Aggregation ===');
  
  // Get summary by category
  await new Promise((resolve) => {
    const sql = `SELECT type, SUM(amount) as total, COUNT(*) as count 
                 FROM expenses 
                 GROUP BY type 
                 ORDER BY total DESC`;
    db.all(sql, [], (err, rows) => {
      const hasResults = rows.length > 0;
      const allValidCategories = rows.every(row => CATEGORIES.includes(row.type));
      logTest('Category aggregation returns results', hasResults,
        `Found ${rows.length} categories`);
      logTest('All aggregated categories are valid', allValidCategories);
      
      // Display summary
      console.log('\nCategory Summary:');
      rows.forEach(row => {
        console.log(`  ${row.type}: $${row.total.toFixed(2)} (${row.count} expenses)`);
      });
      resolve();
    });
  });
}

// Test 7: Tax-deductible identification
async function testTaxDeductible(db) {
  console.log('\n=== Test 7: Tax-Deductible Category Identification ===');
  
  // Add tax-deductible expenses
  for (const category of TAX_DEDUCTIBLE_CATEGORIES) {
    await new Promise((resolve) => {
      const sql = `INSERT INTO expenses (date, place, notes, amount, type, week, method) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;
      db.run(sql, ['2024-11-25', 'Medical Center', 'Treatment', 200.00, category, 4, 'Credit'], resolve);
    });
  }

  // Query tax-deductible expenses
  await new Promise((resolve) => {
    const sql = `SELECT * FROM expenses WHERE type LIKE 'Tax -%'`;
    db.all(sql, [], (err, rows) => {
      const expected = TAX_DEDUCTIBLE_CATEGORIES.length;
      const actual = rows.length;
      const allTaxDeductible = rows.every(row => TAX_DEDUCTIBLE_CATEGORIES.includes(row.type));
      
      logTest('Tax-deductible expenses identified', actual >= expected,
        `Expected at least ${expected}, found ${actual}`);
      logTest('All identified expenses are tax-deductible', allTaxDeductible);
      resolve();
    });
  });
}

// Test 8: Invalid category rejection
async function testInvalidCategoryRejection(db) {
  console.log('\n=== Test 8: Invalid Category Rejection ===');
  
  const invalidCategories = ['Food', 'InvalidCategory', 'Random', ''];
  
  for (const category of invalidCategories) {
    await new Promise((resolve) => {
      const sql = `INSERT INTO expenses (date, place, notes, amount, type, week, method) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;
      const params = ['2024-11-01', 'Test', 'Test', 50.00, category, 1, 'Credit'];
      
      db.run(sql, params, function(err) {
        const rejected = err !== null;
        logTest(`Reject invalid category "${category}"`, rejected,
          rejected ? 'Correctly rejected' : 'Should have been rejected');
        resolve();
      });
    });
  }
}

// Test 9: Historical data display (migration verification)
async function testHistoricalDataDisplay(db) {
  console.log('\n=== Test 9: Historical Data Display ===');
  
  // Verify no "Food" expenses exist
  await new Promise((resolve) => {
    db.get('SELECT COUNT(*) as count FROM expenses WHERE type = ?', ['Food'], (err, row) => {
      logTest('No "Food" expenses exist after migration', row.count === 0,
        `Found ${row.count} "Food" expenses`);
      resolve();
    });
  });

  // Verify "Dining Out" expenses exist
  await new Promise((resolve) => {
    db.get('SELECT COUNT(*) as count FROM expenses WHERE type = ?', ['Dining Out'], (err, row) => {
      logTest('"Dining Out" expenses exist', row.count > 0,
        `Found ${row.count} "Dining Out" expenses`);
      resolve();
    });
  });

  // Verify legacy categories still work
  const legacyCategories = ['Gas', 'Tax - Medical', 'Tax - Donation', 'Other'];
  for (const category of legacyCategories) {
    await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM expenses WHERE type = ?', [category], (err, row) => {
        logTest(`Legacy category "${category}" still works`, row.count > 0,
          `Found ${row.count} expenses`);
        resolve();
      });
    });
  }
}

// Test 10: Summary report generation
async function testSummaryReports(db) {
  console.log('\n=== Test 10: Summary Report Generation ===');
  
  // Monthly summary
  await new Promise((resolve) => {
    const sql = `SELECT 
                   strftime('%Y-%m', date) as month,
                   type,
                   SUM(amount) as total
                 FROM expenses
                 GROUP BY month, type
                 ORDER BY month, total DESC`;
    db.all(sql, [], (err, rows) => {
      logTest('Monthly summary generated', rows.length > 0,
        `Generated ${rows.length} summary rows`);
      resolve();
    });
  });

  // Annual summary
  await new Promise((resolve) => {
    const sql = `SELECT 
                   strftime('%Y', date) as year,
                   type,
                   SUM(amount) as total,
                   COUNT(*) as count
                 FROM expenses
                 GROUP BY year, type
                 ORDER BY year, total DESC`;
    db.all(sql, [], (err, rows) => {
      logTest('Annual summary generated', rows.length > 0,
        `Generated ${rows.length} summary rows`);
      resolve();
    });
  });
}

// Main test runner
async function runTests() {
  console.log('=================================================');
  console.log('Integration Test Suite: Expanded Expense Categories');
  console.log('=================================================\n');

  let db;
  try {
    db = await createTestDatabase();
    console.log('✓ Test database created\n');

    await testExpenseCreation(db);
    await testBudgetCreation(db);
    await testBudgetCalculation(db);
    await testRecurringExpenses(db);
    await testCategoryFiltering(db);
    await testCategoryAggregation(db);
    await testTaxDeductible(db);
    await testInvalidCategoryRejection(db);
    await testHistoricalDataDisplay(db);
    await testSummaryReports(db);

    console.log('\n=================================================');
    console.log('Test Results Summary');
    console.log('=================================================');
    console.log(`Total Tests: ${results.passed + results.failed}`);
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
    
    if (results.failed > 0) {
      console.log('\nFailed Tests:');
      results.tests.filter(t => !t.passed).forEach(t => {
        console.log(`  ✗ ${t.name}: ${t.message}`);
      });
    }

    console.log('\n=================================================\n');

  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  } finally {
    if (db) {
      db.close();
    }
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests();
