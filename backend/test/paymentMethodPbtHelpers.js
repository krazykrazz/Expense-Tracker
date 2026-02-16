/**
 * Shared Helper Utilities for PaymentMethodService PBT Tests
 * 
 * This module provides common database setup, data insertion, calculation,
 * and arbitrary generation functions used across paymentMethodService PBT tests.
 * 
 * PERFORMANCE OPTIMIZATION: Uses singleton database pattern to avoid recreating
 * the database schema for every test iteration. This reduces test execution time
 * from ~20 minutes to ~2 minutes per test file.
 */

const fc = require('fast-check');
const sqlite3 = require('sqlite3').verbose();

// ============================================================================
// Database Helpers - Singleton Pattern
// ============================================================================

// Singleton database instance
let singletonDb = null;
let isSchemaCreated = false;

/**
 * Get or create the singleton test database with foreign keys enabled
 * This reuses the same database instance across all test iterations
 */
function getTestDatabase() {
  return new Promise((resolve, reject) => {
    if (singletonDb) {
      resolve(singletonDb);
      return;
    }

    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) {
        reject(err);
      } else {
        db.run('PRAGMA foreign_keys = ON', (fkErr) => {
          if (fkErr) {
            reject(fkErr);
          } else {
            singletonDb = db;
            resolve(db);
          }
        });
      }
    });
  });
}

/**
 * DEPRECATED: Use getTestDatabase() instead
 * Kept for backward compatibility
 */
function createTestDatabase() {
  return getTestDatabase();
}

/**
 * Reset database by clearing all data (keeps schema intact)
 * This is much faster than recreating the entire database
 */
function resetTestDatabase(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('DELETE FROM credit_card_payments', (err) => {
        if (err) return reject(err);
        
        db.run('DELETE FROM expenses', (err) => {
          if (err) return reject(err);
          
          db.run('DELETE FROM payment_methods', (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });
    });
  });
}

/**
 * Close database connection (only call in afterAll)
 */
function closeDatabase(db) {
  return new Promise((resolve, reject) => {
    if (db === singletonDb) {
      singletonDb = null;
      isSchemaCreated = false;
    }
    
    db.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Create payment_methods, expenses, and credit_card_payments tables
 * Only creates schema once per test suite (singleton pattern)
 */
function createTables(db) {
  return new Promise((resolve, reject) => {
    // Skip if schema already created
    if (isSchemaCreated) {
      resolve();
      return;
    }

    db.serialize(() => {
      db.run(`
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
      
      db.run(`
        CREATE TABLE IF NOT EXISTS expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          posted_date TEXT DEFAULT NULL,
          place TEXT,
          notes TEXT,
          amount REAL NOT NULL,
          type TEXT NOT NULL,
          week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
          method TEXT NOT NULL,
          payment_method_id INTEGER REFERENCES payment_methods(id),
          insurance_eligible INTEGER DEFAULT 0,
          claim_status TEXT DEFAULT NULL,
          original_cost REAL DEFAULT NULL
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS credit_card_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id),
          amount REAL NOT NULL,
          payment_date TEXT NOT NULL,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          reject(err);
        } else {
          isSchemaCreated = true;
          resolve();
        }
      });
    });
  });
}

// ============================================================================
// Data Insertion Helpers
// ============================================================================

/**
 * Insert a credit card payment method
 */
function insertCreditCard(db, displayName, fullName, billingCycleStart = null, billingCycleEnd = null) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO payment_methods (type, display_name, full_name, current_balance, is_active, billing_cycle_start, billing_cycle_end)
       VALUES ('credit_card', ?, ?, 0, 1, ?, ?)`,
      [displayName, fullName, billingCycleStart, billingCycleEnd],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

/**
 * Insert an expense with optional posted_date
 */
function insertExpense(db, date, postedDate, place, amount, type, week, method, paymentMethodId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO expenses (date, posted_date, place, amount, type, week, method, payment_method_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, postedDate, place, amount, type, week, method, paymentMethodId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

/**
 * Insert a credit card payment
 */
function insertPayment(db, paymentMethodId, amount, paymentDate) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO credit_card_payments (payment_method_id, amount, payment_date)
       VALUES (?, ?, ?)`,
      [paymentMethodId, amount, paymentDate],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

