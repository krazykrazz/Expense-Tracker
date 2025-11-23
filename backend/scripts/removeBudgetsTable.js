const sqlite3 = require('sqlite3').verbose();
const { getDatabasePath } = require('../config/paths');

// Database file path - use dynamic path from config
const DB_PATH = getDatabasePath();

console.log('Starting rollback: Removing budgets table...');
console.log('Database path:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to database');
});

db.serialize(() => {
  // Check if table exists before dropping
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'", (err, row) => {
    if (err) {
      console.error('Error checking for table:', err.message);
      process.exit(1);
    }
    
    if (!row) {
      console.log('ℹ budgets table does not exist, nothing to rollback');
      db.close();
      return;
    }
    
    console.log('Found budgets table, proceeding with rollback...');
    
    // Drop trigger first
    db.run('DROP TRIGGER IF EXISTS update_budgets_timestamp', (err) => {
      if (err) {
        console.error('Error dropping trigger:', err.message);
        process.exit(1);
      }
      console.log('✓ Trigger update_budgets_timestamp dropped');
    });
    
    // Drop indexes (they will be dropped automatically with the table, but being explicit)
    db.run('DROP INDEX IF EXISTS idx_budgets_period', (err) => {
      if (err) {
        console.error('Error dropping period index:', err.message);
        process.exit(1);
      }
      console.log('✓ Index idx_budgets_period dropped');
    });
    
    db.run('DROP INDEX IF EXISTS idx_budgets_category', (err) => {
      if (err) {
        console.error('Error dropping category index:', err.message);
        process.exit(1);
      }
      console.log('✓ Index idx_budgets_category dropped');
    });
    
    // Drop the table
    db.run('DROP TABLE IF EXISTS budgets', (err) => {
      if (err) {
        console.error('Error dropping budgets table:', err.message);
        process.exit(1);
      }
      console.log('✓ budgets table dropped successfully');
      
      // Verify table was dropped
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'", (err, row) => {
        if (err) {
          console.error('Error verifying table removal:', err.message);
          process.exit(1);
        }
        
        if (!row) {
          console.log('✓ Verification successful: budgets table has been removed');
          
          db.close((err) => {
            if (err) {
              console.error('Error closing database:', err.message);
              process.exit(1);
            }
            console.log('\n✓ Rollback completed successfully!');
            console.log('The budgets table and related objects have been removed.');
          });
        } else {
          console.error('✗ Verification failed: budgets table still exists');
          db.close();
          process.exit(1);
        }
      });
    });
  });
});
