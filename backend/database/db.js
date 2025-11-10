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
    });

    // Create expenses table with all constraints
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        place TEXT,
        notes TEXT,
        amount REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('Other', 'Food', 'Gas')),
        week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
        method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
        highlighted INTEGER DEFAULT 0,
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
        type TEXT NOT NULL CHECK(type IN ('Other', 'Food', 'Gas')),
        method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
        day_of_month INTEGER NOT NULL CHECK(day_of_month >= 1 AND day_of_month <= 31),
        start_month TEXT NOT NULL,
        end_month TEXT,
        paused INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
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

        // Add highlighted column if it doesn't exist (migration)
        db.run('ALTER TABLE expenses ADD COLUMN highlighted INTEGER DEFAULT 0', (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding highlighted column:', err.message);
          } else if (!err) {
            console.log('Added highlighted column to expenses table');
          }
        });

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
            'CREATE INDEX IF NOT EXISTS idx_recurring_id ON expenses(recurring_id)'
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
}

// Get database connection
function getDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error connecting to database:', err.message);
        reject(err);
        return;
      }
      resolve(db);
    });
  });
}

module.exports = {
  initializeDatabase,
  getDatabase,
  DB_PATH
};
