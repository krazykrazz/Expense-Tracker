const sqlite3 = require('sqlite3').verbose();
const { getDatabasePath } = require('../config/paths');

const dbPath = getDatabasePath();
const db = new sqlite3.Database(dbPath);

db.all("PRAGMA table_info(credit_card_billing_cycles)", [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  
  console.log('credit_card_billing_cycles table schema:');
  rows.forEach(row => {
    console.log(`  - ${row.name} (${row.type})`);
  });
  
  db.close();
});
