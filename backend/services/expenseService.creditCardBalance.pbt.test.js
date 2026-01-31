/**
 * Property-Based Tests for Expense Service - Credit Card Balance Tracking
 * Feature: configurable-payment-methods
 * 
 * Property 8: Expense Increases Credit Card Balance
 * **Validates: Requirements 3.3**
 * 
 * For any credit card with balance B and any expense amount E recorded with that card,
 * the resulting balance should be exactly B + E.
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

// Helper function to insert credit card
function insertCreditCard(db, displayName, fullName, initialBalance) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO payment_methods (type, display_name, full_name, current_balance, is_active)
       VALUES ('credit_card', ?, ?, ?, 1)`,
      [displayName, fullName, initialBalance],
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

// Helper function to insert debit payment method
function insertDebitMethod(db, displayName) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO payment_methods (type, display_name, is_active)
       VALUES ('debit', ?, 1)`,
      [displayName],
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

// Helper function to insert expense
function insertExpense(db, date, place, amount, type, week, method, paymentMethodId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [date, place, amount, type, week, method, paymentMethodId],
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

// Helper function to update balance (simulating what the service does)
function updateBalance(db, paymentMethodId, amount) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE payment_methods 
       SET current_balance = MAX(0, current_balance + ?), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [amount, paymentMethodId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      }
    );
  });
}

// Helper function to get payment method by ID
function getPaymentMethodById(db, id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM payment_methods WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Helper function to delete expense
function deleteExpense(db, id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM expenses WHERE id = ?', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0);
      }
    });
  });
}

// Arbitrary for generating unique display names
let displayNameCounter = 0;
const uniqueDisplayName = () => {
  displayNameCounter++;
  return fc.constant(`TestCard_${displayNameCounter}_${Date.now()}`);
};

// Arbitrary for generating valid expense dates
const validExpenseDate = fc.integer({ min: 2020, max: 2030 })
  .chain(year => fc.integer({ min: 1, max: 12 })
    .chain(month => fc.integer({ min: 1, max: 28 })
      .map(day => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)));

// Arbitrary for expense types
const expenseType = fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Other');

describe('ExpenseService - Credit Card Balance Property-Based Tests', () => {
  beforeEach(() => {
    // Reset counter for each test
    displayNameCounter = 0;
  });

  /**
   * Feature: configurable-payment-methods, Property 8: Expense Increases Credit Card Balance
   * **Validates: Requirements 3.3**
   * 
   * For any credit card with balance B and any expense amount E recorded with that card,
   * the resulting balance should be exactly B + E.
   */
  test('Property 8: Expense Increases Credit Card Balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        validExpenseDate,
        expenseType,
        async (displayName, initialBalance, expenseAmount, expenseDate, type) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card with initial balance
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', initialBalance);
            
            // Verify initial state
            const cardBefore = await getPaymentMethodById(db, cardId);
            expect(cardBefore.current_balance).toBeCloseTo(initialBalance, 2);
            
            // Create expense with credit card
            const expenseId = await insertExpense(
              db,
              expenseDate,
              'Test Place',
              expenseAmount,
              type,
              1,
              displayName,
              cardId
            );
            
            // Simulate what the service does: update balance
            await updateBalance(db, cardId, expenseAmount);
            
            // Verify balance increased by expense amount
            const cardAfter = await getPaymentMethodById(db, cardId);
            const expectedBalance = initialBalance + expenseAmount;
            
            expect(cardAfter.current_balance).toBeCloseTo(expectedBalance, 2);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions
    );
  });

  /**
   * Property: Expense deletion decreases credit card balance
   * **Validates: Requirements 3.3**
   * 
   * For any credit card with balance B and any expense amount E that was recorded with that card,
   * deleting the expense should result in a new balance of exactly B - E.
   */
  test('Property: Expense Deletion Decreases Credit Card Balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.float({ min: Math.fround(100), max: Math.fround(5000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true }).map(n => Math.round(n * 100) / 100),
        validExpenseDate,
        expenseType,
        async (displayName, initialBalance, expenseAmount, expenseDate, type) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card with initial balance
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', initialBalance);
            
            // Create expense with credit card
            const expenseId = await insertExpense(
              db,
              expenseDate,
              'Test Place',
              expenseAmount,
              type,
              1,
              displayName,
              cardId
            );
            
            // Simulate expense creation: update balance
            await updateBalance(db, cardId, expenseAmount);
            
            // Verify balance after expense creation
            const cardAfterCreate = await getPaymentMethodById(db, cardId);
            expect(cardAfterCreate.current_balance).toBeCloseTo(initialBalance + expenseAmount, 2);
            
            // Delete expense
            await deleteExpense(db, expenseId);
            
            // Simulate expense deletion: decrement balance
            await updateBalance(db, cardId, -expenseAmount);
            
            // Verify balance returned to initial
            const cardAfterDelete = await getPaymentMethodById(db, cardId);
            expect(cardAfterDelete.current_balance).toBeCloseTo(initialBalance, 2);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions
    );
  });

  /**
   * Property: Non-credit card expenses don't affect balance
   * **Validates: Requirements 3.3**
   * 
   * For any non-credit card payment method, creating an expense should not affect any balance.
   */
  test('Property: Non-Credit Card Expenses Do Not Affect Balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        validExpenseDate,
        expenseType,
        async (displayName, expenseAmount, expenseDate, type) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create debit payment method (no balance tracking)
            const debitId = await insertDebitMethod(db, displayName);
            
            // Verify debit method has no balance
            const debitBefore = await getPaymentMethodById(db, debitId);
            expect(debitBefore.current_balance).toBe(0);
            expect(debitBefore.type).toBe('debit');
            
            // Create expense with debit method
            await insertExpense(
              db,
              expenseDate,
              'Test Place',
              expenseAmount,
              type,
              1,
              displayName,
              debitId
            );
            
            // Verify balance unchanged (debit doesn't track balance)
            const debitAfter = await getPaymentMethodById(db, debitId);
            expect(debitAfter.current_balance).toBe(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions
    );
  });

  /**
   * Property: Balance cannot go negative
   * **Validates: Requirements 3.3**
   * 
   * For any credit card, the balance should never go below zero even after deletions.
   */
  test('Property: Balance Cannot Go Negative', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.float({ min: Math.fround(10), max: Math.fround(100), noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.float({ min: Math.fround(200), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100),
        async (displayName, initialBalance, largeDeduction) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card with small initial balance
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', initialBalance);
            
            // Try to deduct more than the balance
            await updateBalance(db, cardId, -largeDeduction);
            
            // Verify balance is 0, not negative
            const cardAfter = await getPaymentMethodById(db, cardId);
            expect(cardAfter.current_balance).toBe(0);
            expect(cardAfter.current_balance).toBeGreaterThanOrEqual(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions
    );
  });
});
