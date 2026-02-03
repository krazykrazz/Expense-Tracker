const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { getDatabasePath, getBackupPath } = require('../config/paths');
const { CATEGORIES, BUDGETABLE_CATEGORIES } = require('../utils/categories');
const logger = require('../config/logger');

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
      
      logger.info('Auto-migration backup created:', backupPath);
      resolve(backupPath);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Disable foreign key constraints
 * IMPORTANT: Call this before any migration that recreates tables with foreign key references
 * This prevents CASCADE DELETE from triggering when dropping the old table
 */
function disableForeignKeys(db) {
  return new Promise((resolve, reject) => {
    db.run('PRAGMA foreign_keys = OFF', (err) => {
      if (err) {
        reject(err);
        return;
      }
      logger.debug('Foreign key constraints disabled');
      resolve();
    });
  });
}

/**
 * Enable foreign key constraints
 * IMPORTANT: Call this after the migration completes to restore normal FK behavior
 */
function enableForeignKeys(db) {
  return new Promise((resolve, reject) => {
    db.run('PRAGMA foreign_keys = ON', (err) => {
      if (err) {
        reject(err);
        return;
      }
      logger.debug('Foreign key constraints enabled');
      resolve();
    });
  });
}

/**
 * Check current foreign key status
 */
function checkForeignKeyStatus(db) {
  return new Promise((resolve, reject) => {
    db.get('PRAGMA foreign_keys', (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row ? row.foreign_keys === 1 : false);
    });
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
    logger.info(`Migration "${migrationName}" already applied, skipping`);
    return;
  }

  logger.info(`Running migration: ${migrationName}`);

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
 * Migration: Add Clothing category
 */
async function migrateAddClothingCategory(db) {
  const migrationName = 'add_clothing_category_v1';
  
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
            place TEXT,
            notes TEXT,
            amount REAL NOT NULL,
            type TEXT NOT NULL CHECK(type IN (${categoryList})),
            week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
            method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
            recurring_id INTEGER,
            is_generated INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }

          db.run(`
            INSERT INTO expenses_new 
            SELECT * FROM expenses
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

                console.log('✓ Updated expenses table with Clothing category');

                // Recreate indexes
                const indexes = [
                  'CREATE INDEX IF NOT EXISTS idx_date ON expenses(date)',
                  'CREATE INDEX IF NOT EXISTS idx_type ON expenses(type)',
                  'CREATE INDEX IF NOT EXISTS idx_method ON expenses(method)',
                  'CREATE INDEX IF NOT EXISTS idx_recurring_id ON expenses(recurring_id)'
                ];

                let completed = 0;
                indexes.forEach((indexSQL) => {
                  db.run(indexSQL, (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    completed++;
                    if (completed === indexes.length) {
                      // Update recurring_expenses table
                      db.run(`
                        CREATE TABLE recurring_expenses_new (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          place TEXT NOT NULL,
                          amount REAL NOT NULL,
                          notes TEXT,
                          type TEXT NOT NULL CHECK(type IN (${categoryList})),
                          method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
                          day_of_month INTEGER NOT NULL CHECK(day_of_month >= 1 AND day_of_month <= 31),
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
                          SELECT * FROM recurring_expenses
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

                              console.log('✓ Updated recurring_expenses table with Clothing category');

                              // Recreate recurring_expenses indexes
                              db.run('CREATE INDEX IF NOT EXISTS idx_recurring_dates ON recurring_expenses(start_month, end_month)', (err) => {
                                if (err) {
                                  db.run('ROLLBACK');
                                  return reject(err);
                                }

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
                                        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                        UNIQUE(year, month, category)
                                      )
                                    `, (err) => {
                                      if (err) {
                                        db.run('ROLLBACK');
                                        return reject(err);
                                      }

                                      db.run(`
                                        INSERT INTO budgets_new 
                                        SELECT * FROM budgets
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

                                            console.log('✓ Updated budgets table with Clothing category');

                                            // Recreate budgets indexes and trigger
                                            db.run('CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(year, month)', (err) => {
                                              if (err) {
                                                db.run('ROLLBACK');
                                                return reject(err);
                                              }

                                              db.run('CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category)', (err) => {
                                                if (err) {
                                                  db.run('ROLLBACK');
                                                  return reject(err);
                                                }

                                                db.run(`
                                                  CREATE TRIGGER IF NOT EXISTS update_budgets_timestamp 
                                                  AFTER UPDATE ON budgets
                                                  BEGIN
                                                    UPDATE budgets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                                                  END
                                                `, (err) => {
                                                  if (err) {
                                                    db.run('ROLLBACK');
                                                    return reject(err);
                                                  }

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
}

/**
 * Migration: Remove recurring expenses feature
 */
async function migrateRemoveRecurringExpenses(db) {
  const migrationName = 'remove_recurring_expenses_v1';
  
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

    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Check if recurring_expenses table exists
        db.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='recurring_expenses'",
          (err, row) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            if (row) {
              console.log('✓ recurring_expenses table found, removing...');
              
              // Count generated expenses before conversion
              db.get('SELECT COUNT(*) as count FROM expenses WHERE is_generated = 1', (err, countRow) => {
                if (err) {
                  // Column might not exist, that's okay
                  console.log('ℹ No is_generated column found');
                }
                
                const generatedCount = countRow ? countRow.count : 0;
                if (generatedCount > 0) {
                  console.log(`ℹ Converting ${generatedCount} generated expenses to regular expenses`);
                }

                // Drop recurring_expenses table
                db.run('DROP TABLE IF EXISTS recurring_expenses', (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  console.log('✓ Dropped recurring_expenses table');

                  // Create new expenses table without recurring columns
                  db.run(`
                    CREATE TABLE expenses_new (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      date TEXT NOT NULL,
                      place TEXT,
                      notes TEXT,
                      amount REAL NOT NULL,
                      type TEXT NOT NULL CHECK(type IN (${categoryList})),
                      week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
                      method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
                      created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                  `, (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }

                    // Copy all data (excluding recurring_id and is_generated columns)
                    db.run(`
                      INSERT INTO expenses_new (id, date, place, notes, amount, type, week, method, created_at)
                      SELECT id, date, place, notes, amount, type, week, method, 
                             COALESCE(created_at, CURRENT_TIMESTAMP)
                      FROM expenses
                    `, function(err) {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      
                      console.log(`✓ Copied ${this.changes} expense records (all expenses now regular)`);

                      // Drop old table
                      db.run('DROP TABLE expenses', (err) => {
                        if (err) {
                          db.run('ROLLBACK');
                          return reject(err);
                        }

                        // Rename new table
                        db.run('ALTER TABLE expenses_new RENAME TO expenses', (err) => {
                          if (err) {
                            db.run('ROLLBACK');
                            return reject(err);
                          }

                          console.log('✓ Updated expenses table structure');

                          // Recreate indexes
                          const indexes = [
                            'CREATE INDEX IF NOT EXISTS idx_date ON expenses(date)',
                            'CREATE INDEX IF NOT EXISTS idx_type ON expenses(type)',
                            'CREATE INDEX IF NOT EXISTS idx_method ON expenses(method)'
                          ];

                          let completed = 0;
                          indexes.forEach((indexSQL) => {
                            db.run(indexSQL, (err) => {
                              if (err) {
                                db.run('ROLLBACK');
                                return reject(err);
                              }
                              completed++;
                              if (completed === indexes.length) {
                                // Mark migration as applied and commit
                                markMigrationApplied(db, migrationName).then(() => {
                                  db.run('COMMIT', (err) => {
                                    if (err) {
                                      db.run('ROLLBACK');
                                      return reject(err);
                                    }
                                    console.log(`✓ Migration "${migrationName}" completed successfully`);
                                    console.log('✓ Recurring expenses feature removed');
                                    resolve();
                                  });
                                }).catch(reject);
                              }
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            } else {
              console.log('✓ recurring_expenses table not found (already removed)');
              
              // Still need to check if expenses table has recurring columns
              db.all('PRAGMA table_info(expenses)', (err, columns) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }

                const hasRecurringId = columns.some(col => col.name === 'recurring_id');
                const hasIsGenerated = columns.some(col => col.name === 'is_generated');

                if (hasRecurringId || hasIsGenerated) {
                  console.log('ℹ Expenses table still has recurring columns, removing...');
                  
                  // Create new expenses table without recurring columns
                  db.run(`
                    CREATE TABLE expenses_new (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      date TEXT NOT NULL,
                      place TEXT,
                      notes TEXT,
                      amount REAL NOT NULL,
                      type TEXT NOT NULL CHECK(type IN (${categoryList})),
                      week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
                      method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
                      created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                  `, (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }

                    // Copy all data
                    db.run(`
                      INSERT INTO expenses_new (id, date, place, notes, amount, type, week, method, created_at)
                      SELECT id, date, place, notes, amount, type, week, method,
                             COALESCE(created_at, CURRENT_TIMESTAMP)
                      FROM expenses
                    `, function(err) {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      
                      console.log(`✓ Copied ${this.changes} expense records`);

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

                          // Recreate indexes
                          const indexes = [
                            'CREATE INDEX IF NOT EXISTS idx_date ON expenses(date)',
                            'CREATE INDEX IF NOT EXISTS idx_type ON expenses(type)',
                            'CREATE INDEX IF NOT EXISTS idx_method ON expenses(method)'
                          ];

                          let completed = 0;
                          indexes.forEach((indexSQL) => {
                            db.run(indexSQL, (err) => {
                              if (err) {
                                db.run('ROLLBACK');
                                return reject(err);
                              }
                              completed++;
                              if (completed === indexes.length) {
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
                              }
                            });
                          });
                        });
                      });
                    });
                  });
                } else {
                  console.log('✓ Expenses table already clean');
                  // Mark as applied and commit
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
                }
              });
            }
          }
        );
      });
    });
  });
}

/**
 * Migration: Fix category constraints to include Gifts
 * This migration ensures all tables have the complete category list
 */
async function migrateFixCategoryConstraints(db) {
  const migrationName = 'fix_category_constraints_v1';
  
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

        // Check current expenses table constraint
        db.get(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='expenses'",
          (err, row) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            // Check if Gifts is already in the constraint
            if (row && row.sql.includes("'Gifts'")) {
              console.log('✓ Expenses table already has correct constraints');
              
              // Still check budgets table
              checkAndUpdateBudgetsTable(db, budgetCategoryList, migrationName, resolve, reject);
            } else {
              console.log('ℹ Updating expenses table constraints...');
              
              // Create new expenses table with correct constraint
              db.run(`
                CREATE TABLE expenses_new (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  date TEXT NOT NULL,
                  place TEXT,
                  notes TEXT,
                  amount REAL NOT NULL,
                  type TEXT NOT NULL CHECK(type IN (${categoryList})),
                  week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
                  method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                  recurring_id INTEGER,
                  is_generated INTEGER DEFAULT 0
                )
              `, (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }

                // Copy all data
                db.run(`
                  INSERT INTO expenses_new 
                  SELECT * FROM expenses
                `, function(err) {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }

                  console.log(`✓ Copied ${this.changes} expense records`);

                  // Drop old table
                  db.run('DROP TABLE expenses', (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }

                    // Rename new table
                    db.run('ALTER TABLE expenses_new RENAME TO expenses', (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }

                      console.log('✓ Updated expenses table');

                      // Recreate indexes
                      const indexes = [
                        'CREATE INDEX IF NOT EXISTS idx_date ON expenses(date)',
                        'CREATE INDEX IF NOT EXISTS idx_type ON expenses(type)',
                        'CREATE INDEX IF NOT EXISTS idx_method ON expenses(method)'
                      ];

                      let completed = 0;
                      indexes.forEach((indexSQL) => {
                        db.run(indexSQL, (err) => {
                          if (err) {
                            db.run('ROLLBACK');
                            return reject(err);
                          }
                          completed++;
                          if (completed === indexes.length) {
                            // Check and update recurring_expenses table
                            checkAndUpdateRecurringTable(db, categoryList, budgetCategoryList, migrationName, resolve, reject);
                          }
                        });
                      });
                    });
                  });
                });
              });
            }
          }
        );
      });
    });
  });
}