/**
 * Insert a payment method (generic)
 */
function insertPaymentMethod(db, type, displayName, fullName = null, accountDetails = null, creditLimit = null, billingCycleStart = null, billingCycleEnd = null, paymentDueDay = null) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO payment_methods (type, display_name, full_name, account_details, credit_limit, billing_cycle_start, billing_cycle_end, payment_due_day, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [type, displayName, fullName, accountDetails, creditLimit, billingCycleStart, billingCycleEnd, paymentDueDay],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Add days to a date string (YYYY-MM-DD format)
 */
function addDays(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Format Date object as YYYY-MM-DD
 */
function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Get effective date using COALESCE(posted_date, date) logic
 */
function getEffectiveDate(transactionDate, postedDate) {
  return postedDate || transactionDate;
}

// ============================================================================
// Balance Calculation Helpers
// ============================================================================

/**
 * Calculate dynamic balance using COALESCE logic
 * Formula: (expenses where COALESCE(posted_date, date) <= referenceDate) - (all payments)
 */
function calculateDynamicBalance(db, paymentMethodId, referenceDate) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM expenses 
       WHERE payment_method_id = ? 
       AND COALESCE(posted_date, date) <= ?`,
      [paymentMethodId, referenceDate],
      (err, expenseRow) => {
        if (err) return reject(err);
        
        const expenseTotal = expenseRow?.total || 0;
        
        db.get(
          `SELECT COALESCE(SUM(amount), 0) as total 
           FROM credit_card_payments 
           WHERE payment_method_id = ?`,
          [paymentMethodId],
          (err, paymentRow) => {
            if (err) return reject(err);
            
            const paymentTotal = paymentRow?.total || 0;
            const balance = Math.max(0, Math.round((expenseTotal - paymentTotal) * 100) / 100);
            
            resolve(balance);
          }
        );
      }
    );
  });
}

/**
 * Calculate statement balance (expenses before cycle start - payments before cycle start)
 */
function calculateStatementBalance(db, paymentMethodId, cycleStartDate) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM expenses 
       WHERE payment_method_id = ? 
       AND COALESCE(posted_date, date) < ?`,
      [paymentMethodId, cycleStartDate],
      (err, expenseRow) => {
        if (err) return reject(err);
        
        const expenseTotal = expenseRow?.total || 0;
        
        db.get(
          `SELECT COALESCE(SUM(amount), 0) as total 
           FROM credit_card_payments 
           WHERE payment_method_id = ?
           AND payment_date < ?`,
          [paymentMethodId, cycleStartDate],
          (err, paymentRow) => {
            if (err) return reject(err);
            
            const paymentTotal = paymentRow?.total || 0;
            const balance = Math.max(0, Math.round((expenseTotal - paymentTotal) * 100) / 100);
            
            resolve(balance);
          }
        );
      }
    );
  });
}

/**
 * Calculate current balance (expenses with effective date <= today - payments <= today)
 */
function calculateCurrentBalance(db, paymentMethodId, todayStr) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM expenses 
       WHERE payment_method_id = ? 
       AND COALESCE(posted_date, date) <= ?`,
      [paymentMethodId, todayStr],
      (err, expenseRow) => {
        if (err) return reject(err);
        
        const expenseTotal = expenseRow?.total || 0;
        
        db.get(
          `SELECT COALESCE(SUM(amount), 0) as total 
           FROM credit_card_payments 
           WHERE payment_method_id = ?
           AND payment_date <= ?`,
          [paymentMethodId, todayStr],
          (err, paymentRow) => {
            if (err) return reject(err);
            
            const paymentTotal = paymentRow?.total || 0;
            const balance = Math.max(0, Math.round((expenseTotal - paymentTotal) * 100) / 100);
            
            resolve(balance);
          }
        );
      }
    );
  });
}

/**
 * Calculate projected balance (all expenses - all payments)
 */
function calculateProjectedBalance(db, paymentMethodId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM expenses 
       WHERE payment_method_id = ?`,
      [paymentMethodId],
      (err, expenseRow) => {
        if (err) return reject(err);
        
        const expenseTotal = expenseRow?.total || 0;
        
        db.get(
          `SELECT COALESCE(SUM(amount), 0) as total 
           FROM credit_card_payments 
           WHERE payment_method_id = ?`,
          [paymentMethodId],
          (err, paymentRow) => {
            if (err) return reject(err);
            
            const paymentTotal = paymentRow?.total || 0;
            const balance = Math.max(0, Math.round((expenseTotal - paymentTotal) * 100) / 100);
            
            resolve(balance);
          }
        );
      }
    );
  });
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Count expenses in a date range using effective_date
 */
