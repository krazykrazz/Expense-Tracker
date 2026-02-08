const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { getDatabasePath, ensureDirectories } = require('../config/paths');
const { CATEGORIES, BUDGETABLE_CATEGORIES } = require('../utils/categories');
const logger = require('../config/logger');
const { initializeInvoiceStorage } = require('../scripts/initializeInvoiceStorage');

// Database file path - use dynamic path from config
const DB_PATH = getDatabasePath();
const OLD_DB_PATH = path.join(__dirname, 'expenses.db');

/**
 * Automatically migrate database from old location to new /config structure
 * Only runs if old database exists and new location doesn't have a database
 */
async function migrateOldDatabase() {
  const oldExists = fs.existsSync(OLD_DB_PATH);
  const newExists = fs.existsSync(DB_PATH);
  
  // Only migrate if old exists and new doesn't (or is empty/small)
  if (oldExists && (!newExists || fs.statSync(DB_PATH).size < 100000)) {
    try {
      const oldStats = fs.statSync(OLD_DB_PATH);
      logger.info('Migrating database from old location...', {
        oldPath: OLD_DB_PATH,
        newPath: DB_PATH,
        size: oldStats.size
      });
      
      await fs.promises.copyFile(OLD_DB_PATH, DB_PATH);
      
      const newStats = fs.statSync(DB_PATH);
      if (oldStats.size === newStats.size) {
        logger.info('Database migration successful');
      } else {
        logger.warn('Database copy size mismatch', {
          oldSize: oldStats.size,
          newSize: newStats.size
        });
      }
    } catch (error) {
      logger.error('Error migrating database:', error);
      // Don't throw - allow initialization to continue
    }
  }
}