function checkAndUpdateRecurringTable(db, categoryList, budgetCategoryList, migrationName, resolve, reject) {
  db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='recurring_expenses'",
    (err, row) => {
      if (err) {
        db.run('ROLLBACK');
        return reject(err);
      }

      if (row) {
        // Check if recurring_expenses has correct constraint
        db.get(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='recurring_expenses'",
          (err, row) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            if (row && row.sql.includes("'Gifts'")) {
              console.log('✓ Recurring expenses table already has correct constraints');
              checkAndUpdateBudgetsTable(db, budgetCategoryList, migrationName, resolve, reject);
            } else {
              console.log('ℹ Updating recurring_expenses table constraints...');
              
              db.run(`
                CREATE TABLE recurring_expenses_new (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  place TEXT NOT NULL,
                  amount REAL NOT NULL,
                  notes TEXT,
                  type TEXT NOT NULL CHECK(type IN (${categoryList})),
                  method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
                  day_of_month INTEGER NOT NULL CHECK(day_of_month >= 1 AND day_of_month <= 31),
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
                  SELECT * FROM recurring_expenses
                `, function(err) {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }

                  console.log(`✓ Copied ${this.changes} recurring expense records`);

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
                      checkAndUpdateBudgetsTable(db, budgetCategoryList, migrationName, resolve, reject);
                    });
                  });
                });
              });
            }
          }
        );
      } else {
        // No recurring_expenses table
        checkAndUpdateBudgetsTable(db, budgetCategoryList, migrationName, resolve, reject);
      }
    }
  );
}

function checkAndUpdateBudgetsTable(db, budgetCategoryList, migrationName, resolve, reject) {
  db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'",
    (err, row) => {
      if (err) {
        db.run('ROLLBACK');
        return reject(err);
      }

      if (row) {
        // Check if budgets has correct constraint
        db.get(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='budgets'",
          (err, row) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            if (row && row.sql.includes("'Gifts'")) {
              console.log('✓ Budgets table already has correct constraints');
              commitFixMigration(db, migrationName, resolve, reject);
            } else {
              console.log('ℹ Updating budgets table constraints...');
              
              db.run(`
                CREATE TABLE budgets_new (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  year INTEGER NOT NULL,
                  month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
                  category TEXT NOT NULL CHECK(category IN (${budgetCategoryList})),
                  "limit" REAL NOT NULL CHECK("limit" > 0),
                  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE(year, month, category)
                )
              `, (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }

                db.run(`
                  INSERT INTO budgets_new 
                  SELECT * FROM budgets
                `, function(err) {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }

                  console.log(`✓ Copied ${this.changes} budget records`);

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

                      // Recreate budgets indexes and trigger
                      db.run('CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(year, month)', (err) => {
                        if (err) {
                          db.run('ROLLBACK');
                          return reject(err);
                        }

                        db.run('CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category)', (err) => {
                          if (err) {
                            db.run('ROLLBACK');
                            return reject(err);
                          }

                          db.run(`
                            CREATE TRIGGER IF NOT EXISTS update_budgets_timestamp 
                            AFTER UPDATE ON budgets
                            BEGIN
                              UPDATE budgets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                            END
                          `, (err) => {
                            if (err) {
                              db.run('ROLLBACK');
                              return reject(err);
                            }

                            commitFixMigration(db, migrationName, resolve, reject);
                          });
                        });
                      });
                    });
                  });
                });
              });
            }
          }
        );
      } else {
        // No budgets table
        commitFixMigration(db, migrationName, resolve, reject);
      }
    }
  );
}

function commitFixMigration(db, migrationName, resolve, reject) {
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
}

/**
 * Migration: Add Personal Care category
 */
