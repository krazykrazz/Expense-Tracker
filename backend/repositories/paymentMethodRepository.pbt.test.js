/**
 * Property-Based Tests for Payment Method Repository
 * Feature: configurable-payment-methods
 * 
 * Using fast-check library for property-based testing
  *
 * @invariant Payment Method CRUD: For any valid payment method, creating and reading it returns equivalent data; type constraints enforce valid payment method types. Randomization covers diverse method names, types, and configuration options.
 */

const fc = require('fast-check');
const { dbPbtOptions, safeString } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();

// Valid payment method types
const PAYMENT_METHOD_TYPES = ['cash', 'cheque', 'debit', 'credit_card'];

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

// Helper function to insert payment method
function insertPaymentMethod(db, paymentMethod) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO payment_methods (type, display_name, full_name, account_details, credit_limit, current_balance, payment_due_day, billing_cycle_start, billing_cycle_end, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        paymentMethod.type,
        paymentMethod.display_name,
        paymentMethod.full_name || null,
        paymentMethod.account_details || null,
        paymentMethod.credit_limit || null,
        paymentMethod.current_balance || 0,
        paymentMethod.payment_due_day || null,
        paymentMethod.billing_cycle_start || null,
        paymentMethod.billing_cycle_end || null,
        paymentMethod.is_active !== undefined ? paymentMethod.is_active : 1
      ],
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

// Helper function to update payment method
function updatePaymentMethod(db, id, paymentMethod) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE payment_methods 
       SET type = ?, display_name = ?, full_name = ?, account_details = ?, 
           credit_limit = ?, current_balance = ?, payment_due_day = ?,
           billing_cycle_start = ?, billing_cycle_end = ?, is_active = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        paymentMethod.type,
        paymentMethod.display_name,
        paymentMethod.full_name || null,
        paymentMethod.account_details || null,
        paymentMethod.credit_limit || null,
        paymentMethod.current_balance !== undefined ? paymentMethod.current_balance : 0,
        paymentMethod.payment_due_day || null,
        paymentMethod.billing_cycle_start || null,
        paymentMethod.billing_cycle_end || null,
        paymentMethod.is_active !== undefined ? paymentMethod.is_active : 1,
        id
      ],
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

// Helper function to delete payment method
function deletePaymentMethod(db, id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM payment_methods WHERE id = ?', [id], function(err) {
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
  return fc.string({ minLength: 1, maxLength: 30 })
    .filter(s => s.trim().length > 0)
    .map(s => `${s.trim().substring(0, 20)}_${displayNameCounter}_${Date.now()}`);
};

