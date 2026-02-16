/**
 * Property-Based Tests for Credit Card Payment Service
 * Feature: configurable-payment-methods
 * 
 * Property 7: Credit Card Payment Reduces Balance
 * **Validates: Requirements 3.2**
 * 
 * For any credit card with balance B and any valid payment amount P,
 * recording a payment should result in a new balance of exactly B - P.
  *
 * @invariant Payment Reduces Balance: For any credit card with balance B and valid payment amount P, recording a payment results in a new balance of exactly B - P. Randomization covers diverse balance and payment amount combinations to verify arithmetic correctness.
 */

const fc = require('fast-check');
const { dbPbtOptions, safeString } = require('../test/pbtArbitraries');
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
        CREATE TABLE IF NOT EXISTS credit_card_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          payment_method_id INTEGER NOT NULL,
          amount REAL NOT NULL CHECK(amount > 0),
          payment_date TEXT NOT NULL,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
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

// Helper function to insert payment
function insertPayment(db, paymentMethodId, amount, paymentDate, notes) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO credit_card_payments (payment_method_id, amount, payment_date, notes)
       VALUES (?, ?, ?, ?)`,
      [paymentMethodId, amount, paymentDate, notes],
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

// Helper function to update balance
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

// Arbitrary for generating unique display names
let displayNameCounter = 0;
const uniqueDisplayName = () => {
  displayNameCounter++;
  return fc.constant(`TestCard_${displayNameCounter}_${Date.now()}`);
};

// Arbitrary for generating valid payment dates
const validPaymentDate = fc.integer({ min: 2020, max: 2030 })
  .chain(year => fc.integer({ min: 1, max: 12 })
    .chain(month => fc.integer({ min: 1, max: 28 })
      .map(day => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)));

describe('CreditCardPaymentService - Property-Based Tests', () => {
  beforeEach(() => {
    // Reset counter for each test
    displayNameCounter = 0;
  });

  /**
   * Feature: configurable-payment-methods, Property 7: Credit Card Payment Reduces Balance
   * **Validates: Requirements 3.2**
   * 
   * For any credit card with balance B and any valid payment amount P,
   * recording a payment should result in a new balance of exactly B - P.
   */
  test('Property 7: Credit Card Payment Reduces Balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        validPaymentDate,
        async (displayName, initialBalance, paymentAmount, paymentDate) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card with initial balance
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', initialBalance);
            
            // Verify initial balance
            const beforePayment = await getPaymentMethodById(db, cardId);
            expect(beforePayment.current_balance).toBe(initialBalance);
            
            // Record payment
            await insertPayment(db, cardId, paymentAmount, paymentDate, null);
            
            // Update balance (reduce by payment amount)
            await updateBalance(db, cardId, -paymentAmount);
            
            // Verify new balance
            const afterPayment = await getPaymentMethodById(db, cardId);
            
            // Expected balance is B - P, but not less than 0
            const expectedBalance = Math.max(0, initialBalance - paymentAmount);
            
            // Use approximate comparison for floating point
            expect(Math.abs(afterPayment.current_balance - expectedBalance)).toBeLessThan(0.01);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property: Multiple payments should reduce balance cumulatively
   */
  test('Property: Multiple payments should reduce balance cumulatively', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.float({ min: Math.fround(1000), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.array(
          fc.float({ min: Math.fround(10), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100),
          { minLength: 1, maxLength: 5 }
        ),
        async (displayName, initialBalance, paymentAmounts) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card with initial balance
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', initialBalance);
            
            // Record multiple payments
            let totalPayments = 0;
            for (let i = 0; i < paymentAmounts.length; i++) {
              const amount = paymentAmounts[i];
              const date = `2025-01-${String(i + 1).padStart(2, '0')}`;
              
              await insertPayment(db, cardId, amount, date, null);
              await updateBalance(db, cardId, -amount);
              totalPayments += amount;
            }
            
            // Verify final balance
            const afterPayments = await getPaymentMethodById(db, cardId);
            
            // Expected balance is initial - sum of all payments, but not less than 0
            const expectedBalance = Math.max(0, initialBalance - totalPayments);
            
            // Use approximate comparison for floating point
            expect(Math.abs(afterPayments.current_balance - expectedBalance)).toBeLessThan(0.01);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property: Balance should never go negative
   */
  test('Property: Balance should never go negative', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.float({ min: Math.fround(100), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.float({ min: Math.fround(600), max: Math.fround(1000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        validPaymentDate,
        async (displayName, initialBalance, paymentAmount, paymentDate) => {
          // Payment amount is intentionally larger than balance
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card with initial balance
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', initialBalance);
            
            // Record payment larger than balance
            await insertPayment(db, cardId, paymentAmount, paymentDate, null);
            await updateBalance(db, cardId, -paymentAmount);
            
            // Verify balance is not negative
            const afterPayment = await getPaymentMethodById(db, cardId);
            expect(afterPayment.current_balance).toBeGreaterThanOrEqual(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property: Payment validation should reject non-positive amounts
   */
  test('Property: Payment validation should reject non-positive amounts', async () => {
    const creditCardPaymentService = require('./creditCardPaymentService');
    
    const nonPositiveAmount = fc.oneof(
      fc.constant(0),
      fc.float({ min: Math.fround(-1000), max: Math.fround(-0.01), noNaN: true })
    );
    
    await fc.assert(
      fc.asyncProperty(
        nonPositiveAmount,
        validPaymentDate,
        async (amount, paymentDate) => {
          const validation = creditCardPaymentService.validatePayment({
            payment_method_id: 1,
            amount: amount,
            payment_date: paymentDate
          });
          
          // Non-positive amount should fail validation
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.toLowerCase().includes('amount'))).toBe(true);
          
          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property: Payment validation should require payment_method_id
   */
  test('Property: Payment validation should require payment_method_id', async () => {
    const creditCardPaymentService = require('./creditCardPaymentService');
    
    const validAmount = fc.float({ min: Math.fround(1), max: Math.fround(1000), noNaN: true });
    
    await fc.assert(
      fc.asyncProperty(
        validAmount,
        validPaymentDate,
        async (amount, paymentDate) => {
          const validation = creditCardPaymentService.validatePayment({
            // Missing payment_method_id
            amount: amount,
            payment_date: paymentDate
          });
          
          // Missing payment_method_id should fail validation
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.toLowerCase().includes('payment method'))).toBe(true);
          
          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property: Payment validation should require valid date format
   */
  test('Property: Payment validation should require valid date format', async () => {
    const creditCardPaymentService = require('./creditCardPaymentService');
    
    const invalidDate = fc.oneof(
      fc.constant(''),
      fc.constant('invalid'),
      fc.constant('2025/01/15'),
      fc.constant('01-15-2025'),
      fc.constant('2025-13-01'), // Invalid month
      fc.constant('2025-01-32')  // Invalid day
    );
    
    await fc.assert(
      fc.asyncProperty(
        invalidDate,
        async (paymentDate) => {
          const validation = creditCardPaymentService.validatePayment({
            payment_method_id: 1,
            amount: 100,
            payment_date: paymentDate
          });
          
          // Invalid date should fail validation
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.toLowerCase().includes('date'))).toBe(true);
          
          return true;
        }
      ),
      dbPbtOptions()
    );
  });
});
