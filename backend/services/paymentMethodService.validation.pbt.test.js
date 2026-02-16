/**
 * @invariant Validation Rule Invariants
 * 
 * This file tests validation properties for payment method creation and updates:
 * 1. Type-specific required fields (cash, cheque, debit, credit_card)
 * 2. Required fields enforcement (billing_cycle_day, payment_due_day for credit cards)
 * 3. Range validation (day values must be 1-31)
 * 4. Display name uniqueness across all payment methods
 * 
 * Randomness adds value by:
 * - Testing validation with various input combinations
 * - Ensuring edge cases (boundary values, invalid types) are handled
 * - Verifying uniqueness constraints across random display names
 * - Testing whitespace handling and string normalization
 * 
 * Consolidated from: validation, requiredFields, rangeValidation, uniqueness
 */

const fc = require('fast-check');
const { pbtOptions, safeString } = require('../test/pbtArbitraries');
const paymentMethodService = require('./paymentMethodService');
const {
  getTestDatabase,
  resetTestDatabase,
  createTestDatabase,
  closeDatabase,
  createTables,
  insertPaymentMethod,
  findByDisplayName,
  resetDisplayNameCounter,
  uniqueDisplayName,
  validDisplayName,
  validFullName,
  validBillingCycleDay,
  validPaymentDueDay,
  invalidDayValue
} = require('../test/paymentMethodPbtHelpers');

// Valid payment method types
const PAYMENT_METHOD_TYPES = ['cash', 'cheque', 'debit', 'credit_card'];

// Arbitrary for generating valid credit limit
const validCreditLimit = fc.option(
  fc.float({ min: 100, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100),
  { nil: null }
);

describe('PaymentMethodService - Required Fields Validation Property Tests', () => {
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

  /**
   * Feature: credit-card-statement-balance, Property 1: Required Fields Validation
   * **Validates: Requirements 1.1, 1.2, 1.5**
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
          };

          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => e.toLowerCase().includes('billing cycle day'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

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
          };

          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => e.toLowerCase().includes('payment due day'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

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

          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

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
          };

          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
          
          return true;
        }
      ),
      pbtOptions()
    );
  }, 120000);
});

describe('PaymentMethodService - Range Validation Property Tests', () => {
  /**
   * Feature: credit-card-statement-balance, Property 2: Billing Cycle Day Range Validation
   * **Validates: Requirements 1.3, 1.4**
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

          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
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

          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
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

          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
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

          const result = paymentMethodService.validatePaymentMethod(data, { isUpdate: false });
          
          expect(result.isValid).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  }, 120000);
});

describe('PaymentMethodService - Display Name Uniqueness Property Tests', () => {
  beforeEach(() => {
    resetDisplayNameCounter();
  });

  /**
   * Feature: configurable-payment-methods, Property 6: Display Name Uniqueness
   * **Validates: Requirements 2.6, 9.5**
   */
  test('Property 6: Display Name Uniqueness - duplicate display_name should be rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.constantFrom(...PAYMENT_METHOD_TYPES),
        fc.constantFrom(...PAYMENT_METHOD_TYPES),
        async (displayName, type1, type2) => {
          const db = sharedDb;
          
          try {
            const firstPaymentMethod = {
              type: type1,
              display_name: displayName,
              full_name: type1 === 'credit_card' ? 'Test Card 1' : null,
              is_active: 1
            };
            
            const firstId = await insertPaymentMethod(db, firstPaymentMethod.type, firstPaymentMethod.display_name, firstPaymentMethod.full_name);
            expect(firstId).toBeGreaterThan(0);
            
            const secondPaymentMethod = {
              type: type2,
              display_name: displayName,
              full_name: type2 === 'credit_card' ? 'Test Card 2' : null,
              is_active: 1
            };
            
            let errorOccurred = false;
            try {
              await insertPaymentMethod(db, secondPaymentMethod.type, secondPaymentMethod.display_name, secondPaymentMethod.full_name);
            } catch (err) {
              errorOccurred = true;
              expect(err.message).toMatch(/UNIQUE constraint failed/i);
            }
            
            expect(errorOccurred).toBe(true);
            
            return true;
          } finally {
            // Database reset in beforeEach
          }
        }
      ),
      pbtOptions()
    );
  });

  test('Property: Different display names should be allowed', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        uniqueDisplayName(),
        fc.constantFrom(...PAYMENT_METHOD_TYPES),
        async (displayName1, displayName2, type) => {
          if (displayName1 === displayName2) {
            return true;
          }
          
          const db = sharedDb;
          
          try {
            const firstId = await insertPaymentMethod(db, type, displayName1, type === 'credit_card' ? 'Test Card 1' : null);
            expect(firstId).toBeGreaterThan(0);
            
            const secondId = await insertPaymentMethod(db, type, displayName2, type === 'credit_card' ? 'Test Card 2' : null);
            expect(secondId).toBeGreaterThan(0);
            
            const first = await findByDisplayName(db, displayName1);
            const second = await findByDisplayName(db, displayName2);
            
            expect(first).toBeDefined();
            expect(second).toBeDefined();
            expect(first.id).not.toBe(second.id);
            
            return true;
          } finally {
            // Database reset in beforeEach
          }
        }
      ),
      pbtOptions()
    );
  });

  test('Property: Empty or whitespace-only display names should fail validation', async () => {
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
          
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.toLowerCase().includes('display name'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  test('Property: Display names exceeding max length should fail validation', async () => {
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
          
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.toLowerCase().includes('display name') && e.includes('50'))).toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  }, 120000);
});
