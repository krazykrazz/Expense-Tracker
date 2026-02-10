/**
 * Check current database schema
 */

const { getDatabase } = require('../database/db');

async function main() {
  try {
    const db = await getDatabase();
    
    console.log('Checking expenses table schema...\n');
    
    db.all('PRAGMA table_info(expenses)', (err, columns) => {
      if (err) {
        console.error('Error:', err.message);
        process.exit(1);
      }
      
      console.log('Columns:');
      columns.forEach(col => {
        console.log(`  - ${col.name} (${col.type})`);
      });
      
      // Get the CREATE TABLE statement
      db.get(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='expenses'",
        (err, row) => {
          if (err) {
            console.error('Error:', err.message);
            process.exit(1);
          }
          
          console.log('\nCREATE TABLE statement:');
          console.log(row.sql);
          
          db.close();
        }
      );
    });
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
