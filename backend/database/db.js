const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { getDatabasePath, ensureDirectories } = require('../config/paths');
const { CATEGORIES, BUDGETABLE_CATEGORIES } = require('../utils/categories');

// Database file path - use dynamic path from config
const DB_PATH = getDatabasePath();
const OLD_DB_PATH = path.join(__dirname, 'expenses.db');

/**
 * Automatically migrate database from old location to new /config structure
 * Only runs if old database exists and new location doesn't have a database
 */
async function migrateOldDatabase() {
  const oldExists = fs.existsSync(OLD_DB_PATH);
  const newExists = fs.existsSync(DB_PATH);
  
  // Only migrate if old exists and new doesn't (or is empty/small)
  if (oldExists && (!newExists || fs.statSync(DB_PATH).size < 100000)) {
    try {
      const oldStats = fs.statSync(OLD_DB_PATH);
      console.log('Migrating database from old location...');
      console.log('  Old:', OLD_DB_PATH, `(${oldStats.size} bytes)`);
      console.log('  New:', DB_PATH);
      
      await fs.promises.copyFile(OLD_DB_PATH, DB_PATH);
      
      const newStats = fs.statSync(DB_PATH);
      if (oldStats.size === newStats.size) {
        console.log('✓ Database migration successful');
      } else {
        console.warn('⚠ Warning: Database copy size mismatch');
      }
    } catch (error) {
      console.error('Error migrating database:', error.message);
      // Don't throw - allow initialization to continue
    }
  }
}

