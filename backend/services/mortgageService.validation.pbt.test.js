/**
 * Property-Based Tests for MortgageService Validation
 *
 * Feature: mortgage-tracking
 * Tests Property 1: Mortgage Required Fields Validation
 * Tests Property 7: Validation Bounds
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 10.1, 10.2, 10.3, 10.4, 10.5
 */

const fc = require('fast-check');
const mortgageService = require('./mortgageService');
const { pbtOptions, safeAmount } = require('../test/pbtArbitraries');

/**
 * Safe future date arbitrary for renewal dates
 * Generates dates between 2027 and 2035 as YYYY-MM-DD strings
 * Using 2027 as minimum to ensure dates are always in the future
 */
const safeFutureDateString = () => {
  return fc.record({
    year: fc.integer({ min: 2027, max: 2035 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 })
  }).map(({ year, month, day }) => {
    const monthStr = month.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  });
};

/**
 * Safe past date arbitrary for testing invalid renewal dates
 * Generates dates between 2020 and 2024 as YYYY-MM-DD strings
 */
const safePastDateString = () => {
  return fc.record({
    year: fc.integer({ min: 2020, max: 2024 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 })
  }).map(({ year, month, day }) => {
    const monthStr = month.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  });
};

// Valid mortgage data arbitrary (all required fields present and valid)
const validMortgageArb = fc.record({
  amortization_period: fc.integer({ min: 1, max: 40 }),
  term_length: fc.integer({ min: 1, max: 10 }),
  renewal_date: safeFutureDateString(),
  rate_type: fc.constantFrom('fixed', 'variable'),
  payment_frequency: fc.constantFrom('monthly', 'bi-weekly', 'accelerated_bi-weekly'),
  estimated_property_value: fc.option(safeAmount({ min: 1, max: 50000000 }), { nil: null })
}).filter(m => m.term_length <= m.amortization_period);

