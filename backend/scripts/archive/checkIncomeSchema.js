/**
 * Check income_sources table schema
 */

const sqlite3 = require('sqlite3').verbose();
const { getDatabasePath } = require('../config/paths');

const DB_PATH = getDatabasePath();

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});

console.log('Checking income_sources table schema...\n');

// Check if table exists
db.get(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='income_sources'",
  (err, row) => {
    if (err) {
      console.error('Error checking table:', err.message);
      process.exit(1);
    }

    if (!row) {
      console.log('✗ income_sources table does not exist');
      db.close();
      process.exit(0);
    }

    console.log('✓ income_sources table exists\n');

    // Get columns
    db.all('PRAGMA table_info(income_sources)', (err, columns) => {
      if (err) {
        console.error('Error getting columns:', err.message);
        process.exit(1);
      }

      console.log('Columns:');
      columns.forEach(col => {
        console.log(`  - ${col.name} (${col.type})${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
      });

      const hasCategory = columns.some(col => col.name === 'category');
      console.log(`\nHas category column: ${hasCategory ? 'YES' : 'NO'}`);

      // Get CREATE TABLE statement
      db.get(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='income_sources'",
        (err, row) => {
          if (err) {
            console.error('Error getting CREATE TABLE:', err.message);
            process.exit(1);
          }

          console.log('\nCREATE TABLE statement:');
          console.log(row.sql);

          // Count records
          db.get('SELECT COUNT(*) as count FROM income_sources', (err, result) => {
            if (err) {
              console.error('Error counting records:', err.message);
              process.exit(1);
            }

            console.log(`\nTotal records: ${result.count}`);

            if (hasCategory && result.count > 0) {
              // Show sample records with categories
              db.all('SELECT * FROM income_sources LIMIT 5', (err, rows) => {
                if (err) {
                  console.error('Error getting sample records:', err.message);
                  process.exit(1);
                }

                console.log('\nSample records:');
                rows.forEach(row => {
                  console.log(`  - ${row.name}: $${row.amount.toFixed(2)} [${row.category || 'NULL'}]`);
                });

                db.close();
              });
            } else {
              db.close();
            }
          });
        }
      );
    });
  }
);
