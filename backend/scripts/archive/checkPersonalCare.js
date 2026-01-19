const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database/expenses.db');
const db = new sqlite3.Database(dbPath);

console.log('Checking if Personal Care is in the database schema...\n');

db.get('SELECT sql FROM sqlite_master WHERE type="table" AND name="expenses"', (err, row) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    process.exit(1);
  }
  
  const sql = row.sql;
  const hasPersonalCare = sql.includes('Personal Care');
  
  console.log('Expenses table CHECK constraint:');
  const match = sql.match(/CHECK\(type IN \([^)]+\)\)/);
  if (match) {
    console.log(match[0]);
  }
  
  console.log('\n');
  
  if (hasPersonalCare) {
    console.log('✅ Personal Care IS in the database schema!');
  } else {
    console.log('❌ Personal Care is NOT in the database schema yet.');
    console.log('\nThe migration may not have applied correctly.');
    console.log('Try restarting the server to trigger the migration.');
  }
  
  db.close();
});
