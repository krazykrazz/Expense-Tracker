/**
 * Migration Script: Remove Recurring Expenses Feature
 * 
 * This script removes the recurring expenses feature from the database:
 * 1. Drops the recurring_expenses table
 * 2. Removes recurring_id and is_generated columns from expenses table
 * 3. Creates a backup before making changes
 * 
 * Run with: node backend/scripts/removeRecurringExpenses.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { getDatabasePath, getBackupPath } = require('../config/paths');

const DB_PATH = getDatabasePath();
const BACKUP_DIR = getBackupPath();

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `pre-recurring-removal-${timestamp}.db`);
  
  console.log('Creating backup...');
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`✓ Backup created: ${backupPath}`);
  
  return backupPath;
}

function removeRecurringExpenses() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }
      
      console.log('\nStarting recurring expenses removal...\n');
      
      db.serialize(() => {
        // Begin transaction
        db.run('BEGIN TRANSACTION', (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          console.log('Step 1: Checking current schema...');
          
          // Check if recurring_expenses table exists
          db.get(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='recurring_expenses'",
            (err, row) => {
              if (err) {
                db.run('ROLLBACK');
                reject(err);
                return;
              }
              
              if (row) {
                console.log('✓ recurring_expenses table found');
                
                // Drop recurring_expenses table
                console.log('\nStep 2: Dropping recurring_expenses table...');
                db.run('DROP TABLE IF EXISTS recurring_expenses', (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    reject(err);
                    return;
                  }
                  console.log('✓ recurring_expenses table dropped');
                  
                  removeColumnsFromExpenses(db, resolve, reject);
                });
              } else {
                console.log('✓ recurring_expenses table not found (already removed)');
                removeColumnsFromExpenses(db, resolve, reject);
              }
            }
          );
        });
      });
    });
  });
}

function removeColumnsFromExpenses(db, resolve, reject) {
  console.log('\nStep 3: Converting generated expenses to regular expenses...');
  
  // First, count how many expenses were generated from templates
  db.get('SELECT COUNT(*) as count FROM expenses WHERE is_generated = 1', (err, row) => {
    if (err) {
      console.log('✓ No is_generated column found (already migrated)');
      createNewExpensesTable(db, resolve, reject);
      return;
    }
    
    const generatedCount = row ? row.count : 0;
    if (generatedCount > 0) {
      console.log(`✓ Found ${generatedCount} expenses generated from templates`);
      console.log('  These will be converted to regular expenses');
    } else {
      console.log('✓ No generated expenses found');
    }
    
    createNewExpensesTable(db, resolve, reject);
  });
}

function createNewExpensesTable(db, resolve, reject) {
  console.log('\nStep 4: Removing recurring_id and is_generated columns from expenses table...');
  
  // SQLite doesn't support DROP COLUMN directly, so we need to:
  // 1. Create a new table without those columns
  // 2. Copy ALL data (including generated expenses - they become regular expenses)
  // 3. Drop old table
  // 4. Rename new table
  
  const createNewTableSQL = `
    CREATE TABLE expenses_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      place TEXT,
      notes TEXT,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('Housing', 'Utilities', 'Groceries', 'Dining Out', 'Insurance', 'Gas', 'Vehicle Maintenance', 'Entertainment', 'Subscriptions', 'Recreation Activities', 'Pet Care', 'Tax - Medical', 'Tax - Donation', 'Other')),
      week INTEGER NOT NULL,
      method TEXT NOT NULL
    )
  `;
  
  db.run(createNewTableSQL, (err) => {
    if (err) {
      db.run('ROLLBACK');
      reject(err);
      return;
    }
    console.log('✓ Created new expenses table structure');
    
    // Copy ALL data (excluding only recurring_id and is_generated columns)
    // This preserves all expenses, including those that were generated from templates
    const copyDataSQL = `
      INSERT INTO expenses_new (id, date, place, notes, amount, type, week, method)
      SELECT id, date, place, notes, amount, type, week, method
      FROM expenses
    `;
    
    db.run(copyDataSQL, function(err) {
      if (err) {
        db.run('ROLLBACK');
        reject(err);
        return;
      }
      console.log(`✓ Copied ${this.changes} expense records to new table`);
      console.log('  All expenses (including previously generated ones) are now regular expenses');
      
      // Drop old table
      db.run('DROP TABLE expenses', (err) => {
        if (err) {
          db.run('ROLLBACK');
          reject(err);
          return;
        }
        console.log('✓ Dropped old expenses table');
        
        // Rename new table
        db.run('ALTER TABLE expenses_new RENAME TO expenses', (err) => {
          if (err) {
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          console.log('✓ Renamed new table to expenses');
          
          // Commit transaction
          db.run('COMMIT', (err) => {
            if (err) {
              db.run('ROLLBACK');
              reject(err);
              return;
            }
            
            console.log('\n✓ Transaction committed successfully');
            console.log('\n========================================');
            console.log('Recurring expenses feature removed!');
            console.log('All expenses preserved as regular expenses.');
            console.log('========================================\n');
            
            db.close((err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });
        });
      });
    });
  });
}

// Main execution
(async () => {
  try {
    // Create backup first
    const backupPath = createBackup();
    
    // Remove recurring expenses
    await removeRecurringExpenses();
    
    console.log('Migration completed successfully!');
    console.log(`Backup saved at: ${backupPath}`);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Database has been rolled back to previous state.');
    process.exit(1);
  }
})();
