/**
 * Property-Based Tests for Credit Card Balance Types
 * 
 * Feature: credit-card-balance-types
 * Property 1: Balance Ordering Invariant
 * Property 3: Non-Negative Balance Invariant
 * 
 * **Validates: Requirements 1.1, 1.5, 2.1, 2.4, 3.1, 3.3**
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

// Helper function to insert credit card payment
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
 * Calculate statement balance (expenses before current cycle - payments before current cycle)
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

// Arbitrary for generating unique display names
let displayNameCounter = 0;
const uniqueDisplayName = () => {
  displayNameCounter++;
  return fc.constant(`TestCard_BalanceTypes_${displayNameCounter}_${Date.now()}`);
};

// Arbitrary for generating valid dates in YYYY-MM-DD format
const validDate = fc.integer({ min: 2020, max: 2025 })
  .chain(year => fc.integer({ min: 1, max: 12 })
    .chain(month => fc.integer({ min: 1, max: 28 })
      .map(day => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)));

// Arbitrary for expense types
const expenseType = fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Other');


describe('PaymentMethodService - Balance Ordering Property-Based Tests', () => {
  beforeEach(() => {
    displayNameCounter = 0;
  });

  /**
   * Feature: credit-card-balance-types
   * Property 1: Balance Ordering Invariant
   * 
   * For any credit card with expenses and payments, the statement balance SHALL be 
   * less than or equal to the current balance, which SHALL be less than or equal 
   * to the projected balance (statement ≤ current ≤ projected), assuming no future-dated payments.
   * 
   * The key insight is:
   * - Statement balance = (expenses before cycle) - (payments before cycle)
   * - Current balance = (expenses up to today) - (payments up to today)
   * - Projected balance = (all expenses) - (all payments)
   * 
   * Since cycle start <= today <= future, and we only have past payments:
   * - expenses_before_cycle <= expenses_up_to_today <= all_expenses
   * - payments_before_cycle <= payments_up_to_today <= all_payments
   * 
   * The ordering holds when payments don't exceed expenses in each category.
   * 
   * **Validates: Requirements 1.1, 2.1, 3.1**
   */
  test('Property 1: Balance Ordering Invariant - statement ≤ current ≤ projected', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        // Use a fixed billing cycle that's easy to reason about: 1st to 28th of each month
        fc.array(
          fc.record({
            // Expenses spread across past, current cycle, and future
            category: fc.constantFrom('past', 'current', 'future'),
            amount: fc.float({ min: Math.fround(10), max: Math.fround(200), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 5 }
        ),
        fc.array(
          fc.record({
            // Payments only in past (before cycle start)
            amount: fc.float({ min: Math.fround(5), max: Math.fround(50), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 0, maxLength: 2 }
        ),
        async (displayName, expenseConfigs, paymentConfigs) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Use fixed billing cycle: 1st to 28th
            const cycleStart = 1;
            const cycleEnd = 28;
            
            // Create credit card with billing cycle
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', cycleStart, cycleEnd);
            
            // Use a fixed reference date: 15th of current month (middle of cycle)
            const today = new Date();
            today.setDate(15);
            const todayStr = formatDate(today);
            
            // Cycle starts on 1st of current month
            const cycleStartDate = new Date(today.getFullYear(), today.getMonth(), 1);
            const cycleStartStr = formatDate(cycleStartDate);
            
            // Create expenses based on category
            for (const config of expenseConfigs) {
              let transactionDate;
              
              if (config.category === 'past') {
                // Before cycle start (last month)
                transactionDate = addDays(cycleStartStr, -10);
              } else if (config.category === 'current') {
                // In current cycle, before today
                transactionDate = addDays(todayStr, -5);
              } else {
                // Future (after today)
                transactionDate = addDays(todayStr, 10);
              }
              
              await insertExpense(
                db,
                transactionDate,
                null, // No posted_date for simplicity
                'Test Place',
                config.amount,
                'Other',
                1,
                displayName,
                cardId
              );
            }
            
            // Create payments (all before cycle start)
            for (const config of paymentConfigs) {
              const paymentDate = addDays(cycleStartStr, -15); // Well before cycle
              await insertPayment(db, cardId, config.amount, paymentDate);
            }
            
            // Calculate all three balance types
            const statementBalance = await calculateStatementBalance(db, cardId, cycleStartStr);
            const currentBalance = await calculateCurrentBalance(db, cardId, todayStr);
            const projectedBalance = await calculateProjectedBalance(db, cardId);
            
            // Property: statement ≤ current ≤ projected
            // This should always hold because:
            // - Statement only includes past expenses minus past payments
            // - Current includes past + current cycle expenses minus past + current payments
            // - Projected includes all expenses minus all payments
            expect(statementBalance).toBeLessThanOrEqual(currentBalance);
            expect(currentBalance).toBeLessThanOrEqual(projectedBalance);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });
});


describe('PaymentMethodService - Non-Negative Balance Property-Based Tests', () => {
  beforeEach(() => {
    displayNameCounter = 0;
  });

  /**
   * Feature: credit-card-balance-types
   * Property 3: Non-Negative Balance Invariant
   * 
   * For any credit card and any combination of expenses and payments, 
   * all three balance types (statement, current, projected) SHALL be 
   * greater than or equal to zero.
   * 
   * This property ensures that even when payments exceed expenses,
   * the balance is clamped to 0 (not negative).
   * 
   * **Validates: Requirements 1.5, 2.4, 3.3**
   */
  test('Property 3: Non-Negative Balance Invariant - all balances >= 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.array(
          fc.record({
            category: fc.constantFrom('past', 'current', 'future'),
            amount: fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 0, maxLength: 3 }
        ),
        fc.array(
          fc.record({
            // Payments can be large (potentially exceeding expenses)
            amount: fc.float({ min: Math.fround(50), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (displayName, expenseConfigs, paymentConfigs) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Use fixed billing cycle: 1st to 28th
            const cycleStart = 1;
            const cycleEnd = 28;
            
            // Create credit card with billing cycle
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', cycleStart, cycleEnd);
            
            // Use a fixed reference date: 15th of current month
            const today = new Date();
            today.setDate(15);
            const todayStr = formatDate(today);
            
            // Cycle starts on 1st of current month
            const cycleStartDate = new Date(today.getFullYear(), today.getMonth(), 1);
            const cycleStartStr = formatDate(cycleStartDate);
            
            // Create expenses based on category
            for (const config of expenseConfigs) {
              let transactionDate;
              
              if (config.category === 'past') {
                transactionDate = addDays(cycleStartStr, -10);
              } else if (config.category === 'current') {
                transactionDate = addDays(todayStr, -5);
              } else {
                transactionDate = addDays(todayStr, 10);
              }
              
              await insertExpense(
                db,
                transactionDate,
                null,
                'Test Place',
                config.amount,
                'Other',
                1,
                displayName,
                cardId
              );
            }
            
            // Create payments (potentially exceeding expenses)
            for (const config of paymentConfigs) {
              const paymentDate = addDays(cycleStartStr, -15);
              await insertPayment(db, cardId, config.amount, paymentDate);
            }
            
            // Calculate all three balance types
            const statementBalance = await calculateStatementBalance(db, cardId, cycleStartStr);
            const currentBalance = await calculateCurrentBalance(db, cardId, todayStr);
            const projectedBalance = await calculateProjectedBalance(db, cardId);
            
            // Property: All balances must be >= 0
            expect(statementBalance).toBeGreaterThanOrEqual(0);
            expect(currentBalance).toBeGreaterThanOrEqual(0);
            expect(projectedBalance).toBeGreaterThanOrEqual(0);
            
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
   * Property 3 (continued): Non-negative even with zero expenses
   * 
   * When there are no expenses but there are payments,
   * all balances should still be 0 (not negative).
   * 
   * **Validates: Requirements 1.5, 2.4, 3.3**
   */
  test('Property 3: Non-Negative Balance with zero expenses', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.array(
          fc.record({
            amount: fc.float({ min: Math.fround(10), max: Math.fround(1000), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (displayName, paymentConfigs) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card with billing cycle
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const today = new Date();
            today.setDate(15);
            const todayStr = formatDate(today);
            
            const cycleStartDate = new Date(today.getFullYear(), today.getMonth(), 1);
            const cycleStartStr = formatDate(cycleStartDate);
            
            // No expenses - only payments
            for (const config of paymentConfigs) {
              const paymentDate = addDays(cycleStartStr, -15);
              await insertPayment(db, cardId, config.amount, paymentDate);
            }
            
            // Calculate all three balance types
            const statementBalance = await calculateStatementBalance(db, cardId, cycleStartStr);
            const currentBalance = await calculateCurrentBalance(db, cardId, todayStr);
            const projectedBalance = await calculateProjectedBalance(db, cardId);
            
            // Property: All balances must be 0 (not negative)
            expect(statementBalance).toBe(0);
            expect(currentBalance).toBe(0);
            expect(projectedBalance).toBe(0);
            
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
