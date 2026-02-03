/**
 * Property-Based Tests for Payment Method Service - Inactive Payment Methods
 * Feature: configurable-payment-methods
 * 
 * Property 5: Inactive Payment Methods Hidden From Dropdowns
 * **Validates: Requirements 2.4, 2.5, 2.8**
 * 
 * For any payment method marked as inactive, it should not appear in the list of 
 * payment methods returned for dropdown population (active-only queries), but should 
 * still be retrievable by ID for historical expense display.
 */

const fc = require('fast-check');
const { pbtOptions, safeString } = require('../test/pbtArbitraries');
const paymentMethodService = require('./paymentMethodService');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const { getDatabase } = require('../database/db');

// Valid payment method types
const PAYMENT_METHOD_TYPES = ['cash', 'cheque', 'debit', 'credit_card'];

// Arbitrary for generating valid display names with unique suffix
const validDisplayName = (suffix) => safeString({ minLength: 1, maxLength: 30 })
  .filter(s => s.trim().length > 0)
  .map(s => `${s.trim()}_${suffix}_${Date.now()}`);

// Arbitrary for generating valid full names
const validFullName = safeString({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0);

// Arbitrary for generating a valid payment method
const validPaymentMethod = (suffix) => fc.record({
  type: fc.constantFrom(...PAYMENT_METHOD_TYPES),
  display_name: validDisplayName(suffix),
  full_name: validFullName,
  is_active: fc.boolean()
}).map(pm => {
  // Credit cards require full_name, others don't need it
  if (pm.type !== 'credit_card') {
    delete pm.full_name;
  }
  return pm;
});

describe('PaymentMethodService - Inactive Payment Methods Property Tests', () => {
  beforeEach(async () => {
    // Clean up tables in correct order (expenses first due to foreign key)
    const db = await getDatabase();
    // Delete expenses first (they reference payment_methods)
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // Delete fixed_expenses (they also reference payment_methods)
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM fixed_expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // Delete credit_card_payments (they reference payment_methods)
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM credit_card_payments', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // Delete credit_card_statements (they reference payment_methods)
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM credit_card_statements', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // Now safe to delete payment_methods
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
   * 
   * Inactive payment methods should NOT appear in getActivePaymentMethods() results
   */
  test('Property 5.1: Inactive payment methods are hidden from active-only queries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (numMethods) => {
          // Create a mix of active and inactive payment methods
          const createdMethods = [];
          
          for (let i = 0; i < numMethods; i++) {
            const isActive = i % 2 === 0; // Alternate active/inactive
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
          
          // Get active payment methods
          const activeMethods = await paymentMethodService.getActivePaymentMethods();
          
          // Verify: All returned methods should be active
          for (const method of activeMethods) {
            expect(method.is_active).toBe(1);
          }
          
          // Verify: No inactive methods should be in the result
          const activeIds = activeMethods.map(m => m.id);
          for (const created of createdMethods) {
            if (!created.expectedActive) {
              expect(activeIds).not.toContain(created.id);
            }
          }
          
          // Verify: All active methods should be in the result
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
   * 
   * Inactive payment methods should still be retrievable by ID for historical display
   */
  test('Property 5.2: Inactive payment methods are retrievable by ID', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PAYMENT_METHOD_TYPES),
        async (type) => {
          // Create an inactive payment method
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
          
          // Verify it's not in active methods
          const activeMethods = await paymentMethodService.getActivePaymentMethods();
          const activeIds = activeMethods.map(m => m.id);
          expect(activeIds).not.toContain(created.id);
          
          // Verify it's still retrievable by ID
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
   * 
   * Setting a payment method to inactive should remove it from active queries
   */
  test('Property 5.3: Deactivating a payment method removes it from active queries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PAYMENT_METHOD_TYPES),
        async (type) => {
          // Create an active payment method
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
          
          // Verify it's in active methods initially
          let activeMethods = await paymentMethodService.getActivePaymentMethods();
          let activeIds = activeMethods.map(m => m.id);
          expect(activeIds).toContain(created.id);
          
          // Create another active method to avoid "last active" error
          const otherData = {
            type: 'cash',
            display_name: `OtherMethod_${Date.now()}`,
            is_active: true
          };
          await paymentMethodService.createPaymentMethod(otherData);
          
          // Deactivate the payment method
          await paymentMethodService.setPaymentMethodActive(created.id, false);
          
          // Verify it's no longer in active methods
          activeMethods = await paymentMethodService.getActivePaymentMethods();
          activeIds = activeMethods.map(m => m.id);
          expect(activeIds).not.toContain(created.id);
          
          // Verify it's still retrievable by ID
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
   * 
   * Reactivating a payment method should add it back to active queries
   */
  test('Property 5.4: Reactivating a payment method adds it back to active queries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PAYMENT_METHOD_TYPES),
        async (type) => {
          // Create an inactive payment method
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
          
          // Verify it's not in active methods initially
          let activeMethods = await paymentMethodService.getActivePaymentMethods();
          let activeIds = activeMethods.map(m => m.id);
          expect(activeIds).not.toContain(created.id);
          
          // Reactivate the payment method
          await paymentMethodService.setPaymentMethodActive(created.id, true);
          
          // Verify it's now in active methods
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
   * 
   * The count of active methods should match the number of methods with is_active = 1
   */
  test('Property 5.5: Active method count matches is_active = 1 count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
        async (activeStates) => {
          const db = await getDatabase();
          
          // Clean up any test payment methods from previous iterations
          await new Promise((resolve, reject) => {
            db.run("DELETE FROM payment_methods WHERE display_name LIKE 'CountTest_%'", (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          
          // Create payment methods with the given active states
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
          
          // Get active payment methods
          const activeMethods = await paymentMethodService.getActivePaymentMethods();
          
          // Count how many of our created methods are active
          const ourActiveCount = createdIds.filter(id => 
            activeMethods.some(m => m.id === id)
          ).length;
          
          // Count expected active methods from our created ones
          const expectedOurActiveCount = activeStates.filter(s => s).length;
          
          // Verify our created active methods are all in the active list
          expect(ourActiveCount).toBe(expectedOurActiveCount);
          
          // Also verify that inactive methods are NOT in the active list
          const ourInactiveCount = createdIds.filter(id => 
            !activeMethods.some(m => m.id === id)
          ).length;
          const expectedOurInactiveCount = activeStates.filter(s => !s).length;
          expect(ourInactiveCount).toBe(expectedOurInactiveCount);
          
          // Clean up created payment methods
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
