/**
 * Property-Based Tests for Payment Method Service - Range Validation
 * Feature: credit-card-statement-balance
 * 
 * Property 2: Billing Cycle Day Range Validation
 * **Validates: Requirements 1.3, 1.4**
 * 
 * For any credit card creation or update request, if `billing_cycle_day` or 
 * `payment_due_day` is provided, it must be between 1 and 31 inclusive; 
 * values outside this range should be rejected.
 */

const fc = require('fast-check');
const { pbtOptions, safeString } = require('../test/pbtArbitraries');
const paymentMethodService = require('./paymentMethodService');

// Arbitrary for generating valid display names
const validDisplayName = safeString({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0);

// Arbitrary for generating valid full names
const validFullName = safeString({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0);

// Arbitrary for generating valid billing cycle day (1-31)
const validBillingCycleDay = fc.integer({ min: 1, max: 31 });

// Arbitrary for generating valid payment due day (1-31)
const validPaymentDueDay = fc.integer({ min: 1, max: 31 });

// Arbitrary for generating invalid day values (outside 1-31)
const invalidDayValue = fc.oneof(
  fc.integer({ min: -1000, max: 0 }),  // Zero and negative
  fc.integer({ min: 32, max: 1000 })   // Greater than 31
);

describe('PaymentMethodService - Range Validation Property Tests', () => {
  /**
   * Feature: credit-card-statement-balance, Property 2: Billing Cycle Day Range Validation
   * **Validates: Requirements 1.3**
   * 
   * billing_cycle_day outside 1-31 should fail validation
   */
  test('Property 2.1: billing_cycle_day outside 1-31 should fail validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validFullName,
        invalidDayValue,
        validPaymentDueDay,
        async (displayName, fullName, invalidBillingCycleDay, paymentDueDay) => {
          const data = {
            type: 'credit_card',
            display_name: displayName,
            full_name: fullName,
            billing_cycle_day: invalidBillingCycleDay,
            payment_due_day: paymentDueDay
          };

          // Validate for creation
          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
          // Should fail validation
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => 
            e.toLowerCase().includes('billing cycle day') && 
            (e.includes('1') && e.includes('31'))
          )).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: credit-card-statement-balance, Property 2: Billing Cycle Day Range Validation
   * **Validates: Requirements 1.4**
   * 
   * payment_due_day outside 1-31 should fail validation
   */
  test('Property 2.2: payment_due_day outside 1-31 should fail validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validFullName,
        validBillingCycleDay,
        invalidDayValue,
        async (displayName, fullName, billingCycleDay, invalidPaymentDueDay) => {
          const data = {
            type: 'credit_card',
            display_name: displayName,
            full_name: fullName,
            billing_cycle_day: billingCycleDay,
            payment_due_day: invalidPaymentDueDay
          };

          // Validate for creation
          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
          // Should fail validation
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => 
            e.toLowerCase().includes('payment due day') && 
            (e.includes('1') && e.includes('31'))
          )).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: credit-card-statement-balance, Property 2: Billing Cycle Day Range Validation
   * **Validates: Requirements 1.3, 1.4**
   * 
   * Valid day values (1-31) should pass range validation
   */
  test('Property 2.3: Valid day values (1-31) should pass range validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validFullName,
        validBillingCycleDay,
        validPaymentDueDay,
        async (displayName, fullName, billingCycleDay, paymentDueDay) => {
          const data = {
            type: 'credit_card',
            display_name: displayName,
            full_name: fullName,
            billing_cycle_day: billingCycleDay,
            payment_due_day: paymentDueDay
          };

          // Validate for creation
          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
          // Should pass validation (no range errors)
          expect(result.isValid).toBe(true);
          expect(result.errors.filter(e => 
            e.includes('1') && e.includes('31')
          )).toHaveLength(0);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: credit-card-statement-balance, Property 2: Billing Cycle Day Range Validation
   * **Validates: Requirements 1.3, 1.4**
   * 
   * Boundary values (1 and 31) should be valid
   */
  test('Property 2.4: Boundary values (1 and 31) should be valid', async () => {
    const boundaryValues = fc.constantFrom(1, 31);

    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validFullName,
        boundaryValues,
        boundaryValues,
        async (displayName, fullName, billingCycleDay, paymentDueDay) => {
          const data = {
            type: 'credit_card',
            display_name: displayName,
            full_name: fullName,
            billing_cycle_day: billingCycleDay,
            payment_due_day: paymentDueDay
          };

          // Validate for creation
          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
          // Should pass validation
          expect(result.isValid).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: credit-card-statement-balance, Property 2: Billing Cycle Day Range Validation
   * **Validates: Requirements 1.3, 1.4**
   * 
   * Non-integer values should fail validation
   */
  test('Property 2.5: Non-integer day values should fail validation', async () => {
    const nonIntegerValue = fc.float({ min: Math.fround(1.1), max: Math.fround(30.9), noNaN: true })
      .filter(n => !Number.isInteger(n));

    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validFullName,
        nonIntegerValue,
        validPaymentDueDay,
        async (displayName, fullName, nonIntBillingCycleDay, paymentDueDay) => {
          const data = {
            type: 'credit_card',
            display_name: displayName,
            full_name: fullName,
            billing_cycle_day: nonIntBillingCycleDay,
            payment_due_day: paymentDueDay
          };

          // Validate for creation
          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
          // Should fail validation (non-integer)
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => 
            e.toLowerCase().includes('billing cycle day')
          )).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: credit-card-statement-balance, Property 2: Billing Cycle Day Range Validation
   * **Validates: Requirements 1.3, 1.4**
   * 
   * Range validation should also apply on updates
   */
  test('Property 2.6: Range validation should apply on updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validFullName,
        invalidDayValue,
        validPaymentDueDay,
        async (displayName, fullName, invalidBillingCycleDay, paymentDueDay) => {
          const existingCard = {
            id: 1,
            billing_cycle_day: 15,
            payment_due_day: 25
          };

          const data = {
            type: 'credit_card',
            display_name: displayName,
            full_name: fullName,
            billing_cycle_day: invalidBillingCycleDay,
            payment_due_day: paymentDueDay
          };

          // Validate for update
          const result = paymentMethodService.validatePaymentMethod(data, { 
            isUpdate: true, 
            existing: existingCard 
          });
          
          // Should fail validation even on update
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => 
            e.toLowerCase().includes('billing cycle day') && 
            (e.includes('1') && e.includes('31'))
          )).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });
});