async function migrateAddPersonalCareCategory(db) {
  const migrationName = 'add_personal_care_category_v1';
  
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

        // First check if table has recurring columns
        db.all('PRAGMA table_info(expenses)', (err, columns) => {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }

          const hasRecurringId = columns.some(col => col.name === 'recurring_id');
          const hasIsGenerated = columns.some(col => col.name === 'is_generated');

          // Create new table with or without recurring columns based on current schema
          const createTableSQL = hasRecurringId && hasIsGenerated
            ? `CREATE TABLE expenses_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                place TEXT,
                notes TEXT,
                amount REAL NOT NULL,
                type TEXT NOT NULL CHECK(type IN (${categoryList})),
                week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
                method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
                recurring_id INTEGER,
                is_generated INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
              )`
            : `CREATE TABLE expenses_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                place TEXT,
                notes TEXT,
                amount REAL NOT NULL,
                type TEXT NOT NULL CHECK(type IN (${categoryList})),
                week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
                method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
              )`;

          // Update expenses table
          db.run(createTableSQL, (err) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            db.run(`
              INSERT INTO expenses_new 
              SELECT * FROM expenses
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

                console.log('✓ Updated expenses table with Personal Care category');

                // Recreate indexes
                const indexes = [
                  'CREATE INDEX IF NOT EXISTS idx_date ON expenses(date)',
                  'CREATE INDEX IF NOT EXISTS idx_type ON expenses(type)',
                  'CREATE INDEX IF NOT EXISTS idx_method ON expenses(method)'
                ];

                let completed = 0;
                indexes.forEach((indexSQL) => {
                  db.run(indexSQL, (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    completed++;
                    if (completed === indexes.length) {
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
                              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                              UNIQUE(year, month, category)
                            )
                          `, (err) => {
                            if (err) {
                              db.run('ROLLBACK');
                              return reject(err);
                            }

                            db.run(`
                              INSERT INTO budgets_new 
                              SELECT * FROM budgets
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

                                  console.log('✓ Updated budgets table with Personal Care category');

                                  // Recreate budgets indexes and trigger
                                  db.run('CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(year, month)', (err) => {
                                    if (err) {
                                      db.run('ROLLBACK');
                                      return reject(err);
                                    }

                                    db.run('CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category)', (err) => {
                                      if (err) {
                                        db.run('ROLLBACK');
                                        return reject(err);
                                      }

                                      db.run(`
                                        CREATE TRIGGER IF NOT EXISTS update_budgets_timestamp 
                                        AFTER UPDATE ON budgets
                                        BEGIN
                                          UPDATE budgets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                                        END
                                      `, (err) => {
                                        if (err) {
                                          db.run('ROLLBACK');
                                          return reject(err);
                                        }

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
                              });
                            });
                          });
                        }
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
}

/**
 * Migration: Add category and payment_type to fixed_expenses table
 */
async function migrateAddCategoryAndPaymentTypeToFixedExpenses(db) {
  const migrationName = 'add_category_payment_type_fixed_expenses_v1';
  
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
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Check if fixed_expenses table exists
        db.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='fixed_expenses'",
          (err, row) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            if (!row) {
              console.log('ℹ fixed_expenses table does not exist, skipping migration');
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
              return;
            }

            // Check if columns already exist
            db.all('PRAGMA table_info(fixed_expenses)', (err, columns) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }

              const hasCategory = columns.some(col => col.name === 'category');
              const hasPaymentType = columns.some(col => col.name === 'payment_type');

              if (hasCategory && hasPaymentType) {
                console.log('✓ fixed_expenses already has category and payment_type columns');
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
                return;
              }

              // Add category column with default value 'Other'
              if (!hasCategory) {
                db.run(`
                  ALTER TABLE fixed_expenses 
                  ADD COLUMN category TEXT NOT NULL DEFAULT 'Other'
                `, (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  console.log('✓ Added category column to fixed_expenses');

                  // Add payment_type column with default value 'Debit'
                  if (!hasPaymentType) {
                    db.run(`
                      ALTER TABLE fixed_expenses 
                      ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'Debit'
                    `, (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      console.log('✓ Added payment_type column to fixed_expenses');

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
                  } else {
                    // Only category was missing
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
                  }
                });
              } else if (!hasPaymentType) {
                // Only payment_type is missing
                db.run(`
                  ALTER TABLE fixed_expenses 
                  ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'Debit'
                `, (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  console.log('✓ Added payment_type column to fixed_expenses');

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
              }
            });
          }
        );
      });
    });
  });
}

/**
 * Migration: Add category column to income_sources table
 */
async function migrateAddIncomeCategoryColumn(db) {
  const migrationName = 'add_income_category_column_v1';
  
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
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Check if income_sources table exists
        db.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='income_sources'",
          (err, row) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            if (!row) {
              console.log('ℹ income_sources table does not exist, skipping migration');
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
              return;
            }

            // Check if category column already exists
            db.all('PRAGMA table_info(income_sources)', (err, columns) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }

              const hasCategory = columns.some(col => col.name === 'category');

              if (hasCategory) {
                console.log('✓ income_sources already has category column');
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
                return;
              }

              // Add category column with default value 'Other'
              db.run(`
                ALTER TABLE income_sources 
                ADD COLUMN category TEXT NOT NULL DEFAULT 'Other' 
                CHECK(category IN ('Salary', 'Government', 'Gifts', 'Other'))
              `, (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                
                console.log('✓ Added category column to income_sources');

                // Count updated records
                db.get('SELECT COUNT(*) as count FROM income_sources', (err, row) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }

                  const recordCount = row ? row.count : 0;
                  if (recordCount > 0) {
                    console.log(`✓ Updated ${recordCount} existing income source(s) with default category 'Other'`);
                  }

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
          }
        );
      });
    });
  });
}

/**
 * Migration: Add investment tracking tables
 */
async function migrateAddInvestmentTables(db) {
  const migrationName = 'add_investment_tables_v1';
  
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
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Check if investments table already exists
        db.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='investments'",
          (err, row) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            if (row) {
              console.log('✓ investments table already exists');
              
              // Check if investment_values table exists
              db.get(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='investment_values'",
                (err, row) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }

                  if (row) {
                    console.log('✓ investment_values table already exists');
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
                    // Create investment_values table
                    createInvestmentValuesTables(db, migrationName, resolve, reject);
                  }
                }
              );
            } else {
              // Create investments table
              db.run(`
                CREATE TABLE investments (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  type TEXT NOT NULL CHECK(type IN ('TFSA', 'RRSP')),
                  initial_value REAL NOT NULL CHECK(initial_value >= 0),
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
              `, (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }

                console.log('✓ Created investments table');

                // Create index on type
                db.run('CREATE INDEX IF NOT EXISTS idx_investments_type ON investments(type)', (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }

                  console.log('✓ Created index on investments.type');

                  // Create investment_values table
                  createInvestmentValuesTables(db, migrationName, resolve, reject);
                });
              });
            }
          }
        );
      });
    });
  });
}

function createInvestmentValuesTables(db, migrationName, resolve, reject) {
  db.run(`
    CREATE TABLE IF NOT EXISTS investment_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      investment_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      value REAL NOT NULL CHECK(value >= 0),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE,
      UNIQUE(investment_id, year, month)
    )
  `, (err) => {
    if (err) {
      db.run('ROLLBACK');
      return reject(err);
    }

    console.log('✓ Created investment_values table');

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_investment_values_investment_id ON investment_values(investment_id)',
      'CREATE INDEX IF NOT EXISTS idx_investment_values_year_month ON investment_values(year, month)'
    ];

    let completed = 0;
    indexes.forEach((indexSQL) => {
      db.run(indexSQL, (err) => {
        if (err) {
          db.run('ROLLBACK');
          return reject(err);
        }
        completed++;
        if (completed === indexes.length) {
          console.log('✓ Created indexes on investment_values table');

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
        }
      });
    });
  });
}

/**
 * Migration: Add people and expense_people tables for medical expense tracking
 */
async function migrateAddPeopleTables(db) {
  const migrationName = 'add_people_tables_v1';
  
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
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Create people table
        const createPeopleSQL = `
          CREATE TABLE IF NOT EXISTS people (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            date_of_birth DATE,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `;

        db.run(createPeopleSQL, (err) => {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }
          console.log('✓ Created people table');

          // Create expense_people junction table
          const createExpensePeopleSQL = `
            CREATE TABLE IF NOT EXISTS expense_people (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              expense_id INTEGER NOT NULL,
              person_id INTEGER NOT NULL,
              amount DECIMAL(10,2) NOT NULL,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
              FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
              UNIQUE(expense_id, person_id)
            )
          `;

          db.run(createExpensePeopleSQL, (err) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }
            console.log('✓ Created expense_people junction table');

            // Create indexes for better performance
            const indexes = [
              'CREATE INDEX IF NOT EXISTS idx_people_name ON people(name)',
              'CREATE INDEX IF NOT EXISTS idx_expense_people_expense_id ON expense_people(expense_id)',
              'CREATE INDEX IF NOT EXISTS idx_expense_people_person_id ON expense_people(person_id)'
            ];

            let completed = 0;
            indexes.forEach((indexSQL) => {
              db.run(indexSQL, (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                completed++;
                if (completed === indexes.length) {
                  console.log('✓ Created indexes for people tables');

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
                }
              });
            });
          });
        });
      });
    });
  });
}

/**
 * Migration: Add performance indexes for frequently queried columns
 */
async function migrateAddPerformanceIndexes(db) {
  const migrationName = 'add_performance_indexes_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    console.log(`✓ Migration "${migrationName}" already applied, skipping`);
    return;
  }

  console.log(`Running migration: ${migrationName}`);

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Performance indexes for expenses table
        const expenseIndexes = [
          'CREATE INDEX IF NOT EXISTS idx_expenses_place ON expenses(place)',
          'CREATE INDEX IF NOT EXISTS idx_expenses_year_month ON expenses(strftime("%Y", date), strftime("%m", date))',
          'CREATE INDEX IF NOT EXISTS idx_expenses_amount ON expenses(amount)',
          'CREATE INDEX IF NOT EXISTS idx_expenses_date_type ON expenses(date, type)',
          'CREATE INDEX IF NOT EXISTS idx_expenses_place_date ON expenses(place, date)'
        ];

        // Performance indexes for other tables
        const otherIndexes = [
          'CREATE INDEX IF NOT EXISTS idx_fixed_expenses_year_month ON fixed_expenses(year, month)',
          'CREATE INDEX IF NOT EXISTS idx_fixed_expenses_category ON fixed_expenses(category)',
          'CREATE INDEX IF NOT EXISTS idx_income_sources_year_month ON income_sources(year, month)',
          'CREATE INDEX IF NOT EXISTS idx_income_sources_category ON income_sources(category)',
          'CREATE INDEX IF NOT EXISTS idx_loan_balances_year_month ON loan_balances(year, month)',
          'CREATE INDEX IF NOT EXISTS idx_loans_type ON loans(loan_type)',
          'CREATE INDEX IF NOT EXISTS idx_loans_paid_off ON loans(is_paid_off)'
        ];

        const allIndexes = [...expenseIndexes, ...otherIndexes];
        let completed = 0;

        console.log(`Creating ${allIndexes.length} performance indexes...`);

        allIndexes.forEach((indexSQL, index) => {
          db.run(indexSQL, (err) => {
            if (err) {
              console.error(`Failed to create index ${index + 1}:`, err.message);
              db.run('ROLLBACK');
              return reject(err);
            }
            
            completed++;
            if (completed === allIndexes.length) {
              console.log(`✓ Created ${completed} performance indexes`);

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
            }
          });
        });
      });
    });
  });
}

/**
 * Migration: Add expense_invoices table for medical expense invoice attachments
 */
async function migrateAddExpenseInvoicesTable(db) {
  const migrationName = 'add_expense_invoices_table_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    logger.info(`Migration "${migrationName}" already applied, skipping`);
    return;
  }

  logger.info(`Running migration: ${migrationName}`);

  // Create backup
  await createBackup();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Check if expense_invoices table already exists
        db.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='expense_invoices'",
          (err, row) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            if (row) {
              logger.info('expense_invoices table already exists');
              markMigrationApplied(db, migrationName).then(() => {
                db.run('COMMIT', (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  logger.info(`Migration "${migrationName}" completed successfully`);
                  resolve();
                });
              }).catch(reject);
              return;
            }

            // Create expense_invoices table
            const createExpenseInvoicesSQL = `
              CREATE TABLE expense_invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                expense_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                mime_type TEXT NOT NULL DEFAULT 'application/pdf',
                upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
                UNIQUE(expense_id)
              )
            `;

            db.run(createExpenseInvoicesSQL, (err) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }

              logger.info('Created expense_invoices table');

              // Create indexes for performance
              const indexes = [
                'CREATE INDEX IF NOT EXISTS idx_expense_invoices_expense_id ON expense_invoices(expense_id)',
                'CREATE INDEX IF NOT EXISTS idx_expense_invoices_upload_date ON expense_invoices(upload_date)'
              ];

              let completed = 0;
              indexes.forEach((indexSQL) => {
                db.run(indexSQL, (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  completed++;
                  if (completed === indexes.length) {
                    logger.info('Created indexes for expense_invoices table');

                    // Mark migration as applied and commit
                    markMigrationApplied(db, migrationName).then(() => {
                      db.run('COMMIT', (err) => {
                        if (err) {
                          db.run('ROLLBACK');
                          return reject(err);
                        }
                        logger.info(`Migration "${migrationName}" completed successfully`);
                        resolve();
                      });
                    }).catch(reject);
                  }
                });
              });
            });
          }
        );
      });
    });
  });
}

/**
 * Migration: Add multi-invoice support to expense_invoices table
 * - Removes UNIQUE constraint on expense_id to allow multiple invoices per expense
 * - Adds person_id column with FK to people table (ON DELETE SET NULL)
 * - Preserves all existing invoice data
 * - Creates indexes for person_id
 */
async function migrateMultiInvoiceSupport(db) {
  const migrationName = 'multi_invoice_support_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    logger.info(`Migration "${migrationName}" already applied, skipping`);
    return;
  }

  logger.info(`Running migration: ${migrationName}`);

  // Create backup
  await createBackup();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Check if expense_invoices table exists
        db.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='expense_invoices'",
          (err, row) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            if (!row) {
              // Table doesn't exist - create it with new schema directly
              logger.info('expense_invoices table does not exist, creating with multi-invoice schema');
              
              const createExpenseInvoicesSQL = `
                CREATE TABLE expense_invoices (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  expense_id INTEGER NOT NULL,
                  person_id INTEGER,
                  filename TEXT NOT NULL,
                  original_filename TEXT NOT NULL,
                  file_path TEXT NOT NULL,
                  file_size INTEGER NOT NULL,
                  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
                  upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
                  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
                )
              `;

              db.run(createExpenseInvoicesSQL, (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }

                logger.info('Created expense_invoices table with multi-invoice schema');

                // Create indexes
                createMultiInvoiceIndexes(db, migrationName, resolve, reject);
              });
              return;
            }

            // Table exists - check if it already has person_id column
            db.all('PRAGMA table_info(expense_invoices)', (err, columns) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }

              const hasPersonId = columns.some(col => col.name === 'person_id');

              if (hasPersonId) {
                logger.info('expense_invoices already has person_id column');
                markMigrationApplied(db, migrationName).then(() => {
                  db.run('COMMIT', (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    logger.info(`Migration "${migrationName}" completed successfully`);
                    resolve();
                  });
                }).catch(reject);
                return;
              }

              // Get existing invoice data before migration
              db.all('SELECT * FROM expense_invoices', (err, existingInvoices) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }

                const invoiceCount = existingInvoices ? existingInvoices.length : 0;
                logger.info(`Found ${invoiceCount} existing invoice(s) to migrate`);

                // Create new table without UNIQUE constraint and with person_id
                const createNewTableSQL = `
                  CREATE TABLE expense_invoices_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    expense_id INTEGER NOT NULL,
                    person_id INTEGER,
                    filename TEXT NOT NULL,
                    original_filename TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
                    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
                    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
                  )
                `;

                db.run(createNewTableSQL, (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }

                  logger.info('Created new expense_invoices table with multi-invoice schema');

                  // Copy existing data with person_id as NULL
                  db.run(`
                    INSERT INTO expense_invoices_new 
                    (id, expense_id, person_id, filename, original_filename, file_path, file_size, mime_type, upload_date)
                    SELECT id, expense_id, NULL as person_id, filename, original_filename, file_path, file_size, mime_type, upload_date
                    FROM expense_invoices
                  `, function(err) {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }

                    const copiedCount = this.changes;
                    logger.info(`Copied ${copiedCount} invoice record(s) to new table`);

                    // Drop old table
                    db.run('DROP TABLE expense_invoices', (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }

                      // Rename new table
                      db.run('ALTER TABLE expense_invoices_new RENAME TO expense_invoices', (err) => {
                        if (err) {
                          db.run('ROLLBACK');
                          return reject(err);
                        }

                        logger.info('Renamed new table to expense_invoices');

                        // Create indexes
                        createMultiInvoiceIndexes(db, migrationName, resolve, reject);
                      });
                    });
                  });
                });
              });
            });
          }
        );
      });
    });
  });
}

/**
 * Helper function to create indexes for multi-invoice support
 */
function createMultiInvoiceIndexes(db, migrationName, resolve, reject) {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_expense_invoices_expense_id ON expense_invoices(expense_id)',
    'CREATE INDEX IF NOT EXISTS idx_expense_invoices_person_id ON expense_invoices(person_id)',
    'CREATE INDEX IF NOT EXISTS idx_expense_invoices_upload_date ON expense_invoices(upload_date)'
  ];

  let completed = 0;
  indexes.forEach((indexSQL) => {
    db.run(indexSQL, (err) => {
      if (err) {
        db.run('ROLLBACK');
        return reject(err);
      }
      completed++;
      if (completed === indexes.length) {
        logger.info('Created indexes for expense_invoices table');

        // Mark migration as applied and commit
        markMigrationApplied(db, migrationName).then(() => {
          db.run('COMMIT', (err) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }
            logger.info(`Migration "${migrationName}" completed successfully`);
            resolve();
          });
        }).catch(reject);
      }
    });
  });
}

/**
 * Migration: Link invoices to single person for single-person medical expenses
 * 
 * This migration retroactively links invoices to the assigned person when:
 * - The expense is a medical expense (type = 'Tax - Medical')
 * - The expense has exactly one person assigned
 * - The invoice has no person linked (person_id IS NULL)
 */
async function migrateLinkInvoicesToSinglePerson(db) {
  const migrationName = 'link_invoices_to_single_person_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    logger.info(`Migration "${migrationName}" already applied, skipping`);
    return;
  }

  logger.info(`Running migration: ${migrationName}`);

  // Create backup
  await createBackup();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Find all medical expenses with exactly one person assigned
        // and update their invoices that have no person linked
        const updateSql = `
          UPDATE expense_invoices
          SET person_id = (
            SELECT ep.person_id
            FROM expense_people ep
            WHERE ep.expense_id = expense_invoices.expense_id
          )
          WHERE expense_invoices.person_id IS NULL
            AND expense_invoices.expense_id IN (
              SELECT e.id
              FROM expenses e
              INNER JOIN expense_people ep ON e.id = ep.expense_id
              WHERE e.type = 'Tax - Medical'
              GROUP BY e.id
              HAVING COUNT(ep.person_id) = 1
            )
        `;

        db.run(updateSql, function(err) {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }

          const updatedCount = this.changes;
          logger.info(`Updated ${updatedCount} invoice(s) to link to single person`);

          // Mark migration as applied and commit
          markMigrationApplied(db, migrationName).then(() => {
            db.run('COMMIT', (err) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }
              logger.info(`Migration "${migrationName}" completed successfully`);
              resolve();
            });
          }).catch(reject);
        });
      });
    });
  });
}

/**
 * Migration: Add insurance tracking fields to expenses table
 * 
 * Adds the following columns to the expenses table:
 * - insurance_eligible INTEGER DEFAULT 0 (0 = not eligible, 1 = eligible)
 * - claim_status TEXT DEFAULT NULL with CHECK constraint for valid values
 * - original_cost REAL DEFAULT NULL (original cost before reimbursement)
 * 
 * For existing medical expenses:
 * - Sets insurance_eligible = 0
 * - Sets original_cost = amount (preserves original amount)
 */
async function migrateAddInsuranceFieldsToExpenses(db) {
  const migrationName = 'add_insurance_fields_to_expenses_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    logger.info(`Migration "${migrationName}" already applied, skipping`);
    return;
  }

  logger.info(`Running migration: ${migrationName}`);

  // Create backup
  await createBackup();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Check if expenses table exists
        db.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='expenses'",
          (err, row) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            if (!row) {
              logger.info('expenses table does not exist, skipping migration');
              markMigrationApplied(db, migrationName).then(() => {
                db.run('COMMIT', (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  logger.info(`Migration "${migrationName}" completed successfully`);
                  resolve();
                });
              }).catch(reject);
              return;
            }

            // Check if columns already exist
            db.all('PRAGMA table_info(expenses)', (err, columns) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }

              const hasInsuranceEligible = columns.some(col => col.name === 'insurance_eligible');
              const hasClaimStatus = columns.some(col => col.name === 'claim_status');
              const hasOriginalCost = columns.some(col => col.name === 'original_cost');

              if (hasInsuranceEligible && hasClaimStatus && hasOriginalCost) {
                logger.info('expenses table already has insurance fields');
                markMigrationApplied(db, migrationName).then(() => {
                  db.run('COMMIT', (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    logger.info(`Migration "${migrationName}" completed successfully`);
                    resolve();
                  });
                }).catch(reject);
                return;
              }

              // Add insurance_eligible column
              const addInsuranceEligible = () => {
                if (hasInsuranceEligible) {
                  return Promise.resolve();
                }
                return new Promise((res, rej) => {
                  db.run(`
                    ALTER TABLE expenses 
                    ADD COLUMN insurance_eligible INTEGER DEFAULT 0
                  `, (err) => {
                    if (err) {
                      rej(err);
                    } else {
                      logger.info('Added insurance_eligible column to expenses');
                      res();
                    }
                  });
                });
              };

              // Add claim_status column with CHECK constraint
              const addClaimStatus = () => {
                if (hasClaimStatus) {
                  return Promise.resolve();
                }
                return new Promise((res, rej) => {
                  db.run(`
                    ALTER TABLE expenses 
                    ADD COLUMN claim_status TEXT DEFAULT NULL 
                    CHECK(claim_status IS NULL OR claim_status IN ('not_claimed', 'in_progress', 'paid', 'denied'))
                  `, (err) => {
                    if (err) {
                      rej(err);
                    } else {
                      logger.info('Added claim_status column to expenses');
                      res();
                    }
                  });
                });
              };

              // Add original_cost column
              const addOriginalCost = () => {
                if (hasOriginalCost) {
                  return Promise.resolve();
                }
                return new Promise((res, rej) => {
                  db.run(`
                    ALTER TABLE expenses 
                    ADD COLUMN original_cost REAL DEFAULT NULL
                  `, (err) => {
                    if (err) {
                      rej(err);
                    } else {
                      logger.info('Added original_cost column to expenses');
                      res();
                    }
                  });
                });
              };

              // Set original_cost = amount for existing medical expenses
              const setOriginalCostForMedical = () => {
                return new Promise((res, rej) => {
                  db.run(`
                    UPDATE expenses 
                    SET original_cost = amount 
                    WHERE type = 'Tax - Medical' AND original_cost IS NULL
                  `, function(err) {
                    if (err) {
                      rej(err);
                    } else {
                      if (this.changes > 0) {
                        logger.info(`Set original_cost = amount for ${this.changes} existing medical expense(s)`);
                      }
                      res();
                    }
                  });
                });
              };

              // Execute all column additions sequentially
              addInsuranceEligible()
                .then(() => addClaimStatus())
                .then(() => addOriginalCost())
                .then(() => setOriginalCostForMedical())
                .then(() => {
                  // Create index for insurance_eligible for better query performance
                  db.run('CREATE INDEX IF NOT EXISTS idx_expenses_insurance_eligible ON expenses(insurance_eligible)', (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    
                    // Create index for claim_status
                    db.run('CREATE INDEX IF NOT EXISTS idx_expenses_claim_status ON expenses(claim_status)', (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }

                      logger.info('Created indexes for insurance fields');

                      // Mark migration as applied and commit
                      markMigrationApplied(db, migrationName).then(() => {
                        db.run('COMMIT', (err) => {
                          if (err) {
                            db.run('ROLLBACK');
                            return reject(err);
                          }
                          logger.info(`Migration "${migrationName}" completed successfully`);
                          resolve();
                        });
                      }).catch(reject);
                    });
                  });
                })
                .catch((err) => {
                  db.run('ROLLBACK');
                  reject(err);
                });
            });
          }
        );
      });
    });
  });
}

/**
 * Migration: Add original_amount column to expense_people table
 * 
 * Adds the original_amount column to track the original cost allocation per person
 * before any insurance reimbursement.
 * 
 * For existing allocations:
 * - Sets original_amount = amount (preserves original allocation)
 */
async function migrateAddOriginalAmountToExpensePeople(db) {
  const migrationName = 'add_original_amount_to_expense_people_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    logger.info(`Migration "${migrationName}" already applied, skipping`);
    return;
  }

  logger.info(`Running migration: ${migrationName}`);

  // Create backup
  await createBackup();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Check if expense_people table exists
        db.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='expense_people'",
          (err, row) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            if (!row) {
              logger.info('expense_people table does not exist, skipping migration');
              markMigrationApplied(db, migrationName).then(() => {
                db.run('COMMIT', (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  logger.info(`Migration "${migrationName}" completed successfully`);
                  resolve();
                });
              }).catch(reject);
              return;
            }

            // Check if original_amount column already exists
            db.all('PRAGMA table_info(expense_people)', (err, columns) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }

              const hasOriginalAmount = columns.some(col => col.name === 'original_amount');

              if (hasOriginalAmount) {
                logger.info('expense_people table already has original_amount column');
                markMigrationApplied(db, migrationName).then(() => {
                  db.run('COMMIT', (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    logger.info(`Migration "${migrationName}" completed successfully`);
                    resolve();
                  });
                }).catch(reject);
                return;
              }

              // Add original_amount column
              db.run(`
                ALTER TABLE expense_people 
                ADD COLUMN original_amount REAL DEFAULT NULL
              `, (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                
                logger.info('Added original_amount column to expense_people');

                // Set original_amount = amount for existing allocations
                db.run(`
                  UPDATE expense_people 
                  SET original_amount = amount 
                  WHERE original_amount IS NULL
                `, function(err) {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }

                  if (this.changes > 0) {
                    logger.info(`Set original_amount = amount for ${this.changes} existing allocation(s)`);
                  }

                  // Mark migration as applied and commit
                  markMigrationApplied(db, migrationName).then(() => {
                    db.run('COMMIT', (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      logger.info(`Migration "${migrationName}" completed successfully`);
                      resolve();
                    });
                  }).catch(reject);
                });
              });
            });
          }
        );
      });
    });
  });
}

/**
 * Migration: Add mortgage fields to loans table
 * Adds columns for mortgage-specific data: amortization_period, term_length, 
 * renewal_date, rate_type, payment_frequency, estimated_property_value
 * Also updates loan_type CHECK constraint to include 'mortgage'
 * 
 * IMPORTANT: This migration disables foreign keys before dropping the loans table
 * to prevent CASCADE DELETE from removing loan_balances data.
 */
async function migrateAddMortgageFields(db) {
  const migrationName = 'add_mortgage_fields_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    logger.info(`Migration "${migrationName}" already applied, skipping`);
    return;
  }

  logger.info(`Running migration: ${migrationName}`);

  // Create backup
  await createBackup();

  // CRITICAL: Disable foreign keys BEFORE the transaction to prevent CASCADE DELETE
  // when we drop the loans table (loan_balances has FK reference with ON DELETE CASCADE)
  await disableForeignKeys(db);

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          enableForeignKeys(db).catch(() => {});
          return reject(err);
        }

        // Check current columns in loans table
        db.all("PRAGMA table_info(loans)", (err, columns) => {
          if (err) {
            db.run('ROLLBACK');
            enableForeignKeys(db).catch(() => {});
            return reject(err);
          }

          const hasAmortizationPeriod = columns.some(col => col.name === 'amortization_period');

          if (hasAmortizationPeriod) {
            logger.info('loans table already has mortgage fields');
            markMigrationApplied(db, migrationName).then(() => {
              db.run('COMMIT', (err) => {
                enableForeignKeys(db).catch(() => {});
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                logger.info(`Migration "${migrationName}" completed successfully`);
                resolve();
              });
            }).catch((err) => {
              enableForeignKeys(db).catch(() => {});
              reject(err);
            });
            return;
          }

          // Check if estimated_months_left column exists in the old table
          db.all("PRAGMA table_info(loans)", (err, oldColumns) => {
            if (err) {
              db.run('ROLLBACK');
              enableForeignKeys(db).catch(() => {});
              return reject(err);
            }

            const hasEstimatedMonthsLeft = oldColumns.some(col => col.name === 'estimated_months_left');

            // SQLite doesn't support adding CHECK constraints via ALTER TABLE
            // We need to recreate the table with the new constraint and columns
            db.run(`
              CREATE TABLE loans_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                initial_balance REAL NOT NULL CHECK(initial_balance >= 0),
                start_date TEXT NOT NULL,
                notes TEXT,
                loan_type TEXT NOT NULL DEFAULT 'loan' CHECK(loan_type IN ('loan', 'line_of_credit', 'mortgage')),
                is_paid_off INTEGER DEFAULT 0,
                estimated_months_left INTEGER,
                amortization_period INTEGER,
                term_length INTEGER,
                renewal_date TEXT,
                rate_type TEXT CHECK(rate_type IS NULL OR rate_type IN ('fixed', 'variable')),
                payment_frequency TEXT CHECK(payment_frequency IS NULL OR payment_frequency IN ('monthly', 'bi-weekly', 'accelerated_bi-weekly')),
                estimated_property_value REAL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
              )
            `, (err) => {
              if (err) {
                db.run('ROLLBACK');
                enableForeignKeys(db).catch(() => {});
                return reject(err);
              }

              // Copy existing data to new table - handle case where estimated_months_left doesn't exist
              const insertSql = hasEstimatedMonthsLeft
                ? `INSERT INTO loans_new (id, name, initial_balance, start_date, notes, loan_type, is_paid_off, estimated_months_left, created_at, updated_at)
                   SELECT id, name, initial_balance, start_date, notes, loan_type, is_paid_off, estimated_months_left, created_at, updated_at
                   FROM loans`
                : `INSERT INTO loans_new (id, name, initial_balance, start_date, notes, loan_type, is_paid_off, created_at, updated_at)
                   SELECT id, name, initial_balance, start_date, notes, loan_type, is_paid_off, created_at, updated_at
                   FROM loans`;

              db.run(insertSql, function(err) {
                if (err) {
                  db.run('ROLLBACK');
                  enableForeignKeys(db).catch(() => {});
                  return reject(err);
                }

                logger.info(`Copied ${this.changes} loan records to new table`);

                // Drop old table - FK constraints are OFF so this won't cascade delete loan_balances
                db.run('DROP TABLE loans', (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    enableForeignKeys(db).catch(() => {});
                    return reject(err);
                  }

                  // Rename new table
                  db.run('ALTER TABLE loans_new RENAME TO loans', (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      enableForeignKeys(db).catch(() => {});
                      return reject(err);
                    }

                    logger.info('Updated loans table with mortgage fields');

                    // Recreate indexes
                    db.run('CREATE INDEX IF NOT EXISTS idx_loans_paid_off ON loans(is_paid_off)', (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        enableForeignKeys(db).catch(() => {});
                        return reject(err);
                      }

                      db.run('CREATE INDEX IF NOT EXISTS idx_loans_loan_type ON loans(loan_type)', (err) => {
                        if (err) {
                          db.run('ROLLBACK');
                          enableForeignKeys(db).catch(() => {});
                          return reject(err);
                        }

                        // Mark migration as applied and commit
                        markMigrationApplied(db, migrationName).then(() => {
                          db.run('COMMIT', (err) => {
                            // Re-enable foreign keys after commit
                            enableForeignKeys(db).catch(() => {});
                            if (err) {
                              db.run('ROLLBACK');
                              return reject(err);
                            }
                            logger.info(`Migration "${migrationName}" completed successfully`);
                            resolve();
                          });
                        }).catch((err) => {
                          enableForeignKeys(db).catch(() => {});
                          reject(err);
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
 * Migration: Add dismissed_anomalies table for persisting anomaly dismissals
 */
async function migrateAddDismissedAnomaliesTable(db) {
  const migrationName = 'add_dismissed_anomalies_table_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    logger.info(`Migration "${migrationName}" already applied, skipping`);
    return;
  }

  logger.info(`Running migration: ${migrationName}`);

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Create dismissed_anomalies table
        db.run(`
          CREATE TABLE IF NOT EXISTS dismissed_anomalies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            expense_id INTEGER NOT NULL,
            dismissed_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(expense_id),
            FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
          )
        `, (err) => {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }

          logger.info('Created dismissed_anomalies table');

          // Create index for faster lookups
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_dismissed_anomalies_expense_id 
            ON dismissed_anomalies(expense_id)
          `, (err) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            // Mark migration as applied and commit
            markMigrationApplied(db, migrationName).then(() => {
              db.run('COMMIT', (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                logger.info(`Migration "${migrationName}" completed successfully`);
                resolve();
              });
            }).catch(reject);
          });
        });
      });
    });
  });
}

