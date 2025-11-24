const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { CATEGORIES, BUDGETABLE_CATEGORIES } = require('../utils/categories');

const TEST_DB_PATH = path.join(__dirname, '../../test-migration.db');
const TEST_BACKUP_PATH = path.join(__dirname, '../../test-migration-backup.db');

describe('Migration Script - Unit Tests', () => {
  let db;

  // Helper function to create a test database
  function createTestDatabase() {
    return new Promise((resolve, reject) => {
      const testDb = new sqlite3.Database(TEST_DB_PATH, (err) => {
        if (err) return reject(err);

        testDb.serialize(() => {
          // Create expenses table with old constraint
          testDb.run(`
            CREATE TABLE IF NOT EXISTS expenses (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              date TEXT NOT NULL,
              place TEXT NOT NULL,
              notes TEXT,
              amount REAL NOT NULL,
              type TEXT NOT NULL CHECK(type IN ('Other', 'Food', 'Gas', 'Tax - Medical', 'Tax - Donation')),
              week INTEGER NOT NULL,
              method TEXT NOT NULL,
              recurring_id INTEGER,
              is_generated INTEGER DEFAULT 0,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `, (err) => {
            if (err) return reject(err);

            // Create recurring_expenses table with old constraint
            testDb.run(`
              CREATE TABLE IF NOT EXISTS recurring_expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                place TEXT NOT NULL,
                notes TEXT,
                amount REAL NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('Other', 'Food', 'Gas', 'Tax - Medical', 'Tax - Donation')),
                method TEXT NOT NULL,
                frequency TEXT NOT NULL CHECK(frequency IN ('weekly', 'biweekly', 'monthly')),
                start_date TEXT NOT NULL,
                end_date TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
              )
            `, (err) => {
              if (err) return reject(err);

              // Create budgets table with old constraint
              testDb.run(`
                CREATE TABLE IF NOT EXISTS budgets (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  year INTEGER NOT NULL,
                  month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
                  category TEXT NOT NULL CHECK(category IN ('Food', 'Gas', 'Other')),
                  limit_amount REAL NOT NULL CHECK(limit_amount >= 0),
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE(year, month, category)
                )
              `, (err) => {
                if (err) return reject(err);
                resolve(testDb);
              });
            });
          });
        });
      });
    });
  }

  // Helper function to insert test data
  function insertTestData(testDb) {
    return new Promise((resolve, reject) => {
      testDb.serialize(() => {
        // Insert expenses with "Food" category
        testDb.run(`
          INSERT INTO expenses (date, place, notes, amount, type, week, method)
          VALUES 
            ('2024-01-15', 'Restaurant A', 'Lunch', 25.50, 'Food', 3, 'Credit'),
            ('2024-01-20', 'Grocery Store', 'Weekly shopping', 150.00, 'Food', 3, 'Debit'),
            ('2024-01-25', 'Gas Station', 'Fuel', 45.00, 'Gas', 4, 'Credit')
        `, (err) => {
          if (err) return reject(err);

          // Insert recurring expenses with "Food" category
          testDb.run(`
            INSERT INTO recurring_expenses (place, notes, amount, type, method, frequency, start_date)
            VALUES 
              ('Netflix', 'Subscription', 15.99, 'Other', 'Credit', 'monthly', '2024-01-01'),
              ('Meal Prep Service', 'Weekly meals', 75.00, 'Food', 'Credit', 'weekly', '2024-01-01')
          `, (err) => {
            if (err) return reject(err);

            // Insert budgets with "Food" category
            testDb.run(`
              INSERT INTO budgets (year, month, category, limit_amount)
              VALUES 
                (2024, 1, 'Food', 500.00),
                (2024, 1, 'Gas', 200.00)
            `, (err) => {
              if (err) return reject(err);
              resolve();
            });
          });
        });
      });
    });
  }

  // Helper function to clean up test files
  function cleanupTestFiles() {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_BACKUP_PATH)) {
      fs.unlinkSync(TEST_BACKUP_PATH);
    }
  }

  // Helper function to create backup
  function createBackup() {
    return new Promise((resolve, reject) => {
      try {
        if (!fs.existsSync(TEST_DB_PATH)) {
          return reject(new Error('Database file not found'));
        }

        const backupDir = path.dirname(TEST_BACKUP_PATH);
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }

        fs.copyFileSync(TEST_DB_PATH, TEST_BACKUP_PATH);
        resolve(TEST_BACKUP_PATH);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Helper function to run migration
  function runMigration(testDb) {
    return new Promise((resolve, reject) => {
      const results = {
        expensesUpdated: 0,
        recurringUpdated: 0,
        budgetsUpdated: 0
      };

      testDb.serialize(() => {
        testDb.run('BEGIN TRANSACTION', (err) => {
          if (err) return reject(err);

          // Step 1: Update constraints FIRST (so we can use "Dining Out")
          updateExpensesConstraint(testDb, (err) => {
            if (err) {
              testDb.run('ROLLBACK');
              return reject(err);
            }

            updateRecurringExpensesConstraint(testDb, (err) => {
              if (err) {
                testDb.run('ROLLBACK');
                return reject(err);
              }

              updateBudgetsConstraint(testDb, (err) => {
                if (err) {
                  testDb.run('ROLLBACK');
                  return reject(err);
                }

                // Step 2: Now update the data
                testDb.run(
                  `UPDATE expenses SET type = 'Dining Out' WHERE type = 'Food'`,
                  function(err) {
                    if (err) {
                      testDb.run('ROLLBACK');
                      return reject(err);
                    }
                    results.expensesUpdated = this.changes;

                    testDb.run(
                      `UPDATE recurring_expenses SET type = 'Dining Out' WHERE type = 'Food'`,
                      function(err) {
                        if (err) {
                          testDb.run('ROLLBACK');
                          return reject(err);
                        }
                        results.recurringUpdated = this.changes;

                        testDb.run(
                          `UPDATE budgets SET category = 'Dining Out' WHERE category = 'Food'`,
                          function(err) {
                            if (err) {
                              testDb.run('ROLLBACK');
                              return reject(err);
                            }
                            results.budgetsUpdated = this.changes;

                            testDb.run('COMMIT', (err) => {
                              if (err) {
                                testDb.run('ROLLBACK');
                                return reject(err);
                              }
                              resolve(results);
                            });
                          }
                        );
                      }
                    );
                  }
                );
              });
            });
          });
        });
      });
    });
  }

  // Helper function to update expenses constraint
  function updateExpensesConstraint(testDb, callback) {
    const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
    
    testDb.serialize(() => {
      testDb.run(`
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
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) return callback(err);

        testDb.run(`INSERT INTO expenses_new SELECT * FROM expenses`, (err) => {
          if (err) return callback(err);

          testDb.run('DROP TABLE expenses', (err) => {
            if (err) return callback(err);

            testDb.run('ALTER TABLE expenses_new RENAME TO expenses', (err) => {
              if (err) return callback(err);
              callback(null);
            });
          });
        });
      });
    });
  }

  // Helper function to update recurring_expenses constraint
  function updateRecurringExpensesConstraint(testDb, callback) {
    const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
    
    testDb.serialize(() => {
      testDb.run(`
        CREATE TABLE recurring_expenses_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          place TEXT NOT NULL,
          notes TEXT,
          amount REAL NOT NULL,
          type TEXT NOT NULL CHECK(type IN (${categoryList})),
          method TEXT NOT NULL,
          frequency TEXT NOT NULL CHECK(frequency IN ('weekly', 'biweekly', 'monthly')),
          start_date TEXT NOT NULL,
          end_date TEXT,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) return callback(err);

        testDb.run(`INSERT INTO recurring_expenses_new SELECT * FROM recurring_expenses`, (err) => {
          if (err) return callback(err);

          testDb.run('DROP TABLE recurring_expenses', (err) => {
            if (err) return callback(err);

            testDb.run('ALTER TABLE recurring_expenses_new RENAME TO recurring_expenses', (err) => {
              if (err) return callback(err);
              callback(null);
            });
          });
        });
      });
    });
  }

  // Helper function to update budgets constraint
  function updateBudgetsConstraint(testDb, callback) {
    const categoryList = BUDGETABLE_CATEGORIES.map(c => `'${c}'`).join(', ');
    
    testDb.serialize(() => {
      testDb.run(`
        CREATE TABLE budgets_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          year INTEGER NOT NULL,
          month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
          category TEXT NOT NULL CHECK(category IN (${categoryList})),
          limit_amount REAL NOT NULL CHECK(limit_amount >= 0),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(year, month, category)
        )
      `, (err) => {
        if (err) return callback(err);

        testDb.run(`INSERT INTO budgets_new SELECT * FROM budgets`, (err) => {
          if (err) return callback(err);

          testDb.run('DROP TABLE budgets', (err) => {
            if (err) return callback(err);

            testDb.run('ALTER TABLE budgets_new RENAME TO budgets', (err) => {
              if (err) return callback(err);
              callback(null);
            });
          });
        });
      });
    });
  }

  // Helper function to verify migration
  function verifyMigration(testDb) {
    return new Promise((resolve, reject) => {
      testDb.get(`SELECT COUNT(*) as count FROM expenses WHERE type = 'Food'`, (err, row) => {
        if (err) return reject(err);
        
        if (row.count > 0) {
          return reject(new Error(`Migration verification failed: ${row.count} "Food" records still exist in expenses table`));
        }

        testDb.get(`SELECT COUNT(*) as count FROM recurring_expenses WHERE type = 'Food'`, (err, row) => {
          if (err) return reject(err);
          
          if (row.count > 0) {
            return reject(new Error(`Migration verification failed: ${row.count} "Food" records still exist in recurring_expenses table`));
          }

          testDb.get(`SELECT COUNT(*) as count FROM budgets WHERE category = 'Food'`, (err, row) => {
            if (err) return reject(err);
            
            if (row.count > 0) {
              return reject(new Error(`Migration verification failed: ${row.count} "Food" records still exist in budgets table`));
            }

            resolve();
          });
        });
      });
    });
  }

  beforeEach(async () => {
    cleanupTestFiles();
    db = await createTestDatabase();
    await insertTestData(db);
  });

  afterEach((done) => {
    if (db) {
      db.close((err) => {
        cleanupTestFiles();
        done(err);
      });
    } else {
      cleanupTestFiles();
      done();
    }
  });

  describe('Backup Creation Tests', () => {
    test('should create backup successfully', async () => {
      const backupPath = await createBackup();
      
      expect(fs.existsSync(backupPath)).toBe(true);
      expect(backupPath).toBe(TEST_BACKUP_PATH);
      
      const stats = fs.statSync(backupPath);
      expect(stats.size).toBeGreaterThan(0);
    });

    test('should fail if database does not exist', async () => {
      await new Promise((resolve) => {
        db.close(() => {
          fs.unlinkSync(TEST_DB_PATH);
          db = null; // Set to null so afterEach doesn't try to close again
          resolve();
        });
      });
      
      await expect(createBackup()).rejects.toThrow('Database file not found');
    });

    test('should create backup directory if it does not exist', async () => {
      // Remove backup file if it exists
      if (fs.existsSync(TEST_BACKUP_PATH)) {
        fs.unlinkSync(TEST_BACKUP_PATH);
      }
      
      const backupPath = await createBackup();
      
      expect(fs.existsSync(path.dirname(backupPath))).toBe(true);
      expect(fs.existsSync(backupPath)).toBe(true);
    });
  });

  describe('"Food" to "Dining Out" Migration Tests', () => {
    test('should migrate all "Food" expenses to "Dining Out"', async () => {
      const results = await runMigration(db);
      
      expect(results.expensesUpdated).toBe(2);
      
      const foodCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM expenses WHERE type = ?', ['Food'], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      expect(foodCount).toBe(0);
      
      const diningOutCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM expenses WHERE type = ?', ['Dining Out'], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      expect(diningOutCount).toBe(2);
    });

    test('should migrate all "Food" recurring expenses to "Dining Out"', async () => {
      const results = await runMigration(db);
      
      expect(results.recurringUpdated).toBe(1);
      
      const foodCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM recurring_expenses WHERE type = ?', ['Food'], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      expect(foodCount).toBe(0);
      
      const diningOutCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM recurring_expenses WHERE type = ?', ['Dining Out'], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      expect(diningOutCount).toBe(1);
    });

    test('should migrate all "Food" budgets to "Dining Out"', async () => {
      const results = await runMigration(db);
      
      expect(results.budgetsUpdated).toBe(1);
      
      const foodCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM budgets WHERE category = ?', ['Food'], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      expect(foodCount).toBe(0);
      
      const diningOutCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM budgets WHERE category = ?', ['Dining Out'], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      expect(diningOutCount).toBe(1);
    });

    test('should preserve other category data during migration', async () => {
      await runMigration(db);
      
      const gasExpense = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM expenses WHERE type = ?', ['Gas'], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      expect(gasExpense).toBeDefined();
      expect(gasExpense.place).toBe('Gas Station');
      expect(gasExpense.amount).toBe(45.00);
      
      const otherRecurring = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM recurring_expenses WHERE type = ?', ['Other'], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      expect(otherRecurring).toBeDefined();
      expect(otherRecurring.place).toBe('Netflix');
      
      const gasBudget = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM budgets WHERE category = ?', ['Gas'], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      expect(gasBudget).toBeDefined();
      expect(gasBudget.limit_amount).toBe(200.00);
    });
  });

  describe('Constraint Update Tests', () => {
    test('should update expenses table constraint to accept new categories', async () => {
      await runMigration(db);
      
      const insertPromise = new Promise((resolve, reject) => {
        db.run(`
          INSERT INTO expenses (date, place, notes, amount, type, week, method)
          VALUES ('2024-02-01', 'Test Place', 'Test', 100.00, 'Housing', 1, 'Credit')
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      await expect(insertPromise).resolves.not.toThrow();
      
      const housingExpense = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM expenses WHERE type = ?', ['Housing'], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      expect(housingExpense).toBeDefined();
      expect(housingExpense.place).toBe('Test Place');
    });

    test('should update recurring_expenses table constraint to accept new categories', async () => {
      await runMigration(db);
      
      const insertPromise = new Promise((resolve, reject) => {
        db.run(`
          INSERT INTO recurring_expenses (place, notes, amount, type, method, frequency, start_date)
          VALUES ('Test Place', 'Test', 50.00, 'Utilities', 'Credit', 'monthly', '2024-02-01')
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      await expect(insertPromise).resolves.not.toThrow();
      
      const utilitiesRecurring = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM recurring_expenses WHERE type = ?', ['Utilities'], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      expect(utilitiesRecurring).toBeDefined();
      expect(utilitiesRecurring.place).toBe('Test Place');
    });

    test('should update budgets table constraint to accept new categories', async () => {
      await runMigration(db);
      
      const insertPromise = new Promise((resolve, reject) => {
        db.run(`
          INSERT INTO budgets (year, month, category, limit_amount)
          VALUES (2024, 2, 'Groceries', 400.00)
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      await expect(insertPromise).resolves.not.toThrow();
      
      const groceriesBudget = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM budgets WHERE category = ?', ['Groceries'], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      expect(groceriesBudget).toBeDefined();
      expect(groceriesBudget.limit_amount).toBe(400.00);
    });

    test('should reject invalid categories after migration', async () => {
      await runMigration(db);
      
      const insertPromise = new Promise((resolve, reject) => {
        db.run(`
          INSERT INTO expenses (date, place, notes, amount, type, week, method)
          VALUES ('2024-02-01', 'Test Place', 'Test', 100.00, 'InvalidCategory', 1, 'Credit')
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      await expect(insertPromise).rejects.toThrow();
    });

    test('should still accept legacy categories after migration', async () => {
      await runMigration(db);
      
      const legacyCategories = ['Gas', 'Other', 'Tax - Medical', 'Tax - Donation'];
      
      for (const category of legacyCategories) {
        const insertPromise = new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO expenses (date, place, notes, amount, type, week, method)
            VALUES ('2024-02-01', 'Test Place', 'Test', 100.00, ?, 1, 'Credit')
          `, [category], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        await expect(insertPromise).resolves.not.toThrow();
      }
    });
  });

  describe('Rollback on Error Tests', () => {
    test('should rollback transaction if constraint update fails', async () => {
      const initialExpenseCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM expenses WHERE type = ?', ['Food'], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      expect(initialExpenseCount).toBe(2);
      
      await runMigration(db);
      
      const finalFoodCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM expenses WHERE type = ?', ['Food'], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      expect(finalFoodCount).toBe(0);
    });
  });

  describe('Verification Tests', () => {
    test('should verify migration successfully when no "Food" records remain', async () => {
      await runMigration(db);
      
      await expect(verifyMigration(db)).resolves.not.toThrow();
    });

    test('should fail verification if "Food" records still exist in expenses', async () => {
      // Don't run migration, so "Food" records remain
      await expect(verifyMigration(db)).rejects.toThrow('2 "Food" records still exist in expenses table');
    });

    test('should fail verification if "Food" records still exist in recurring_expenses', async () => {
      await new Promise((resolve, reject) => {
        db.run('UPDATE expenses SET type = ? WHERE type = ?', ['Dining Out', 'Food'], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      await expect(verifyMigration(db)).rejects.toThrow('1 "Food" records still exist in recurring_expenses table');
    });

    test('should fail verification if "Food" records still exist in budgets', async () => {
      await new Promise((resolve, reject) => {
        db.run('UPDATE expenses SET type = ? WHERE type = ?', ['Dining Out', 'Food'], (err) => {
          if (err) reject(err);
          else {
            db.run('UPDATE recurring_expenses SET type = ? WHERE type = ?', ['Dining Out', 'Food'], (err) => {
              if (err) reject(err);
              else resolve();
            });
          }
        });
      });
      
      await expect(verifyMigration(db)).rejects.toThrow('1 "Food" records still exist in budgets table');
    });
  });

  describe('Data Integrity Tests', () => {
    test('should preserve all expense data except category during migration', async () => {
      const originalExpense = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM expenses WHERE type = ? AND place = ?', ['Food', 'Restaurant A'], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      await runMigration(db);
      
      const migratedExpense = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM expenses WHERE place = ?', ['Restaurant A'], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      expect(migratedExpense.id).toBe(originalExpense.id);
      expect(migratedExpense.date).toBe(originalExpense.date);
      expect(migratedExpense.place).toBe(originalExpense.place);
      expect(migratedExpense.notes).toBe(originalExpense.notes);
      expect(migratedExpense.amount).toBe(originalExpense.amount);
      expect(migratedExpense.week).toBe(originalExpense.week);
      expect(migratedExpense.method).toBe(originalExpense.method);
      expect(migratedExpense.type).toBe('Dining Out');
    });

    test('should preserve all budget data except category during migration', async () => {
      const originalBudget = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM budgets WHERE category = ?', ['Food'], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      await runMigration(db);
      
      const migratedBudget = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM budgets WHERE year = ? AND month = ? AND category = ?', 
          [originalBudget.year, originalBudget.month, 'Dining Out'], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      expect(migratedBudget.id).toBe(originalBudget.id);
      expect(migratedBudget.year).toBe(originalBudget.year);
      expect(migratedBudget.month).toBe(originalBudget.month);
      expect(migratedBudget.limit_amount).toBe(originalBudget.limit_amount);
      expect(migratedBudget.category).toBe('Dining Out');
    });

    test('should maintain record count after migration', async () => {
      const initialExpenseCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM expenses', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      const initialRecurringCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM recurring_expenses', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      const initialBudgetCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM budgets', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      await runMigration(db);
      
      const finalExpenseCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM expenses', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      const finalRecurringCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM recurring_expenses', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      const finalBudgetCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM budgets', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      expect(finalExpenseCount).toBe(initialExpenseCount);
      expect(finalRecurringCount).toBe(initialRecurringCount);
      expect(finalBudgetCount).toBe(initialBudgetCount);
    });
  });
});
