/**
 * Property-Based Tests for useExpenseFormValidation
 *
 * Tests universal validation properties across randomly generated inputs using fast-check.
 * The hook is pure (no state, no side effects) so we can call it directly.
 *
 * Feature: frontend-custom-hooks
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { pbtOptions, safeDate } from '../test/pbtArbitraries';
import useExpenseFormValidation from './useExpenseFormValidation';

const { validate } = useExpenseFormValidation();

// --- Smart Generators ---

/** Generates a valid positive amount string (e.g. "12.50") */
const positiveAmountStr = fc.float({ min: Math.fround(0.01), max: Math.fround(99999), noNaN: true })
  .filter(n => isFinite(n) && n > 0)
  .map(n => n.toFixed(2));

/** Generates a non-empty expense type string */
const nonEmptyType = fc.constantFrom(
  'Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Tax - Medical', 'Tax - Donation', 'Other'
);

/** Generates a valid payment method ID (positive integer) */
const validPaymentMethodId = fc.integer({ min: 1, max: 100 });

/** Generates a string within the 200-char limit (including empty) */
const safeShortString = fc.string({ minLength: 0, maxLength: 200 });

/** Generates a valid date string in YYYY-MM-DD format */
const validDateStr = safeDate();

/** Generates a complete valid form data object */
const validFormData = fc.record({
  date: validDateStr,
  amount: positiveAmountStr,
  type: nonEmptyType,
  payment_method_id: validPaymentMethodId,
  place: safeShortString,
  notes: safeShortString,
});

// --- Invalid field generators ---

/** Empty or falsy date values */
const invalidDate = fc.constantFrom('', null, undefined);

/** Non-positive amount strings: zero, negative, or empty/falsy */
const nonPositiveAmountStr = fc.oneof(
  fc.constant('0'),
  fc.constant('0.00'),
  fc.constant('-5'),
  fc.float({ min: Math.fround(-99999), max: Math.fround(-0.01), noNaN: true }).filter(n => isFinite(n) && n < 0).map(n => n.toFixed(2)),
  fc.constant(''),
  fc.constant(null),
  fc.constant(undefined)
);

/** Empty or falsy type values */
const invalidType = fc.constantFrom('', null, undefined);

/** Null or undefined payment method ID */
const invalidPaymentMethodId = fc.constantFrom(null, undefined, 0);

// --- Property Tests ---

