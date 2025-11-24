console.log('Script starting...');

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { getDatabasePath, getBackupPath } = require('../config/paths');
const { CATEGORIES, BUDGETABLE_CATEGORIES } = require('../utils/categories');

// Database file path
const DB_PATH = getDatabasePath();

console.log('='.repeat(60));
console.log('Starting migration: Expanding expense categories');
console.log('='.repeat(60));
console.log('Database path:', DB_PATH);

/**
 * Create a backup before migration
 */
function createBackup() {
  return new Promise((resolve, reject) => {
    try {
      // Check if database exists
      if (!fs.existsSync(DB_PATH)) {
        return reject(new Error('Database file not found'));
      }

      // Get backup directory
      const backupDir = getBackupPath();
      
      // Ensure backup directory exists
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Create backup file with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `expense-tracker-migration-${timestamp}.db`);

      // Copy database file
      fs.copyFileSync(DB_PATH, backupPath);
      
      console.log('✓ Backup created:', backupPath);
      resolve(backupPath);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Update CHECK constraint for expenses table
 * This function updates data AND constraint in one operation
 */
function updateExpensesConstraint(db, callback) {
  const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
  
  db.serialize(() => {
    // Create temporary table with new constraint
    db.run(`
      CREATE TABLE expenses_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        place TEXT NOT NULL,
        notes TEXT,
        amount REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN (${categoryList})),
        week INTEGER NOT NULL,
        method TEXT NOT NULL,
        recurring_id INTEGER,
        is_generated INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (recurring_id) REFERENCES recurring_expenses(id) ON DELETE SET NULL
      )
    `, (err) => {
      if (err) return callback(err);

      // Copy data from old table to new table, updating "Food" to "Dining Out" during copy
      db.run(`
        INSERT INTO expenses_new 
        SELECT 
          id, date, place, notes, amount,
          CASE WHEN type = 'Food' THEN 'Dining Out' ELSE type END as type,
          week, method, recurring_id, is_generated, created_at
        FROM expenses
      `, function(err) {
        if (err) return callback(err);
        
        const rowsUpdated = this.changes;

        // Drop old table
        db.run('DROP TABLE expenses', (err) => {
          if (err) return callback(err);

          // Rename new table to original name
          db.run('ALTER TABLE expenses_new RENAME TO expenses', (err) => {
            if (err) return callback(err);
            console.log('✓ Updated CHECK constraint for expenses table');
            console.log(`✓ Migrated ${rowsUpdated} expense records`);
            callback(null, rowsUpdated);
          });
        });
      });
    });
  });
}

/**
 * Update CHECK constraint for recurring_expenses table
 * This function updates data AND constraint in one operation
 */
function updateRecurringExpensesConstraint(db, callback) {
  const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
  
  db.serialize(() => {
    // Create temporary table with new constraint
    db.run(`
      CREATE TABLE recurring_expenses_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        place TEXT NOT NULL,
        amount REAL NOT NULL,
        notes TEXT,
        type TEXT NOT NULL CHECK(type IN (${categoryList})),
        method TEXT NOT NULL,
        day_of_month INTEGER NOT NULL,
        start_month TEXT NOT NULL,
        end_month TEXT,
        paused INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) return callback(err);

      // Copy data from old table to new table, updating "Food" to "Dining Out" during copy
      db.run(`
        INSERT INTO recurring_expenses_new 
        SELECT 
          id, place, amount, notes,
          CASE WHEN type = 'Food' THEN 'Dining Out' ELSE type END as type,
          method, day_of_month, start_month, end_month, paused, created_at
        FROM recurring_expenses
      `, function(err) {
        if (err) return callback(err);
        
        const rowsUpdated = this.changes;

        // Drop old table
        db.run('DROP TABLE recurring_expenses', (err) => {
          if (err) return callback(err);

          // Rename new table to original name
          db.run('ALTER TABLE recurring_expenses_new RENAME TO recurring_expenses', (err) => {
            if (err) return callback(err);
            console.log('✓ Updated CHECK constraint for recurring_expenses table');
            console.log(`✓ Migrated ${rowsUpdated} recurring expense records`);
            callback(null, rowsUpdated);
          });
        });
      });
    });
  });
}

/**
 * Update CHECK constraint for budgets table
 * This function updates data AND constraint in one operation
 * Skips if budgets table doesn't exist
 */
function updateBudgetsConstraint(db, callback) {
  // First check if budgets table exists
  db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'`, (err, row) => {
    if (err) return callback(err);
    
    if (!row) {
      console.log('ℹ Budgets table does not exist, skipping migration');
      return callback(null, 0);
    }

    const categoryList = BUDGETABLE_CATEGORIES.map(c => `'${c}'`).join(', ');
    
    db.serialize(() => {
      // Create temporary table with new constraint
      db.run(`
        CREATE TABLE budgets_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          year INTEGER NOT NULL,
          month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
          category TEXT NOT NULL CHECK(category IN (${categoryList})),
          "limit" REAL NOT NULL CHECK("limit" > 0),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(year, month, category)
        )
      `, (err) => {
        if (err) return callback(err);

        // Copy data from old table to new table, updating "Food" to "Dining Out" during copy
        db.run(`
          INSERT INTO budgets_new 
          SELECT 
            id, year, month,
            CASE WHEN category = 'Food' THEN 'Dining Out' ELSE category END as category,
            "limit", created_at, updated_at
          FROM budgets
        `, function(err) {
          if (err) return callback(err);
          
          const rowsUpdated = this.changes;

          // Drop old table
          db.run('DROP TABLE budgets', (err) => {
            if (err) return callback(err);

            // Rename new table to original name
            db.run('ALTER TABLE budgets_new RENAME TO budgets', (err) => {
              if (err) return callback(err);
              console.log('✓ Updated CHECK constraint for budgets table');
              console.log(`✓ Migrated ${rowsUpdated} budget records`);
              callback(null, rowsUpdated);
            });
          });
        });
      });
    });
  });
}

/**
 * Run migration in a transaction
 */
function runMigration(db) {
  return new Promise((resolve, reject) => {
    const results = {
      expensesUpdated: 0,
      recurringUpdated: 0,
      budgetsUpdated: 0
    };

    db.serialize(() => {
      // Start transaction
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        console.log('\n--- Starting transaction ---');

        // Step 1: Update expenses table (migrates "Food" to "Dining Out" and updates constraint)
        updateExpensesConstraint(db, (err, expensesCount) => {
          if (err) {
            console.error('Error updating expenses constraint:', err);
            db.run('ROLLBACK');
            return reject(err);
          }
          results.expensesUpdated = expensesCount;

          // Step 2: Update recurring_expenses table (migrates "Food" to "Dining Out" and updates constraint)
          updateRecurringExpensesConstraint(db, (err, recurringCount) => {
            if (err) {
              console.error('Error updating recurring expenses constraint:', err);
              db.run('ROLLBACK');
              return reject(err);
            }
            results.recurringUpdated = recurringCount;

            // Step 3: Update budgets table (migrates "Food" to "Dining Out" and updates constraint)
            updateBudgetsConstraint(db, (err, budgetsCount) => {
              if (err) {
                console.error('Error updating budgets constraint:', err);
                db.run('ROLLBACK');
                return reject(err);
              }
              results.budgetsUpdated = budgetsCount;

              // Commit transaction
              db.run('COMMIT', (err) => {
                if (err) {
                  console.error('Error committing transaction:', err);
                  db.run('ROLLBACK');
                  return reject(err);
                }
                console.log('\n--- Transaction committed successfully ---');
                resolve(results);
              });
            });
          });
        });
      });
    });
  });
}

/**
 * Verify migration results
 */
function verifyMigration(db) {
  return new Promise((resolve, reject) => {
    console.log('\n--- Verifying migration ---');
    
    // Check that no "Food" records remain
    db.get(`SELECT COUNT(*) as count FROM expenses WHERE type = 'Food'`, (err, row) => {
      if (err) return reject(err);
      
      if (row.count > 0) {
        return reject(new Error(`Migration verification failed: ${row.count} "Food" records still exist in expenses table`));
      }
      console.log('✓ No "Food" records in expenses table');

      db.get(`SELECT COUNT(*) as count FROM recurring_expenses WHERE type = 'Food'`, (err, row) => {
        if (err) return reject(err);
        
        if (row.count > 0) {
          return reject(new Error(`Migration verification failed: ${row.count} "Food" records still exist in recurring_expenses table`));
        }
        console.log('✓ No "Food" records in recurring_expenses table');

        // Check budgets table only if it exists
        db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'`, (err, tableRow) => {
          if (err) return reject(err);
          
          if (!tableRow) {
            console.log('ℹ Budgets table does not exist, skipping verification');
            
            // Check that "Dining Out" records exist (if any were migrated)
            db.get(`SELECT COUNT(*) as count FROM expenses WHERE type = 'Dining Out'`, (err, row) => {
              if (err) return reject(err);
              console.log(`✓ Found ${row.count} "Dining Out" records in expenses table`);
              resolve();
            });
          } else {
            db.get(`SELECT COUNT(*) as count FROM budgets WHERE category = 'Food'`, (err, row) => {
              if (err) return reject(err);
              
              if (row.count > 0) {
                return reject(new Error(`Migration verification failed: ${row.count} "Food" records still exist in budgets table`));
              }
              console.log('✓ No "Food" records in budgets table');

              // Check that "Dining Out" records exist (if any were migrated)
              db.get(`SELECT COUNT(*) as count FROM expenses WHERE type = 'Dining Out'`, (err, row) => {
                if (err) return reject(err);
                console.log(`✓ Found ${row.count} "Dining Out" records in expenses table`);
                resolve();
              });
            });
          }
        });
      });
    });
  });
}

/**
 * Main migration function
 */
async function migrate() {
  let db;
  
  try {
    // Step 1: Create backup
    console.log('\n[1/3] Creating backup...');
    await createBackup();

    // Step 2: Run migration
    console.log('\n[2/3] Running migration...');
    db = new sqlite3.Database(DB_PATH);
    const results = await runMigration(db);

    // Step 3: Verify migration
    console.log('\n[3/3] Verifying migration...');
    await verifyMigration(db);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('Migration completed successfully!');
    console.log('='.repeat(60));
    console.log('Summary:');
    console.log(`  - Expenses updated: ${results.expensesUpdated}`);
    console.log(`  - Recurring expenses updated: ${results.recurringUpdated}`);
    console.log(`  - Budgets updated: ${results.budgetsUpdated}`);
    console.log('='.repeat(60));

    db.close();
    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('Migration failed!');
    console.error('='.repeat(60));
    console.error('Error:', error.message);
    console.error('='.repeat(60));
    
    if (db) {
      db.close();
    }
    
    process.exit(1);
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  const fs = require('fs');
  fs.writeFileSync('migration-debug.txt', 'Script is running\n');
  migrate();
}

// Export functions for testing
module.exports = {
  createBackup,
  runMigration,
  verifyMigration,
  updateExpensesConstraint,
  updateRecurringExpensesConstraint,
  updateBudgetsConstraint
};
