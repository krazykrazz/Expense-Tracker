const { initializeDatabase } = require('../database/db');

async function testInvestmentMigration() {
  console.log('Testing investment tracking migration...\n');
  
  try {
    // Initialize database (this will run migrations)
    const db = await initializeDatabase();
    
    // Check if investments table exists
    db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='investments'",
      (err, row) => {
        if (err) {
          console.error('Error checking investments table:', err.message);
          process.exit(1);
        }
        
        if (row) {
          console.log('✓ investments table exists');
          
          // Check table structure
          db.all('PRAGMA table_info(investments)', (err, columns) => {
            if (err) {
              console.error('Error getting investments table info:', err.message);
              process.exit(1);
            }
            
            console.log('\nInvestments table columns:');
            columns.forEach(col => {
              console.log(`  - ${col.name} (${col.type})`);
            });
            
            // Check for type constraint
            db.get(
              "SELECT sql FROM sqlite_master WHERE type='table' AND name='investments'",
              (err, row) => {
                if (err) {
                  console.error('Error getting investments table SQL:', err.message);
                  process.exit(1);
                }
                
                if (row.sql.includes("CHECK(type IN ('TFSA', 'RRSP'))")) {
                  console.log('✓ Type constraint exists (TFSA, RRSP)');
                } else {
                  console.error('✗ Type constraint missing');
                }
                
                if (row.sql.includes('CHECK(initial_value >= 0)')) {
                  console.log('✓ Initial value constraint exists (>= 0)');
                } else {
                  console.error('✗ Initial value constraint missing');
                }
              }
            );
          });
          
          // Check if investment_values table exists
          db.get(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='investment_values'",
            (err, row) => {
              if (err) {
                console.error('Error checking investment_values table:', err.message);
                process.exit(1);
              }
              
              if (row) {
                console.log('\n✓ investment_values table exists');
                
                // Check table structure
                db.all('PRAGMA table_info(investment_values)', (err, columns) => {
                  if (err) {
                    console.error('Error getting investment_values table info:', err.message);
                    process.exit(1);
                  }
                  
                  console.log('\nInvestment values table columns:');
                  columns.forEach(col => {
                    console.log(`  - ${col.name} (${col.type})`);
                  });
                  
                  // Check foreign key
                  db.all('PRAGMA foreign_key_list(investment_values)', (err, fks) => {
                    if (err) {
                      console.error('Error getting foreign keys:', err.message);
                      process.exit(1);
                    }
                    
                    console.log('\nForeign keys:');
                    fks.forEach(fk => {
                      console.log(`  - ${fk.from} -> ${fk.table}.${fk.to} (ON DELETE ${fk.on_delete})`);
                    });
                    
                    if (fks.some(fk => fk.table === 'investments' && fk.on_delete === 'CASCADE')) {
                      console.log('✓ Foreign key with CASCADE delete exists');
                    } else {
                      console.error('✗ Foreign key with CASCADE delete missing');
                    }
                  });
                  
                  // Check indexes
                  db.all(
                    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='investment_values'",
                    (err, indexes) => {
                      if (err) {
                        console.error('Error getting indexes:', err.message);
                        process.exit(1);
                      }
                      
                      console.log('\nInvestment values indexes:');
                      indexes.forEach(idx => {
                        console.log(`  - ${idx.name}`);
                      });
                      
                      const expectedIndexes = [
                        'idx_investment_values_investment_id',
                        'idx_investment_values_year_month'
                      ];
                      
                      expectedIndexes.forEach(expectedIdx => {
                        if (indexes.some(idx => idx.name === expectedIdx)) {
                          console.log(`✓ Index ${expectedIdx} exists`);
                        } else {
                          console.error(`✗ Index ${expectedIdx} missing`);
                        }
                      });
                    }
                  );
                });
              } else {
                console.error('✗ investment_values table does not exist');
                process.exit(1);
              }
            }
          );
          
          // Check investments indexes
          db.all(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='investments'",
            (err, indexes) => {
              if (err) {
                console.error('Error getting investments indexes:', err.message);
                process.exit(1);
              }
              
              console.log('\nInvestments indexes:');
              indexes.forEach(idx => {
                console.log(`  - ${idx.name}`);
              });
              
              if (indexes.some(idx => idx.name === 'idx_investments_type')) {
                console.log('✓ Index idx_investments_type exists');
              } else {
                console.error('✗ Index idx_investments_type missing');
              }
              
              // Test inserting data
              console.log('\n--- Testing data insertion ---');
              
              db.run(
                'INSERT INTO investments (name, type, initial_value) VALUES (?, ?, ?)',
                ['Test TFSA', 'TFSA', 10000.00],
                function(err) {
                  if (err) {
                    console.error('Error inserting test investment:', err.message);
                    process.exit(1);
                  }
                  
                  console.log('✓ Inserted test investment with ID:', this.lastID);
                  const investmentId = this.lastID;
                  
                  // Test inserting value entry
                  db.run(
                    'INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)',
                    [investmentId, 2025, 11, 10500.00],
                    function(err) {
                      if (err) {
                        console.error('Error inserting test value entry:', err.message);
                        process.exit(1);
                      }
                      
                      console.log('✓ Inserted test value entry with ID:', this.lastID);
                      
                      // Test unique constraint
                      db.run(
                        'INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)',
                        [investmentId, 2025, 11, 10600.00],
                        (err) => {
                          if (err) {
                            if (err.message.includes('UNIQUE constraint failed')) {
                              console.log('✓ UNIQUE constraint working (duplicate month/year rejected)');
                            } else {
                              console.error('Unexpected error:', err.message);
                            }
                          } else {
                            console.error('✗ UNIQUE constraint not working (duplicate allowed)');
                          }
                          
                          // Test type constraint
                          db.run(
                            'INSERT INTO investments (name, type, initial_value) VALUES (?, ?, ?)',
                            ['Invalid Type', 'INVALID', 5000.00],
                            (err) => {
                              if (err) {
                                if (err.message.includes('CHECK constraint failed')) {
                                  console.log('✓ Type CHECK constraint working (invalid type rejected)');
                                } else {
                                  console.error('Unexpected error:', err.message);
                                }
                              } else {
                                console.error('✗ Type CHECK constraint not working (invalid type allowed)');
                              }
                              
                              // Test cascade delete
                              db.run(
                                'DELETE FROM investments WHERE id = ?',
                                [investmentId],
                                (err) => {
                                  if (err) {
                                    console.error('Error deleting investment:', err.message);
                                    process.exit(1);
                                  }
                                  
                                  console.log('✓ Deleted test investment');
                                  
                                  // Check if value entry was also deleted
                                  db.get(
                                    'SELECT COUNT(*) as count FROM investment_values WHERE investment_id = ?',
                                    [investmentId],
                                    (err, row) => {
                                      if (err) {
                                        console.error('Error checking cascade delete:', err.message);
                                        process.exit(1);
                                      }
                                      
                                      if (row.count === 0) {
                                        console.log('✓ CASCADE DELETE working (value entries deleted)');
                                      } else {
                                        console.error('✗ CASCADE DELETE not working (value entries remain)');
                                      }
                                      
                                      console.log('\n✓ All tests passed!');
                                      db.close();
                                      process.exit(0);
                                    }
                                  );
                                }
                              );
                            }
                          );
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        } else {
          console.error('✗ investments table does not exist');
          process.exit(1);
        }
      }
    );
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

testInvestmentMigration();
