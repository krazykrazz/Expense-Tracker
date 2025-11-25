/**
 * Test script to verify the fixed expenses migration
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Create a test database
const testDbPath = path.join(__dirname, 'test-migration.db');

// Clean up any existing test database
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new sqlite3.Database(testDbPath);

// Import the migration function
const { checkMigrationApplied, markMigrationApplied } = require('../database/migrations');

async function testMigration() {
  console.log('Testing fixed expenses migration...\n');

  try {
    // Create the fixed_expenses table without category and payment_type
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE fixed_expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          year INTEGER NOT NULL,
          month INTEGER NOT NULL,
          name TEXT NOT NULL,
          amount REAL NOT NULL CHECK(amount >= 0),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Created fixed_expenses table (old schema)');

    // Insert some test data
    await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO fixed_expenses (year, month, name, amount) 
        VALUES (2025, 1, 'Rent', 1500.00),
               (2025, 1, 'Internet', 75.00),
               (2025, 1, 'Phone', 50.00)
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Inserted 3 test fixed expenses');

    // Get data before migration
    const beforeData = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM fixed_expenses ORDER BY id', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    console.log('\nData before migration:');
    console.table(beforeData);

    // Run the migration
    console.log('\nRunning migration...');
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION', (err) => {
          if (err) return reject(err);

          // Check if columns already exist
          db.all('PRAGMA table_info(fixed_expenses)', (err, columns) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            const hasCategory = columns.some(col => col.name === 'category');
            const hasPaymentType = columns.some(col => col.name === 'payment_type');

            if (hasCategory && hasPaymentType) {
              console.log('✓ Columns already exist');
              db.run('COMMIT', (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                resolve();
              });
              return;
            }

            // Add category column
            if (!hasCategory) {
              db.run(`
                ALTER TABLE fixed_expenses 
                ADD COLUMN category TEXT NOT NULL DEFAULT 'Other'
              `, (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                console.log('✓ Added category column');

                // Add payment_type column
                if (!hasPaymentType) {
                  db.run(`
                    ALTER TABLE fixed_expenses 
                    ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'Debit'
                  `, (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    console.log('✓ Added payment_type column');

                    db.run('COMMIT', (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      resolve();
                    });
                  });
                } else {
                  db.run('COMMIT', (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    resolve();
                  });
                }
              });
            } else if (!hasPaymentType) {
              db.run(`
                ALTER TABLE fixed_expenses 
                ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'Debit'
              `, (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                console.log('✓ Added payment_type column');

                db.run('COMMIT', (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  resolve();
                });
              });
            }
          });
        });
      });
    });

    // Get data after migration
    const afterData = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM fixed_expenses ORDER BY id', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    console.log('\nData after migration:');
    console.table(afterData);

    // Verify data integrity
    console.log('\nVerifying data integrity...');
    let allGood = true;
    
    if (beforeData.length !== afterData.length) {
      console.error('✗ Row count mismatch!');
      allGood = false;
    } else {
      console.log(`✓ Row count preserved: ${afterData.length} rows`);
    }

    for (let i = 0; i < beforeData.length; i++) {
      const before = beforeData[i];
      const after = afterData[i];

      if (before.id !== after.id || 
          before.year !== after.year || 
          before.month !== after.month || 
          before.name !== after.name || 
          before.amount !== after.amount) {
        console.error(`✗ Data mismatch for row ${i + 1}`);
        allGood = false;
      }

      if (after.category !== 'Other') {
        console.error(`✗ Default category not set correctly for row ${i + 1}`);
        allGood = false;
      }

      if (after.payment_type !== 'Debit') {
        console.error(`✗ Default payment_type not set correctly for row ${i + 1}`);
        allGood = false;
      }
    }

    if (allGood) {
      console.log('✓ All original data preserved');
      console.log('✓ Default values set correctly');
      console.log('\n✅ Migration test PASSED!');
    } else {
      console.log('\n❌ Migration test FAILED!');
    }

  } catch (error) {
    console.error('Error during migration test:', error);
  } finally {
    // Close database
    db.close(() => {
      // Clean up test database
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
        console.log('\n✓ Cleaned up test database');
      }
    });
  }
}

testMigration();
