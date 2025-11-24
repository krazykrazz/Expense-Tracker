const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// This script runs the Personal Care migration inside the Docker container
// The database path in the container is /app/backend/database/expenses.db

const dbPath = path.join(__dirname, '..', 'database', 'expenses.db');

console.log('Running Personal Care migration in container...');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to database');
});

// Run the migration
db.serialize(() => {
  console.log('\n1. Creating backup of expenses table...');
  db.run(`CREATE TABLE expenses_backup AS SELECT * FROM expenses`, (err) => {
    if (err) {
      console.error('Error creating backup:', err.message);
      process.exit(1);
    }
    console.log('✓ Backup created');

    console.log('\n2. Dropping old expenses table...');
    db.run(`DROP TABLE expenses`, (err) => {
      if (err) {
        console.error('Error dropping table:', err.message);
        process.exit(1);
      }
      console.log('✓ Old table dropped');

      console.log('\n3. Creating new expenses table with Personal Care...');
      db.run(`
        CREATE TABLE expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('Clothing', 'Dining Out', 'Entertainment', 'Gas', 'Gifts', 'Groceries', 'Housing', 'Insurance', 'Personal Care', 'Pet Care', 'Recreation Activities', 'Subscriptions', 'Utilities', 'Vehicle Maintenance', 'Other', 'Tax - Donation', 'Tax - Medical')),
          place TEXT NOT NULL,
          amount REAL NOT NULL,
          week INTEGER,
          recurring_id INTEGER,
          is_generated INTEGER DEFAULT 0,
          FOREIGN KEY (recurring_id) REFERENCES recurring_expenses(id) ON DELETE SET NULL
        )
      `, (err) => {
        if (err) {
          console.error('Error creating new table:', err.message);
          process.exit(1);
        }
        console.log('✓ New table created');

        console.log('\n4. Restoring data from backup...');
        db.run(`INSERT INTO expenses SELECT * FROM expenses_backup`, (err) => {
          if (err) {
            console.error('Error restoring data:', err.message);
            process.exit(1);
          }
          console.log('✓ Data restored');

          console.log('\n5. Dropping backup table...');
          db.run(`DROP TABLE expenses_backup`, (err) => {
            if (err) {
              console.error('Error dropping backup:', err.message);
              process.exit(1);
            }
            console.log('✓ Backup table dropped');

            console.log('\n6. Verifying migration...');
            db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='expenses'`, (err, row) => {
              if (err) {
                console.error('Error verifying:', err.message);
                process.exit(1);
              }
              
              if (row.sql.includes('Personal Care')) {
                console.log('✓ Migration successful! Personal Care is now in the CHECK constraint');
                console.log('\nYou can now update expenses to Personal Care category.');
              } else {
                console.error('✗ Migration failed - Personal Care not found in constraint');
                process.exit(1);
              }

              db.close();
            });
          });
        });
      });
    });
  });
});
