/**
 * Migration script to move database from old location to new /config structure
 * This ensures existing data is preserved when upgrading to the new path structure
 */

const fs = require('fs');
const path = require('path');

const OLD_DB_PATH = path.join(__dirname, '..', 'database', 'expenses.db');
const NEW_DB_PATH = path.join(__dirname, '..', 'config', 'database', 'expenses.db');
const NEW_DB_DIR = path.join(__dirname, '..', 'config', 'database');

async function migrateDatabaseLocation() {
  console.log('=== Database Location Migration ===\n');
  
  // Check if old database exists
  const oldDbExists = fs.existsSync(OLD_DB_PATH);
  const newDbExists = fs.existsSync(NEW_DB_PATH);
  
  console.log('Old database location:', OLD_DB_PATH);
  console.log('Old database exists:', oldDbExists);
  console.log('\nNew database location:', NEW_DB_PATH);
  console.log('New database exists:', newDbExists);
  
  if (!oldDbExists) {
    console.log('\n✓ No old database found - nothing to migrate');
    return;
  }
  
  if (newDbExists) {
    console.log('\n⚠ Warning: New database already exists!');
    console.log('Please manually review which database to keep.');
    console.log('\nOptions:');
    console.log('1. Keep old database: Copy', OLD_DB_PATH, 'to', NEW_DB_PATH);
    console.log('2. Keep new database: Delete', OLD_DB_PATH);
    return;
  }
  
  // Ensure new directory exists
  try {
    await fs.promises.mkdir(NEW_DB_DIR, { recursive: true });
    console.log('\n✓ Created new database directory');
  } catch (error) {
    console.error('\n✗ Error creating directory:', error.message);
    process.exit(1);
  }
  
  // Copy database to new location
  try {
    await fs.promises.copyFile(OLD_DB_PATH, NEW_DB_PATH);
    console.log('✓ Database copied to new location');
    
    // Verify the copy
    const oldStats = await fs.promises.stat(OLD_DB_PATH);
    const newStats = await fs.promises.stat(NEW_DB_PATH);
    
    if (oldStats.size === newStats.size) {
      console.log('✓ Database copy verified (size:', oldStats.size, 'bytes)');
      console.log('\n=== Migration Complete ===');
      console.log('\nThe old database at', OLD_DB_PATH, 'has been preserved.');
      console.log('You can safely delete it after verifying the new location works.');
    } else {
      console.error('✗ Database copy size mismatch!');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n✗ Error copying database:', error.message);
    process.exit(1);
  }
}

// Run migration
migrateDatabaseLocation().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
