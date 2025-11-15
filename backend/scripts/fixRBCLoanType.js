const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/expenses.db');

console.log('\n=== Fixing RBC Line of Credit Type ===\n');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Update the RBC loan to be a line of credit
db.run(
  "UPDATE loans SET loan_type = 'line_of_credit' WHERE name = 'RBC Line of Credit'",
  function(err) {
    if (err) {
      console.error('Error updating loan:', err);
      db.close();
      process.exit(1);
    }

    if (this.changes === 0) {
      console.log('⚠️  No loan found with name "RBC Line of Credit"');
    } else {
      console.log(`✓ Updated ${this.changes} loan(s)`);
      console.log('  RBC Line of Credit is now type: line_of_credit\n');
    }

    db.close();
    process.exit(0);
  }
);