function countExpensesInRange(db, paymentMethodId, startDate, endDate) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(*) as count
       FROM expenses 
       WHERE payment_method_id = ? 
       AND COALESCE(posted_date, date) >= ? 
       AND COALESCE(posted_date, date) <= ?`,
      [paymentMethodId, startDate, endDate],
      (err, row) => {
        if (err) return reject(err);
        resolve(row?.count || 0);
      }
    );
  });
}

/**
 * Sum expenses in a date range using effective_date
 */
function sumExpensesInRange(db, paymentMethodId, startDate, endDate) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM expenses 
       WHERE payment_method_id = ? 
       AND COALESCE(posted_date, date) >= ? 
       AND COALESCE(posted_date, date) <= ?`,
      [paymentMethodId, startDate, endDate],
      (err, row) => {
        if (err) return reject(err);
        resolve(Math.round((row?.total || 0) * 100) / 100);
      }
    );
  });
}

/**
 * Count expenses up to a date using effective_date
 */
function countExpensesUpToDate(db, paymentMethodId, endDate) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(*) as count
       FROM expenses 
       WHERE payment_method_id = ? 
       AND COALESCE(posted_date, date) <= ?`,
      [paymentMethodId, endDate],
      (err, row) => {
        if (err) return reject(err);
        resolve(row?.count || 0);
      }
    );
  });
}

/**
 * Sum expenses up to a date using effective_date
 */
function sumExpensesUpToDate(db, paymentMethodId, endDate) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM expenses 
       WHERE payment_method_id = ? 
       AND COALESCE(posted_date, date) <= ?`,
      [paymentMethodId, endDate],
      (err, row) => {
        if (err) return reject(err);
        resolve(Math.round((row?.total || 0) * 100) / 100);
      }
    );
  });
}

/**
 * Count expenses in billing cycle
 */
function countExpensesInCycle(db, paymentMethodId, cycleStartDate, cycleEndDate) {
  return countExpensesInRange(db, paymentMethodId, cycleStartDate, cycleEndDate);
}

/**
 * Find payment method by display name
 */
