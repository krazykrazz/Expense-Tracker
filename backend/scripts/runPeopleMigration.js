#!/usr/bin/env node

/**
 * Standalone script to run the people tables migration
 * This can be used for testing or manual migration execution
 */

const { getDatabase } = require('../database/db');
const { migrateAddPeopleTables } = require('../database/migrations');

async function runPeopleMigration() {
  console.log('Starting people tables migration...');
  
  try {
    const db = await getDatabase();
    
    await migrateAddPeopleTables(db);
    
    console.log('✓ People tables migration completed successfully');
    
    // Close database connection
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
        process.exit(1);
      }
      console.log('Database connection closed');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runPeopleMigration();
}

module.exports = { runPeopleMigration };