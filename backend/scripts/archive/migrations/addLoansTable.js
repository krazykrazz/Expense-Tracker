const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/expenses.db');

function addLoansTables() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
        reject(err);
        return;
      }
      console.log('Connected to database for loans migration');
    });

    // Create loans table
    const createLoansTableSQL = `
      CREATE TABLE IF NOT EXISTS loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        initial_balance REAL NOT NULL CHECK(initial_balance >= 0),
        start_date TEXT NOT NULL,
        notes TEXT,
        is_paid_off INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create loan_balances table
    const createLoanBalancesTableSQL = `
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

    db.run(createLoansTableSQL, (err) => {
      if (err) {
        console.error('Error creating loans table:', err.message);
        db.close();
        reject(err);
        return;
      }
      console.log('✓ Loans table created or already exists');

      db.run(createLoanBalancesTableSQL, (err) => {
        if (err) {
          console.error('Error creating loan_balances table:', err.message);
          db.close();
          reject(err);
          return;
        }
        console.log('✓ Loan balances table created or already exists');

        // Create indexes for performance
        const indexes = [
          'CREATE INDEX IF NOT EXISTS idx_loans_paid_off ON loans(is_paid_off)',
          'CREATE INDEX IF NOT EXISTS idx_loan_balances_loan_id ON loan_balances(loan_id)',
          'CREATE INDEX IF NOT EXISTS idx_loan_balances_year_month ON loan_balances(year, month)'
        ];

        let completed = 0;
        indexes.forEach((indexSQL) => {
          db.run(indexSQL, (err) => {
            if (err) {
              console.error('Error creating index:', err.message);
              db.close();
              reject(err);
              return;
            }
            completed++;
            if (completed === indexes.length) {
              console.log('✓ All loan indexes created successfully');
              db.close((err) => {
                if (err) {
                  console.error('Error closing database:', err.message);
                  reject(err);
                  return;
                }
                console.log('\n✓ Loans migration completed successfully!');
                resolve();
              });
            }
          });
        });
      });
    });
  });
}

// Run migration if called directly
if (require.main === module) {
  console.log('Starting loans table migration...\n');
  addLoansTables()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { addLoansTables };
