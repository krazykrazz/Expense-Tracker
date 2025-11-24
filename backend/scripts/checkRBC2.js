const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/expenses.db');

const db = new sqlite3.Database(DB_PATH);

db.all(`SELECT id, date, place, type, amount FROM expenses WHERE place LIKE '%RBC%' ORDER BY date`, [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Found', rows.length, 'RBC expenses:');
    rows.forEach(row => {
      console.log(`  ${row.date} - "${row.place}" - ${row.type} - $${row.amount}`);
    });
  }
  db.close();
});
