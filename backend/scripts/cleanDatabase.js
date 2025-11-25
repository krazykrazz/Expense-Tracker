/**
 * Clean all data from the database
 * This will delete all records from all tables while preserving the schema
 * 
 * Usage: node backend/scripts/cleanDatabase.js
 */

const { getDatabase } = require('../database/db');

async function cleanDatabase() {
  try {
    console.log('Connecting to database...');
    const db = await getDatabase();
    
    const tables = [
      'expenses',
      'monthly_gross',
      'income_sources',
      'fixed_expenses',
      'loans',
      'loan_balances',
      'budgets'
    ];
    
    console.log('\nCleaning database tables...\n');
    
    for (const table of tables) {
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM ${table}`, function(err) {
          if (err) {
            console.error(`✗ Error clearing ${table}:`, err.message);
            reject(err);
            return;
          }
          console.log(`✓ Cleared ${table}: ${this.changes} record(s) deleted`);
          resolve(this.changes);
        });
      });
    }
    
    console.log('\n✓ Database cleaned successfully!');
    console.log('All tables are now empty and ready for fresh data');
    
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Run the script
cleanDatabase()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nFailed:', error.message);
    process.exit(1);
  });
