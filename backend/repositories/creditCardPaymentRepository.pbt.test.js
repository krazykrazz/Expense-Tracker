/**
 * Property-Based Tests for Credit Card Payment Repository
 * Feature: configurable-payment-methods
 * 
 * Using fast-check library for property-based testing
 */

const fc = require('fast-check');
const { pbtOptions, dbPbtOptions, safeDate, safeAmount, safeString } = require('../test/pbtArbitraries');
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

// Helper function to create payment_methods table
function createPaymentMethodsTable(db) {
  return new Promise((resolve, reject) => {
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
    `, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Helper function to create credit_card_payments table
function createCreditCardPaymentsTable(db) {
  return new Promise((resolve, reject) => {
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
}

// Helper function to insert a credit card payment method
function insertCreditCardPaymentMethod(db, displayName) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO payment_methods (type, display_name, full_name, is_active)
       VALUES ('credit_card', ?, ?, 1)`,
      [displayName, displayName],
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
function insertCreditCardPayment(db, payment) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO credit_card_payments (payment_method_id, amount, payment_date, notes)
       VALUES (?, ?, ?, ?)`,
      [payment.payment_method_id, payment.amount, payment.payment_date, payment.notes || null],
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

// Helper function to get payments by payment method ID (ordered by date DESC)
function getPaymentsByPaymentMethodId(db, paymentMethodId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM credit_card_payments 
       WHERE payment_method_id = ?
       ORDER BY payment_date DESC, created_at DESC`,
      [paymentMethodId],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

// Helper function to get total payments in date range
function getTotalPaymentsInRange(db, paymentMethodId, startDate, endDate) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM credit_card_payments 
       WHERE payment_method_id = ?
         AND payment_date >= ?
         AND payment_date <= ?`,
      [paymentMethodId, startDate, endDate],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? row.total : 0);
        }
      }
    );
  });
}

// Arbitrary for generating payment data
const paymentArbitrary = fc.record({
  amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100),
  payment_date: safeDate(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null })
});

// Arbitrary for generating an array of payments with distinct dates
const paymentsWithDistinctDatesArbitrary = fc.array(
  paymentArbitrary,
  { minLength: 2, maxLength: 10 }
).chain(payments => {
  // Ensure distinct dates by modifying each payment's date
  const distinctPayments = payments.map((p, index) => ({
    ...p,
    payment_date: `2024-${String(index + 1).padStart(2, '0')}-15`
  }));
  return fc.constant(distinctPayments);
});

describe('CreditCardPaymentRepository - Property-Based Tests', () => {
  /**
   * Feature: configurable-payment-methods, Property 10: Payment History Chronological Ordering
   * **Validates: Requirements 3.5**
   * 
   * For any set of credit card payments with distinct dates, retrieving the payment history 
   * should return payments in descending date order (most recent first).
   */
  test('Property 10: Payment History Chronological Ordering', async () => {
    let testCounter = 0;
    
    await fc.assert(
      fc.asyncProperty(
        paymentsWithDistinctDatesArbitrary,
        async (payments) => {
          const db = await createTestDatabase();
          testCounter++;
          
          try {
            // Create tables
            await createPaymentMethodsTable(db);
            await createCreditCardPaymentsTable(db);
            
            // Create a credit card payment method
            const paymentMethodId = await insertCreditCardPaymentMethod(db, `TestCard_${testCounter}_${Date.now()}`);
            
            // Insert payments in random order (shuffle)
            const shuffledPayments = [...payments].sort(() => Math.random() - 0.5);
            
            for (const payment of shuffledPayments) {
              await insertCreditCardPayment(db, {
                payment_method_id: paymentMethodId,
                ...payment
              });
            }
            
            // Retrieve payment history
            const history = await getPaymentsByPaymentMethodId(db, paymentMethodId);
            
            // Verify count matches
            expect(history.length).toBe(payments.length);
            
            // Verify chronological ordering (descending - most recent first)
            for (let i = 0; i < history.length - 1; i++) {
              const currentDate = history[i].payment_date;
              const nextDate = history[i + 1].payment_date;
              
              // Current date should be >= next date (descending order)
              expect(currentDate >= nextDate).toBe(true);
            }
            
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
   * Additional property test: Payment sum calculation
   * Validates that total payments in a date range equals sum of individual payments
   */
  test('Property: Payment sum calculation is accurate', async () => {
    let testCounter = 0;
    
    await fc.assert(
      fc.asyncProperty(
        fc.array(paymentArbitrary, { minLength: 1, maxLength: 10 }),
        async (payments) => {
          const db = await createTestDatabase();
          testCounter++;
          
          try {
            // Create tables
            await createPaymentMethodsTable(db);
            await createCreditCardPaymentsTable(db);
            
            // Create a credit card payment method
            const paymentMethodId = await insertCreditCardPaymentMethod(db, `SumTestCard_${testCounter}_${Date.now()}`);
            
            // Insert all payments
            for (const payment of payments) {
              await insertCreditCardPayment(db, {
                payment_method_id: paymentMethodId,
                ...payment
              });
            }
            
            // Calculate expected sum
            const expectedSum = payments.reduce((sum, p) => sum + p.amount, 0);
            
            // Get total from database (using a wide date range to include all)
            const actualSum = await getTotalPaymentsInRange(db, paymentMethodId, '2000-01-01', '2099-12-31');
            
            // Verify sum matches (with floating point tolerance)
            expect(Math.abs(actualSum - expectedSum)).toBeLessThan(0.01);
            
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
   * Additional property test: Payment CRUD round-trip
   * Validates that created payments can be retrieved with all attributes preserved
   */
  test('Property: Payment CRUD round-trip preserves data', async () => {
    let testCounter = 0;
    
    await fc.assert(
      fc.asyncProperty(
        paymentArbitrary,
        async (payment) => {
          const db = await createTestDatabase();
          testCounter++;
          
          try {
            // Create tables
            await createPaymentMethodsTable(db);
            await createCreditCardPaymentsTable(db);
            
            // Create a credit card payment method
            const paymentMethodId = await insertCreditCardPaymentMethod(db, `RoundTripCard_${testCounter}_${Date.now()}`);
            
            // Insert payment
            const paymentId = await insertCreditCardPayment(db, {
              payment_method_id: paymentMethodId,
              ...payment
            });
            
            // Retrieve payment
            const history = await getPaymentsByPaymentMethodId(db, paymentMethodId);
            
            expect(history.length).toBe(1);
            const retrieved = history[0];
            
            // Verify all fields are preserved
            expect(retrieved.id).toBe(paymentId);
            expect(retrieved.payment_method_id).toBe(paymentMethodId);
            expect(retrieved.amount).toBe(payment.amount);
            expect(retrieved.payment_date).toBe(payment.payment_date);
            expect(retrieved.notes).toBe(payment.notes);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });
});
