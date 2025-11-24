const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { getDatabasePath } = require('../config/paths');
const { CATEGORIES, BUDGETABLE_CATEGORIES } = require('../utils/categories');

const DB_PATH = getDatabasePath();

console.log('Quick Migration Script');
console.log('Database:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  
  console.log('Database opened');
  
  const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
  const budgetCategoryList = BUDGETABLE_CATEGORIES.map(c => `'${c}'`).join(', ');
  
  db.serialize(() => {
    console.log('Starting transaction...');
    
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error('Error starting transaction:', err);
        process.exit(1);
      }
      
      // Update expenses table
      console.log('Creating expenses_new table...');
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
          recurring_id INTEGER,
          is_generated INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (recurring_id) REFERENCES recurring_expenses(id) ON DELETE SET NULL
        )
      `, (err) => {
        if (err) {
          console.error('Error creating expenses_new:', err);
          db.run('ROLLBACK');
          process.exit(1);
        }
        
        console.log('Copying expenses data (updating Food to Dining Out)...');
        db.run(`INSERT INTO expenses_new SELECT id, date, place, notes, amount, CASE WHEN type = 'Food' THEN 'Dining Out' ELSE type END, week, method, recurring_id, is_generated, created_at FROM expenses`, (err) => {
          if (err) {
            console.error('Error copying expenses:', err);
            db.run('ROLLBACK');
            process.exit(1);
          }
          
          console.log('Dropping old expenses table...');
          db.run('DROP TABLE expenses', (err) => {
            if (err) {
              console.error('Error dropping expenses:', err);
              db.run('ROLLBACK');
              process.exit(1);
            }
            
            console.log('Renaming expenses_new to expenses...');
            db.run('ALTER TABLE expenses_new RENAME TO expenses', (err) => {
              if (err) {
                console.error('Error renaming expenses:', err);
                db.run('ROLLBACK');
                process.exit(1);
              }
              
              console.log('Expenses table updated!');
              
              // Update recurring_expenses table
              console.log('Creating recurring_expenses_new table...');
              db.run(`
                CREATE TABLE recurring_expenses_new (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  place TEXT NOT NULL,
                  amount REAL NOT NULL,
                  notes TEXT,
                  type TEXT NOT NULL CHECK(type IN (${categoryList})),
                  method TEXT NOT NULL,
                  day_of_month INTEGER NOT NULL,
                  start_month TEXT NOT NULL,
                  end_month TEXT,
                  paused INTEGER DEFAULT 0,
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
              `, (err) => {
                if (err) {
                  console.error('Error creating recurring_expenses_new:', err);
                  db.run('ROLLBACK');
                  process.exit(1);
                }
                
                console.log('Copying recurring_expenses data (updating Food to Dining Out)...');
                db.run(`INSERT INTO recurring_expenses_new SELECT id, place, amount, notes, CASE WHEN type = 'Food' THEN 'Dining Out' ELSE type END, method, day_of_month, start_month, end_month, paused, created_at FROM recurring_expenses`, (err) => {
                  if (err) {
                    console.error('Error copying recurring_expenses:', err);
                    db.run('ROLLBACK');
                    process.exit(1);
                  }
                  
                  console.log('Dropping old recurring_expenses table...');
                  db.run('DROP TABLE recurring_expenses', (err) => {
                    if (err) {
                      console.error('Error dropping recurring_expenses:', err);
                      db.run('ROLLBACK');
                      process.exit(1);
                    }
                    
                    console.log('Renaming recurring_expenses_new to recurring_expenses...');
                    db.run('ALTER TABLE recurring_expenses_new RENAME TO recurring_expenses', (err) => {
                      if (err) {
                        console.error('Error renaming recurring_expenses:', err);
                        db.run('ROLLBACK');
                        process.exit(1);
                      }
                      
                      console.log('Recurring expenses table updated!');
                      
                      // Check if budgets table exists
                      db.get('SELECT name FROM sqlite_master WHERE type="table" AND name="budgets"', (err, row) => {
                        if (err) {
                          console.error('Error checking for budgets table:', err);
                          db.run('ROLLBACK');
                          process.exit(1);
                        }
                        
                        if (!row) {
                          console.log('Budgets table does not exist, skipping...');
                          console.log('Committing transaction...');
                          db.run('COMMIT', (err) => {
                            if (err) {
                              console.error('Error committing:', err);
                              db.run('ROLLBACK');
                              process.exit(1);
                            }
                            
                            console.log('Migration complete!');
                            db.close();
                            process.exit(0);
                          });
                          return;
                        }
                        
                        // Update budgets table
                        console.log('Creating budgets_new table...');
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
                          console.error('Error creating budgets_new:', err);
                          db.run('ROLLBACK');
                          process.exit(1);
                        }
                        
                        console.log('Copying budgets data (updating Food to Dining Out)...');
                        db.run(`INSERT INTO budgets_new SELECT id, year, month, CASE WHEN category = 'Food' THEN 'Dining Out' ELSE category END, "limit", created_at, updated_at FROM budgets`, (err) => {
                          if (err) {
                            console.error('Error copying budgets:', err);
                            db.run('ROLLBACK');
                            process.exit(1);
                          }
                          
                          console.log('Dropping old budgets table...');
                          db.run('DROP TABLE budgets', (err) => {
                            if (err) {
                              console.error('Error dropping budgets:', err);
                              db.run('ROLLBACK');
                              process.exit(1);
                            }
                            
                            console.log('Renaming budgets_new to budgets...');
                            db.run('ALTER TABLE budgets_new RENAME TO budgets', (err) => {
                              if (err) {
                                console.error('Error renaming budgets:', err);
                                db.run('ROLLBACK');
                                process.exit(1);
                              }
                              
                                console.log('Budgets table updated!');
                                
                                console.log('Committing transaction...');
                                db.run('COMMIT', (err) => {
                                  if (err) {
                                    console.error('Error committing:', err);
                                    db.run('ROLLBACK');
                                    process.exit(1);
                                  }
                                  
                                  console.log('Migration complete!');
                                  db.close();
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
              });
            });
          });
        });
      });
    });
  });
});
