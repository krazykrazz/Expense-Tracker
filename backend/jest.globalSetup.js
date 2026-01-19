/**
 * Jest Global Setup
 * 
 * This file runs ONCE before all test suites.
 * It creates a backup of the production database before tests run.
 */

const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const dbPath = path.join(__dirname, 'config', 'database', 'expenses.db');
  const backupDir = path.join(__dirname, 'config', 'backups');
  
  // Only backup if production database exists
  if (fs.existsSync(dbPath)) {
    // Ensure backup directory exists
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Use a fixed name for the pre-test backup (overwrites previous)
    const backupPath = path.join(backupDir, 'pre-test-backup.db');
    
    try {
      fs.copyFileSync(dbPath, backupPath);
      console.log(`\n✓ Pre-test backup created: pre-test-backup.db`);
      
      // Store backup path for potential restoration
      process.env.PRE_TEST_BACKUP_PATH = backupPath;
    } catch (error) {
      console.warn(`\n⚠ Warning: Could not create pre-test backup: ${error.message}`);
    }
  } else {
    console.log('\nℹ No production database found, skipping backup');
  }
};
