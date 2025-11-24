const sqlite3 = require('sqlite3');
const { getDatabasePath } = require('../config/paths');

const db = new sqlite3.Database(getDatabasePath());

db.get('SELECT sql FROM sqlite_master WHERE type="table" AND name="expenses"', (err, row) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Expenses table schema:');
    console.log(row.sql);
  }
  db.close();
});