describe('useExpenseFormValidation Property-Based Tests', () => {
  /**
   * Feature: frontend-custom-hooks, Property 6: Validation rejects invalid basic fields
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
   *
   * For any form data where the date is empty, or the amount is non-positive
   * (zero, negative, or NaN), or the type is empty, or the payment_method_id
   * is null/undefined, the validate function SHALL return { valid: false }
   * with at least one error entry.
   */
  describe('Property 6: Validation rejects invalid basic fields', () => {
    test('rejects empty/missing date', () => {
      fc.assert(
        fc.property(
          invalidDate,
          positiveAmountStr,
          nonEmptyType,
          validPaymentMethodId,
          (date, amount, type, payment_method_id) => {
            const result = validate(
              { date, amount, type, payment_method_id, place: '', notes: '' }
            );
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThanOrEqual(1);
            expect(result.errors.some(e => e.field === 'date')).toBe(true);
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('rejects non-positive amounts', () => {
      fc.assert(
        fc.property(
          validDateStr,
          nonPositiveAmountStr,
          nonEmptyType,
          validPaymentMethodId,
          (date, amount, type, payment_method_id) => {
            const result = validate(
              { date, amount, type, payment_method_id, place: '', notes: '' }
            );
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThanOrEqual(1);
            expect(result.errors.some(e => e.field === 'amount')).toBe(true);
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('rejects empty/missing type', () => {
      fc.assert(
        fc.property(
          validDateStr,
          positiveAmountStr,
          invalidType,
          validPaymentMethodId,
          (date, amount, type, payment_method_id) => {
            const result = validate(
              { date, amount, type, payment_method_id, place: '', notes: '' }
            );
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThanOrEqual(1);
            expect(result.errors.some(e => e.field === 'type')).toBe(true);
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('rejects null/undefined/zero payment_method_id', () => {
      fc.assert(
        fc.property(
          validDateStr,
          positiveAmountStr,
          nonEmptyType,
          invalidPaymentMethodId,
          (date, amount, type, payment_method_id) => {
            const result = validate(
              { date, amount, type, payment_method_id, place: '', notes: '' }
            );
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThanOrEqual(1);
            expect(result.errors.some(e => e.field === 'payment_method_id')).toBe(true);
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('rejects form data with any combination of invalid basic fields', () => {
      // Generate form data where at least one basic field is invalid
      const formWithAtLeastOneInvalid = fc.tuple(
        fc.oneof(invalidDate, validDateStr),
        fc.oneof(nonPositiveAmountStr, positiveAmountStr),
        fc.oneof(invalidType, nonEmptyType),
        fc.oneof(invalidPaymentMethodId, validPaymentMethodId)
      ).filter(([date, amount, type, pmId]) => {
        // Ensure at least one field is actually invalid
        const dateInvalid = !date;
        const amountInvalid = !amount || parseFloat(amount) <= 0 || isNaN(parseFloat(amount));
        const typeInvalid = !type;
        const pmIdInvalid = !pmId;
        return dateInvalid || amountInvalid || typeInvalid || pmIdInvalid;
      });

      fc.assert(
        fc.property(
          formWithAtLeastOneInvalid,
          ([date, amount, type, payment_method_id]) => {
            const result = validate(
              { date, amount, type, payment_method_id, place: '', notes: '' }
            );
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThanOrEqual(1);
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });
  });

  /**
   * Feature: frontend-custom-hooks, Property 7: Validation rejects original cost less than net amount
   * **Validates: Requirements 4.5, 4.7**
   *
   * For any expense (medical with insurance or non-medical with reimbursement)
   * where the original cost is less than the net amount (out-of-pocket),
   * the validate function SHALL return { valid: false } with an error about
   * the cost relationship.
   */
  describe('Property 7: Validation rejects original cost less than net amount', () => {
    test('rejects medical insurance where out-of-pocket exceeds original cost', () => {
      // Use integer cents to guarantee amount > originalCost after string conversion
      // amountCents is strictly greater than origCostCents
      const amountAndCost = fc.tuple(
        fc.integer({ min: 2, max: 9999900 }),  // amountCents (at least 0.02)
        fc.integer({ min: 1, max: 9999899 })   // origCostCents (at least 0.01)
      ).filter(([amountCents, origCostCents]) => amountCents > origCostCents)
       .map(([amountCents, origCostCents]) => ({
         amount: (amountCents / 100).toFixed(2),
         originalCost: (origCostCents / 100).toFixed(2),
       }));

      fc.assert(
        fc.property(
          validDateStr,
          amountAndCost,
          validPaymentMethodId,
          (date, { amount, originalCost }, payment_method_id) => {
            const result = validate(
              { date, amount, type: 'Tax - Medical', payment_method_id, place: '', notes: '' },
              { isMedicalExpense: true, insuranceEligible: true, originalCost }
            );
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.field === 'originalCost')).toBe(true);
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('rejects generic reimbursement where net amount exceeds original cost', () => {
      // Use integer cents to guarantee amount > genericOriginalCost after string conversion
      const amountAndCost = fc.tuple(
        fc.integer({ min: 2, max: 9999900 }),  // amountCents
        fc.integer({ min: 1, max: 9999899 })   // origCostCents
      ).filter(([amountCents, origCostCents]) => amountCents > origCostCents)
       .map(([amountCents, origCostCents]) => ({
         amount: (amountCents / 100).toFixed(2),
         genericOriginalCost: (origCostCents / 100).toFixed(2),
       }));

      fc.assert(
        fc.property(
          validDateStr,
          amountAndCost,
          nonEmptyType,
          validPaymentMethodId,
          (date, { amount, genericOriginalCost }, type, payment_method_id) => {
            const result = validate(
              { date, amount, type, payment_method_id, place: '', notes: '' },
              { showGenericReimbursementUI: true, genericOriginalCost }
            );
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.field === 'genericOriginalCost')).toBe(true);
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });
  });

  /**
   * Feature: frontend-custom-hooks, Property 8: Validation rejects posted date before expense date
   * **Validates: Requirements 4.6**
   *
   * For any credit card expense where the posted date is strictly before
   * the expense date, the validate function SHALL return { valid: false }
   * with a posted date error.
   */
  describe('Property 8: Validation rejects posted date before expense date', () => {
    test('rejects posted date strictly before expense date', () => {
      // Generate two dates where postedDate < expenseDate
      const datesWithPostedBefore = fc.tuple(
        safeDate({ min: new Date('2020-01-02'), max: new Date('2025-12-31') }),
        safeDate({ min: new Date('2020-01-01'), max: new Date('2025-12-30') })
      ).filter(([expenseDate, postedDate]) => postedDate < expenseDate);

      fc.assert(
        fc.property(
          datesWithPostedBefore,
          positiveAmountStr,
          nonEmptyType,
          validPaymentMethodId,
          ([expenseDate, postedDate], amount, type, payment_method_id) => {
            const result = validate(
              { date: expenseDate, amount, type, payment_method_id, place: '', notes: '' },
              { isCreditCard: true, postedDate }
            );
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.field === 'postedDate')).toBe(true);
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });
  });

  /**
   * Feature: frontend-custom-hooks, Property 9: Valid form data passes validation
   * **Validates: Requirements 4.8**
   *
   * For any form data with a non-empty date, positive amount, non-empty type,
   * valid payment_method_id, place ≤ 200 chars, notes ≤ 200 chars, and
   * consistent cost relationships, the validate function SHALL return
   * { valid: true, errors: [] }.
   */
  describe('Property 9: Valid form data passes validation', () => {
    test('valid basic form data always passes', () => {
      fc.assert(
        fc.property(
          validFormData,
          (formData) => {
            const result = validate(formData);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('valid medical insurance data passes when original cost >= amount', () => {
      const validMedicalData = fc.tuple(
        validFormData,
        fc.float({ min: Math.fround(0.01), max: Math.fround(99999), noNaN: true }).filter(n => isFinite(n) && n > 0)
      ).map(([formData, multiplier]) => {
        const amount = parseFloat(formData.amount);
        // originalCost is at least as large as amount
        const originalCost = (amount + Math.abs(multiplier)).toFixed(2);
        return { formData: { ...formData, type: 'Tax - Medical' }, originalCost };
      });

      fc.assert(
        fc.property(
          validMedicalData,
          ({ formData, originalCost }) => {
            const result = validate(formData, {
              isMedicalExpense: true,
              insuranceEligible: true,
              originalCost,
            });
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('valid credit card data passes when posted date >= expense date', () => {
      // Generate two dates where postedDate >= expenseDate
      const datesWithValidPosted = fc.tuple(
        safeDate({ min: new Date('2020-01-01'), max: new Date('2025-06-30') }),
        safeDate({ min: new Date('2020-01-01'), max: new Date('2025-12-31') })
      ).filter(([expenseDate, postedDate]) => postedDate >= expenseDate);

      fc.assert(
        fc.property(
          datesWithValidPosted,
          positiveAmountStr,
          nonEmptyType,
          validPaymentMethodId,
          safeShortString,
          safeShortString,
          ([expenseDate, postedDate], amount, type, payment_method_id, place, notes) => {
            const result = validate(
              { date: expenseDate, amount, type, payment_method_id, place, notes },
              { isCreditCard: true, postedDate }
            );
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('valid generic reimbursement passes when original cost >= net amount', () => {
      const validReimbursementData = fc.tuple(
        validFormData,
        fc.float({ min: Math.fround(0.01), max: Math.fround(99999), noNaN: true }).filter(n => isFinite(n) && n > 0)
      ).map(([formData, extra]) => {
        const amount = parseFloat(formData.amount);
        // genericOriginalCost is at least as large as amount
        const genericOriginalCost = (amount + Math.abs(extra)).toFixed(2);
        return { formData, genericOriginalCost };
      });

      fc.assert(
        fc.property(
          validReimbursementData,
          ({ formData, genericOriginalCost }) => {
            const result = validate(formData, {
              showGenericReimbursementUI: true,
              genericOriginalCost,
            });
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });
  });
});