describe('MortgageService Validation Property Tests', () => {
  /**
   * Property 1: Mortgage Required Fields Validation
   *
   * For any mortgage creation attempt, if any required field (amortization_period,
   * term_length, renewal_date, rate_type, payment_frequency) is missing or null,
   * the system shall reject the creation with a validation error.
   *
   * **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6**
   */
  describe('Property 1: Mortgage Required Fields Validation', () => {
    test('Valid mortgage data should pass validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          (mortgageData) => {
            // Should not throw for valid data
            expect(() => mortgageService.validateMortgageFields(mortgageData)).not.toThrow();
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Missing amortization_period should fail validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          fc.constantFrom(undefined, null),
          (mortgageData, missingValue) => {
            const invalidData = { ...mortgageData, amortization_period: missingValue };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow('Amortization period is required for mortgages');
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Missing term_length should fail validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          fc.constantFrom(undefined, null),
          (mortgageData, missingValue) => {
            const invalidData = { ...mortgageData, term_length: missingValue };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow('Term length is required for mortgages');
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Missing renewal_date should fail validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          fc.constantFrom(undefined, null, ''),
          (mortgageData, missingValue) => {
            const invalidData = { ...mortgageData, renewal_date: missingValue };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow('Renewal date is required for mortgages');
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Missing rate_type should fail validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          fc.constantFrom(undefined, null, ''),
          (mortgageData, missingValue) => {
            const invalidData = { ...mortgageData, rate_type: missingValue };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow('Rate type is required for mortgages');
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Missing payment_frequency should fail validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          fc.constantFrom(undefined, null, ''),
          (mortgageData, missingValue) => {
            const invalidData = { ...mortgageData, payment_frequency: missingValue };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow('Payment frequency is required for mortgages');
            return true;
          }
        ),
        pbtOptions()
      );
    });
  });

  /**
   * Property 7: Validation Bounds
   *
   * For any mortgage creation attempt:
   * (a) amortization_period outside 1-40 years shall be rejected
   * (b) term_length outside 1-10 years shall be rejected
   * (c) term_length greater than amortization_period shall be rejected
   * (d) renewal_date in the past shall be rejected
   * (e) estimated_property_value of zero or negative (when provided) shall be rejected
   *
   * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**
   */
  describe('Property 7: Validation Bounds', () => {
    test('Amortization period below 1 should fail validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          fc.integer({ min: -100, max: 0 }),
          (mortgageData, invalidValue) => {
            const invalidData = { ...mortgageData, amortization_period: invalidValue };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow('Amortization period must be between 1 and 40 years');
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Amortization period above 40 should fail validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          fc.integer({ min: 41, max: 100 }),
          (mortgageData, invalidValue) => {
            const invalidData = { ...mortgageData, amortization_period: invalidValue };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow('Amortization period must be between 1 and 40 years');
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Term length below 1 should fail validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          fc.integer({ min: -100, max: 0 }),
          (mortgageData, invalidValue) => {
            const invalidData = { ...mortgageData, term_length: invalidValue };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow('Term length must be between 1 and 10 years');
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Term length above 10 should fail validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          fc.integer({ min: 11, max: 50 }),
          (mortgageData, invalidValue) => {
            // Ensure amortization_period is high enough to not trigger term > amortization error first
            const invalidData = { 
              ...mortgageData, 
              term_length: invalidValue,
              amortization_period: 40 // Max valid amortization
            };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow('Term length must be between 1 and 10 years');
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Term length greater than amortization period should fail validation', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 9 }), // amortization_period (keep low so term can exceed it within bounds)
          safeFutureDateString(),
          fc.constantFrom('fixed', 'variable'),
          fc.constantFrom('monthly', 'bi-weekly', 'accelerated_bi-weekly'),
          (amortization, renewalDate, rateType, paymentFrequency) => {
            // term_length is amortization + 1, ensuring term > amortization but still within 1-10 bounds
            const termLength = Math.min(amortization + 1, 10);
            // Only test when term actually exceeds amortization
            if (termLength <= amortization) return true;
            
            const invalidData = {
              amortization_period: amortization,
              term_length: termLength,
              renewal_date: renewalDate,
              rate_type: rateType,
              payment_frequency: paymentFrequency
            };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow('Term length cannot exceed amortization period');
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Renewal date in the past should fail validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          safePastDateString(),
          (mortgageData, pastDate) => {
            const invalidData = { ...mortgageData, renewal_date: pastDate };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow('Renewal date must be in the future');
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Invalid renewal date format should fail validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          fc.constantFrom('2026/01/01', '01-01-2026', '2026-1-1', 'invalid', '2026-13-01', '2026-01-32'),
          (mortgageData, invalidDate) => {
            const invalidData = { ...mortgageData, renewal_date: invalidDate };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow('Renewal date must be in YYYY-MM-DD format');
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Estimated property value of zero should fail validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          (mortgageData) => {
            const invalidData = { ...mortgageData, estimated_property_value: 0 };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow('Estimated property value must be greater than zero');
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Negative estimated property value should fail validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          fc.float({ min: Math.fround(-1000000), max: Math.fround(-0.01), noNaN: true }).filter(n => isFinite(n)),
          (mortgageData, negativeValue) => {
            const invalidData = { ...mortgageData, estimated_property_value: negativeValue };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow('Estimated property value must be greater than zero');
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Invalid rate_type should fail validation', () => {
      // Use a guaranteed future date to avoid renewal date validation errors
      const guaranteedFutureDate = '2030-06-15';
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 40 }), // amortization_period
          fc.integer({ min: 1, max: 10 }), // term_length
          fc.constantFrom('monthly', 'bi-weekly', 'accelerated_bi-weekly'),
          fc.constantFrom('Fixed', 'Variable', 'adjustable', 'floating', 'invalid'),
          (amortization, term, paymentFrequency, invalidRateType) => {
            // Ensure term <= amortization
            const validTerm = Math.min(term, amortization);
            const invalidData = {
              amortization_period: amortization,
              term_length: validTerm,
              renewal_date: guaranteedFutureDate,
              rate_type: invalidRateType,
              payment_frequency: paymentFrequency
            };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow("Rate type must be 'fixed' or 'variable'");
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Invalid payment_frequency should fail validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          fc.constantFrom('Monthly', 'weekly', 'annual', 'biweekly', 'invalid'),
          (mortgageData, invalidFrequency) => {
            const invalidData = { ...mortgageData, payment_frequency: invalidFrequency };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow("Payment frequency must be 'monthly', 'bi-weekly', or 'accelerated_bi-weekly'");
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Non-integer amortization period should fail validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          fc.float({ min: Math.fround(1.1), max: Math.fround(39.9), noNaN: true }).filter(n => !Number.isInteger(n) && isFinite(n)),
          (mortgageData, nonIntegerValue) => {
            const invalidData = { ...mortgageData, amortization_period: nonIntegerValue };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow('Amortization period must be between 1 and 40 years');
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Non-integer term length should fail validation', () => {
      fc.assert(
        fc.property(
          validMortgageArb,
          fc.float({ min: Math.fround(1.1), max: Math.fround(9.9), noNaN: true }).filter(n => !Number.isInteger(n) && isFinite(n)),
          (mortgageData, nonIntegerValue) => {
            const invalidData = { ...mortgageData, term_length: nonIntegerValue };
            expect(() => mortgageService.validateMortgageFields(invalidData))
              .toThrow('Term length must be between 1 and 10 years');
            return true;
          }
        ),
        pbtOptions()
      );
    });
  });
});
