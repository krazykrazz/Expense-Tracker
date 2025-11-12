const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const DB_PATH = path.join(__dirname, '../database/expenses.db');

console.log('Starting migration: Adding fixed_expenses table...');
console.log('Database path:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to database');
});

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

// Create index for better query performance
const createIndexSQL = `
  CREATE INDEX IF NOT EXISTS idx_fixed_expenses_year_month 
  ON fixed_expenses(year, month)
`;

db.serialize(() => {
  // Create table
  db.run(createFixedExpensesSQL, (err) => {
    if (err) {
      console.error('Error creating fixed_expenses table:', err.message);
      process.exit(1);
    }
    console.log('✓ fixed_expenses table created successfully');
  });

  // Create index
  db.run(createIndexSQL, (err) => {
    if (err) {
      console.error('Error creating index:', err.message);
      process.exit(1);
    }
    console.log('✓ Index idx_fixed_expenses_year_month created successfully');
  });

  // Verify table was created
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='fixed_expenses'", (err, row) => {
    if (err) {
      console.error('Error verifying table:', err.message);
      process.exit(1);
    }
    
    if (row) {
      console.log('✓ Verification successful: fixed_expenses table exists');
      
      // Show table schema
      db.all("PRAGMA table_info(fixed_expenses)", (err, columns) => {
        if (err) {
          console.error('Error getting table info:', err.message);
        } else {
          console.log('\nTable schema:');
          columns.forEach(col => {
            console.log(`  - ${col.name} (${col.type})`);
          });
        }
        
        db.close((err) => {
          if (err) {
            console.error('Error closing database:', err.message);
            process.exit(1);
          }
          console.log('\n✓ Migration completed successfully!');
          console.log('You can now restart your backend server.');
        });
      });
    } else {
      console.error('✗ Verification failed: fixed_expenses table was not created');
      db.close();
      process.exit(1);
    }
  });
});
