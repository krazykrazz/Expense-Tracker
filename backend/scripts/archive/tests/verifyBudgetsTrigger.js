const sqlite3 = require('sqlite3').verbose();
const { getDatabasePath } = require('../config/paths');

const DB_PATH = getDatabasePath();

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});

db.get("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='update_budgets_timestamp'", (err, row) => {
  if (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
  
  if (row) {
    console.log('Trigger exists:');
    console.log(row.sql);
  } else {
    console.log('Trigger does not exist');
  }
  
  db.close();
});
