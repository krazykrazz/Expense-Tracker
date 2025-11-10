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

        // Create indexes for better query performance
        const indexes = [
          'CREATE INDEX IF NOT EXISTS idx_date ON expenses(date)',
          'CREATE INDEX IF NOT EXISTS idx_type ON expenses(type)',
          'CREATE INDEX IF NOT EXISTS idx_method ON expenses(method)',
          'CREATE INDEX IF NOT EXISTS idx_year_month ON monthly_gross(year, month)'
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
