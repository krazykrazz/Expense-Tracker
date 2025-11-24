const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { getDatabasePath, getBackupPath } = require('../config/paths');
const { CATEGORIES, BUDGETABLE_CATEGORIES } = require('../utils/categories');

/**
 * Check if a migration has been applied
 */
function checkMigrationApplied(db, migrationName) {
  return new Promise((resolve, reject) => {
    // Create migrations table if it doesn't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        migration_name TEXT NOT NULL UNIQUE,
        applied_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        reject(err);
        return;
      }

      // Check if this migration has been applied
      db.get(
        'SELECT * FROM schema_migrations WHERE migration_name = ?',
        [migrationName],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(!!row);
        }
      );
    });
  });
}

/**
 * Mark a migration as applied
 */
function markMigrationApplied(db, migrationName) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO schema_migrations (migration_name) VALUES (?)',
      [migrationName],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });
}

/**
 * Create a backup before migration
 */
function createBackup() {
  return new Promise((resolve, reject) => {
    try {
      const DB_PATH = getDatabasePath();
      
      if (!fs.existsSync(DB_PATH)) {
        return reject(new Error('Database file not found'));
      }

      const backupDir = getBackupPath();
      
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `expense-tracker-auto-migration-${timestamp}.db`);

      fs.copyFileSync(DB_PATH, backupPath);
      
      console.log('✓ Auto-migration backup created:', backupPath);
      resolve(backupPath);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Migration: Expand expense categories
 */
async function migrateExpandCategories(db) {
  const migrationName = 'expand_expense_categories_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    console.log(`✓ Migration "${migrationName}" already applied, skipping`);
    return;
  }

  console.log(`Running migration: ${migrationName}`);

  // Create backup
  await createBackup();

  return new Promise((resolve, reject) => {
    const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
    const budgetCategoryList = BUDGETABLE_CATEGORIES.map(c => `'${c}'`).join(', ');

    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Update expenses table
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
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }

          db.run(`
            INSERT INTO expenses_new 
            SELECT 
              id, date, place, notes, amount,
              CASE WHEN type = 'Food' THEN 'Dining Out' ELSE type END as type,
              week, method, recurring_id, is_generated, created_at
            FROM expenses
          `, (err) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            db.run('DROP TABLE expenses', (err) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }

              db.run('ALTER TABLE expenses_new RENAME TO expenses', (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }

                console.log('✓ Updated expenses table');

                // Update recurring_expenses table
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
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }

                  db.run(`
                    INSERT INTO recurring_expenses_new 
                    SELECT 
                      id, place, amount, notes,
                      CASE WHEN type = 'Food' THEN 'Dining Out' ELSE type END as type,
                      method, day_of_month, start_month, end_month, paused, created_at
                    FROM recurring_expenses
                  `, (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }

                    db.run('DROP TABLE recurring_expenses', (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }

                      db.run('ALTER TABLE recurring_expenses_new RENAME TO recurring_expenses', (err) => {
                        if (err) {
                          db.run('ROLLBACK');
                          return reject(err);
                        }

                        console.log('✓ Updated recurring_expenses table');

                        // Check if budgets table exists
                        db.get('SELECT name FROM sqlite_master WHERE type="table" AND name="budgets"', (err, row) => {
                          if (err) {
                            db.run('ROLLBACK');
                            return reject(err);
                          }

                          if (!row) {
                            // No budgets table, skip and commit
                            console.log('ℹ Budgets table does not exist, skipping');
                            
                            markMigrationApplied(db, migrationName).then(() => {
                              db.run('COMMIT', (err) => {
                                if (err) {
                                  db.run('ROLLBACK');
                                  return reject(err);
                                }
                                console.log(`✓ Migration "${migrationName}" completed successfully`);
                                resolve();
                              });
                            }).catch(reject);
                          } else {
                            // Update budgets table
                            db.run(`
                              CREATE TABLE budgets_new (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                year INTEGER NOT NULL,
                                month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
                                category TEXT NOT NULL CHECK(category IN (${budgetCategoryList})),
                                "limit" REAL NOT NULL CHECK("limit" > 0),
                                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                                UNIQUE(year, month, category)
                              )
                            `, (err) => {
                              if (err) {
                                db.run('ROLLBACK');
                                return reject(err);
                              }

                              db.run(`
                                INSERT INTO budgets_new 
                                SELECT 
                                  id, year, month,
                                  CASE WHEN category = 'Food' THEN 'Dining Out' ELSE category END as category,
                                  "limit", created_at, updated_at
                                FROM budgets
                              `, (err) => {
                                if (err) {
                                  db.run('ROLLBACK');
                                  return reject(err);
                                }

                                db.run('DROP TABLE budgets', (err) => {
                                  if (err) {
                                    db.run('ROLLBACK');
                                    return reject(err);
                                  }

                                  db.run('ALTER TABLE budgets_new RENAME TO budgets', (err) => {
                                    if (err) {
                                      db.run('ROLLBACK');
                                      return reject(err);
                                    }

                                    console.log('✓ Updated budgets table');

                                    // Mark migration as applied and commit
                                    markMigrationApplied(db, migrationName).then(() => {
                                      db.run('COMMIT', (err) => {
                                        if (err) {
                                          db.run('ROLLBACK');
                                          return reject(err);
                                        }
                                        console.log(`✓ Migration "${migrationName}" completed successfully`);
                                        resolve();
                                      });
                                    }).catch(reject);
                                  });
                                });
                              });
                            });
                          }
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

/**
 * Run all pending migrations
 */
async function runMigrations(db) {
  console.log('\n--- Checking for pending migrations ---');
  
  try {
    await migrateExpandCategories(db);
    console.log('✓ All migrations completed\n');
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    throw error;
  }
}

module.exports = {
  runMigrations,
  checkMigrationApplied,
  markMigrationApplied
};
