/**
 * Script to clear the "Migrated from PDF statement" notes from billing cycles
 * These notes were added during migration but are unnecessary clutter.
 * 
 * Usage: node backend/scripts/clearMigrationNotes.js
 */

const { getDatabase } = require('../database/db');

async function clearMigrationNotes() {
  console.log('Clearing migration notes from billing cycles...\n');
  
  const db = await getDatabase();
  
  const result = await new Promise((resolve, reject) => {
    db.run(`
      UPDATE credit_card_billing_cycles 
      SET notes = NULL 
      WHERE notes LIKE '%Migrated from PDF statement%'
    `, function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
  
  console.log(`Cleared notes from ${result} billing cycle records.`);
}

clearMigrationNotes()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  });
