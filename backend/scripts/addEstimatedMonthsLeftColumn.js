const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/expenses.db');

console.log('Adding estimated_months_left column to loans table...');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to database');
});

// Add estimated_months_left column
db.run(`ALTER TABLE loans ADD COLUMN estimated_months_left INTEGER`, (err) => {
  if (err) {
    if (err.message.includes('duplicate column')) {
      console.log('Column estimated_months_left already exists');
    } else {
      console.error('Error adding estimated_months_left column:', err.message);
      db.close();
      process.exit(1);
    }
  } else {
    console.log('✓ Added estimated_months_left column to loans table');
  }

  // Verify the schema
  db.all(`PRAGMA table_info(loans)`, [], (err, rows) => {
    if (err) {
      console.error('Error checking schema:', err.message);
    } else {
      console.log('\nCurrent loans table schema:');
      rows.forEach(row => {
        console.log(`  - ${row.name} (${row.type})`);
      });
    }

    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('\nDatabase migration completed successfully!');
      }
    });
  });
});
