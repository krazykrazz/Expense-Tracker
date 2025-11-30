const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/expenses.db');

const db = new sqlite3.Database(DB_PATH);

db.all(`SELECT DISTINCT place, type FROM expenses WHERE place LIKE '%RBC%' OR place LIKE '%Insurance%' ORDER BY place, type`, [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Found', rows.length, 'results:');
    rows.forEach(row => {
      console.log(`  "${row.place}" - "${row.type}"`);
    });
  }
  db.close();
});
