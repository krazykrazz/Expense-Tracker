/**
 * Property-Based Tests for Payment Method Service - Type-Specific Validation
 * Feature: configurable-payment-methods
 * 
 * Property 1: Type-Specific Validation Rules
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.5**
 * 
 * For any payment method creation request, the system should enforce type-specific required fields:
 * - Cash requires only display_name
 * - Cheque and Debit require display_name with optional account_details
 * - Credit_Card requires display_name and full_name with optional billing cycle fields
 */

const fc = require('fast-check');
const { pbtOptions, safeString } = require('../test/pbtArbitraries');
const paymentMethodService = require('./paymentMethodService');

// Valid payment method types
const PAYMENT_METHOD_TYPES = ['cash', 'cheque', 'debit', 'credit_card'];

// Arbitrary for generating valid display names
const validDisplayName = safeString({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0);

// Arbitrary for generating valid full names
const validFullName = safeString({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0);

// Arbitrary for generating valid account details
const validAccountDetails = fc.option(safeString({ maxLength: 100 }), { nil: null });

// Arbitrary for generating valid credit limit
const validCreditLimit = fc.option(
  fc.float({ min: 100, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100),
  { nil: null }
);

// Arbitrary for generating valid balance
const validBalance = fc.option(
  fc.float({ min: 0, max: 50000, noNaN: true }).map(n => Math.round(n * 100) / 100),
  { nil: null }
);

// Arbitrary for generating valid billing cycle day
const validBillingDay = fc.option(fc.integer({ min: 1, max: 31 }), { nil: null });

describe('PaymentMethodService - Type-Specific Validation Property Tests', () => {
  /**
   * Feature: configurable-payment-methods, Property 1: Type-Specific Validation Rules
   * **Validates: Requirements 1.2, 1.3, 1.4, 1.5**
   * 
   * Cash payment methods require only display_name
   */
  test('Property 1.2: Cash payment methods require only display_name', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validAccountDetails,
        async (displayName, accountDetails) => {
          const data = {
            type: 'cash',
            display_name: displayName,
            account_details: accountDetails
          };

          const result = paymentMethodService.validatePaymentMethod(data);
          
          // Cash with valid display_name should pass validation
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: configurable-payment-methods, Property 1: Type-Specific Validation Rules
   * **Validates: Requirements 1.3**
   * 
   * Cheque payment methods require display_name with optional account_details
   */
  test('Property 1.3: Cheque payment methods require display_name with optional account_details', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validAccountDetails,
        async (displayName, accountDetails) => {
          const data = {
            type: 'cheque',
            display_name: displayName,
            account_details: accountDetails
          };

          const result = paymentMethodService.validatePaymentMethod(data);
          
          // Cheque with valid display_name should pass validation
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: configurable-payment-methods, Property 1: Type-Specific Validation Rules
   * **Validates: Requirements 1.4**
   * 
   * Debit payment methods require display_name with optional account_details
   */
  test('Property 1.4: Debit payment methods require display_name with optional account_details', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validAccountDetails,
        async (displayName, accountDetails) => {
          const data = {
            type: 'debit',
            display_name: displayName,
            account_details: accountDetails
          };

          const result = paymentMethodService.validatePaymentMethod(data);
          
          // Debit with valid display_name should pass validation
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: configurable-payment-methods, Property 1: Type-Specific Validation Rules
   * **Validates: Requirements 1.5**
   * 
   * Credit_Card payment methods require display_name, full_name, billing_cycle_day, and payment_due_day
   */
  test('Property 1.5: Credit_Card payment methods require display_name and full_name', async () => {
    // Use non-nullable billing day for this test since billing_cycle_day is required
    const requiredBillingDay = fc.integer({ min: 1, max: 31 });
    
    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validFullName,
        validCreditLimit,
        validBalance,
        requiredBillingDay, // payment_due_day - required
        requiredBillingDay, // billing_cycle_day - required
        validBillingDay,    // billing_cycle_end - optional
        async (displayName, fullName, creditLimit, balance, paymentDueDay, billingCycleDay, billingEnd) => {
          const data = {
            type: 'credit_card',
            display_name: displayName,
            full_name: fullName,
            credit_limit: creditLimit,
            current_balance: balance,
            payment_due_day: paymentDueDay,
            billing_cycle_day: billingCycleDay, // Now required for credit cards
            billing_cycle_end: billingEnd
          };

          const result = paymentMethodService.validatePaymentMethod(data);
          
          // Credit card with valid display_name, full_name, billing_cycle_day, and payment_due_day should pass validation
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Credit card without full_name should fail validation
   */
  test('Property: Credit card without full_name should fail validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        async (displayName) => {
          const data = {
            type: 'credit_card',
            display_name: displayName,
            full_name: '' // Empty full_name
          };

          const result = paymentMethodService.validatePaymentMethod(data);
          
          // Credit card without full_name should fail
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => e.toLowerCase().includes('full name'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Empty display_name should fail validation for all types
   */
  test('Property: Empty display_name should fail validation for all types', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PAYMENT_METHOD_TYPES),
        async (type) => {
          const data = {
            type: type,
            display_name: '', // Empty display_name
            full_name: type === 'credit_card' ? 'Test Card' : undefined
          };

          const result = paymentMethodService.validatePaymentMethod(data);
          
          // Empty display_name should fail for all types
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => e.toLowerCase().includes('display name'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Whitespace-only display_name should fail validation
   */
  test('Property: Whitespace-only display_name should fail validation', async () => {
    // Generate whitespace-only strings
    const whitespaceOnly = fc.array(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 10 })
      .map(arr => arr.join(''));

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PAYMENT_METHOD_TYPES),
        whitespaceOnly,
        async (type, displayName) => {
          const data = {
            type: type,
            display_name: displayName,
            full_name: type === 'credit_card' ? 'Test Card' : undefined
          };

          const result = paymentMethodService.validatePaymentMethod(data);
          
          // Whitespace-only display_name should fail
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => e.toLowerCase().includes('display name'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Invalid payment method type should fail validation
   */
  test('Property: Invalid payment method type should fail validation', async () => {
    const invalidType = fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => !PAYMENT_METHOD_TYPES.includes(s.toLowerCase().trim()));

    await fc.assert(
      fc.asyncProperty(
        invalidType,
        validDisplayName,
        async (type, displayName) => {
          const data = {
            type: type,
            display_name: displayName
          };

          const result = paymentMethodService.validatePaymentMethod(data);
          
          // Invalid type should fail
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => e.toLowerCase().includes('type'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Negative credit card balance should fail validation
   */
  test('Property: Negative credit card balance should fail validation', async () => {
    const negativeBalance = fc.float({ min: Math.fround(-10000), max: Math.fround(-0.01), noNaN: true });

    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validFullName,
        negativeBalance,
        async (displayName, fullName, balance) => {
          const data = {
            type: 'credit_card',
            display_name: displayName,
            full_name: fullName,
            current_balance: balance
          };

          const result = paymentMethodService.validatePaymentMethod(data);
          
          // Negative balance should fail
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => e.toLowerCase().includes('balance'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Invalid billing cycle day should fail validation
   */
  test('Property: Invalid billing cycle day should fail validation', async () => {
    const invalidDay = fc.oneof(
      fc.integer({ min: -100, max: 0 }),
      fc.integer({ min: 32, max: 100 })
    );

    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validFullName,
        invalidDay,
        async (displayName, fullName, invalidDayValue) => {
          const data = {
            type: 'credit_card',
            display_name: displayName,
            full_name: fullName,
            payment_due_day: invalidDayValue
          };

          const result = paymentMethodService.validatePaymentMethod(data);
          
          // Invalid day should fail
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => e.toLowerCase().includes('day') || e.toLowerCase().includes('31'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Non-positive credit limit should fail validation
   */
  test('Property: Non-positive credit limit should fail validation', async () => {
    const nonPositiveLimit = fc.oneof(
      fc.constant(0),
      fc.float({ min: Math.fround(-10000), max: Math.fround(-0.01), noNaN: true })
    );

    await fc.assert(
      fc.asyncProperty(
        validDisplayName,
        validFullName,
        nonPositiveLimit,
        async (displayName, fullName, creditLimit) => {
          const data = {
            type: 'credit_card',
            display_name: displayName,
            full_name: fullName,
            credit_limit: creditLimit
          };

          const result = paymentMethodService.validatePaymentMethod(data);
          
          // Non-positive credit limit should fail
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => e.toLowerCase().includes('credit limit'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });
});
