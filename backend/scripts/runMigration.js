/**
 * Manual migration runner
 * Run this script to apply pending database migrations
 */

const { getDatabase } = require('../database/db');
const { runMigrations } = require('../database/migrations');

async function main() {
  console.log('Starting manual migration...\n');
  
  try {
    const db = await getDatabase();
    await runMigrations(db);
    
    console.log('\n✓ Migration completed successfully!');
    console.log('You can now use the "Gifts" category and other expanded categories.');
    
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
        process.exit(1);
      }
      process.exit(0);
    });
  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
