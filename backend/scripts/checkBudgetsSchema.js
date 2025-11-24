const sqlite3 = require('sqlite3');
const { getDatabasePath } = require('../config/paths');

const db = new sqlite3.Database(getDatabasePath());

db.get('SELECT sql FROM sqlite_master WHERE type="table" AND name="budgets"', (err, row) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Budgets table schema:');
    console.log(row ? row.sql : 'Table not found');
  }
  db.close();
});
