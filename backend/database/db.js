const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const DB_PATH = path.join(__dirname, 'expenses.db');

// Create and initialize database
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
        reject(err);
        return;
      }
      console.log('Connected to SQLite database');
      
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
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS expenses (
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
        type TEXT NOT NULL CHECK(type IN ('Other', 'Food', 'Gas', 'Tax - Medical', 'Tax - Donation')),
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
                    'CREATE INDEX IF NOT EXISTS idx_recurring_id ON expenses(recurring_id)',
                    'CREATE INDEX IF NOT EXISTS idx_income_year_month ON income_sources(year, month)',
                    'CREATE INDEX IF NOT EXISTS idx_fixed_expenses_year_month ON fixed_expenses(year, month)',
                    'CREATE INDEX IF NOT EXISTS idx_loans_paid_off ON loans(is_paid_off)',
                    'CREATE INDEX IF NOT EXISTS idx_loan_balances_loan_id ON loan_balances(loan_id)',
                    'CREATE INDEX IF NOT EXISTS idx_loan_balances_year_month ON loan_balances(year, month)'
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
                        resolve(db);
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
}

// Get database connection
function getDatabase() {
  return new Promise((resolve, reject) => {
    const dbPath = process.env.DB_PATH || DB_PATH;
    const db = new sqlite3.Database(dbPath, (err) => {
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
