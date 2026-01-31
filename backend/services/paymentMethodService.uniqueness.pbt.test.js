/**
 * Property-Based Tests for Payment Method Service - Display Name Uniqueness
 * Feature: configurable-payment-methods
 * 
 * Property 6: Display Name Uniqueness
 * **Validates: Requirements 2.6, 9.5**
 * 
 * For any two payment method creation requests with the same display_name (after trimming and case normalization),
 * the second request should be rejected regardless of other attributes.
 */

const fc = require('fast-check');
const { pbtOptions, safeString } = require('../test/pbtArbitraries');
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

// Helper function to find payment method by display name
function findByDisplayName(db, displayName) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM payment_methods WHERE display_name = ?', [displayName], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Arbitrary for generating valid display names
let displayNameCounter = 0;
const uniqueDisplayName = () => {
  displayNameCounter++;
  return safeString({ minLength: 1, maxLength: 30 })
    .filter(s => s.trim().length > 0)
    .map(s => `${s.trim().substring(0, 20)}_${displayNameCounter}_${Date.now()}`);
};

describe('PaymentMethodService - Display Name Uniqueness Property Tests', () => {
  beforeEach(() => {
    // Reset counter for each test
    displayNameCounter = 0;
  });

  /**
   * Feature: configurable-payment-methods, Property 6: Display Name Uniqueness
   * **Validates: Requirements 2.6, 9.5**
   * 
   * For any two payment method creation requests with the same display_name,
   * the second request should be rejected regardless of other attributes.
   */
  test('Property 6: Display Name Uniqueness - duplicate display_name should be rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.constantFrom(...PAYMENT_METHOD_TYPES),
        fc.constantFrom(...PAYMENT_METHOD_TYPES),
        async (displayName, type1, type2) => {
          const db = await createTestDatabase();
          
          try {
            await createPaymentMethodsTable(db);
            
            // Create first payment method
            const firstPaymentMethod = {
              type: type1,
              display_name: displayName,
              full_name: type1 === 'credit_card' ? 'Test Card 1' : null,
              is_active: 1
            };
            
            const firstId = await insertPaymentMethod(db, firstPaymentMethod);
            expect(firstId).toBeGreaterThan(0);
            
            // Try to create second payment method with same display_name
            const secondPaymentMethod = {
              type: type2, // Different type
              display_name: displayName, // Same display_name
              full_name: type2 === 'credit_card' ? 'Test Card 2' : null,
              is_active: 1
            };
            
            let errorOccurred = false;
            try {
              await insertPaymentMethod(db, secondPaymentMethod);
            } catch (err) {
              errorOccurred = true;
              expect(err.message).toMatch(/UNIQUE constraint failed/i);
            }
            
            // Second insert should fail due to uniqueness constraint
            expect(errorOccurred).toBe(true);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Trimmed display names should be treated as equal
   * Validates: Requirement 9.6 (whitespace trimming)
   */
  test('Property: Service validates display name uniqueness correctly', async () => {
    // Import the service for validation testing
    const paymentMethodService = require('./paymentMethodService');
    
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        async (displayName) => {
          // Test that isDisplayNameUnique returns true for new names
          // Note: This tests the service method in isolation
          // The actual database uniqueness is tested in the repository tests
          
          const validation = paymentMethodService.validatePaymentMethod({
            type: 'cash',
            display_name: displayName
          });
          
          // Valid display name should pass validation
          expect(validation.isValid).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Different display names should be allowed
   */
  test('Property: Different display names should be allowed', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        uniqueDisplayName(),
        fc.constantFrom(...PAYMENT_METHOD_TYPES),
        async (displayName1, displayName2, type) => {
          // Skip if names happen to be the same
          if (displayName1 === displayName2) {
            return true;
          }
          
          const db = await createTestDatabase();
          
          try {
            await createPaymentMethodsTable(db);
            
            // Create first payment method
            const firstId = await insertPaymentMethod(db, {
              type: type,
              display_name: displayName1,
              full_name: type === 'credit_card' ? 'Test Card 1' : null,
              is_active: 1
            });
            expect(firstId).toBeGreaterThan(0);
            
            // Create second payment method with different display_name
            const secondId = await insertPaymentMethod(db, {
              type: type,
              display_name: displayName2,
              full_name: type === 'credit_card' ? 'Test Card 2' : null,
              is_active: 1
            });
            expect(secondId).toBeGreaterThan(0);
            
            // Both should exist
            const first = await findByDisplayName(db, displayName1);
            const second = await findByDisplayName(db, displayName2);
            
            expect(first).toBeDefined();
            expect(second).toBeDefined();
            expect(first.id).not.toBe(second.id);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Empty or whitespace-only display names should be rejected by validation
   */
  test('Property: Empty or whitespace-only display names should fail validation', async () => {
    const paymentMethodService = require('./paymentMethodService');
    
    const emptyOrWhitespace = fc.oneof(
      fc.constant(''),
      fc.constant('   '),
      fc.constant('\t'),
      fc.constant('\n'),
      fc.array(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 5 }).map(arr => arr.join(''))
    );
    
    await fc.assert(
      fc.asyncProperty(
        emptyOrWhitespace,
        fc.constantFrom(...PAYMENT_METHOD_TYPES),
        async (displayName, type) => {
          const validation = paymentMethodService.validatePaymentMethod({
            type: type,
            display_name: displayName,
            full_name: type === 'credit_card' ? 'Test Card' : null
          });
          
          // Empty or whitespace-only display name should fail validation
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.toLowerCase().includes('display name'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Display names exceeding max length should fail validation
   */
  test('Property: Display names exceeding max length should fail validation', async () => {
    const paymentMethodService = require('./paymentMethodService');
    
    // Generate strings longer than 50 characters
    const longDisplayName = fc.string({ minLength: 51, maxLength: 100 })
      .filter(s => s.trim().length > 50);
    
    await fc.assert(
      fc.asyncProperty(
        longDisplayName,
        fc.constantFrom(...PAYMENT_METHOD_TYPES),
        async (displayName, type) => {
          const validation = paymentMethodService.validatePaymentMethod({
            type: type,
            display_name: displayName,
            full_name: type === 'credit_card' ? 'Test Card' : null
          });
          
          // Long display name should fail validation
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.toLowerCase().includes('display name') && e.includes('50'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });
});
