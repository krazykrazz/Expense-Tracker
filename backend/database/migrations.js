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
 * Run all pending migrations
 */
async function runMigrations(db) {
  console.log('\n--- Checking for pending migrations ---');
  
  try {
    await migrateExpandCategories(db);
    await migrateAddClothingCategory(db);
    await migrateRemoveRecurringExpenses(db);
    await migrateFixCategoryConstraints(db);
    await migrateAddPersonalCareCategory(db);
    await migrateAddCategoryAndPaymentTypeToFixedExpenses(db);
    await migrateAddIncomeCategoryColumn(db);
    await migrateAddInvestmentTables(db);
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