/**
 * Migration: Add mortgage_payments table for tracking payment amounts over time
 * This table stores user-entered payment amounts with effective dates for mortgage insights
 */
async function migrateAddMortgagePaymentsTable(db) {
  const migrationName = 'add_mortgage_payments_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    logger.info(`Migration "${migrationName}" already applied, skipping`);
    return;
  }

  logger.info(`Running migration: ${migrationName}`);

  // Create backup
  await createBackup();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Create mortgage_payments table
        db.run(`
          CREATE TABLE IF NOT EXISTS mortgage_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            loan_id INTEGER NOT NULL,
            payment_amount REAL NOT NULL,
            effective_date TEXT NOT NULL,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
          )
        `, (err) => {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }

          logger.info('Created mortgage_payments table');

          // Create index for loan_id lookups
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_mortgage_payments_loan_id 
            ON mortgage_payments(loan_id)
          `, (err) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            // Create composite index for loan_id and effective_date
            db.run(`
              CREATE INDEX IF NOT EXISTS idx_mortgage_payments_loan_effective_date 
              ON mortgage_payments(loan_id, effective_date)
            `, (err) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }

              // Mark migration as applied and commit
              markMigrationApplied(db, migrationName).then(() => {
                db.run('COMMIT', (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  logger.info(`Migration "${migrationName}" completed successfully`);
                  resolve();
                });
              }).catch((err) => {
                db.run('ROLLBACK');
                reject(err);
              });
            });
          });
        });
      });
    });
  });
}

/**
 * Migration: Fix invoice file paths from old 'uploads/' structure to new '/config/invoices/' structure
 * This handles backups created with older versions that stored invoices in backend/uploads/
 */
async function migrateFixInvoiceFilePaths(db) {
  const migrationName = 'fix_invoice_file_paths_v1';
  
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    logger.debug(`Migration "${migrationName}" already applied, skipping`);
    return;
  }

  // Check if expense_invoices table exists
  const tableExists = await new Promise((resolve, reject) => {
    db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='expense_invoices'",
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });

  if (!tableExists) {
    logger.debug('expense_invoices table does not exist, skipping path migration');
    await markMigrationApplied(db, migrationName);
    return;
  }

  // Check if there are any records with old 'uploads/' paths
  const oldPathCount = await new Promise((resolve, reject) => {
    db.get(
      "SELECT COUNT(*) as count FROM expense_invoices WHERE file_path LIKE 'uploads/%'",
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.count : 0);
      }
    );
  });

  if (oldPathCount === 0) {
    logger.debug('No invoice records with old paths found, skipping');
    await markMigrationApplied(db, migrationName);
    return;
  }

  logger.info(`Running migration: ${migrationName} (${oldPathCount} records to update)`);

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Update file_path from 'uploads/xxx' to just 'xxx' (the filename)
        // The old format stored 'uploads/hashname' but the new format stores
        // paths relative to baseInvoiceDir. Since the files are now in the root
        // of the invoices directory, we just need the filename.
        db.run(
          `UPDATE expense_invoices 
           SET file_path = SUBSTR(file_path, 9) 
           WHERE file_path LIKE 'uploads/%'`,
          function(err) {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            const updatedCount = this.changes;
            logger.info(`Updated ${updatedCount} invoice file paths`);

            db.run('COMMIT', async (err) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }

              try {
                await markMigrationApplied(db, migrationName);
                logger.info(`Migration "${migrationName}" completed successfully`);
                resolve();
              } catch (markErr) {
                reject(markErr);
              }
            });
          }
        );
      });
    });
  });
}

/**
 * Migration: Add configurable payment methods tables
 * Creates payment_methods, credit_card_payments, and credit_card_statements tables
 * Adds payment_method_id foreign key to expenses and fixed_expenses tables
 * Migrates existing payment method strings to the new table
 * Removes CHECK constraint on method column to allow dynamic payment methods
 */
async function migrateConfigurablePaymentMethods(db) {
  const migrationName = 'configurable_payment_methods_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    logger.info(`Migration "${migrationName}" already applied, skipping`);
    return;
  }

  logger.info(`Running migration: ${migrationName}`);

  // Create backup
  await createBackup();

  // Define explicit migration mapping for existing payment methods
  const migrationMapping = [
    { id: 1, oldValue: 'Cash', displayName: 'Cash', fullName: 'Cash', type: 'cash' },
    { id: 2, oldValue: 'Debit', displayName: 'Debit', fullName: 'Debit', type: 'debit' },
    { id: 3, oldValue: 'Cheque', displayName: 'Cheque', fullName: 'Cheque', type: 'cheque' },
    { id: 4, oldValue: 'CIBC MC', displayName: 'CIBC MC', fullName: 'CIBC Mastercard', type: 'credit_card' },
    { id: 5, oldValue: 'PCF MC', displayName: 'PCF MC', fullName: 'PCF Mastercard', type: 'credit_card' },
    { id: 6, oldValue: 'WS VISA', displayName: 'WS VISA', fullName: 'WealthSimple VISA', type: 'credit_card' },
    { id: 7, oldValue: 'VISA', displayName: 'RBC VISA', fullName: 'RBC VISA', type: 'credit_card' }
  ];

  // Disable foreign keys before table recreation
  await disableForeignKeys(db);

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', async (err) => {
        if (err) {
          enableForeignKeys(db).catch(() => {});
          return reject(err);
        }

        try {
          // 1. Create payment_methods table
          await runStatement(db, `
            CREATE TABLE IF NOT EXISTS payment_methods (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              type TEXT NOT NULL CHECK(type IN ('cash', 'cheque', 'debit', 'credit_card')),
              display_name TEXT NOT NULL UNIQUE,
              full_name TEXT,
              account_details TEXT,
              credit_limit REAL CHECK(credit_limit IS NULL OR credit_limit > 0),
              current_balance REAL DEFAULT 0 CHECK(current_balance >= 0),
              payment_due_day INTEGER CHECK(payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31)),
              billing_cycle_start INTEGER CHECK(billing_cycle_start IS NULL OR (billing_cycle_start >= 1 AND billing_cycle_start <= 31)),
              billing_cycle_end INTEGER CHECK(billing_cycle_end IS NULL OR (billing_cycle_end >= 1 AND billing_cycle_end <= 31)),
              is_active INTEGER DEFAULT 1,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `);
          logger.info('Created payment_methods table');

          // Create indexes for payment_methods
          await runStatement(db, 'CREATE INDEX IF NOT EXISTS idx_payment_methods_type ON payment_methods(type)');
          await runStatement(db, 'CREATE INDEX IF NOT EXISTS idx_payment_methods_display_name ON payment_methods(display_name)');
          await runStatement(db, 'CREATE INDEX IF NOT EXISTS idx_payment_methods_is_active ON payment_methods(is_active)');
          logger.info('Created payment_methods indexes');

          // 2. Create credit_card_payments table
          await runStatement(db, `
            CREATE TABLE IF NOT EXISTS credit_card_payments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              payment_method_id INTEGER NOT NULL,
              amount REAL NOT NULL CHECK(amount > 0),
              payment_date TEXT NOT NULL,
              notes TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
            )
          `);
          logger.info('Created credit_card_payments table');

          // Create indexes for credit_card_payments
          await runStatement(db, 'CREATE INDEX IF NOT EXISTS idx_cc_payments_method_id ON credit_card_payments(payment_method_id)');
          await runStatement(db, 'CREATE INDEX IF NOT EXISTS idx_cc_payments_date ON credit_card_payments(payment_date)');
          logger.info('Created credit_card_payments indexes');

          // 3. Create credit_card_statements table
          await runStatement(db, `
            CREATE TABLE IF NOT EXISTS credit_card_statements (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              payment_method_id INTEGER NOT NULL,
              statement_date TEXT NOT NULL,
              statement_period_start TEXT NOT NULL,
              statement_period_end TEXT NOT NULL,
              filename TEXT NOT NULL,
              original_filename TEXT NOT NULL,
              file_path TEXT NOT NULL,
              file_size INTEGER NOT NULL,
              mime_type TEXT NOT NULL DEFAULT 'application/pdf',
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
            )
          `);
          logger.info('Created credit_card_statements table');

          // Create indexes for credit_card_statements
          await runStatement(db, 'CREATE INDEX IF NOT EXISTS idx_cc_statements_method_id ON credit_card_statements(payment_method_id)');
          await runStatement(db, 'CREATE INDEX IF NOT EXISTS idx_cc_statements_date ON credit_card_statements(statement_date)');
          logger.info('Created credit_card_statements indexes');

          // 4. Insert payment methods with explicit IDs
          for (const mapping of migrationMapping) {
            await runStatement(db, 
              `INSERT INTO payment_methods (id, type, display_name, full_name, is_active) 
               VALUES (?, ?, ?, ?, 1)`,
              [mapping.id, mapping.type, mapping.displayName, mapping.fullName]
            );
          }
          logger.info(`Inserted ${migrationMapping.length} payment methods`);

          // 5. Recreate expenses table without CHECK constraint on method column
          // This allows dynamic payment methods instead of hardcoded values
          const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
          
          await runStatement(db, `
            CREATE TABLE expenses_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              date TEXT NOT NULL,
              place TEXT,
              notes TEXT,
              amount REAL NOT NULL,
              type TEXT NOT NULL CHECK(type IN (${categoryList})),
              week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
              method TEXT NOT NULL,
              payment_method_id INTEGER REFERENCES payment_methods(id),
              insurance_eligible INTEGER DEFAULT 0,
              claim_status TEXT DEFAULT NULL CHECK(claim_status IS NULL OR claim_status IN ('not_claimed', 'in_progress', 'paid', 'denied')),
              original_cost REAL DEFAULT NULL,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `);
          
          // Copy data from old table, updating VISA to RBC VISA
          await runStatement(db, `
            INSERT INTO expenses_new (id, date, place, notes, amount, type, week, method, insurance_eligible, claim_status, original_cost, created_at)
            SELECT id, date, place, notes, amount, type, week, 
                   CASE WHEN method = 'VISA' THEN 'RBC VISA' ELSE method END,
                   COALESCE(insurance_eligible, 0), claim_status, original_cost, 
                   COALESCE(created_at, CURRENT_TIMESTAMP)
            FROM expenses
          `);
          
          // Drop old table and rename new one
          await runStatement(db, 'DROP TABLE expenses');
          await runStatement(db, 'ALTER TABLE expenses_new RENAME TO expenses');
          logger.info('Recreated expenses table without method CHECK constraint');

          // Recreate indexes for expenses
          await runStatement(db, 'CREATE INDEX IF NOT EXISTS idx_date ON expenses(date)');
          await runStatement(db, 'CREATE INDEX IF NOT EXISTS idx_type ON expenses(type)');
          await runStatement(db, 'CREATE INDEX IF NOT EXISTS idx_method ON expenses(method)');
          await runStatement(db, 'CREATE INDEX IF NOT EXISTS idx_expenses_insurance_eligible ON expenses(insurance_eligible)');
          await runStatement(db, 'CREATE INDEX IF NOT EXISTS idx_expenses_claim_status ON expenses(claim_status)');
          await runStatement(db, 'CREATE INDEX IF NOT EXISTS idx_expenses_payment_method_id ON expenses(payment_method_id)');
          logger.info('Recreated expenses indexes');

          // 6. Populate payment_method_id for expenses based on method string
          for (const mapping of migrationMapping) {
            const methodToMatch = mapping.oldValue === 'VISA' ? 'RBC VISA' : mapping.oldValue;
            await runStatement(db,
              'UPDATE expenses SET payment_method_id = ? WHERE method = ?',
              [mapping.id, methodToMatch]
            );
          }
          logger.info('Populated payment_method_id for existing expenses');

          // 7. Add payment_method_id column to fixed_expenses table
          await runStatement(db, 'ALTER TABLE fixed_expenses ADD COLUMN payment_method_id INTEGER REFERENCES payment_methods(id)');
          await runStatement(db, 'CREATE INDEX IF NOT EXISTS idx_fixed_expenses_payment_method_id ON fixed_expenses(payment_method_id)');
          logger.info('Added payment_method_id column to fixed_expenses table');

          // 8. Populate payment_method_id for fixed_expenses based on payment_type string
          // First, handle standard payment methods
          for (const mapping of migrationMapping) {
            await runStatement(db,
              'UPDATE fixed_expenses SET payment_method_id = ? WHERE payment_type = ?',
              [mapping.id, mapping.oldValue]
            );
          }
          
          // Handle legacy payment types that were used before standardization
          // Map legacy values to appropriate standard payment methods:
          // - "Auto-Pay" -> Debit (id=2) - typically bank auto-withdrawals
          // - "Credit Card" -> CIBC MC (id=4) - generic credit card reference
          const legacyMapping = [
            { oldValue: 'Auto-Pay', newId: 2, newDisplayName: 'Debit' },
            { oldValue: 'Credit Card', newId: 4, newDisplayName: 'CIBC MC' },
            { oldValue: 'Fixed', newId: 2, newDisplayName: 'Debit' }  // Another legacy value
          ];
          
          for (const legacy of legacyMapping) {
            await runStatement(db,
              'UPDATE fixed_expenses SET payment_method_id = ?, payment_type = ? WHERE payment_type = ?',
              [legacy.newId, legacy.newDisplayName, legacy.oldValue]
            );
          }
          logger.info('Populated payment_method_id for existing fixed_expenses (including legacy values)');

          // 9. Update display names where they changed (VISA → RBC VISA) in fixed_expenses
          await runStatement(db,
            'UPDATE fixed_expenses SET payment_type = ? WHERE payment_type = ?',
            ['RBC VISA', 'VISA']
          );
          logger.info('Updated VISA to RBC VISA in fixed_expenses');

          // 10. Calculate and set initial balances for credit cards based on existing expenses
          // Get all credit card payment methods
          const creditCards = await new Promise((resolve, reject) => {
            db.all(
              'SELECT id, display_name FROM payment_methods WHERE type = "credit_card"',
              (err, rows) => err ? reject(err) : resolve(rows || [])
            );
          });

          for (const card of creditCards) {
            // Sum expenses for this card (payments table is empty at migration time)
            // Only include expenses dated today or earlier (exclude future pre-logged expenses)
            const todayForBalance = new Date();
            const todayStrForBalance = `${todayForBalance.getFullYear()}-${String(todayForBalance.getMonth() + 1).padStart(2, '0')}-${String(todayForBalance.getDate()).padStart(2, '0')}`;
            const expenseResult = await new Promise((resolve, reject) => {
              db.get(
                'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE payment_method_id = ? AND date <= ?',
                [card.id, todayStrForBalance],
                (err, row) => err ? reject(err) : resolve(row)
              );
            });
            
            const balance = Math.round((expenseResult?.total || 0) * 100) / 100;
            
            if (balance > 0) {
              await runStatement(db,
                'UPDATE payment_methods SET current_balance = ? WHERE id = ?',
                [balance, card.id]
              );
              logger.info(`Set initial balance for ${card.display_name}: $${balance.toFixed(2)} (excluding future expenses)`);
            }
          }
          logger.info('Calculated initial credit card balances from existing expenses (excluding future-dated)');

          // Mark migration as applied
          await markMigrationApplied(db, migrationName);

          // Commit transaction
          db.run('COMMIT', (err) => {
            enableForeignKeys(db).catch(() => {});
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }
            logger.info(`Migration "${migrationName}" completed successfully`);
            resolve();
          });
        } catch (error) {
          db.run('ROLLBACK');
          enableForeignKeys(db).catch(() => {});
          logger.error(`Migration "${migrationName}" failed:`, error);
          reject(error);
        }
      });
    });
  });
}

/**
 * Migration: Add posted_date column to expenses table
 * This allows distinguishing between transaction date and credit card posting date
 * for accurate balance calculations when pre-logging future expenses.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
async function migrateAddPostedDate(db) {
  const migrationName = 'add_posted_date_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    logger.info(`Migration "${migrationName}" already applied, skipping`);
    return;
  }

  logger.info(`Running migration: ${migrationName}`);

  // Create backup
  await createBackup();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Check if posted_date column already exists
        db.all('PRAGMA table_info(expenses)', (err, columns) => {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }

          const hasPostedDate = columns.some(col => col.name === 'posted_date');

          if (hasPostedDate) {
            logger.info('expenses table already has posted_date column');
            markMigrationApplied(db, migrationName).then(() => {
              db.run('COMMIT', (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                logger.info(`Migration "${migrationName}" completed successfully`);
                resolve();
              });
            }).catch(reject);
            return;
          }

          // Add posted_date column (nullable, no default)
          db.run(
            'ALTER TABLE expenses ADD COLUMN posted_date TEXT DEFAULT NULL',
            (err) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }
              
              logger.info('Added posted_date column to expenses table');

              // Create index for query performance
              db.run(
                'CREATE INDEX IF NOT EXISTS idx_expenses_posted_date ON expenses(posted_date)',
                (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }

                  logger.info('Created index idx_expenses_posted_date');

                  // Mark migration as applied and commit
                  markMigrationApplied(db, migrationName).then(() => {
                    db.run('COMMIT', (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      logger.info(`Migration "${migrationName}" completed successfully`);
                      resolve();
                    });
                  }).catch(reject);
                }
              );
            }
          );
        });
      });
    });
  });
}

/**
 * Helper function to run a SQL statement as a promise
 */
function runStatement(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

/**
 * Migration: Add fixed_interest_rate column to loans table
 * 
 * This adds support for fixed interest rate loans where the rate doesn't change.
 * When a loan has a fixed_interest_rate set, balance entries can auto-populate
 * the rate field, simplifying data entry.
 * 
 * Requirements: 1.1, 1.5
 */
async function migrateAddFixedInterestRate(db) {
  const migrationName = 'add_fixed_interest_rate_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    logger.info(`Migration "${migrationName}" already applied, skipping`);
    return;
  }

  logger.info(`Running migration: ${migrationName}`);

  // Create backup
  await createBackup();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Check if fixed_interest_rate column already exists
        db.all('PRAGMA table_info(loans)', (err, columns) => {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }

          const hasFixedInterestRate = columns.some(col => col.name === 'fixed_interest_rate');

          if (hasFixedInterestRate) {
            logger.info('loans table already has fixed_interest_rate column');
            markMigrationApplied(db, migrationName).then(() => {
              db.run('COMMIT', (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                logger.info(`Migration "${migrationName}" completed successfully`);
                resolve();
              });
            }).catch(reject);
            return;
          }

          // Add fixed_interest_rate column (nullable, defaults to NULL)
          db.run(
            'ALTER TABLE loans ADD COLUMN fixed_interest_rate REAL DEFAULT NULL',
            (err) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }
              
              logger.info('Added fixed_interest_rate column to loans table');

              // Mark migration as applied and commit
              markMigrationApplied(db, migrationName).then(() => {
                db.run('COMMIT', (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  logger.info(`Migration "${migrationName}" completed successfully`);
                  resolve();
                });
              }).catch(reject);
            }
          );
        });
      });
    });
  });
}

/**
 * Migration: Add billing_cycle_day column to payment_methods table
 * This simplifies billing cycle configuration by using a single day value
 * instead of separate start/end values
 */
async function migrateAddBillingCycleDayColumn(db) {
  const migrationName = 'add_billing_cycle_day_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    logger.info(`Migration "${migrationName}" already applied, skipping`);
    return;
  }

  logger.info(`Running migration: ${migrationName}`);

  // Create backup
  await createBackup();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Check if billing_cycle_day column already exists
        db.all('PRAGMA table_info(payment_methods)', (err, columns) => {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }

          const hasBillingCycleDay = columns.some(col => col.name === 'billing_cycle_day');

          if (hasBillingCycleDay) {
            logger.info('payment_methods table already has billing_cycle_day column');
            markMigrationApplied(db, migrationName).then(() => {
              db.run('COMMIT', (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                logger.info(`Migration "${migrationName}" completed successfully`);
                resolve();
              });
            }).catch(reject);
            return;
          }

          // Add billing_cycle_day column (nullable, with CHECK constraint 1-31)
          db.run(
            'ALTER TABLE payment_methods ADD COLUMN billing_cycle_day INTEGER CHECK(billing_cycle_day IS NULL OR (billing_cycle_day >= 1 AND billing_cycle_day <= 31))',
            (err) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }
              
              logger.info('Added billing_cycle_day column to payment_methods table');

              // Migrate existing data: copy billing_cycle_end to billing_cycle_day for credit cards
              // billing_cycle_end represents when the statement closes, which is what billing_cycle_day represents
              db.run(
                `UPDATE payment_methods 
                 SET billing_cycle_day = billing_cycle_end 
                 WHERE type = 'credit_card' 
                   AND billing_cycle_end IS NOT NULL 
                   AND billing_cycle_day IS NULL`,
                function(err) {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  
                  if (this.changes > 0) {
                    logger.info(`Migrated billing_cycle_end to billing_cycle_day for ${this.changes} credit cards`);
                  }

                  // Mark migration as applied and commit
                  markMigrationApplied(db, migrationName).then(() => {
                    db.run('COMMIT', (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      logger.info(`Migration "${migrationName}" completed successfully`);
                      resolve();
                    });
                  }).catch(reject);
                }
              );
            }
          );
        });
      });
    });
  });
}

/**
 * Migration: Add credit_card_billing_cycles table
 * Stores actual statement balances per billing cycle for reconciliation
 */
async function migrateAddBillingCyclesTable(db) {
  const migrationName = 'add_billing_cycles_table_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    logger.info(`Migration "${migrationName}" already applied, skipping`);
    return;
  }

  logger.info(`Running migration: ${migrationName}`);

  // Create backup
  await createBackup();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Create credit_card_billing_cycles table
        db.run(`
          CREATE TABLE IF NOT EXISTS credit_card_billing_cycles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payment_method_id INTEGER NOT NULL,
            cycle_start_date TEXT NOT NULL,
            cycle_end_date TEXT NOT NULL,
            actual_statement_balance REAL NOT NULL CHECK(actual_statement_balance >= 0),
            calculated_statement_balance REAL NOT NULL CHECK(calculated_statement_balance >= 0),
            minimum_payment REAL CHECK(minimum_payment IS NULL OR minimum_payment >= 0),
            due_date TEXT,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE,
            UNIQUE(payment_method_id, cycle_end_date)
          )
        `, (err) => {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }

          logger.info('Created credit_card_billing_cycles table');

          // Create indexes for efficient querying
          db.run('CREATE INDEX IF NOT EXISTS idx_billing_cycles_payment_method ON credit_card_billing_cycles(payment_method_id)', (err) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            db.run('CREATE INDEX IF NOT EXISTS idx_billing_cycles_cycle_end ON credit_card_billing_cycles(cycle_end_date)', (err) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }

              db.run('CREATE INDEX IF NOT EXISTS idx_billing_cycles_pm_cycle_end ON credit_card_billing_cycles(payment_method_id, cycle_end_date)', (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }

                logger.info('Created indexes for credit_card_billing_cycles table');

                // Create trigger for updated_at
                db.run(`
                  CREATE TRIGGER IF NOT EXISTS update_billing_cycles_timestamp 
                  AFTER UPDATE ON credit_card_billing_cycles
                  BEGIN
                    UPDATE credit_card_billing_cycles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                  END
                `, (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }

                  logger.info('Created updated_at trigger for credit_card_billing_cycles table');

                  // Mark migration as applied and commit
                  markMigrationApplied(db, migrationName).then(() => {
                    db.run('COMMIT', (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      logger.info(`Migration "${migrationName}" completed successfully`);
                      resolve();
                    });
                  }).catch((err) => {
                    db.run('ROLLBACK');
                    reject(err);
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
  logger.info('Checking for pending migrations');
  
  try {
    await migrateExpandCategories(db);
    await migrateAddClothingCategory(db);
    await migrateRemoveRecurringExpenses(db);
    await migrateFixCategoryConstraints(db);
    await migrateAddPersonalCareCategory(db);
    await migrateAddCategoryAndPaymentTypeToFixedExpenses(db);
    await migrateAddIncomeCategoryColumn(db);
    await migrateAddInvestmentTables(db);
    await migrateAddPeopleTables(db);
    await migrateAddPerformanceIndexes(db);
    await migrateAddExpenseInvoicesTable(db);
    await migrateMultiInvoiceSupport(db);
    await migrateLinkInvoicesToSinglePerson(db);
    await migrateAddInsuranceFieldsToExpenses(db);
    await migrateAddOriginalAmountToExpensePeople(db);
    await migrateAddDismissedAnomaliesTable(db);
    await migrateAddMortgageFields(db);
    await migrateAddMortgagePaymentsTable(db);
    await migrateFixInvoiceFilePaths(db);
    await migrateConfigurablePaymentMethods(db);
    await migrateAddPostedDate(db);
    await migrateAddFixedInterestRate(db);
    await migrateAddBillingCycleDayColumn(db);
    await migrateAddBillingCyclesTable(db);
    logger.info('All migrations completed');
  } catch (error) {
    logger.error('Migration failed:', error.message);
    throw error;
  }
}

module.exports = {
  runMigrations,
  checkMigrationApplied,
  markMigrationApplied,
  migrateAddPeopleTables,
  migrateAddExpenseInvoicesTable,
  migrateMultiInvoiceSupport,
  migrateLinkInvoicesToSinglePerson,
  migrateAddInsuranceFieldsToExpenses,
  migrateAddOriginalAmountToExpensePeople,
  migrateAddDismissedAnomaliesTable,
  migrateAddMortgageFields,
  migrateAddMortgagePaymentsTable,
  migrateConfigurablePaymentMethods,
  migrateAddPostedDate,
  migrateAddFixedInterestRate,
  migrateAddBillingCycleDayColumn,
  migrateAddBillingCyclesTable
};
