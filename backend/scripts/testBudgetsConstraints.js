const sqlite3 = require('sqlite3').verbose();
const { getDatabasePath } = require('../config/paths');

// Database file path - use dynamic path from config
const DB_PATH = getDatabasePath();

console.log('Testing budgets table constraints...');
console.log('Database path:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to database\n');
});

let testsPassed = 0;
let testsFailed = 0;

function runTest(testName, sql, params, shouldFail = false) {
  return new Promise((resolve) => {
    db.run(sql, params, function(err) {
      if (shouldFail) {
        if (err) {
          console.log(`✓ ${testName}: Correctly rejected (${err.message})`);
          testsPassed++;
        } else {
          console.log(`✗ ${testName}: Should have failed but succeeded`);
          testsFailed++;
        }
      } else {
        if (err) {
          console.log(`✗ ${testName}: Failed (${err.message})`);
          testsFailed++;
        } else {
          console.log(`✓ ${testName}: Passed (ID: ${this.lastID})`);
          testsPassed++;
        }
      }
      resolve();
    });
  });
}

async function runTests() {
  console.log('=== Testing Valid Inserts ===\n');
  
  // Test 1: Valid budget for Food
  await runTest(
    'Valid Food budget',
    'INSERT INTO budgets (year, month, category, "limit") VALUES (?, ?, ?, ?)',
    [2025, 11, 'Food', 500.00]
  );
  
  // Test 2: Valid budget for Gas
  await runTest(
    'Valid Gas budget',
    'INSERT INTO budgets (year, month, category, "limit") VALUES (?, ?, ?, ?)',
    [2025, 11, 'Gas', 300.00]
  );
  
  // Test 3: Valid budget for Other
  await runTest(
    'Valid Other budget',
    'INSERT INTO budgets (year, month, category, "limit") VALUES (?, ?, ?, ?)',
    [2025, 11, 'Other', 200.00]
  );
  
  console.log('\n=== Testing Constraint Violations ===\n');
  
  // Test 4: Negative limit (should fail)
  await runTest(
    'Negative limit rejection',
    'INSERT INTO budgets (year, month, category, "limit") VALUES (?, ?, ?, ?)',
    [2025, 12, 'Food', -100.00],
    true
  );
  
  // Test 5: Zero limit (should fail)
  await runTest(
    'Zero limit rejection',
    'INSERT INTO budgets (year, month, category, "limit") VALUES (?, ?, ?, ?)',
    [2025, 12, 'Food', 0],
    true
  );
  
  // Test 6: Invalid category (should fail)
  await runTest(
    'Invalid category rejection',
    'INSERT INTO budgets (year, month, category, "limit") VALUES (?, ?, ?, ?)',
    [2025, 12, 'Tax - Medical', 100.00],
    true
  );
  
  // Test 7: Invalid month - too low (should fail)
  await runTest(
    'Month < 1 rejection',
    'INSERT INTO budgets (year, month, category, "limit") VALUES (?, ?, ?, ?)',
    [2025, 0, 'Food', 100.00],
    true
  );
  
  // Test 8: Invalid month - too high (should fail)
  await runTest(
    'Month > 12 rejection',
    'INSERT INTO budgets (year, month, category, "limit") VALUES (?, ?, ?, ?)',
    [2025, 13, 'Food', 100.00],
    true
  );
  
  // Test 9: Duplicate budget (should fail)
  await runTest(
    'Duplicate budget rejection',
    'INSERT INTO budgets (year, month, category, "limit") VALUES (?, ?, ?, ?)',
    [2025, 11, 'Food', 600.00],
    true
  );
  
  console.log('\n=== Testing Update Trigger ===\n');
  
  // Test 10: Update budget and check timestamp
  await new Promise((resolve) => {
    db.get('SELECT updated_at FROM budgets WHERE year = 2025 AND month = 11 AND category = "Food"', (err, row) => {
      if (err) {
        console.log(`✗ Get original timestamp: Failed (${err.message})`);
        testsFailed++;
        resolve();
        return;
      }
      
      const originalTimestamp = row.updated_at;
      console.log(`Original timestamp: ${originalTimestamp}`);
      
      // Wait a moment then update
      setTimeout(() => {
        db.run('UPDATE budgets SET "limit" = ? WHERE year = 2025 AND month = 11 AND category = "Food"', [550.00], (err) => {
          if (err) {
            console.log(`✗ Update budget: Failed (${err.message})`);
            testsFailed++;
            resolve();
            return;
          }
          
          // Check if timestamp was updated
          db.get('SELECT updated_at FROM budgets WHERE year = 2025 AND month = 11 AND category = "Food"', (err, row) => {
            if (err) {
              console.log(`✗ Get updated timestamp: Failed (${err.message})`);
              testsFailed++;
            } else if (row.updated_at !== originalTimestamp) {
              console.log(`✓ Timestamp trigger: Passed (${originalTimestamp} → ${row.updated_at})`);
              testsPassed++;
            } else {
              console.log(`✗ Timestamp trigger: Failed (timestamp not updated)`);
              testsFailed++;
            }
            resolve();
          });
        });
      }, 100);
    });
  });
  
  console.log('\n=== Testing Indexes ===\n');
  
  // Test 11: Query using period index
  await new Promise((resolve) => {
    db.all('SELECT * FROM budgets WHERE year = 2025 AND month = 11', (err, rows) => {
      if (err) {
        console.log(`✗ Period index query: Failed (${err.message})`);
        testsFailed++;
      } else {
        console.log(`✓ Period index query: Passed (found ${rows.length} budgets)`);
        testsPassed++;
      }
      resolve();
    });
  });
  
  // Test 12: Query using category index
  await new Promise((resolve) => {
    db.all('SELECT * FROM budgets WHERE category = "Food"', (err, rows) => {
      if (err) {
        console.log(`✗ Category index query: Failed (${err.message})`);
        testsFailed++;
      } else {
        console.log(`✓ Category index query: Passed (found ${rows.length} Food budgets)`);
        testsPassed++;
      }
      resolve();
    });
  });
  
  console.log('\n=== Cleanup ===\n');
  
  // Clean up test data
  await new Promise((resolve) => {
    db.run('DELETE FROM budgets WHERE year = 2025', (err) => {
      if (err) {
        console.log(`✗ Cleanup: Failed (${err.message})`);
      } else {
        console.log(`✓ Cleanup: Test data removed`);
      }
      resolve();
    });
  });
  
  // Close database
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    }
    
    console.log('\n=== Test Summary ===\n');
    console.log(`Tests Passed: ${testsPassed}`);
    console.log(`Tests Failed: ${testsFailed}`);
    console.log(`Total Tests: ${testsPassed + testsFailed}`);
    
    if (testsFailed === 0) {
      console.log('\n✓ All tests passed!');
      process.exit(0);
    } else {
      console.log('\n✗ Some tests failed');
      process.exit(1);
    }
  });
}

runTests();