// Create and initialize database
function initializeDatabase() {
  return new Promise(async (resolve, reject) => {
    try {
      // Ensure /config directory structure exists before initializing database
      await ensureDirectories();
      
      // Initialize invoice storage infrastructure
      try {
        await initializeInvoiceStorage();
        logger.info('Invoice storage initialized successfully');
      } catch (invoiceError) {
        logger.warn('Invoice storage initialization failed (non-critical):', invoiceError);
        // Don't fail database initialization if invoice storage fails
      }
      
      // Auto-migrate old database if it exists and new location is empty
      await migrateOldDatabase();
    } catch (err) {
      logger.error('Error creating config directories:', err);
      reject(err);
      return;
    }

    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        logger.error('Error opening database:', err);
        reject(err);
        return;
      }
      logger.info('Connected to SQLite database', { path: DB_PATH });
      
      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          logger.error('Error enabling foreign keys:', err);
          reject(err);
          return;
        }
      });
    });

    // Create expenses table with all constraints
    const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS expenses (
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
    `;

    // Create monthly_gross table
    const createMonthlyGrossSQL = `
      CREATE TABLE IF NOT EXISTS monthly_gross (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        gross_amount REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(year, month)
      )
    `;

    // Create recurring_expenses table
    const createRecurringExpensesSQL = `
      CREATE TABLE IF NOT EXISTS recurring_expenses (
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
    `;

    // Create income_sources table
    const createIncomeSourcesSQL = `
      CREATE TABLE IF NOT EXISTS income_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount >= 0),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create fixed_expenses table
    const createFixedExpensesSQL = `
      CREATE TABLE IF NOT EXISTS fixed_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount >= 0),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create loans table
    const createLoansSQL = `
      CREATE TABLE IF NOT EXISTS loans (
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
    `;

    // Create loan_balances table
    const createLoanBalancesSQL = `
      CREATE TABLE IF NOT EXISTS loan_balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        remaining_balance REAL NOT NULL CHECK(remaining_balance >= 0),
        rate REAL NOT NULL CHECK(rate >= 0),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
        UNIQUE(loan_id, year, month)
      )
    `;

    // Create budgets table
    const budgetCategoryList = BUDGETABLE_CATEGORIES.map(c => `'${c}'`).join(', ');
    const createBudgetsSQL = `
      CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
        category TEXT NOT NULL CHECK(category IN (${budgetCategoryList})),
        "limit" REAL NOT NULL CHECK("limit" > 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(year, month, category)
      )
    `;

    db.run(createTableSQL, (err) => {
      if (err) {
        logger.error('Error creating expenses table:', err);
        reject(err);
        return;
      }
      logger.debug('Expenses table created or already exists');

      // Create monthly_gross table
      db.run(createMonthlyGrossSQL, (err) => {
        if (err) {
          logger.error('Error creating monthly_gross table:', err);
          reject(err);
          return;
        }
        logger.debug('Monthly gross table created or already exists');

        // Create recurring_expenses table
        db.run(createRecurringExpensesSQL, (err) => {
          if (err) {
            logger.error('Error creating recurring_expenses table:', err);
            reject(err);
            return;
          }
          logger.debug('Recurring expenses table created or already exists');

          // Create income_sources table
          db.run(createIncomeSourcesSQL, (err) => {
            if (err) {
              logger.error('Error creating income_sources table:', err);
              reject(err);
              return;
            }
            logger.debug('Income sources table created or already exists');

            // Create fixed_expenses table
            db.run(createFixedExpensesSQL, (err) => {
              if (err) {
                logger.error('Error creating fixed_expenses table:', err);
                reject(err);
                return;
              }
              logger.debug('Fixed expenses table created or already exists');

              // Create loans table
              db.run(createLoansSQL, (err) => {
                if (err) {
                  logger.error('Error creating loans table:', err);
                  reject(err);
                  return;
                }
                logger.debug('Loans table created or already exists');

                // Create loan_balances table
                db.run(createLoanBalancesSQL, (err) => {
                  if (err) {
                    logger.error('Error creating loan_balances table:', err);
                    reject(err);
                    return;
                  }
                  logger.debug('Loan balances table created or already exists');

                  // Create budgets table
                  db.run(createBudgetsSQL, (err) => {
                    if (err) {
                      logger.error('Error creating budgets table:', err);
                      reject(err);
                      return;
                    }
                    logger.debug('Budgets table created or already exists');

                    // Create trigger for budgets updated_at timestamp
                    const createBudgetsTriggerSQL = `
                      CREATE TRIGGER IF NOT EXISTS update_budgets_timestamp 
                      AFTER UPDATE ON budgets
                      BEGIN
                        UPDATE budgets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                      END
                    `;

                    db.run(createBudgetsTriggerSQL, (err) => {
                      if (err) {
                        logger.error('Error creating budgets trigger:', err);
                        reject(err);
                        return;
                      }
                      logger.debug('Budgets trigger created or already exists');

                      // Create investments table
                      const createInvestmentsSQL = `
                        CREATE TABLE IF NOT EXISTS investments (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          name TEXT NOT NULL,
                          type TEXT NOT NULL CHECK(type IN ('TFSA', 'RRSP')),
                          initial_value REAL NOT NULL CHECK(initial_value >= 0),
                          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                        )
                      `;

                      db.run(createInvestmentsSQL, (err) => {
                        if (err) {
                          logger.error('Error creating investments table:', err);
                          reject(err);
                          return;
                        }
                        logger.debug('Investments table created or already exists');

                        // Create investment_values table
                        const createInvestmentValuesSQL = `
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
                        `;

                        db.run(createInvestmentValuesSQL, (err) => {
                          if (err) {
                            logger.error('Error creating investment_values table:', err);
                            reject(err);
                            return;
                          }
                          logger.debug('Investment values table created or already exists');

            // Add recurring expense columns if they don't exist (migration)
            db.run('ALTER TABLE expenses ADD COLUMN recurring_id INTEGER', (err) => {
              if (err && !err.message.includes('duplicate column')) {
                logger.error('Error adding recurring_id column:', err);
              } else if (!err) {
                logger.debug('Added recurring_id column to expenses table');
              }
            });

            db.run('ALTER TABLE expenses ADD COLUMN is_generated INTEGER DEFAULT 0', (err) => {
              if (err && !err.message.includes('duplicate column')) {
                logger.error('Error adding is_generated column:', err);
              } else if (!err) {
                logger.debug('Added is_generated column to expenses table');
              }
            });

                          // Create indexes for better query performance
                          const indexes = [
                            'CREATE INDEX IF NOT EXISTS idx_date ON expenses(date)',
                            'CREATE INDEX IF NOT EXISTS idx_type ON expenses(type)',
                            'CREATE INDEX IF NOT EXISTS idx_method ON expenses(method)',
                            'CREATE INDEX IF NOT EXISTS idx_year_month ON monthly_gross(year, month)',
                            'CREATE INDEX IF NOT EXISTS idx_recurring_dates ON recurring_expenses(start_month, end_month)',
                            'CREATE INDEX IF NOT EXISTS idx_income_year_month ON income_sources(year, month)',
                            'CREATE INDEX IF NOT EXISTS idx_fixed_expenses_year_month ON fixed_expenses(year, month)',
                            'CREATE INDEX IF NOT EXISTS idx_loans_paid_off ON loans(is_paid_off)',
                            'CREATE INDEX IF NOT EXISTS idx_loans_loan_type ON loans(loan_type)',
                            'CREATE INDEX IF NOT EXISTS idx_loan_balances_loan_id ON loan_balances(loan_id)',
                            'CREATE INDEX IF NOT EXISTS idx_loan_balances_year_month ON loan_balances(year, month)',
                            'CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(year, month)',
                            'CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category)',
                            'CREATE INDEX IF NOT EXISTS idx_investments_type ON investments(type)',
                            'CREATE INDEX IF NOT EXISTS idx_investment_values_investment_id ON investment_values(investment_id)',
                            'CREATE INDEX IF NOT EXISTS idx_investment_values_year_month ON investment_values(year, month)'
                          ];

                          let completed = 0;
                          indexes.forEach((indexSQL) => {
                            db.run(indexSQL, (err) => {
                              if (err) {
                                logger.error('Error creating index:', err);
                                reject(err);
                                return;
                              }
                              completed++;
                              if (completed === indexes.length) {
                                logger.info('All database indexes created successfully');
                                
                                // Run any pending migrations
                                const { runMigrations } = require('./migrations');
                                runMigrations(db)
                                  .then(() => {
                                    resolve(db);
                                  })
                                  .catch((err) => {
                                    logger.error('Migration error:', err);
                                    // Don't reject - allow app to start even if migrations fail
                                    // This prevents breaking the app if there's a migration issue
                                    resolve(db);
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
    });
  });
}

// Get database connection
// In test mode (NODE_ENV=test), returns the in-memory test database
// Unless SKIP_TEST_DB is set, which forces use of the production database
function getDatabase() {
  const nodeEnv = process.env.NODE_ENV;
  const skipTestDb = process.env.SKIP_TEST_DB;
  
  // If running tests and SKIP_TEST_DB is not set, use the in-memory test database
  // Use trim() to handle any whitespace issues from Windows cmd
  if (nodeEnv && nodeEnv.trim() === 'test' && skipTestDb !== 'true') {
    return getTestDatabase();
  }
  
  return new Promise((resolve, reject) => {
    // Use dynamic path from config (supports /config directory)
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        logger.error('Error connecting to database:', err);
        reject(err);
        return;
      }
      
      // Enable foreign keys for this connection
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          logger.error('Error enabling foreign keys:', err);
          reject(err);
          return;
        }
        resolve(db);
      });
    });
  });
}

/**
 * Get the test database path for the current worker.
 * Each Jest worker gets its own isolated database file to enable parallel execution.
 * Falls back to a default path when JEST_WORKER_ID is not set.
 */
function getTestDbPath() {
  const workerId = process.env.JEST_WORKER_ID || '1';
  return path.join(__dirname, '..', 'config', 'database', `test-expenses-worker-${workerId}.db`);
}

/**
 * Create an in-memory SQLite database for testing
 * This creates all the same tables as the production database
 * but uses a per-worker temporary file so tests can run in parallel
 */
function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const testDbPath = getTestDbPath();
    
    // Only remove existing test database if we don't have an active connection
    // This prevents corruption when the singleton is still in use
    if (!testDbInstance && fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch (err) {
        // Ignore errors - file might be locked
        logger.debug('Could not delete test database file:', err.message);
      }
    }
    
    const db = new sqlite3.Database(testDbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Enable WAL mode for better concurrency
        db.run('PRAGMA journal_mode = WAL', (err) => {
          if (err) {
            // WAL mode is optional, continue even if it fails
            logger.debug('Could not enable WAL mode:', err.message);
          }
          
          // Create all tables in sequence
          const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
        const budgetCategoryList = BUDGETABLE_CATEGORIES.map(c => `'${c}'`).join(', ');
        
        const createStatements = [
          // schema_migrations table (for tracking migrations)
          `CREATE TABLE IF NOT EXISTS schema_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            migration_name TEXT NOT NULL UNIQUE,
            applied_at TEXT DEFAULT CURRENT_TIMESTAMP
          )`,
          
          // expenses table
          `CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            posted_date TEXT DEFAULT NULL,
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
          )`,
          
          // monthly_gross table
          `CREATE TABLE IF NOT EXISTS monthly_gross (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            gross_amount REAL NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(year, month)
          )`,
          
          // income_sources table
          `CREATE TABLE IF NOT EXISTS income_sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            name TEXT NOT NULL,
            amount REAL NOT NULL CHECK(amount >= 0),
            category TEXT DEFAULT 'Salary',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )`,
          
          // fixed_expenses table
          `CREATE TABLE IF NOT EXISTS fixed_expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            name TEXT NOT NULL,
            amount REAL NOT NULL CHECK(amount >= 0),
            category TEXT DEFAULT 'Other',
            payment_type TEXT DEFAULT 'Fixed',
            payment_method_id INTEGER REFERENCES payment_methods(id),
            payment_due_day INTEGER CHECK(payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31)),
            linked_loan_id INTEGER REFERENCES loans(id) ON DELETE SET NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )`,
          
          // loans table
          `CREATE TABLE IF NOT EXISTS loans (
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
            fixed_interest_rate REAL DEFAULT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )`,
          
          // loan_balances table
          `CREATE TABLE IF NOT EXISTS loan_balances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            loan_id INTEGER NOT NULL,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            remaining_balance REAL NOT NULL CHECK(remaining_balance >= 0),
            rate REAL NOT NULL CHECK(rate >= 0),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
            UNIQUE(loan_id, year, month)
          )`,
          
          // mortgage_payments table (for tracking payment amounts over time)
          `CREATE TABLE IF NOT EXISTS mortgage_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            loan_id INTEGER NOT NULL,
            payment_amount REAL NOT NULL,
            effective_date TEXT NOT NULL,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
          )`,
          
          // loan_payments table (for payment-based tracking of loans and mortgages)
          `CREATE TABLE IF NOT EXISTS loan_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            loan_id INTEGER NOT NULL,
            amount REAL NOT NULL CHECK(amount > 0),
            payment_date TEXT NOT NULL,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
          )`,
          
          // budgets table
          `CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
            category TEXT NOT NULL CHECK(category IN (${budgetCategoryList})),
            "limit" REAL NOT NULL CHECK("limit" > 0),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(year, month, category)
          )`,
          
          // investments table
          `CREATE TABLE IF NOT EXISTS investments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('TFSA', 'RRSP')),
            initial_value REAL NOT NULL CHECK(initial_value >= 0),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )`,
          
          // investment_values table
          `CREATE TABLE IF NOT EXISTS investment_values (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            investment_id INTEGER NOT NULL,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            value REAL NOT NULL CHECK(value >= 0),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE,
            UNIQUE(investment_id, year, month)
          )`,
          
          // people table
          `CREATE TABLE IF NOT EXISTS people (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            date_of_birth TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )`,
          
          // expense_people junction table
          `CREATE TABLE IF NOT EXISTS expense_people (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            expense_id INTEGER NOT NULL,
            person_id INTEGER NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            original_amount REAL DEFAULT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
            FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
            UNIQUE(expense_id, person_id)
          )`,
          
          // expense_invoices table (for medical expense invoice attachments)
          `CREATE TABLE IF NOT EXISTS expense_invoices (
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
          )`,
          
          // place_names table
          `CREATE TABLE IF NOT EXISTS place_names (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_name TEXT NOT NULL,
            standardized_name TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(original_name)
          )`,
          
          // reminders table
          `CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('investment_values', 'loan_balances')),
            dismissed INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(year, month, type)
          )`,
          
          // dismissed_anomalies table (for persisting anomaly dismissals)
          `CREATE TABLE IF NOT EXISTS dismissed_anomalies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            expense_id INTEGER NOT NULL,
            dismissed_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(expense_id),
            FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
          )`,
          
          // payment_methods table (for configurable payment methods)
          `CREATE TABLE IF NOT EXISTS payment_methods (
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
            billing_cycle_day INTEGER CHECK(billing_cycle_day IS NULL OR (billing_cycle_day >= 1 AND billing_cycle_day <= 31)),
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )`,
          
          // credit_card_payments table (for tracking credit card payments)
          `CREATE TABLE IF NOT EXISTS credit_card_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payment_method_id INTEGER NOT NULL,
            amount REAL NOT NULL CHECK(amount > 0),
            payment_date TEXT NOT NULL,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
          )`,
          
          // credit_card_statements table (for storing credit card statement files)
          `CREATE TABLE IF NOT EXISTS credit_card_statements (
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
          )`,
          
          // credit_card_billing_cycles table (for storing actual statement balances per billing cycle)
          `CREATE TABLE IF NOT EXISTS credit_card_billing_cycles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payment_method_id INTEGER NOT NULL,
            cycle_start_date TEXT NOT NULL,
            cycle_end_date TEXT NOT NULL,
            actual_statement_balance REAL NOT NULL CHECK(actual_statement_balance >= 0),
            calculated_statement_balance REAL NOT NULL CHECK(calculated_statement_balance >= 0),
            minimum_payment REAL CHECK(minimum_payment IS NULL OR minimum_payment >= 0),
            due_date TEXT,
            notes TEXT,
            statement_pdf_path TEXT,
            is_user_entered INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE,
            UNIQUE(payment_method_id, cycle_end_date)
          )`
        ];
        
        // Execute all create statements sequentially
        let completed = 0;
        const executeNext = () => {
          if (completed >= createStatements.length) {
            // All tables created, now create indexes
            createTestIndexes(db, resolve, reject);
            return;
          }
          
          db.run(createStatements[completed], (err) => {
            if (err) {
              reject(err);
              return;
            }
            completed++;
            executeNext();
          });
        };
        
        executeNext();
        });
      });
    });
  });
}

/**
 * Create indexes for the test database
 */
function createTestIndexes(db, resolve, reject) {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_date ON expenses(date)',
    'CREATE INDEX IF NOT EXISTS idx_type ON expenses(type)',
    'CREATE INDEX IF NOT EXISTS idx_method ON expenses(method)',
    'CREATE INDEX IF NOT EXISTS idx_expenses_insurance_eligible ON expenses(insurance_eligible)',
    'CREATE INDEX IF NOT EXISTS idx_expenses_claim_status ON expenses(claim_status)',
    'CREATE INDEX IF NOT EXISTS idx_expenses_posted_date ON expenses(posted_date)',
    'CREATE INDEX IF NOT EXISTS idx_year_month ON monthly_gross(year, month)',
    'CREATE INDEX IF NOT EXISTS idx_income_year_month ON income_sources(year, month)',
    'CREATE INDEX IF NOT EXISTS idx_fixed_expenses_year_month ON fixed_expenses(year, month)',
    'CREATE INDEX IF NOT EXISTS idx_loans_paid_off ON loans(is_paid_off)',
    'CREATE INDEX IF NOT EXISTS idx_loans_loan_type ON loans(loan_type)',
    'CREATE INDEX IF NOT EXISTS idx_loan_balances_loan_id ON loan_balances(loan_id)',
    'CREATE INDEX IF NOT EXISTS idx_loan_balances_year_month ON loan_balances(year, month)',
    'CREATE INDEX IF NOT EXISTS idx_mortgage_payments_loan_id ON mortgage_payments(loan_id)',
    'CREATE INDEX IF NOT EXISTS idx_mortgage_payments_loan_effective_date ON mortgage_payments(loan_id, effective_date)',
    'CREATE INDEX IF NOT EXISTS idx_loan_payments_loan_id ON loan_payments(loan_id)',
    'CREATE INDEX IF NOT EXISTS idx_loan_payments_payment_date ON loan_payments(payment_date)',
    'CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(year, month)',
    'CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category)',
    'CREATE INDEX IF NOT EXISTS idx_investments_type ON investments(type)',
    'CREATE INDEX IF NOT EXISTS idx_investment_values_investment_id ON investment_values(investment_id)',
    'CREATE INDEX IF NOT EXISTS idx_investment_values_year_month ON investment_values(year, month)',
    'CREATE INDEX IF NOT EXISTS idx_expense_people_expense ON expense_people(expense_id)',
    'CREATE INDEX IF NOT EXISTS idx_expense_people_person ON expense_people(person_id)',
    'CREATE INDEX IF NOT EXISTS idx_expense_invoices_expense_id ON expense_invoices(expense_id)',
    'CREATE INDEX IF NOT EXISTS idx_expense_invoices_upload_date ON expense_invoices(upload_date)',
    'CREATE INDEX IF NOT EXISTS idx_dismissed_anomalies_expense_id ON dismissed_anomalies(expense_id)',
    'CREATE INDEX IF NOT EXISTS idx_expenses_payment_method_id ON expenses(payment_method_id)',
    'CREATE INDEX IF NOT EXISTS idx_fixed_expenses_payment_method_id ON fixed_expenses(payment_method_id)',
    'CREATE INDEX IF NOT EXISTS idx_fixed_expenses_linked_loan ON fixed_expenses(linked_loan_id)',
    'CREATE INDEX IF NOT EXISTS idx_fixed_expenses_due_day ON fixed_expenses(payment_due_day)',
    'CREATE INDEX IF NOT EXISTS idx_payment_methods_type ON payment_methods(type)',
    'CREATE INDEX IF NOT EXISTS idx_payment_methods_display_name ON payment_methods(display_name)',
    'CREATE INDEX IF NOT EXISTS idx_payment_methods_is_active ON payment_methods(is_active)',
    'CREATE INDEX IF NOT EXISTS idx_cc_payments_method_id ON credit_card_payments(payment_method_id)',
    'CREATE INDEX IF NOT EXISTS idx_cc_payments_date ON credit_card_payments(payment_date)',
    'CREATE INDEX IF NOT EXISTS idx_cc_statements_method_id ON credit_card_statements(payment_method_id)',
    'CREATE INDEX IF NOT EXISTS idx_cc_statements_date ON credit_card_statements(statement_date)',
    'CREATE INDEX IF NOT EXISTS idx_billing_cycles_payment_method ON credit_card_billing_cycles(payment_method_id)',
    'CREATE INDEX IF NOT EXISTS idx_billing_cycles_cycle_end ON credit_card_billing_cycles(cycle_end_date)',
    'CREATE INDEX IF NOT EXISTS idx_billing_cycles_pm_cycle_end ON credit_card_billing_cycles(payment_method_id, cycle_end_date)'
  ];
  
  let completed = 0;
  indexes.forEach((indexSQL) => {
    db.run(indexSQL, (err) => {
      if (err) {
        reject(err);
        return;
      }
      completed++;
      if (completed === indexes.length) {
        // After indexes, seed default payment methods
        seedTestPaymentMethods(db, resolve, reject);
      }
    });
  });
}

/**
 * Seed default payment methods for the test database
 * These match the production migration defaults
 */
function seedTestPaymentMethods(db, resolve, reject) {
  // Default payment methods matching the production migration
  const defaultPaymentMethods = [
    { id: 1, type: 'cash', display_name: 'Cash', full_name: 'Cash' },
    { id: 2, type: 'debit', display_name: 'Debit', full_name: 'Debit Card' },
    { id: 3, type: 'cheque', display_name: 'Cheque', full_name: 'Cheque' },
    { id: 4, type: 'credit_card', display_name: 'CIBC MC', full_name: 'CIBC Mastercard' },
    { id: 5, type: 'credit_card', display_name: 'PCF MC', full_name: 'PC Financial Mastercard' },
    { id: 6, type: 'credit_card', display_name: 'WS VISA', full_name: 'WealthSimple VISA' },
    { id: 7, type: 'credit_card', display_name: 'VISA', full_name: 'VISA' }
  ];
  
  let completed = 0;
  const total = defaultPaymentMethods.length;
  
  if (total === 0) {
    resolve(db);
    return;
  }
  
  defaultPaymentMethods.forEach((pm) => {
    db.run(
      `INSERT OR IGNORE INTO payment_methods (id, type, display_name, full_name, is_active) VALUES (?, ?, ?, ?, 1)`,
      [pm.id, pm.type, pm.display_name, pm.full_name],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        completed++;
        if (completed === total) {
          resolve(db);
        }
      }
    );
  });
}

// Singleton for test database (reused across test files)
let testDbInstance = null;
let testDbPromise = null;

/**
 * Get or create the test database instance
 * Uses a singleton pattern per worker so all tests in the same worker share the same database
 * Returns a Promise that resolves to the database instance
 */
async function getTestDatabase() {
  const testDbPath = getTestDbPath();
  
  // If we have an instance but the file was deleted, recreate it
  if (testDbInstance && !fs.existsSync(testDbPath)) {
    logger.debug('Test database file was deleted, recreating...');
    testDbInstance = null;
    testDbPromise = null;
  }
  
  // If we already have an instance, return it
  if (testDbInstance) {
    return testDbInstance;
  }
  
  // If creation is in progress, wait for it
  if (testDbPromise) {
    return testDbPromise;
  }
  
  // Create new instance
  testDbPromise = createTestDatabase().then(db => {
    testDbInstance = db;
    testDbPromise = null;
    return db;
  });
  
  return testDbPromise;
}

/**
 * Reset the test database (clear all data but keep schema)
 * This clears all data from tables but preserves the schema
 */
async function resetTestDatabase() {
  const db = await getTestDatabase();
  
  const tables = [
    'credit_card_statements',
    'credit_card_payments',
    'expense_invoices',
    'expense_people',
    'expenses',
    'people',
    'fixed_expenses',
    'income_sources',
    'budgets',
    'mortgage_payments',
    'loan_balances',
    'loans',
    'investment_values',
    'investments',
    'place_names',
    'reminders',
    'monthly_gross',
    'payment_methods',
    'schema_migrations'
  ];
  
  // Use serialize to ensure operations complete in order
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Disable foreign keys temporarily for clean deletion
      db.run('PRAGMA foreign_keys = OFF');
      
      for (const table of tables) {
        db.run(`DELETE FROM ${table}`, (err) => {
          if (err && !err.message.includes('no such table')) {
            // Ignore "no such table" errors, log others
            logger.debug(`Error clearing table ${table}:`, err.message);
          }
        });
      }
      
      // Reset auto-increment sequences
      db.run('DELETE FROM sqlite_sequence', (err) => {
        // Ignore errors - table might not exist
      });
      
      // Re-enable foreign keys
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(db);
        }
      });
    });
  });
}

/**
 * Close the test database connection and clear the singleton
 * Also removes the per-worker database file to avoid stale files
 */
function closeTestDatabase() {
  if (testDbInstance) {
    try {
      testDbInstance.close();
    } catch (err) {
      // Ignore close errors
    }
    testDbInstance = null;
    testDbPromise = null;
  }
  
  // Clean up the per-worker database file
  const testDbPath = getTestDbPath();
  try {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    // Also clean up WAL and SHM files
    if (fs.existsSync(testDbPath + '-wal')) {
      fs.unlinkSync(testDbPath + '-wal');
    }
    if (fs.existsSync(testDbPath + '-shm')) {
      fs.unlinkSync(testDbPath + '-shm');
    }
  } catch (err) {
    // Ignore cleanup errors
  }
}

/**
 * Force recreation of the test database
 * Useful when the database gets corrupted
 */
async function recreateTestDatabase() {
  closeTestDatabase();
  return getTestDatabase();
}

/**
 * Check if we're in test mode
 */
function isTestMode() {
  return process.env.NODE_ENV === 'test';
}

module.exports = {
  initializeDatabase,
  getDatabase,
  createTestDatabase,
  getTestDatabase,
  getTestDbPath,
  resetTestDatabase,
  closeTestDatabase,
  recreateTestDatabase,
  isTestMode,
  DB_PATH
};
