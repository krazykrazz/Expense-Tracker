/**
 * Run Personal Care Category Migration
 * 
 * This script applies the Personal Care category migration to the production database.
 * It will:
 * 1. Create an automatic backup
 * 2. Update the expenses table CHECK constraint
 * 3. Update the budgets table CHECK constraint
 * 4. Mark the migration as applied
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { runMigrations } = require('../database/migrations');

// Get database path
const dbPath = path.join(__dirname, '../database/expenses.db');

console.log('Running Personal Care category migration...');
console.log('Database:', dbPath);
console.log('');

// Open database connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err);
    process.exit(1);
  }
  
  console.log('✓ Database connection established');
  
  // Run migrations
  runMigrations(db)
    .then(() => {
      console.log('');
      console.log('✅ Migration completed successfully!');
      console.log('');
      console.log('The Personal Care category is now available.');
      console.log('You can now create expenses and budgets with this category.');
      
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        }
        process.exit(0);
      });
    })
    .catch((err) => {
      console.error('');
      console.error('❌ Migration failed:', err.message);
      console.error('');
      console.error('The database has not been modified.');
      console.error('Please check the error message above and try again.');
      
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        }
        process.exit(1);
      });
    });
});