function findByDisplayName(db, displayName) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM payment_methods WHERE display_name = ?`,
      [displayName],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

/**
 * Get billing cycle configuration from database
 */
function getBillingCycleConfig(db, paymentMethodId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT billing_cycle_start, billing_cycle_end FROM payment_methods WHERE id = ?`,
      [paymentMethodId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

/**
 * Get billing cycle details (transaction count, totals, payment count) for a date range
 * This is the reference implementation for property testing
 */
function getBillingCycleDetailsFromDb(db, paymentMethodId, startDate, endDate) {
  return new Promise((resolve, reject) => {
    // Query transaction count and total for the period using effective_date
    db.get(
      `SELECT COUNT(*) as transaction_count, COALESCE(SUM(amount), 0) as total_amount
       FROM expenses 
       WHERE payment_method_id = ? 
       AND COALESCE(posted_date, date) >= ? 
       AND COALESCE(posted_date, date) <= ?`,
      [paymentMethodId, startDate, endDate],
      (err, transactionRow) => {
        if (err) return reject(err);
        
        // Query payment count and total for the period
        db.get(
          `SELECT COUNT(*) as payment_count, COALESCE(SUM(amount), 0) as payment_total
           FROM credit_card_payments 
           WHERE payment_method_id = ? 
           AND payment_date >= ? 
           AND payment_date <= ?`,
          [paymentMethodId, startDate, endDate],
          (err, paymentRow) => {
            if (err) return reject(err);
            
            resolve({
              start_date: startDate,
              end_date: endDate,
              transaction_count: transactionRow?.transaction_count || 0,
              total_amount: Math.round((transactionRow?.total_amount || 0) * 100) / 100,
              payment_count: paymentRow?.payment_count || 0,
              payment_total: Math.round((paymentRow?.payment_total || 0) * 100) / 100
            });
          }
        );
      }
    );
  });
}

// ============================================================================
// Fast-Check Arbitraries
// ============================================================================

// Counter for unique display names
let displayNameCounter = 0;

/**
 * Reset display name counter (call in beforeEach)
 */
function resetDisplayNameCounter() {
  displayNameCounter = 0;
}

/**
 * Generate unique display name
 */
const uniqueDisplayName = (prefix = 'TestCard') => {
  displayNameCounter++;
  return fc.constant(`${prefix}_${displayNameCounter}_${Date.now()}`);
};

/**
 * Generate valid date in YYYY-MM-DD format
 */
const validDate = fc.integer({ min: 2020, max: 2025 })
  .chain(year => fc.integer({ min: 1, max: 12 })
    .chain(month => fc.integer({ min: 1, max: 28 })
      .map(day => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)));

/**
 * Generate expense type
 */
const expenseType = fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Other');

/**
 * Generate valid display name string
 */
const validDisplayName = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

/**
 * Generate valid full name string
 */
const validFullName = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0);

/**
 * Generate valid account details string
 */
const validAccountDetails = fc.string({ minLength: 1, maxLength: 100 });

/**
 * Generate valid credit limit
 */
const validCreditLimit = fc.float({ min: Math.fround(100), max: Math.fround(50000), noNaN: true })
  .map(n => Math.round(n * 100) / 100);

/**
 * Generate valid balance
 */
const validBalance = fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
  .map(n => Math.round(n * 100) / 100);

/**
 * Generate valid billing day (1-31)
 */
const validBillingDay = fc.integer({ min: 1, max: 31 });

/**
 * Generate valid billing cycle day (1-31)
 */
const validBillingCycleDay = fc.integer({ min: 1, max: 31 });

/**
 * Generate valid payment due day (1-31)
 */
const validPaymentDueDay = fc.integer({ min: 1, max: 31 });

/**
 * Generate invalid day value (outside 1-31 range)
 */
const invalidDayValue = fc.oneof(
  fc.integer({ min: -100, max: 0 }),
  fc.integer({ min: 32, max: 100 })
);

/**
 * Generate valid payment method type
 */
const validPaymentMethodType = fc.constantFrom('cash', 'cheque', 'debit', 'credit_card');

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Database helpers
  getTestDatabase,
  createTestDatabase, // DEPRECATED: Use getTestDatabase instead
  resetTestDatabase,
  closeDatabase,
  createTables,
  
  // Data insertion
  insertCreditCard,
  insertExpense,
  insertPayment,
  insertPaymentMethod,
  
  // Date utilities
  addDays,
  formatDate,
  getEffectiveDate,
  
  // Balance calculations
  calculateDynamicBalance,
  calculateStatementBalance,
  calculateCurrentBalance,
  calculateProjectedBalance,
  
  // Query helpers
  countExpensesInRange,
  sumExpensesInRange,
  countExpensesUpToDate,
  sumExpensesUpToDate,
  countExpensesInCycle,
  findByDisplayName,
  getBillingCycleConfig,
  getBillingCycleDetailsFromDb,
  
  // Arbitraries
  resetDisplayNameCounter,
  uniqueDisplayName,
  validDate,
  expenseType,
  validDisplayName,
  validFullName,
  validAccountDetails,
  validCreditLimit,
  validBalance,
  validBillingDay,
  validBillingCycleDay,
  validPaymentDueDay,
  invalidDayValue,
  validPaymentMethodType
};
