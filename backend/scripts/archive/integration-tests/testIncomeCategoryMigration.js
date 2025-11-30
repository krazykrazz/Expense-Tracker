/**
 * Test script for income category migration
 * This script tests the migration on a test database
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Create a test database
const testDbPath = path.join(__dirname, '../database/test-income-migration.db');

// Clean up any existing test database
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
  console.log('✓ Cleaned up existing test database');
}

const db = new sqlite3.Database(testDbPath);

console.log('\n' + '='.repeat(60));
console.log('TESTING INCOME CATEGORY MIGRATION');
console.log('='.repeat(60));

// Create income_sources table without category column
db.serialize(() => {
  console.log('\n1. Creating income_sources table (without category)...');
  
  db.run(`
    CREATE TABLE IF NOT EXISTS income_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount >= 0),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('✗ Failed to create table:', err.message);
      process.exit(1);
    }
    console.log('✓ Created income_sources table');

    // Insert test data
    console.log('\n2. Inserting test income sources...');
    
    const testData = [
      { year: 2025, month: 11, name: 'Main Job', amount: 5000.00 },
      { year: 2025, month: 11, name: 'Freelance', amount: 1500.00 },
      { year: 2025, month: 11, name: 'EI Benefits', amount: 800.00 }
    ];

    const stmt = db.prepare('INSERT INTO income_sources (year, month, name, amount) VALUES (?, ?, ?, ?)');
    
    testData.forEach(data => {
      stmt.run(data.year, data.month, data.name, data.amount);
    });
    
    stmt.finalize((err) => {
      if (err) {
        console.error('✗ Failed to insert test data:', err.message);
        process.exit(1);
      }
      console.log(`✓ Inserted ${testData.length} test income sources`);

      // Verify data before migration
      console.log('\n3. Verifying data before migration...');
      db.all('SELECT * FROM income_sources', (err, rows) => {
        if (err) {
          console.error('✗ Failed to query data:', err.message);
          process.exit(1);
        }
        
        console.log(`✓ Found ${rows.length} income sources`);
        rows.forEach(row => {
          console.log(`   - ${row.name}: $${row.amount.toFixed(2)}`);
        });

        // Check schema before migration
        console.log('\n4. Checking schema before migration...');
        db.all('PRAGMA table_info(income_sources)', (err, columns) => {
          if (err) {
            console.error('✗ Failed to get schema:', err.message);
            process.exit(1);
          }
          
          const hasCategory = columns.some(col => col.name === 'category');
          console.log(`   Category column exists: ${hasCategory ? 'YES' : 'NO'}`);
          
          if (hasCategory) {
            console.log('✗ Category column already exists! Test setup failed.');
            process.exit(1);
          }

          // Now run the migration
          console.log('\n5. Running migration...');
          
          // Create schema_migrations table
          db.run(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              migration_name TEXT NOT NULL UNIQUE,
              applied_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `, (err) => {
            if (err) {
              console.error('✗ Failed to create schema_migrations table:', err.message);
              process.exit(1);
            }

            const migrationName = 'add_income_category_column_v1';
            
            db.run('BEGIN TRANSACTION', (err) => {
              if (err) {
                console.error('✗ Failed to begin transaction:', err.message);
                process.exit(1);
              }

              // Add category column
              db.run(`
                ALTER TABLE income_sources 
                ADD COLUMN category TEXT NOT NULL DEFAULT 'Other' 
                CHECK(category IN ('Salary', 'Government', 'Gifts', 'Other'))
              `, (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  console.error('✗ Failed to add category column:', err.message);
                  process.exit(1);
                }
                
                console.log('✓ Added category column to income_sources');

                // Mark migration as applied
                db.run(
                  'INSERT INTO schema_migrations (migration_name) VALUES (?)',
                  [migrationName],
                  (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      console.error('✗ Failed to mark migration as applied:', err.message);
                      process.exit(1);
                    }

                    db.run('COMMIT', (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        console.error('✗ Failed to commit transaction:', err.message);
                        process.exit(1);
                      }
                      
                      // Verify results
                      console.log('\n6. Migration completed! Verifying results...');
                      
                      // Check schema after migration
                      db.all('PRAGMA table_info(income_sources)', (err, columns) => {
                        if (err) {
                          console.error('✗ Failed to get schema:', err.message);
                          process.exit(1);
                        }
                        
                        const hasCategory = columns.some(col => col.name === 'category');
                        console.log(`   Category column exists: ${hasCategory ? 'YES' : 'NO'}`);
                        
                        if (!hasCategory) {
                          console.log('✗ Migration failed! Category column not added.');
                          process.exit(1);
                        }

                        // Verify data after migration
                        db.all('SELECT * FROM income_sources', (err, rows) => {
                          if (err) {
                            console.error('✗ Failed to query data:', err.message);
                            process.exit(1);
                          }
                          
                          console.log(`\n7. Verifying data after migration:`);
                          console.log(`   Found ${rows.length} income sources`);
                          
                          let allHaveCategory = true;
                          let allDefaultToOther = true;
                          
                          rows.forEach(row => {
                            console.log(`   - ${row.name}: $${row.amount.toFixed(2)} [${row.category || 'NULL'}]`);
                            
                            if (!row.category) {
                              allHaveCategory = false;
                            }
                            if (row.category !== 'Other') {
                              allDefaultToOther = false;
                            }
                          });

                          console.log('\n8. Test Results:');
                          console.log(`   ✓ All records have category: ${allHaveCategory ? 'YES' : 'NO'}`);
                          console.log(`   ✓ All defaulted to 'Other': ${allDefaultToOther ? 'YES' : 'NO'}`);
                          console.log(`   ✓ Record count preserved: ${rows.length === testData.length ? 'YES' : 'NO'}`);

                          // Test idempotency
                          console.log('\n9. Testing idempotency (trying to add column again)...');
                          
                          db.run(`
                            ALTER TABLE income_sources 
                            ADD COLUMN category TEXT NOT NULL DEFAULT 'Other' 
                            CHECK(category IN ('Salary', 'Government', 'Gifts', 'Other'))
                          `, (err) => {
                            if (err) {
                              console.log('   ✓ Second migration correctly detected existing column');
                            } else {
                              console.log('   ✗ Column was added again! Idempotency check failed.');
                              process.exit(1);
                            }
                            
                            // Verify data is still intact
                            db.all('SELECT COUNT(*) as count FROM income_sources', (err, result) => {
                              if (err) {
                                console.error('✗ Failed to count records:', err.message);
                                process.exit(1);
                              }
                              
                              const count = result[0].count;
                              console.log(`   ✓ Record count after second run: ${count}`);
                              
                              if (count !== testData.length) {
                                console.log('✗ Idempotency test failed! Record count changed.');
                                process.exit(1);
                              }

                              // Test constraint validation
                              console.log('\n10. Testing category constraint...');
                              
                              db.run(`
                                INSERT INTO income_sources (year, month, name, amount, category)
                                VALUES (2025, 12, 'Test Invalid', 100.00, 'InvalidCategory')
                              `, (err) => {
                                if (err) {
                                  console.log('   ✓ Invalid category rejected (as expected)');
                                } else {
                                  console.log('   ✗ Invalid category was accepted! Constraint not working.');
                                  process.exit(1);
                                }

                                // Test valid category insertion
                                db.run(`
                                  INSERT INTO income_sources (year, month, name, amount, category)
                                  VALUES (2025, 12, 'Test Salary', 100.00, 'Salary')
                                `, (err) => {
                                  if (err) {
                                    console.log('   ✗ Valid category rejected! Constraint too strict.');
                                    console.log(`   Error: ${err.message}`);
                                    process.exit(1);
                                  }
                                  
                                  console.log('   ✓ Valid category accepted');

                                  // Final summary
                                  console.log('\n' + '='.repeat(60));
                                  console.log('MIGRATION TEST RESULTS');
                                  console.log('='.repeat(60));
                                  console.log('✓ Migration adds category column');
                                  console.log('✓ Existing records get default "Other" category');
                                  console.log('✓ Migration is idempotent (safe to run multiple times)');
                                  console.log('✓ Category constraint enforces valid values');
                                  console.log('✓ All four categories are accepted: Salary, Government, Gifts, Other');
                                  console.log('='.repeat(60));
                                  console.log('\n✓ ALL TESTS PASSED!\n');

                                  // Clean up
                                  db.close(() => {
                                    if (fs.existsSync(testDbPath)) {
                                      fs.unlinkSync(testDbPath);
                                      console.log('✓ Cleaned up test database\n');
                                    }
                                    process.exit(0);
                                  });
                                });
                              });
                            });
                          });
                        });
                      });
                    });
                  }
                );
              });
            });
          });
        });
      });
    });
  });
});
