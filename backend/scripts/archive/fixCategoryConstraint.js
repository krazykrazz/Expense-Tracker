/**
 * Fix category CHECK constraint to include all categories
 * This script will recreate the expenses table with the correct constraint
 */

const { getDatabase, DB_PATH } = require('../database/db');
const { CATEGORIES, BUDGETABLE_CATEGORIES } = require('../utils/categories');
const fs = require('fs');
const path = require('path');

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(path.dirname(DB_PATH), 'backups', `expense-tracker-fix-${timestamp}.db`);
  
  const backupDir = path.dirname(backupPath);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  fs.copyFileSync(DB_PATH, backupPath);
  console.log('✓ Backup created:', backupPath);
  return backupPath;
}

async function main() {
  console.log('Fixing category CHECK constraint...\n');
  console.log('Current categories in code:', CATEGORIES);
  
  try {
    // Create backup first
    await createBackup();
    
    const db = await getDatabase();
    const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
    const budgetCategoryList = BUDGETABLE_CATEGORIES.map(c => `'${c}'`).join(', ');
    
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION', (err) => {
          if (err) {
            return reject(err);
          }
          
          console.log('\nUpdating expenses table...');
          
          // Create new table with correct constraint
          db.run(`
            CREATE TABLE expenses_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              date TEXT NOT NULL,
              place TEXT,
              notes TEXT,
              amount REAL NOT NULL,
              type TEXT NOT NULL CHECK(type IN (${categoryList})),
              week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
              method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              recurring_id INTEGER,
              is_generated INTEGER DEFAULT 0
            )
          `, (err) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }
            
            // Copy all data
            db.run(`
              INSERT INTO expenses_new 
              SELECT * FROM expenses
            `, function(err) {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }
              
              console.log(`✓ Copied ${this.changes} expense records`);
              
              // Drop old table
              db.run('DROP TABLE expenses', (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                
                // Rename new table
                db.run('ALTER TABLE expenses_new RENAME TO expenses', (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  
                  console.log('✓ Updated expenses table');
                  
                  // Recreate indexes
                  const indexes = [
                    'CREATE INDEX IF NOT EXISTS idx_date ON expenses(date)',
                    'CREATE INDEX IF NOT EXISTS idx_type ON expenses(type)',
                    'CREATE INDEX IF NOT EXISTS idx_method ON expenses(method)'
                  ];
                  
                  let completed = 0;
                  indexes.forEach((indexSQL) => {
                    db.run(indexSQL, (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      completed++;
                      if (completed === indexes.length) {
                        console.log('✓ Recreated indexes');
                        
                        // Now update recurring_expenses table if it exists
                        db.get(
                          "SELECT name FROM sqlite_master WHERE type='table' AND name='recurring_expenses'",
                          (err, row) => {
                            if (err) {
                              db.run('ROLLBACK');
                              return reject(err);
                            }
                            
                            if (row) {
                              console.log('\nUpdating recurring_expenses table...');
                              
                              db.run(`
                                CREATE TABLE recurring_expenses_new (
                                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                                  place TEXT NOT NULL,
                                  amount REAL NOT NULL,
                                  notes TEXT,
                                  type TEXT NOT NULL CHECK(type IN (${categoryList})),
                                  method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
                                  day_of_month INTEGER NOT NULL CHECK(day_of_month >= 1 AND day_of_month <= 31),
                                  start_month TEXT NOT NULL,
                                  end_month TEXT,
                                  paused INTEGER DEFAULT 0,
                                  created_at TEXT DEFAULT CURRENT_TIMESTAMP
                                )
                              `, (err) => {
                                if (err) {
                                  db.run('ROLLBACK');
                                  return reject(err);
                                }
                                
                                db.run(`
                                  INSERT INTO recurring_expenses_new 
                                  SELECT * FROM recurring_expenses
                                `, function(err) {
                                  if (err) {
                                    db.run('ROLLBACK');
                                    return reject(err);
                                  }
                                  
                                  console.log(`✓ Copied ${this.changes} recurring expense records`);
                                  
                                  db.run('DROP TABLE recurring_expenses', (err) => {
                                    if (err) {
                                      db.run('ROLLBACK');
                                      return reject(err);
                                    }
                                    
                                    db.run('ALTER TABLE recurring_expenses_new RENAME TO recurring_expenses', (err) => {
                                      if (err) {
                                        db.run('ROLLBACK');
                                        return reject(err);
                                      }
                                      
                                      console.log('✓ Updated recurring_expenses table');
                                      
                                      // Update budgets table
                                      updateBudgetsTable(db, budgetCategoryList, resolve, reject);
                                    });
                                  });
                                });
                              });
                            } else {
                              // No recurring_expenses table, move to budgets
                              updateBudgetsTable(db, budgetCategoryList, resolve, reject);
                            }
                          }
                        );
                      }
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
    console.error('\n✗ Fix failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

function updateBudgetsTable(db, budgetCategoryList, resolve, reject) {
  db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'",
    (err, row) => {
      if (err) {
        db.run('ROLLBACK');
        return reject(err);
      }
      
      if (row) {
        console.log('\nUpdating budgets table...');
        
        db.run(`
          CREATE TABLE budgets_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
            category TEXT NOT NULL CHECK(category IN (${budgetCategoryList})),
            "limit" REAL NOT NULL CHECK("limit" > 0),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(year, month, category)
          )
        `, (err) => {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }
          
          db.run(`
            INSERT INTO budgets_new 
            SELECT * FROM budgets
          `, function(err) {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }
            
            console.log(`✓ Copied ${this.changes} budget records`);
            
            db.run('DROP TABLE budgets', (err) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }
              
              db.run('ALTER TABLE budgets_new RENAME TO budgets', (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                
                console.log('✓ Updated budgets table');
                
                // Recreate budgets indexes and trigger
                db.run('CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(year, month)', (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  
                  db.run('CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category)', (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    
                    db.run(`
                      CREATE TRIGGER IF NOT EXISTS update_budgets_timestamp 
                      AFTER UPDATE ON budgets
                      BEGIN
                        UPDATE budgets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                      END
                    `, (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      
                      commitTransaction(db, resolve, reject);
                    });
                  });
                });
              });
            });
          });
        });
      } else {
        // No budgets table
        commitTransaction(db, resolve, reject);
      }
    }
  );
}

function commitTransaction(db, resolve, reject) {
  db.run('COMMIT', (err) => {
    if (err) {
      db.run('ROLLBACK');
      return reject(err);
    }
    
    console.log('\n✓ All tables updated successfully!');
    console.log('✓ You can now use all categories including "Gifts"');
    
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
        process.exit(1);
      }
      resolve();
      process.exit(0);
    });
  });
}

main();