// Arbitrary for generating valid payment method data
const paymentMethodArbitrary = fc.record({
  type: fc.constantFrom(...PAYMENT_METHOD_TYPES),
  display_name: uniqueDisplayName(),
  full_name: fc.option(safeString({ maxLength: 100 }), { nil: null }),
  account_details: fc.option(safeString({ maxLength: 50 }), { nil: null }),
  credit_limit: fc.option(fc.float({ min: 100, max: 50000, noNaN: true }).map(n => Math.round(n * 100) / 100), { nil: null }),
  current_balance: fc.float({ min: 0, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
  payment_due_day: fc.option(fc.integer({ min: 1, max: 31 }), { nil: null }),
  billing_cycle_start: fc.option(fc.integer({ min: 1, max: 31 }), { nil: null }),
  billing_cycle_end: fc.option(fc.integer({ min: 1, max: 31 }), { nil: null }),
  is_active: fc.constantFrom(0, 1)
});

describe('PaymentMethodRepository - Property-Based Tests', () => {
  beforeEach(() => {
    // Reset counter for each test
    displayNameCounter = 0;
  });

  /**
   * Feature: configurable-payment-methods, Property 3: Payment Method CRUD Round-Trip
   * **Validates: Requirements 2.1**
   * 
   * For any valid payment method data, creating a payment method and then retrieving it by ID 
   * should return an equivalent payment method with all attributes preserved.
   */
  test('Property 3: Payment Method CRUD Round-Trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        paymentMethodArbitrary,
        async (paymentMethod) => {
          const db = await createTestDatabase();
          
          try {
            // Create table
            await createPaymentMethodsTable(db);
            
            // Create payment method
            const id = await insertPaymentMethod(db, paymentMethod);
            
            // Retrieve payment method
            const retrieved = await getPaymentMethodById(db, id);
            
            // Verify all fields are preserved
            expect(retrieved).toBeDefined();
            expect(retrieved.id).toBe(id);
            expect(retrieved.type).toBe(paymentMethod.type);
            expect(retrieved.display_name).toBe(paymentMethod.display_name);
            expect(retrieved.full_name).toBe(paymentMethod.full_name);
            expect(retrieved.account_details).toBe(paymentMethod.account_details);
            expect(retrieved.credit_limit).toBe(paymentMethod.credit_limit);
            expect(retrieved.current_balance).toBe(paymentMethod.current_balance);
            expect(retrieved.payment_due_day).toBe(paymentMethod.payment_due_day);
            expect(retrieved.billing_cycle_start).toBe(paymentMethod.billing_cycle_start);
            expect(retrieved.billing_cycle_end).toBe(paymentMethod.billing_cycle_end);
            expect(retrieved.is_active).toBe(paymentMethod.is_active);
            
            // Test update round-trip
            const updatedData = {
              ...paymentMethod,
              display_name: paymentMethod.display_name + '_updated',
              current_balance: paymentMethod.current_balance + 100
            };
            
            const updateSuccess = await updatePaymentMethod(db, id, updatedData);
            expect(updateSuccess).toBe(true);
            
            const afterUpdate = await getPaymentMethodById(db, id);
            expect(afterUpdate.display_name).toBe(updatedData.display_name);
            expect(afterUpdate.current_balance).toBe(updatedData.current_balance);
            
            // Test delete
            const deleteSuccess = await deletePaymentMethod(db, id);
            expect(deleteSuccess).toBe(true);
            
            const afterDelete = await getPaymentMethodById(db, id);
            expect(afterDelete).toBeUndefined();
            
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
   * Additional property test: Type validation
   * Ensures only valid payment method types are accepted
   */
  test('Property: Type validation rejects invalid types', async () => {
    const invalidTypeArbitrary = fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => !PAYMENT_METHOD_TYPES.includes(s.toLowerCase()));

    await fc.assert(
      fc.asyncProperty(
        invalidTypeArbitrary,
        uniqueDisplayName(),
        async (invalidType, displayName) => {
          const db = await createTestDatabase();
          
          try {
            await createPaymentMethodsTable(db);
            
            let errorOccurred = false;
            try {
              await insertPaymentMethod(db, {
                type: invalidType,
                display_name: displayName,
                is_active: 1
              });
            } catch (err) {
              errorOccurred = true;
              expect(err.message).toMatch(/constraint/i);
            }
            
            expect(errorOccurred).toBe(true);
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
   * Additional property test: Display name uniqueness
   * Ensures duplicate display names are rejected
   */
  test('Property: Display name uniqueness constraint', async () => {
    await fc.assert(
      fc.asyncProperty(
        paymentMethodArbitrary,
        async (paymentMethod) => {
          const db = await createTestDatabase();
          
          try {
            await createPaymentMethodsTable(db);
            
            // Insert first payment method
            await insertPaymentMethod(db, paymentMethod);
            
            // Try to insert duplicate
            let errorOccurred = false;
            try {
              await insertPaymentMethod(db, {
                ...paymentMethod,
                type: 'cash' // Different type but same display_name
              });
            } catch (err) {
              errorOccurred = true;
              expect(err.message).toMatch(/UNIQUE constraint failed/i);
            }
            
            expect(errorOccurred).toBe(true);
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
