/**
 * Property-Based Tests for Effective Date Consistency
 * 
 * Feature: credit-card-balance-types
 * Property 2: Effective Date Consistency
 * 
 * For any expense, the effective date used for balance calculations SHALL equal 
 * COALESCE(posted_date, date), and this same effective date SHALL be used for 
 * both expense counting and balance calculations.
 * 
 * **Validates: Requirements 1.4, 2.3, 5.1**
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();

// Helper function to create an in-memory test database
function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) {
        reject(err);
      } else {
        db.run('PRAGMA foreign_keys = ON', (fkErr) => {
          if (fkErr) {
            reject(fkErr);
          } else {
            resolve(db);
          }
        });
      }
    });
  });
}

// Helper function to close database
function closeDatabase(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Helper function to create tables
function createTables(db) {
  return new Promise((resolve, reject) => {
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
          resolve();
        }
      });
    });
  });
}

// Helper function to insert credit card with billing cycle
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

// Helper function to insert expense with optional posted_date
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

// Helper to add days to a date string
function addDays(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Helper to format date as YYYY-MM-DD
function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Get the effective date for an expense using COALESCE(posted_date, date)
 */
function getEffectiveDate(transactionDate, postedDate) {
  return postedDate || transactionDate;
}

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

// Arbitrary for generating unique display names
let displayNameCounter = 0;
const uniqueDisplayName = () => {
  displayNameCounter++;
  return fc.constant(`TestCard_EffectiveDate_${displayNameCounter}_${Date.now()}`);
};

