/**
 * Property-Based Tests for Expense Count and Balance Consistency
 * 
 * Feature: credit-card-balance-types
 * Property 5: Expense Count and Balance Consistency
 * 
 * For any expense with a posted_date change, if the expense moves into or out of 
 * the current billing cycle based on effective_date, both the expense count and 
 * the current balance SHALL reflect this change consistently.
 * 
 * **Validates: Requirements 5.2, 5.3, 5.4**
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

// Helper function to update expense posted_date
function updateExpensePostedDate(db, expenseId, newPostedDate) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE expenses SET posted_date = ? WHERE id = ?`,
      [newPostedDate, expenseId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
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
 * Count expenses in a billing cycle using effective_date
 */
function countExpensesInCycle(db, paymentMethodId, cycleStartDate, cycleEndDate) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(*) as count
       FROM expenses 
       WHERE payment_method_id = ? 
       AND COALESCE(posted_date, date) >= ? 
       AND COALESCE(posted_date, date) <= ?`,
      [paymentMethodId, cycleStartDate, cycleEndDate],
      (err, row) => {
        if (err) return reject(err);
        resolve(row?.count || 0);
      }
    );
  });
}

/**
 * Calculate current balance (expenses with effective_date <= today - payments <= today)
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

// Arbitrary for generating unique display names
let displayNameCounter = 0;
const uniqueDisplayName = () => {
  displayNameCounter++;
  return fc.constant(`TestCard_ExpenseCount_${displayNameCounter}_${Date.now()}`);
};

describe('PaymentMethodService - Expense Count and Balance Consistency Property-Based Tests', () => {
  beforeEach(() => {
    displayNameCounter = 0;
  });

  /**
   * Feature: credit-card-balance-types
   * Property 5: Expense Count and Balance Consistency
   * 
   * For any expense with a posted_date change, if the expense moves into or out of 
   * the current billing cycle based on effective_date, both the expense count and 
   * the current balance SHALL reflect this change consistently.
   * 
   * This test verifies that when posted_date is changed, both expense count and
   * balance update accordingly.
   * 
   * **Validates: Requirements 5.2, 5.3, 5.4**
   */
  test('Property 5: Posted_date change affects both expense count and balance consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        // Generate an expense that will move in/out of cycle when posted_date changes
        fc.record({
          // Transaction date inside the cycle
          transactionDaysIntoCycle: fc.integer({ min: 5, max: 10 }),
          // Initial posted_date inside cycle AND before today (1-10 days into cycle, today is 15th)
          initialPostedDaysIntoCycle: fc.integer({ min: 1, max: 10 }),
          // New posted_date outside cycle (before cycle start)
          newPostedDaysBeforeCycle: fc.integer({ min: 1, max: 15 }),
          amount: fc.float({ min: Math.fround(50), max: Math.fround(200), noNaN: true }).map(n => Math.round(n * 100) / 100)
        }),
        async (displayName, config) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card with billing cycle: 1st to 28th
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            // Define cycle dates: January 2025
            const cycleStartDate = '2025-01-01';
            const cycleEndDate = '2025-01-28';
            const todayStr = '2025-01-15'; // Middle of cycle
            
            // Calculate dates - ensure initial posted_date is <= today
            const transactionDate = addDays(cycleStartDate, config.transactionDaysIntoCycle);
            const initialPostedDate = addDays(cycleStartDate, config.initialPostedDaysIntoCycle);
            const newPostedDate = addDays(cycleStartDate, -config.newPostedDaysBeforeCycle);
            
            // Insert expense with initial posted_date inside cycle and <= today
            const expenseId = await insertExpense(
              db,
              transactionDate,
              initialPostedDate,
              'Test Place',
              config.amount,
              'Other',
              1,
              displayName,
              cardId
            );
            
            // Get initial count and balance
            const initialCount = await countExpensesInCycle(db, cardId, cycleStartDate, cycleEndDate);
            const initialBalance = await calculateCurrentBalance(db, cardId, todayStr);
            
            // Verify expense is initially in cycle and in balance (posted_date <= today)
            expect(initialCount).toBe(1);
            expect(initialBalance).toBeCloseTo(config.amount, 2);
            
            // Update posted_date to move expense out of cycle (but still <= today)
            await updateExpensePostedDate(db, expenseId, newPostedDate);
            
            // Get updated count and balance
            const updatedCount = await countExpensesInCycle(db, cardId, cycleStartDate, cycleEndDate);
            const updatedBalance = await calculateCurrentBalance(db, cardId, todayStr);
            
            // Property: Both count and balance should reflect the change consistently
            // Since expense moved out of current cycle (before cycle start),
            // it should no longer be counted in the cycle
            expect(updatedCount).toBe(0);
            
            // The balance should still include the expense because its effective date
            // (the new posted_date) is still <= today (it's before cycle start, which is before today)
            expect(updatedBalance).toBeCloseTo(config.amount, 2);
            
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
   * Property 5 (continued): Moving expense into cycle updates both count and balance
   * 
   * When an expense's posted_date is changed to move it INTO the current billing cycle,
   * both the expense count and balance should update consistently.
   * 
   * **Validates: Requirements 5.2, 5.3, 5.4**
   */
  test('Property 5: Moving expense into cycle updates count and balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.record({
          // Transaction date before cycle
          transactionDaysBeforeCycle: fc.integer({ min: 5, max: 20 }),
          // Initial posted_date before cycle
          initialPostedDaysBeforeCycle: fc.integer({ min: 1, max: 15 }),
          // New posted_date inside cycle
          newPostedDaysIntoCycle: fc.integer({ min: 1, max: 25 }),
          amount: fc.float({ min: Math.fround(50), max: Math.fround(200), noNaN: true }).map(n => Math.round(n * 100) / 100)
        }),
        async (displayName, config) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const cycleStartDate = '2025-01-01';
            const cycleEndDate = '2025-01-28';
            const todayStr = '2025-01-28'; // End of cycle to include all cycle expenses
            
            // Calculate dates
            const transactionDate = addDays(cycleStartDate, -config.transactionDaysBeforeCycle);
            const initialPostedDate = addDays(cycleStartDate, -config.initialPostedDaysBeforeCycle);
            const newPostedDate = addDays(cycleStartDate, config.newPostedDaysIntoCycle);
            
            // Insert expense with initial posted_date before cycle
            const expenseId = await insertExpense(
              db,
              transactionDate,
              initialPostedDate,
              'Test Place',
              config.amount,
              'Other',
              1,
              displayName,
              cardId
            );
            
            // Get initial count (expense should NOT be in cycle)
            const initialCount = await countExpensesInCycle(db, cardId, cycleStartDate, cycleEndDate);
            
            // Verify expense is initially NOT in cycle
            expect(initialCount).toBe(0);
            
            // Update posted_date to move expense into cycle
            await updateExpensePostedDate(db, expenseId, newPostedDate);
            
            // Get updated count (expense should now be in cycle)
            const updatedCount = await countExpensesInCycle(db, cardId, cycleStartDate, cycleEndDate);
            const updatedBalance = await calculateCurrentBalance(db, cardId, todayStr);
            
            // Property: Both count and balance should reflect the change
            expect(updatedCount).toBe(1);
            expect(updatedBalance).toBeCloseTo(config.amount, 2);
            
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
   * Property 5 (continued): Multiple expenses maintain consistency
   * 
   * When multiple expenses exist and one has its posted_date changed,
   * the count and balance should update correctly for all expenses.
   * 
   * **Validates: Requirements 5.2, 5.3, 5.4**
   */
  test('Property 5: Multiple expenses maintain count and balance consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        // Generate multiple expenses
        fc.array(
          fc.record({
            daysIntoCycle: fc.integer({ min: 1, max: 25 }),
            amount: fc.float({ min: Math.fround(20), max: Math.fround(100), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 2, maxLength: 5 }
        ),
        // Index of expense to modify
        fc.nat(),
        async (displayName, expenseConfigs, modifyIndexRaw) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const cycleStartDate = '2025-01-01';
            const cycleEndDate = '2025-01-28';
            const todayStr = '2025-01-28';
            
            const expenseIds = [];
            let totalAmount = 0;
            
            // Create all expenses inside the cycle
            for (const config of expenseConfigs) {
              const transactionDate = addDays(cycleStartDate, config.daysIntoCycle);
              
              const expenseId = await insertExpense(
                db,
                transactionDate,
                null, // No posted_date initially
                'Test Place',
                config.amount,
                'Other',
                1,
                displayName,
                cardId
              );
              
              expenseIds.push(expenseId);
              totalAmount += config.amount;
            }
            totalAmount = Math.round(totalAmount * 100) / 100;
            
            // Verify initial state
            const initialCount = await countExpensesInCycle(db, cardId, cycleStartDate, cycleEndDate);
            const initialBalance = await calculateCurrentBalance(db, cardId, todayStr);
            
            expect(initialCount).toBe(expenseConfigs.length);
            expect(initialBalance).toBeCloseTo(totalAmount, 2);
            
            // Modify one expense to move it out of cycle
            const modifyIndex = modifyIndexRaw % expenseConfigs.length;
            const newPostedDate = addDays(cycleStartDate, -10); // Before cycle
            
            await updateExpensePostedDate(db, expenseIds[modifyIndex], newPostedDate);
            
            // Get updated values
            const updatedCount = await countExpensesInCycle(db, cardId, cycleStartDate, cycleEndDate);
            const updatedBalance = await calculateCurrentBalance(db, cardId, todayStr);
            
            // Property: Count should decrease by 1, balance should still include all
            // (because the expense's effective date is still <= today)
            expect(updatedCount).toBe(expenseConfigs.length - 1);
            expect(updatedBalance).toBeCloseTo(totalAmount, 2);
            
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
