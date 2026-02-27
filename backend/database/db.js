const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { getDatabasePath, ensureDirectories } = require('../config/paths');
const logger = require('../config/logger');
const { initializeInvoiceStorage } = require('../scripts/initializeInvoiceStorage');
const { ALL_STATEMENTS } = require('./schema');

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

        // Execute all schema statements sequentially
        let i = 0;
        const executeNext = () => {
          if (i >= ALL_STATEMENTS.length) {
            logger.info('All schema statements executed successfully');
            // Run any pending migrations
            const { runMigrations } = require('./migrations');
            runMigrations(db)
              .then(() => {
                resolve(db);
              })
              .catch((migErr) => {
                logger.error('Migration error:', migErr);
                // Don't reject - allow app to start even if migrations fail
                resolve(db);
              });
            return;
          }
          db.run(ALL_STATEMENTS[i], (err) => {
            if (err) {
              logger.error('Error executing schema statement:', err);
              reject(err);
              return;
            }
            i++;
            executeNext();
          });
        };
        executeNext();
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
 * Create a SQLite database for testing.
 * Uses the consolidated schema module for all table, index, trigger,
 * and seed statements — same source as production.
 */
function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const testDbPath = getTestDbPath();
    
    // Only remove existing test database if we don't have an active connection
    if (!testDbInstance && fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch (err) {
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
            logger.debug('Could not enable WAL mode:', err.message);
          }
          
          // Execute all schema statements sequentially
          let i = 0;
          const executeNext = () => {
            if (i >= ALL_STATEMENTS.length) {
              resolve(db);
              return;
            }
            db.run(ALL_STATEMENTS[i], (err) => {
              if (err) {
                reject(err);
                return;
              }
              i++;
              executeNext();
            });
          };
          executeNext();
        });
      });
    });
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
    'credit_card_billing_cycles',
    'expense_invoices',
    'expense_people',
    'expenses',
    'people',
    'fixed_expenses',
    'income_sources',
    'budgets',
    'mortgage_payments',
    'loan_payments',
    'loan_balances',
    'loans',
    'investment_values',
    'investments',
    'place_names',
    'reminders',
    'dismissed_anomalies',
    'monthly_gross',
    'payment_methods',
    'activity_logs',
    'settings',
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
 * Close the production database connection after checkpointing the WAL.
 * This flushes all WAL contents into the main DB file and releases file locks,
 * which is critical before overwriting the DB file during backup restore.
 * Without this, stale WAL data can replay on the next connection and undo the restore.
 */
function closeDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        logger.warn('Could not open database for WAL checkpoint:', err.message);
        resolve(); // Non-fatal: proceed with restore anyway
        return;
      }

      db.run('PRAGMA wal_checkpoint(TRUNCATE)', (checkpointErr) => {
        if (checkpointErr) {
          logger.warn('WAL checkpoint failed during closeDatabase:', checkpointErr.message);
        } else {
          logger.debug('WAL checkpoint completed before database close');
        }

        db.close((closeErr) => {
          if (closeErr) {
            logger.warn('Error closing database:', closeErr.message);
          }
          resolve();
        });
      });
    });
  });
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
  closeDatabase,
  createTestDatabase,
  getTestDatabase,
  getTestDbPath,
  resetTestDatabase,
  closeTestDatabase,
  recreateTestDatabase,
  isTestMode,
  DB_PATH
};