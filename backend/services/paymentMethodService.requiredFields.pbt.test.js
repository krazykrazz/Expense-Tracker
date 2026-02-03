/**
 * Property-Based Tests for Payment Method Service - Required Fields Validation
 * Feature: credit-card-statement-balance
 * 
 * Property 1: Required Fields Validation
 * **Validates: Requirements 1.1, 1.2, 1.5**
 * 
 * For any credit card creation request, if `billing_cycle_day` or `payment_due_day` 
 * is missing, the request should be rejected with an appropriate error message.
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

// Arbitrary for generating valid credit limit
const validCreditLimit = fc.option(
  fc.float({ min: 100, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100),
  { nil: null }
);

describe('PaymentMethodService - Required Fields Validation Property Tests', () => {
  /**
   * Feature: credit-card-statement-balance, Property 1: Required Fields Validation
   * **Validates: Requirements 1.1, 1.2, 1.5**
   * 
   * Credit card creation without billing_cycle_day should fail
   */
  test('Property 1.1: Credit card creation without billing_cycle_day should fail', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validFullName,
        validPaymentDueDay,
        validCreditLimit,
        async (displayName, fullName, paymentDueDay, creditLimit) => {
          const data = {
            type: 'credit_card',
            display_name: displayName,
            full_name: fullName,
            payment_due_day: paymentDueDay,
            credit_limit: creditLimit
            // billing_cycle_day is missing
          };

          // Validate for creation (isUpdate = false)
          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
          // Should fail validation
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => e.toLowerCase().includes('billing cycle day'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: credit-card-statement-balance, Property 1: Required Fields Validation
   * **Validates: Requirements 1.2, 1.5**
   * 
   * Credit card creation without payment_due_day should fail
   */
  test('Property 1.2: Credit card creation without payment_due_day should fail', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validFullName,
        validBillingCycleDay,
        validCreditLimit,
        async (displayName, fullName, billingCycleDay, creditLimit) => {
          const data = {
            type: 'credit_card',
            display_name: displayName,
            full_name: fullName,
            billing_cycle_day: billingCycleDay,
            credit_limit: creditLimit
            // payment_due_day is missing
          };

          // Validate for creation (isUpdate = false)
          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
          // Should fail validation
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => e.toLowerCase().includes('payment due day'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: credit-card-statement-balance, Property 1: Required Fields Validation
   * **Validates: Requirements 1.1, 1.2, 1.5**
   * 
   * Credit card creation with both required fields should pass
   */
  test('Property 1.3: Credit card creation with both required fields should pass', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validFullName,
        validBillingCycleDay,
        validPaymentDueDay,
        validCreditLimit,
        async (displayName, fullName, billingCycleDay, paymentDueDay, creditLimit) => {
          const data = {
            type: 'credit_card',
            display_name: displayName,
            full_name: fullName,
            billing_cycle_day: billingCycleDay,
            payment_due_day: paymentDueDay,
            credit_limit: creditLimit
          };

          // Validate for creation (isUpdate = false)
          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
          // Should pass validation
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: credit-card-statement-balance, Property 1: Required Fields Validation
   * **Validates: Requirements 1.5**
   * 
   * Credit card creation with null billing_cycle_day should fail
   */
  test('Property 1.4: Credit card creation with null billing_cycle_day should fail', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validFullName,
        validPaymentDueDay,
        async (displayName, fullName, paymentDueDay) => {
          const data = {
            type: 'credit_card',
            display_name: displayName,
            full_name: fullName,
            billing_cycle_day: null, // Explicitly null
            payment_due_day: paymentDueDay
          };

          // Validate for creation (isUpdate = false)
          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
          // Should fail validation
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => e.toLowerCase().includes('billing cycle day'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: credit-card-statement-balance, Property 1: Required Fields Validation
   * **Validates: Requirements 1.5**
   * 
   * Credit card creation with null payment_due_day should fail
   */
  test('Property 1.5: Credit card creation with null payment_due_day should fail', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validFullName,
        validBillingCycleDay,
        async (displayName, fullName, billingCycleDay) => {
          const data = {
            type: 'credit_card',
            display_name: displayName,
            full_name: fullName,
            billing_cycle_day: billingCycleDay,
            payment_due_day: null // Explicitly null
          };

          // Validate for creation (isUpdate = false)
          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
          // Should fail validation
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => e.toLowerCase().includes('payment due day'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: credit-card-statement-balance, Property 1: Required Fields Validation
   * **Validates: Requirements 1.1, 1.2**
   * 
   * Non-credit card types should not require billing_cycle_day or payment_due_day
   */
  test('Property 1.6: Non-credit card types should not require billing cycle fields', async () => {
    const nonCreditCardTypes = fc.constantFrom('cash', 'cheque', 'debit');

    await fc.assert(
      fc.asyncProperty(
        nonCreditCardTypes,
        validDisplayName,
        async (type, displayName) => {
          const data = {
            type: type,
            display_name: displayName
            // No billing_cycle_day or payment_due_day
          };

          // Validate for creation (isUpdate = false)
          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
          // Should pass validation (these fields are not required for non-credit cards)
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });
});
