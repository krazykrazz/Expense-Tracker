#!/usr/bin/env node

/**
 * Script to test foreign key constraints and table functionality
 */

const { getDatabase } = require('../database/db');

async function testPeopleConstraints() {
  console.log('Testing people tables constraints and functionality...');
  
  try {
    const db = await getDatabase();
    
    // Test 1: Insert a person
    console.log('\n--- Test 1: Insert a person ---');
    db.run("INSERT INTO people (name, date_of_birth) VALUES (?, ?)", 
      ['Test Person', '1990-01-01'], 
      function(err) {
        if (err) {
          console.error('✗ Failed to insert person:', err.message);
          return;
        }
        console.log(`✓ Inserted person with ID: ${this.lastID}`);
        const personId = this.lastID;
        
        // Test 2: Insert an expense (we need an existing expense to test the junction table)
        console.log('\n--- Test 2: Insert a test expense ---');
        db.run("INSERT INTO expenses (date, place, notes, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?, ?)",
          ['2025-12-13', 'Test Clinic', 'Test medical expense', 100.00, 'Tax - Medical', 2, 'Debit'],
          function(err) {
            if (err) {
              console.error('✗ Failed to insert expense:', err.message);
              return;
            }
            console.log(`✓ Inserted expense with ID: ${this.lastID}`);
            const expenseId = this.lastID;
            
            // Test 3: Insert expense-person association
            console.log('\n--- Test 3: Insert expense-person association ---');
            db.run("INSERT INTO expense_people (expense_id, person_id, amount) VALUES (?, ?, ?)",
              [expenseId, personId, 100.00],
              function(err) {
                if (err) {
                  console.error('✗ Failed to insert expense-person association:', err.message);
                  return;
                }
                console.log(`✓ Inserted expense-person association with ID: ${this.lastID}`);
                
                // Test 4: Test unique constraint (should fail)
                console.log('\n--- Test 4: Test unique constraint (should fail) ---');
                db.run("INSERT INTO expense_people (expense_id, person_id, amount) VALUES (?, ?, ?)",
                  [expenseId, personId, 50.00],
                  function(err) {
                    if (err) {
                      console.log('✓ Unique constraint working - duplicate insertion prevented:', err.message);
                    } else {
                      console.error('✗ Unique constraint failed - duplicate insertion allowed');
                    }
                    
                    // Test 5: Test foreign key constraint (should fail)
                    console.log('\n--- Test 5: Test foreign key constraint (should fail) ---');
                    db.run("INSERT INTO expense_people (expense_id, person_id, amount) VALUES (?, ?, ?)",
                      [99999, personId, 50.00], // Non-existent expense ID
                      function(err) {
                        if (err) {
                          console.log('✓ Foreign key constraint working - invalid expense_id prevented:', err.message);
                        } else {
                          console.error('✗ Foreign key constraint failed - invalid expense_id allowed');
                        }
                        
                        // Test 6: Test CASCADE DELETE
                        console.log('\n--- Test 6: Test CASCADE DELETE ---');
                        db.run("DELETE FROM people WHERE id = ?", [personId], function(err) {
                          if (err) {
                            console.error('✗ Failed to delete person:', err.message);
                            return;
                          }
                          console.log('✓ Deleted person');
                          
                          // Check if expense_people record was also deleted
                          db.get("SELECT COUNT(*) as count FROM expense_people WHERE person_id = ?", [personId], (err, row) => {
                            if (err) {
                              console.error('✗ Failed to check cascade delete:', err.message);
                              return;
                            }
                            
                            if (row.count === 0) {
                              console.log('✓ CASCADE DELETE working - expense_people record automatically deleted');
                            } else {
                              console.error('✗ CASCADE DELETE failed - expense_people record still exists');
                            }
                            
                            // Cleanup: Delete test expense
                            db.run("DELETE FROM expenses WHERE id = ?", [expenseId], function(err) {
                              if (err) {
                                console.error('Warning: Failed to cleanup test expense:', err.message);
                              } else {
                                console.log('✓ Cleaned up test expense');
                              }
                              
                              console.log('\n✓ All constraint tests completed');
                              
                              // Close database connection
                              db.close((err) => {
                                if (err) {
                                  console.error('Error closing database:', err.message);
                                  process.exit(1);
                                }
                                console.log('Database connection closed');
                                process.exit(0);
                              });
                            });
                          });
                        });
                      });
                  });
              });
          });
      });
    
  } catch (error) {
    console.error('✗ Constraint test failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  testPeopleConstraints();
}

module.exports = { testPeopleConstraints };