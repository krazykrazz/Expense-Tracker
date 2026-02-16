/**
 * @invariant Lifecycle State Invariants
 * 
 * This file tests payment method lifecycle properties:
 * 1. Inactive methods hidden from active-only queries
 * 2. Inactive methods still retrievable by ID for historical display
 * 3. Activation/deactivation state transitions
 * 
 * Randomness adds value by:
 * - Testing with various combinations of active/inactive methods
 * - Ensuring state transitions work correctly
 * - Verifying count consistency across random method sets
 * 
 * Consolidated from: inactive
 */

const fc = require('fast-check');
const { pbtOptions, safeString } = require('../test/pbtArbitraries');
const paymentMethodService = require('./paymentMethodService');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const { getDatabase } = require('../database/db');

// Valid payment method types
const PAYMENT_METHOD_TYPES = ['cash', 'cheque', 'debit', 'credit_card'];

describe('PaymentMethodService - Inactive Payment Methods Property Tests', () => {
  let sharedDb = null;

  beforeAll(async () => {
    // Create database once for all tests
    sharedDb = await getTestDatabase();
    await createTables(sharedDb);
  });

  afterAll(async () => {
    // Close database after all tests
    if (sharedDb) {
      await closeDatabase(sharedDb);
    }
  });

  beforeEach(async () => {
    // Reset database between test iterations
    if (sharedDb) {
      await resetTestDatabase(sharedDb);
    }
  });

  beforeEach(async () => {
    // Clean up tables in correct order (expenses first due to foreign key)
    const db = await getDatabase();
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM fixed_expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM credit_card_payments', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM credit_card_statements', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM payment_methods', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  /**
   * Feature: configurable-payment-methods, Property 5: Inactive Payment Methods Hidden From Dropdowns
   * **Validates: Requirements 2.4, 2.5**
   */
  test('Property 5.1: Inactive payment methods are hidden from active-only queries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (numMethods) => {
          const createdMethods = [];
          
          for (let i = 0; i < numMethods; i++) {
            const isActive = i % 2 === 0;
            const type = PAYMENT_METHOD_TYPES[i % PAYMENT_METHOD_TYPES.length];
            const data = {
              type,
              display_name: `TestMethod_${i}_${Date.now()}`,
              is_active: isActive
            };
            
            if (type === 'credit_card') {
              data.full_name = `Test Credit Card ${i}`;
              data.billing_cycle_day = 15;
              data.payment_due_day = 25;
            }
            
            const created = await paymentMethodService.createPaymentMethod(data);
            createdMethods.push({ ...created, expectedActive: isActive });
          }
          
          const activeMethods = await paymentMethodService.getActivePaymentMethods();
          
          for (const method of activeMethods) {
            expect(method.is_active).toBe(1);
          }
          
          const activeIds = activeMethods.map(m => m.id);
          for (const created of createdMethods) {
            if (!created.expectedActive) {
              expect(activeIds).not.toContain(created.id);
            }
          }
          
          for (const created of createdMethods) {
            if (created.expectedActive) {
              expect(activeIds).toContain(created.id);
            }
          }
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: configurable-payment-methods, Property 5: Inactive Payment Methods Hidden From Dropdowns
   * **Validates: Requirements 2.8**
   */
  test('Property 5.2: Inactive payment methods are retrievable by ID', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PAYMENT_METHOD_TYPES),
        async (type) => {
          const data = {
            type,
            display_name: `InactiveMethod_${type}_${Date.now()}`,
            is_active: false
          };
          
          if (type === 'credit_card') {
            data.full_name = 'Inactive Credit Card';
            data.billing_cycle_day = 15;
            data.payment_due_day = 25;
          }
          
          const created = await paymentMethodService.createPaymentMethod(data);
          
          const activeMethods = await paymentMethodService.getActivePaymentMethods();
          const activeIds = activeMethods.map(m => m.id);
          expect(activeIds).not.toContain(created.id);
          
          const retrieved = await paymentMethodRepository.findById(created.id);
          expect(retrieved).not.toBeNull();
          expect(retrieved.id).toBe(created.id);
          expect(retrieved.display_name).toBe(data.display_name);
          expect(retrieved.is_active).toBe(0);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: configurable-payment-methods, Property 5: Inactive Payment Methods Hidden From Dropdowns
   * **Validates: Requirements 2.4, 2.5**
   */
  test('Property 5.3: Deactivating a payment method removes it from active queries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PAYMENT_METHOD_TYPES),
        async (type) => {
          const data = {
            type,
            display_name: `ToDeactivate_${type}_${Date.now()}`,
            is_active: true
          };
          
          if (type === 'credit_card') {
            data.full_name = 'Card To Deactivate';
            data.billing_cycle_day = 15;
            data.payment_due_day = 25;
          }
          
          const created = await paymentMethodService.createPaymentMethod(data);
          
          let activeMethods = await paymentMethodService.getActivePaymentMethods();
          let activeIds = activeMethods.map(m => m.id);
          expect(activeIds).toContain(created.id);
          
          const otherData = {
            type: 'cash',
            display_name: `OtherMethod_${Date.now()}`,
            is_active: true
          };
          await paymentMethodService.createPaymentMethod(otherData);
          
          await paymentMethodService.setPaymentMethodActive(created.id, false);
          
          activeMethods = await paymentMethodService.getActivePaymentMethods();
          activeIds = activeMethods.map(m => m.id);
          expect(activeIds).not.toContain(created.id);
          
          const retrieved = await paymentMethodRepository.findById(created.id);
          expect(retrieved).not.toBeNull();
          expect(retrieved.is_active).toBe(0);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: configurable-payment-methods, Property 5: Inactive Payment Methods Hidden From Dropdowns
   * **Validates: Requirements 2.4, 2.5**
   */
  test('Property 5.4: Reactivating a payment method adds it back to active queries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PAYMENT_METHOD_TYPES),
        async (type) => {
          const data = {
            type,
            display_name: `ToReactivate_${type}_${Date.now()}`,
            is_active: false
          };
          
          if (type === 'credit_card') {
            data.full_name = 'Card To Reactivate';
            data.billing_cycle_day = 15;
            data.payment_due_day = 25;
          }
          
          const created = await paymentMethodService.createPaymentMethod(data);
          
          let activeMethods = await paymentMethodService.getActivePaymentMethods();
          let activeIds = activeMethods.map(m => m.id);
          expect(activeIds).not.toContain(created.id);
          
          await paymentMethodService.setPaymentMethodActive(created.id, true);
          
          activeMethods = await paymentMethodService.getActivePaymentMethods();
          activeIds = activeMethods.map(m => m.id);
          expect(activeIds).toContain(created.id);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: configurable-payment-methods, Property 5: Inactive Payment Methods Hidden From Dropdowns
   * **Validates: Requirements 2.4, 2.5, 2.8**
   */
  test('Property 5.5: Active method count matches is_active = 1 count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
        async (activeStates) => {
          const db = await getDatabase();
          
          await new Promise((resolve, reject) => {
            db.run("DELETE FROM payment_methods WHERE display_name LIKE 'CountTest_%'", (err) => {
              if (err) reject(err);
              else resolve();
            });, 120000
          });
          
          const createdIds = [];
          for (let i = 0; i < activeStates.length; i++) {
            const type = PAYMENT_METHOD_TYPES[i % PAYMENT_METHOD_TYPES.length];
            const data = {
              type,
              display_name: `CountTest_${i}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              is_active: activeStates[i]
            };
            
            if (type === 'credit_card') {
              data.full_name = `Count Test Card ${i}`;
              data.billing_cycle_day = 15;
              data.payment_due_day = 25;
            }
            
            const created = await paymentMethodService.createPaymentMethod(data);
            createdIds.push(created.id);
          }
          
          const activeMethods = await paymentMethodService.getActivePaymentMethods();
          
          const ourActiveCount = createdIds.filter(id => 
            activeMethods.some(m => m.id === id)
          ).length;
          
          const expectedOurActiveCount = activeStates.filter(s => s).length;
          
          expect(ourActiveCount).toBe(expectedOurActiveCount);
          
          const ourInactiveCount = createdIds.filter(id => 
            !activeMethods.some(m => m.id === id)
          ).length;
          const expectedOurInactiveCount = activeStates.filter(s => !s).length;
          expect(ourInactiveCount).toBe(expectedOurInactiveCount);
          
          for (const id of createdIds) {
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM payment_methods WHERE id = ?', [id], (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          }
          
          return true;
        }
      ),
      pbtOptions()
    );
  });
});
