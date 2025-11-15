/**
 * Add "Cheque" to the payment method constraint
 * This script updates the database to allow "Cheque" as a valid payment method
 * 
 * Usage: node backend/scripts/addChequePaymentMethod.js
 */

const { getDatabase } = require('../database/db');

async function addChequePaymentMethod() {
  try {
    console.log('Connecting to database...');
    const db = await getDatabase();
    
    console.log('Updating expenses table...');
    
    // SQLite doesn't support ALTER TABLE to modify CHECK constraints
    // We need to recreate the table with the new constraint
    
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Start transaction
        db.run('BEGIN TRANSACTION', (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Create new table with updated constraint
          db.run(`
            CREATE TABLE expenses_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              date TEXT NOT NULL,
              place TEXT,
              notes TEXT,
              amount REAL NOT NULL,
              type TEXT NOT NULL CHECK(type IN ('Other', 'Food', 'Gas', 'Tax - Medical', 'Tax - Donation')),
              week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
              method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
              recurring_id INTEGER,
              is_generated INTEGER DEFAULT 0,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `, (err) => {
            if (err) {
              db.run('ROLLBACK');
              reject(err);
              return;
            }
            
            // Copy data from old table
            db.run(`
              INSERT INTO expenses_new 
              SELECT * FROM expenses
            `, (err) => {
              if (err) {
                db.run('ROLLBACK');
                reject(err);
                return;
              }
              
              // Drop old table
              db.run('DROP TABLE expenses', (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  reject(err);
                  return;
                }
                
                // Rename new table
                db.run('ALTER TABLE expenses_new RENAME TO expenses', (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    reject(err);
                    return;
                  }
                  
                  // Recreate indexes
                  db.run('CREATE INDEX IF NOT EXISTS idx_date ON expenses(date)', (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      reject(err);
                      return;
                    }
                    
                    db.run('CREATE INDEX IF NOT EXISTS idx_type ON expenses(type)', (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        reject(err);
                        return;
                      }
                      
                      db.run('CREATE INDEX IF NOT EXISTS idx_method ON expenses(method)', (err) => {
                        if (err) {
                          db.run('ROLLBACK');
                          reject(err);
                          return;
                        }
                        
                        db.run('CREATE INDEX IF NOT EXISTS idx_recurring_id ON expenses(recurring_id)', (err) => {
                          if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                            return;
                          }
                          
                          // Commit transaction
                          db.run('COMMIT', (err) => {
                            if (err) {
                              db.run('ROLLBACK');
                              reject(err);
                              return;
                            }
                            
                            console.log('✓ Successfully updated expenses table to include "Cheque" payment method');
                            resolve();
                          });
                        });
                      });
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
    console.error('Error:', error);
    throw error;
  }
}

// Run the script
addChequePaymentMethod()
  .then(() => {
    console.log('\nDone! "Cheque" is now a valid payment method.');
    console.log('Please restart the backend server for changes to take effect.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nFailed:', error.message);
    process.exit(1);
  });