// Create and initialize database
function initializeDatabase() {
  return new Promise(async (resolve, reject) => {
    try {
      // Ensure /config directory structure exists before initializing database
      await ensureDirectories();
      
      // Auto-migrate old database if it exists and new location is empty
      await migrateOldDatabase();
    } catch (err) {
      console.error('Error creating config directories:', err.message);
      reject(err);
      return;
    }

    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
        reject(err);
        return;
      }
      console.log('Connected to SQLite database at:', DB_PATH);
      
      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          console.error('Error enabling foreign keys:', err.message);
          reject(err);
          return;
        }
      });
    });

    // Create expenses table with all constraints
    const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS expenses (
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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create monthly_gross table
    const createMonthlyGrossSQL = `
      CREATE TABLE IF NOT EXISTS monthly_gross (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        gross_amount REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(year, month)
      )
    `;

    // Create recurring_expenses table
    const createRecurringExpensesSQL = `
      CREATE TABLE IF NOT EXISTS recurring_expenses (
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
    `;

    // Create income_sources table
    const createIncomeSourcesSQL = `
      CREATE TABLE IF NOT EXISTS income_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount >= 0),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create fixed_expenses table
    const createFixedExpensesSQL = `
      CREATE TABLE IF NOT EXISTS fixed_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount >= 0),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create loans table
    const createLoansSQL = `
      CREATE TABLE IF NOT EXISTS loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        initial_balance REAL NOT NULL CHECK(initial_balance >= 0),
        start_date TEXT NOT NULL,
        notes TEXT,
        loan_type TEXT NOT NULL DEFAULT 'loan' CHECK(loan_type IN ('loan', 'line_of_credit')),
        is_paid_off INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create loan_balances table
    const createLoanBalancesSQL = `
      CREATE TABLE IF NOT EXISTS loan_balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        remaining_balance REAL NOT NULL CHECK(remaining_balance >= 0),
        rate REAL NOT NULL CHECK(rate >= 0),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
        UNIQUE(loan_id, year, month)
      )
    `;

    // Create budgets table
    const budgetCategoryList = BUDGETABLE_CATEGORIES.map(c => `'${c}'`).join(', ');
    const createBudgetsSQL = `
      CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
        category TEXT NOT NULL CHECK(category IN (${budgetCategoryList})),
        "limit" REAL NOT NULL CHECK("limit" > 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(year, month, category)
      )
    `;

    db.run(createTableSQL, (err) => {
      if (err) {
        console.error('Error creating expenses table:', err.message);
        reject(err);
        return;
      }
      console.log('Expenses table created or already exists');

      // Create monthly_gross table
      db.run(createMonthlyGrossSQL, (err) => {
        if (err) {
          console.error('Error creating monthly_gross table:', err.message);
          reject(err);
          return;
        }
        console.log('Monthly gross table created or already exists');

        // Create recurring_expenses table
        db.run(createRecurringExpensesSQL, (err) => {
          if (err) {
            console.error('Error creating recurring_expenses table:', err.message);
            reject(err);
            return;
          }
          console.log('Recurring expenses table created or already exists');

          // Create income_sources table
          db.run(createIncomeSourcesSQL, (err) => {
            if (err) {
              console.error('Error creating income_sources table:', err.message);
              reject(err);
              return;
            }
            console.log('Income sources table created or already exists');

            // Create fixed_expenses table
            db.run(createFixedExpensesSQL, (err) => {
              if (err) {
                console.error('Error creating fixed_expenses table:', err.message);
                reject(err);
                return;
              }
              console.log('Fixed expenses table created or already exists');

              // Create loans table
              db.run(createLoansSQL, (err) => {
                if (err) {
                  console.error('Error creating loans table:', err.message);
                  reject(err);
                  return;
                }
                console.log('Loans table created or already exists');

                // Create loan_balances table
                db.run(createLoanBalancesSQL, (err) => {
                  if (err) {
                    console.error('Error creating loan_balances table:', err.message);
                    reject(err);
                    return;
                  }
                  console.log('Loan balances table created or already exists');

                  // Create budgets table
                  db.run(createBudgetsSQL, (err) => {
                    if (err) {
                      console.error('Error creating budgets table:', err.message);
                      reject(err);
                      return;
                    }
                    console.log('Budgets table created or already exists');

                    // Create trigger for budgets updated_at timestamp
                    const createBudgetsTriggerSQL = `
                      CREATE TRIGGER IF NOT EXISTS update_budgets_timestamp 
                      AFTER UPDATE ON budgets
                      BEGIN
                        UPDATE budgets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                      END
                    `;

                    db.run(createBudgetsTriggerSQL, (err) => {
                      if (err) {
                        console.error('Error creating budgets trigger:', err.message);
                        reject(err);
                        return;
                      }
                      console.log('Budgets trigger created or already exists');

                      // Create investments table
                      const createInvestmentsSQL = `
                        CREATE TABLE IF NOT EXISTS investments (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          name TEXT NOT NULL,
                          type TEXT NOT NULL CHECK(type IN ('TFSA', 'RRSP')),
                          initial_value REAL NOT NULL CHECK(initial_value >= 0),
                          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                        )
                      `;

                      db.run(createInvestmentsSQL, (err) => {
                        if (err) {
                          console.error('Error creating investments table:', err.message);
                          reject(err);
                          return;
                        }
                        console.log('Investments table created or already exists');

                        // Create investment_values table
                        const createInvestmentValuesSQL = `
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
                        `;

                        db.run(createInvestmentValuesSQL, (err) => {
                          if (err) {
                            console.error('Error creating investment_values table:', err.message);
                            reject(err);
                            return;
                          }
                          console.log('Investment values table created or already exists');

            // Add recurring expense columns if they don't exist (migration)
            db.run('ALTER TABLE expenses ADD COLUMN recurring_id INTEGER', (err) => {
              if (err && !err.message.includes('duplicate column')) {
                console.error('Error adding recurring_id column:', err.message);
              } else if (!err) {
                console.log('Added recurring_id column to expenses table');
              }
            });

            db.run('ALTER TABLE expenses ADD COLUMN is_generated INTEGER DEFAULT 0', (err) => {
              if (err && !err.message.includes('duplicate column')) {
                console.error('Error adding is_generated column:', err.message);
              } else if (!err) {
                console.log('Added is_generated column to expenses table');
              }
            });

                          // Create indexes for better query performance
                          const indexes = [
                            'CREATE INDEX IF NOT EXISTS idx_date ON expenses(date)',
                            'CREATE INDEX IF NOT EXISTS idx_type ON expenses(type)',
                            'CREATE INDEX IF NOT EXISTS idx_method ON expenses(method)',
                            'CREATE INDEX IF NOT EXISTS idx_year_month ON monthly_gross(year, month)',
                            'CREATE INDEX IF NOT EXISTS idx_recurring_dates ON recurring_expenses(start_month, end_month)',
                            'CREATE INDEX IF NOT EXISTS idx_income_year_month ON income_sources(year, month)',
                            'CREATE INDEX IF NOT EXISTS idx_fixed_expenses_year_month ON fixed_expenses(year, month)',
                            'CREATE INDEX IF NOT EXISTS idx_loans_paid_off ON loans(is_paid_off)',
                            'CREATE INDEX IF NOT EXISTS idx_loan_balances_loan_id ON loan_balances(loan_id)',
                            'CREATE INDEX IF NOT EXISTS idx_loan_balances_year_month ON loan_balances(year, month)',
                            'CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(year, month)',
                            'CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category)',
                            'CREATE INDEX IF NOT EXISTS idx_investments_type ON investments(type)',
                            'CREATE INDEX IF NOT EXISTS idx_investment_values_investment_id ON investment_values(investment_id)',
                            'CREATE INDEX IF NOT EXISTS idx_investment_values_year_month ON investment_values(year, month)'
                          ];

                          let completed = 0;
                          indexes.forEach((indexSQL) => {
                            db.run(indexSQL, (err) => {
                              if (err) {
                                console.error('Error creating index:', err.message);
                                reject(err);
                                return;
                              }
                              completed++;
                              if (completed === indexes.length) {
                                console.log('All indexes created successfully');
                                
                                // Run any pending migrations
                                const { runMigrations } = require('./migrations');
                                runMigrations(db)
                                  .then(() => {
                                    resolve(db);
                                  })
                                  .catch((err) => {
                                    console.error('Migration error:', err);
                                    // Don't reject - allow app to start even if migrations fail
                                    // This prevents breaking the app if there's a migration issue
                                    resolve(db);
                                  });
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
          });
        });
      });
    });
  });
}

// Get database connection
function getDatabase() {
  return new Promise((resolve, reject) => {
    // Use dynamic path from config (supports /config directory)
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error connecting to database:', err.message);
        reject(err);
        return;
      }
      
      // Enable foreign keys for this connection
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          console.error('Error enabling foreign keys:', err.message);
          reject(err);
          return;
        }
        resolve(db);
      });
    });
  });
}

module.exports = {
  initializeDatabase,
  getDatabase,
  DB_PATH
};