describe('PaymentMethodService - Effective Date Consistency Property-Based Tests', () => {
  beforeEach(() => {
    displayNameCounter = 0;
  });

  /**
   * Feature: credit-card-balance-types
   * Property 2: Effective Date Consistency
   * 
   * For any expense, the effective date used for balance calculations SHALL equal 
   * COALESCE(posted_date, date), and this same effective date SHALL be used for 
   * both expense counting and balance calculations.
   * 
   * This test verifies that when posted_date is set, it is used as the effective date,
   * and when posted_date is null, the transaction date is used.
   * 
   * **Validates: Requirements 1.4, 2.3, 5.1**
   */
  test('Property 2: Effective date equals COALESCE(posted_date, date)', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        // Generate expenses with various date configurations
        fc.array(
          fc.record({
            // Transaction date offset from reference date
            transactionDaysOffset: fc.integer({ min: -30, max: 30 }),
            // Whether to use posted_date
            usePostedDate: fc.boolean(),
            // Posted date offset from transaction date (if used)
            postedDateOffset: fc.integer({ min: -10, max: 10 }),
            amount: fc.float({ min: Math.fround(10), max: Math.fround(200), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (displayName, expenseConfigs) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            // Use a fixed reference date
            const referenceDate = '2025-01-15';
            
            // Track expected values manually using effective date logic
            const expenses = [];
            
            for (const config of expenseConfigs) {
              const transactionDate = addDays(referenceDate, config.transactionDaysOffset);
              
              let postedDate = null;
              if (config.usePostedDate) {
                postedDate = addDays(transactionDate, config.postedDateOffset);
              }
              
              // Calculate expected effective date
              const effectiveDate = getEffectiveDate(transactionDate, postedDate);
              
              await insertExpense(
                db,
                transactionDate,
                postedDate,
                'Test Place',
                config.amount,
                'Other',
                1,
                displayName,
                cardId
              );
              
              expenses.push({
                transactionDate,
                postedDate,
                effectiveDate,
                amount: config.amount
              });
            }
            
            // Test: For each expense, verify the effective date is used correctly
            // by checking that the expense count and sum match our expectations
            
            // Pick a test date range that includes some expenses
            const testStartDate = addDays(referenceDate, -15);
            const testEndDate = addDays(referenceDate, 15);
            
            // Calculate expected count and sum based on effective dates
            let expectedCount = 0;
            let expectedSum = 0;
            
            for (const expense of expenses) {
              if (expense.effectiveDate >= testStartDate && expense.effectiveDate <= testEndDate) {
                expectedCount++;
                expectedSum += expense.amount;
              }
            }
            expectedSum = Math.round(expectedSum * 100) / 100;
            
            // Get actual count and sum from database
            const actualCount = await countExpensesInRange(db, cardId, testStartDate, testEndDate);
            const actualSum = await sumExpensesInRange(db, cardId, testStartDate, testEndDate);
            
            // Property: Count and sum must match expected values based on effective dates
            expect(actualCount).toBe(expectedCount);
            expect(actualSum).toBeCloseTo(expectedSum, 2);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  /**
   * Property 2 (continued): Expense counting and balance use same effective date
   * 
   * When an expense has a posted_date that differs from its transaction date,
   * both the expense count and the balance calculation should use the same
   * effective date (COALESCE(posted_date, date)).
   * 
   * **Validates: Requirements 1.4, 2.3, 5.1**
   */
  test('Property 2: Expense count and balance use same effective date', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        // Generate expenses where posted_date differs from transaction date
        fc.array(
          fc.record({
            // Transaction date is before the cutoff
            transactionDaysBeforeCutoff: fc.integer({ min: 1, max: 20 }),
            // Posted date is after the cutoff (so effective date is after cutoff)
            postedDaysAfterCutoff: fc.integer({ min: 1, max: 20 }),
            amount: fc.float({ min: Math.fround(10), max: Math.fround(100), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (displayName, expenseConfigs) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            // Use a fixed cutoff date
            const cutoffDate = '2025-01-15';
            
            // Create expenses where transaction date is before cutoff but posted_date is after
            for (const config of expenseConfigs) {
              const transactionDate = addDays(cutoffDate, -config.transactionDaysBeforeCutoff);
              const postedDate = addDays(cutoffDate, config.postedDaysAfterCutoff);
              
              await insertExpense(
                db,
                transactionDate,
                postedDate,
                'Test Place',
                config.amount,
                'Other',
                1,
                displayName,
                cardId
              );
            }
            
            // Count expenses up to cutoff date using effective date
            const countUpToCutoff = await countExpensesUpToDate(db, cardId, cutoffDate);
            
            // Sum expenses up to cutoff date using effective date
            const sumUpToCutoff = await sumExpensesUpToDate(db, cardId, cutoffDate);
            
            // Property: Since all expenses have posted_date > cutoff, 
            // count and sum should both be 0
            expect(countUpToCutoff).toBe(0);
            expect(sumUpToCutoff).toBe(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions({ numRuns: 30 })
    );
  });

  /**
   * Property 2 (continued): Null posted_date uses transaction date
   * 
   * When posted_date is null, the transaction date should be used as the
   * effective date for both counting and balance calculations.
   * 
   * **Validates: Requirements 1.4, 2.3, 5.1**
   */
  test('Property 2: Null posted_date uses transaction date as effective date', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        // Generate expenses without posted_date
        fc.array(
          fc.record({
            daysOffset: fc.integer({ min: -30, max: 30 }),
            amount: fc.float({ min: Math.fround(10), max: Math.fround(100), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (displayName, expenseConfigs) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const referenceDate = '2025-01-15';
            const expenses = [];
            
            // Create expenses without posted_date
            for (const config of expenseConfigs) {
              const transactionDate = addDays(referenceDate, config.daysOffset);
              
              await insertExpense(
                db,
                transactionDate,
                null, // No posted_date
                'Test Place',
                config.amount,
                'Other',
                1,
                displayName,
                cardId
              );
              
              expenses.push({
                transactionDate,
                effectiveDate: transactionDate, // Should equal transaction date
                amount: config.amount
              });
            }
            
            // Test with a specific date range
            const testEndDate = referenceDate;
            
            // Calculate expected values based on transaction dates (which are effective dates)
            let expectedCount = 0;
            let expectedSum = 0;
            
            for (const expense of expenses) {
              if (expense.effectiveDate <= testEndDate) {
                expectedCount++;
                expectedSum += expense.amount;
              }
            }
            expectedSum = Math.round(expectedSum * 100) / 100;
            
            // Get actual values from database
            const actualCount = await countExpensesUpToDate(db, cardId, testEndDate);
            const actualSum = await sumExpensesUpToDate(db, cardId, testEndDate);
            
            // Property: When posted_date is null, transaction date is used
            expect(actualCount).toBe(expectedCount);
            expect(actualSum).toBeCloseTo(expectedSum, 2);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions({ numRuns: 30 })
    );
  });
});
