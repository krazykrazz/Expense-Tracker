const sqlite3 = require('sqlite3').verbose();
const { getDatabasePath } = require('../config/paths');

// Database file path - use dynamic path from config
const DB_PATH = getDatabasePath();

console.log('Starting migration: Adding budgets table...');
console.log('Database path:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to database');
});

// Create budgets table with all constraints
const createBudgetsSQL = `
  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
    category TEXT NOT NULL CHECK(category IN ('Food', 'Gas', 'Other')),
    "limit" REAL NOT NULL CHECK("limit" > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(year, month, category)
  )
`;

// Create trigger for updated_at timestamp
const createTriggerSQL = `
  CREATE TRIGGER IF NOT EXISTS update_budgets_timestamp 
  AFTER UPDATE ON budgets
  BEGIN
    UPDATE budgets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END
`;

// Create indexes for better query performance
const createPeriodIndexSQL = `
  CREATE INDEX IF NOT EXISTS idx_budgets_period 
  ON budgets(year, month)
`;

const createCategoryIndexSQL = `
  CREATE INDEX IF NOT EXISTS idx_budgets_category 
  ON budgets(category)
`;

db.serialize(() => {
  // Create table
  db.run(createBudgetsSQL, (err) => {
    if (err) {
      console.error('Error creating budgets table:', err.message);
      process.exit(1);
    }
    console.log('✓ budgets table created successfully');
  });

  // Create trigger
  db.run(createTriggerSQL, (err) => {
    if (err) {
      console.error('Error creating trigger:', err.message);
      process.exit(1);
    }
    console.log('✓ Trigger update_budgets_timestamp created successfully');
  });

  // Create period index
  db.run(createPeriodIndexSQL, (err) => {
    if (err) {
      console.error('Error creating period index:', err.message);
      process.exit(1);
    }
    console.log('✓ Index idx_budgets_period created successfully');
  });

  // Create category index
  db.run(createCategoryIndexSQL, (err) => {
    if (err) {
      console.error('Error creating category index:', err.message);
      process.exit(1);
    }
    console.log('✓ Index idx_budgets_category created successfully');
  });

  // Verify table was created
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'", (err, row) => {
    if (err) {
      console.error('Error verifying table:', err.message);
      process.exit(1);
    }
    
    if (row) {
      console.log('✓ Verification successful: budgets table exists');
      
      // Show table schema
      db.all("PRAGMA table_info(budgets)", (err, columns) => {
        if (err) {
          console.error('Error getting table info:', err.message);
        } else {
          console.log('\nTable schema:');
          columns.forEach(col => {
            console.log(`  - ${col.name} (${col.type}${col.notnull ? ' NOT NULL' : ''})`);
          });
        }
        
        // Show indexes
        db.all("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='budgets'", (err, indexes) => {
          if (err) {
            console.error('Error getting indexes:', err.message);
          } else {
            console.log('\nIndexes:');
            indexes.forEach(idx => {
              console.log(`  - ${idx.name}`);
            });
          }
          
          // Show trigger
          db.all("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='budgets'", (err, triggers) => {
            if (err) {
              console.error('Error getting triggers:', err.message);
            } else {
              console.log('\nTriggers:');
              triggers.forEach(trg => {
                console.log(`  - ${trg.name}`);
              });
            }
            
            db.close((err) => {
              if (err) {
                console.error('Error closing database:', err.message);
                process.exit(1);
              }
              console.log('\n✓ Migration completed successfully!');
              console.log('The budgets table is ready for use.');
            });
          });
        });
      });
    } else {
      console.error('✗ Verification failed: budgets table was not created');
      db.close();
      process.exit(1);
    }
  });
});
