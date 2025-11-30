/**
 * Comprehensive Integration Test for Investment Tracking Feature
 * Tests complete flow, validation, cascade delete, upsert, and edge cases
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Test database path
const TEST_DB_PATH = path.join(__dirname, '../database/test-investment-integration.db');

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

let db;
let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

// Helper functions
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(testName, passed, details = '') {
  const status = passed ? '✓ PASS' : '✗ FAIL';
  const color = passed ? 'green' : 'red';
  log(`  ${status}: ${testName}`, color);
  if (details) {
    log(`    ${details}`, 'cyan');
  }
  testResults.tests.push({ name: testName, passed, details });
  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
}

// Database setup
function setupDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(TEST_DB_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }

      // Enable foreign keys (CRITICAL for CASCADE and referential integrity)
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Create tables
        db.serialize(() => {
        db.run(`
          CREATE TABLE IF NOT EXISTS investments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('TFSA', 'RRSP')),
            initial_value REAL NOT NULL CHECK(initial_value >= 0),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS investment_values (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            investment_id INTEGER NOT NULL,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            value REAL NOT NULL CHECK(value >= 0),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE,
            UNIQUE(investment_id, year, month)
          )
        `);

        db.run(`CREATE INDEX IF NOT EXISTS idx_investments_type ON investments(type)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_investment_values_investment_id ON investment_values(investment_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_investment_values_year_month ON investment_values(year, month)`, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
        });
      });
    });
  });
}

function cleanupDatabase() {
  return new Promise((resolve) => {
    if (db) {
      db.close(() => {
        const fs = require('fs');
        if (fs.existsSync(TEST_DB_PATH)) {
          fs.unlinkSync(TEST_DB_PATH);
        }
        resolve();
      });
    } else {
      resolve();
    }
  });
}

// Test helper functions
function createInvestment(name, type, initialValue) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO investments (name, type, initial_value) VALUES (?, ?, ?)',
      [name, type, initialValue],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

function getInvestment(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM investments WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function getAllInvestments() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM investments', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function deleteInvestment(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM investments WHERE id = ?', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes);
      }
    });
  });
}

function createValueEntry(investmentId, year, month, value) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)',
      [investmentId, year, month, value],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

function updateValueEntry(investmentId, year, month, value) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE investment_values SET value = ? WHERE investment_id = ? AND year = ? AND month = ?',
      [value, investmentId, year, month],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      }
    );
  });
}

function getValueEntries(investmentId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM investment_values WHERE investment_id = ? ORDER BY year DESC, month DESC',
      [investmentId],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

function getAllValueEntries() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM investment_values', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Test 1: Complete flow - create investment → add value entries → view
async function testCompleteFlow() {
  log('\n1. Testing Complete Flow', 'blue');
  
  try {
    // Create investment
    const investmentId = await createInvestment('My TFSA', 'TFSA', 10000);
    const investment = await getInvestment(investmentId);
    
    logTest(
      'Create investment',
      investment && investment.name === 'My TFSA' && investment.type === 'TFSA' && investment.initial_value === 10000,
      `Created investment ID: ${investmentId}`
    );

    // Add value entries
    const value1Id = await createValueEntry(investmentId, 2025, 1, 10500);
    const value2Id = await createValueEntry(investmentId, 2025, 2, 11000);
    const value3Id = await createValueEntry(investmentId, 2025, 3, 10800);
    
    logTest(
      'Add multiple value entries',
      value1Id && value2Id && value3Id,
      `Created 3 value entries`
    );

    // Retrieve value history
    const values = await getValueEntries(investmentId);
    
    logTest(
      'Retrieve value history',
      values.length === 3,
      `Retrieved ${values.length} value entries`
    );

    logTest(
      'Value entries sorted chronologically (most recent first)',
      values[0].year === 2025 && values[0].month === 3 &&
      values[1].year === 2025 && values[1].month === 2 &&
      values[2].year === 2025 && values[2].month === 1,
      'Entries sorted correctly'
    );

    // Calculate changes
    const change1 = values[1].value - values[2].value; // Feb - Jan
    const change2 = values[0].value - values[1].value; // Mar - Feb
    const percentChange1 = ((change1 / values[2].value) * 100).toFixed(2);
    const percentChange2 = ((change2 / values[1].value) * 100).toFixed(2);

    logTest(
      'Value change calculations',
      Math.abs(change1 - 500) < 0.01 && Math.abs(change2 - (-200)) < 0.01,
      `Jan→Feb: +$${change1} (${percentChange1}%), Feb→Mar: $${change2} (${percentChange2}%)`
    );

  } catch (error) {
    logTest('Complete flow', false, error.message);
  }
}

// Test 2: Type validation - only TFSA and RRSP accepted
async function testTypeValidation() {
  log('\n2. Testing Type Validation', 'blue');

  try {
    // Valid types
    const tfsaId = await createInvestment('Valid TFSA', 'TFSA', 5000);
    const rrspId = await createInvestment('Valid RRSP', 'RRSP', 8000);
    
    logTest(
      'Accept valid types (TFSA, RRSP)',
      tfsaId && rrspId,
      'Both TFSA and RRSP accepted'
    );

    // Invalid type
    let invalidTypeRejected = false;
    try {
      await createInvestment('Invalid Type', 'FHSA', 3000);
    } catch (error) {
      invalidTypeRejected = error.message.includes('CHECK constraint failed');
    }

    logTest(
      'Reject invalid types',
      invalidTypeRejected,
      'Invalid type "FHSA" rejected by CHECK constraint'
    );

    // Another invalid type
    let anotherInvalidRejected = false;
    try {
      await createInvestment('Another Invalid', 'Savings', 2000);
    } catch (error) {
      anotherInvalidRejected = error.message.includes('CHECK constraint failed');
    }

    logTest(
      'Reject other invalid types',
      anotherInvalidRejected,
      'Invalid type "Savings" rejected'
    );

  } catch (error) {
    logTest('Type validation', false, error.message);
  }
}

// Test 3: Cascade delete - deleting investment removes all value entries
async function testCascadeDelete() {
  log('\n3. Testing Cascade Delete', 'blue');

  try {
    // Create investment with value entries
    const investmentId = await createInvestment('Test Cascade', 'TFSA', 15000);
    await createValueEntry(investmentId, 2025, 1, 15500);
    await createValueEntry(investmentId, 2025, 2, 16000);
    await createValueEntry(investmentId, 2025, 3, 16500);

    const valuesBefore = await getValueEntries(investmentId);
    
    logTest(
      'Value entries exist before delete',
      valuesBefore.length === 3,
      `${valuesBefore.length} value entries found`
    );

    // Delete investment
    await deleteInvestment(investmentId);

    // Check investment is gone
    const investmentAfter = await getInvestment(investmentId);
    
    logTest(
      'Investment deleted',
      !investmentAfter,
      'Investment no longer exists'
    );

    // Check value entries are gone (cascade)
    const valuesAfter = await getValueEntries(investmentId);
    
    logTest(
      'Value entries cascade deleted',
      valuesAfter.length === 0,
      'All value entries removed via CASCADE'
    );

  } catch (error) {
    logTest('Cascade delete', false, error.message);
  }
}

// Test 4: Upsert - adding duplicate month/year updates existing entry
async function testUpsert() {
  log('\n4. Testing Upsert (Duplicate Month/Year)', 'blue');

  try {
    const investmentId = await createInvestment('Test Upsert', 'RRSP', 20000);
    
    // Create initial value entry
    await createValueEntry(investmentId, 2025, 6, 21000);
    const valuesBefore = await getValueEntries(investmentId);
    
    logTest(
      'Initial value entry created',
      valuesBefore.length === 1 && valuesBefore[0].value === 21000,
      `Value: $${valuesBefore[0].value}`
    );

    // Try to create duplicate (should fail with UNIQUE constraint)
    let duplicateRejected = false;
    try {
      await createValueEntry(investmentId, 2025, 6, 22000);
    } catch (error) {
      duplicateRejected = error.message.includes('UNIQUE constraint failed');
    }

    logTest(
      'Duplicate insert rejected by UNIQUE constraint',
      duplicateRejected,
      'Database enforces one value per month'
    );

    // Update existing entry (upsert logic)
    const updated = await updateValueEntry(investmentId, 2025, 6, 22000);
    const valuesAfter = await getValueEntries(investmentId);
    
    logTest(
      'Update existing entry (upsert)',
      updated === 1 && valuesAfter.length === 1 && valuesAfter[0].value === 22000,
      `Updated value from $21000 to $${valuesAfter[0].value}`
    );

  } catch (error) {
    logTest('Upsert', false, error.message);
  }
}

// Test 5: Edge cases
async function testEdgeCases() {
  log('\n5. Testing Edge Cases', 'blue');

  // Test 5a: No investments
  try {
    const investments = await getAllInvestments();
    logTest(
      'Handle no investments',
      Array.isArray(investments),
      `Returns empty array: ${investments.length} investments`
    );
  } catch (error) {
    logTest('No investments edge case', false, error.message);
  }

  // Test 5b: Investment with no value entries
  try {
    const investmentId = await createInvestment('No Values', 'TFSA', 5000);
    const values = await getValueEntries(investmentId);
    
    logTest(
      'Investment with no value entries',
      values.length === 0,
      'Should display initial_value as current value'
    );
  } catch (error) {
    logTest('No value entries edge case', false, error.message);
  }

  // Test 5c: Negative initial value (should be rejected)
  try {
    let negativeRejected = false;
    try {
      await createInvestment('Negative Initial', 'TFSA', -1000);
    } catch (error) {
      negativeRejected = error.message.includes('CHECK constraint failed');
    }

    logTest(
      'Reject negative initial value',
      negativeRejected,
      'CHECK constraint prevents negative values'
    );
  } catch (error) {
    logTest('Negative initial value edge case', false, error.message);
  }

  // Test 5d: Negative value entry (should be rejected)
  try {
    const investmentId = await createInvestment('Test Negative Value', 'RRSP', 10000);
    let negativeValueRejected = false;
    try {
      await createValueEntry(investmentId, 2025, 1, -500);
    } catch (error) {
      negativeValueRejected = error.message.includes('CHECK constraint failed');
    }

    logTest(
      'Reject negative value entry',
      negativeValueRejected,
      'CHECK constraint prevents negative values'
    );
  } catch (error) {
    logTest('Negative value entry edge case', false, error.message);
  }

  // Test 5e: Zero values (should be accepted)
  try {
    const investmentId = await createInvestment('Zero Initial', 'TFSA', 0);
    await createValueEntry(investmentId, 2025, 1, 0);
    
    logTest(
      'Accept zero values',
      true,
      'Zero is valid for initial_value and value'
    );
  } catch (error) {
    logTest('Zero values edge case', false, error.message);
  }

  // Test 5f: Invalid month (should be handled by application logic)
  try {
    const investmentId = await createInvestment('Test Invalid Month', 'TFSA', 5000);
    
    // Month 0 (invalid)
    await createValueEntry(investmentId, 2025, 0, 5500);
    
    // Month 13 (invalid)
    await createValueEntry(investmentId, 2025, 13, 6000);
    
    logTest(
      'Invalid month values',
      true,
      'Database accepts any integer - validation should be in application layer'
    );
  } catch (error) {
    logTest('Invalid month edge case', false, error.message);
  }
}

// Test 6: Arrow indicators and color coding logic
async function testIndicatorsAndColors() {
  log('\n6. Testing Arrow Indicators and Color Coding', 'blue');

  try {
    const investmentId = await createInvestment('Test Indicators', 'TFSA', 10000);
    
    // Create value entries with different changes
    await createValueEntry(investmentId, 2025, 1, 10000); // No change from initial
    await createValueEntry(investmentId, 2025, 2, 10500); // Increase
    await createValueEntry(investmentId, 2025, 3, 10200); // Decrease
    await createValueEntry(investmentId, 2025, 4, 10200); // No change

    const values = await getValueEntries(investmentId);
    
    // Calculate changes
    const changes = [];
    for (let i = values.length - 1; i >= 0; i--) {
      if (i === values.length - 1) {
        // First entry - compare to initial value
        changes.push({
          month: values[i].month,
          change: values[i].value - 10000,
          value: values[i].value
        });
      } else {
        changes.push({
          month: values[i].month,
          change: values[i].value - values[i + 1].value,
          value: values[i].value
        });
      }
    }

    // Test indicator logic
    const indicators = changes.map(c => {
      if (c.change > 0) return '▲';
      if (c.change < 0) return '▼';
      return '—';
    });

    const colors = changes.map(c => {
      if (c.change > 0) return 'green';
      if (c.change < 0) return 'red';
      return 'neutral';
    });

    logTest(
      'Arrow indicator logic',
      indicators[0] === '—' && indicators[1] === '▲' && indicators[2] === '▼' && indicators[3] === '—',
      `Indicators: ${indicators.join(', ')}`
    );

    logTest(
      'Color coding logic',
      colors[0] === 'neutral' && colors[1] === 'green' && colors[2] === 'red' && colors[3] === 'neutral',
      `Colors: ${colors.join(', ')}`
    );

  } catch (error) {
    logTest('Indicators and colors', false, error.message);
  }
}

// Test 7: Data integrity and indexes
async function testDataIntegrity() {
  log('\n7. Testing Data Integrity and Performance', 'blue');

  try {
    // Test foreign key constraint
    let foreignKeyViolation = false;
    try {
      await createValueEntry(99999, 2025, 1, 5000); // Non-existent investment
    } catch (error) {
      foreignKeyViolation = error.message.includes('FOREIGN KEY constraint failed');
    }

    logTest(
      'Foreign key constraint enforced',
      foreignKeyViolation,
      'Cannot create value entry for non-existent investment'
    );

    // Test indexes exist
    const indexQuery = `
      SELECT name FROM sqlite_master 
      WHERE type='index' AND (
        name='idx_investments_type' OR 
        name='idx_investment_values_investment_id' OR 
        name='idx_investment_values_year_month'
      )
    `;
    
    const indexes = await new Promise((resolve, reject) => {
      db.all(indexQuery, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    logTest(
      'Performance indexes created',
      indexes.length === 3,
      `Found ${indexes.length} indexes: ${indexes.map(i => i.name).join(', ')}`
    );

  } catch (error) {
    logTest('Data integrity', false, error.message);
  }
}

// Main test runner
async function runTests() {
  log('='.repeat(60), 'cyan');
  log('Investment Tracking Integration Tests', 'cyan');
  log('='.repeat(60), 'cyan');

  try {
    await setupDatabase();
    log('✓ Test database initialized', 'green');

    await testCompleteFlow();
    await testTypeValidation();
    await testCascadeDelete();
    await testUpsert();
    await testEdgeCases();
    await testIndicatorsAndColors();
    await testDataIntegrity();

    // Summary
    log('\n' + '='.repeat(60), 'cyan');
    log('Test Summary', 'cyan');
    log('='.repeat(60), 'cyan');
    log(`Total Tests: ${testResults.passed + testResults.failed}`, 'blue');
    log(`Passed: ${testResults.passed}`, 'green');
    log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? 'red' : 'green');
    log(`Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`, 
        testResults.failed > 0 ? 'yellow' : 'green');

    if (testResults.failed > 0) {
      log('\nFailed Tests:', 'red');
      testResults.tests.filter(t => !t.passed).forEach(t => {
        log(`  - ${t.name}`, 'red');
        if (t.details) {
          log(`    ${t.details}`, 'cyan');
        }
      });
    }

  } catch (error) {
    log(`\n✗ Test execution failed: ${error.message}`, 'red');
    console.error(error);
  } finally {
    await cleanupDatabase();
    log('\n✓ Test database cleaned up', 'green');
    
    // Exit with appropriate code
    process.exit(testResults.failed > 0 ? 1 : 0);
  }
}

// Run tests
runTests();
