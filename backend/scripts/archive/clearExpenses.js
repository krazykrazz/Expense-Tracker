/**
 * Clear all expenses from the database
 * This will delete all records from the expenses table
 * 
 * Usage: node backend/scripts/clearExpenses.js
 */

const { getDatabase } = require('../database/db');

async function clearExpenses() {
  try {
    console.log('Connecting to database...');
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', function(err) {
        if (err) {
          console.error('Error clearing expenses:', err);
          reject(err);
          return;
        }
        
        console.log(`✓ Successfully deleted ${this.changes} expense(s)`);
        console.log('Database is now empty and ready for fresh import');
        resolve(this.changes);
      });
    });
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Run the script
clearExpenses()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nFailed:', error.message);
    process.exit(1);
  });
