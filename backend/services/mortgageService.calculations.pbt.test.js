/**
 * Property-Based Tests for MortgageService Calculations
 *
 * Feature: mortgage-tracking
 * Tests Property 4: Equity Calculation Formula
 * Tests Property 5: Amortization Schedule Invariants
 * Tests Property 6: Renewal Status Calculation
 *
 * Validates: Requirements 4.1, 4.4, 5.2, 5.3, 7.1, 7.2, 7.3
 */

const fc = require('fast-check');
const mortgageService = require('./mortgageService');
const { pbtOptions, safeAmount } = require('../test/pbtArbitraries');

/**
 * Safe property value arbitrary (positive values for equity calculation)
 */
const safePropertyValue = () => safeAmount({ min: 50000, max: 5000000 });

/**
 * Safe balance arbitrary (non-negative values)
 */
const safeBalance = () => fc.float({ min: Math.fround(0), max: Math.fround(5000000), noNaN: true })
  .filter(n => !isNaN(n) && isFinite(n) && n >= 0);

/**
 * Safe interest rate arbitrary (0-15%)
 */
const safeInterestRate = () => fc.float({ min: Math.fround(0), max: Math.fround(15), noNaN: true })
  .filter(n => !isNaN(n) && isFinite(n) && n >= 0);

/**
 * Safe future date arbitrary for renewal dates
 * Generates dates between 1 month and 24 months from now
 */
const safeFutureDateString = (minMonths = 1, maxMonths = 24) => {
  return fc.integer({ min: minMonths, max: maxMonths }).map(monthsAhead => {
    const date = new Date();
    date.setMonth(date.getMonth() + monthsAhead);
    return date.toISOString().split('T')[0];
  });
};

/**
 * Safe past date arbitrary for testing past due renewals
 */
const safePastDateString = () => {
  return fc.integer({ min: 1, max: 24 }).map(monthsAgo => {
    const date = new Date();
    date.setMonth(date.getMonth() - monthsAgo);
    return date.toISOString().split('T')[0];
  });
};

describe('MortgageService Calculation Property Tests', () => {
  /**
   * Property 4: Equity Calculation Formula
   *
   * For any mortgage with a positive estimated_property_value and a non-negative
   * remaining_balance, the calculated equity amount shall equal
   * (estimated_property_value - remaining_balance) and the equity percentage
   * shall equal ((estimated_property_value - remaining_balance) / estimated_property_value) * 100.
   *
   * **Validates: Requirements 4.1, 4.4**
   */
  describe('Property 4: Equity Calculation Formula', () => {
    test('Equity amount equals property value minus balance', () => {
      fc.assert(
        fc.property(
          safePropertyValue(),
          safeBalance(),
          (propertyValue, balance) => {
            const result = mortgageService.calculateEquity(propertyValue, balance);
            
            expect(result).not.toBeNull();
            
            const expectedEquity = propertyValue - balance;
            expect(result.equityAmount).toBeCloseTo(expectedEquity, 2);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Equity percentage equals (equity / property value) * 100', () => {
      fc.assert(
        fc.property(
          safePropertyValue(),
          safeBalance(),
          (propertyValue, balance) => {
            const result = mortgageService.calculateEquity(propertyValue, balance);
            
            expect(result).not.toBeNull();
            
            const expectedPercentage = ((propertyValue - balance) / propertyValue) * 100;
            expect(result.equityPercentage).toBeCloseTo(expectedPercentage, 2);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Zero property value returns null', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          (balance) => {
            const result = mortgageService.calculateEquity(0, balance);
            expect(result).toBeNull();
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Negative property value returns null', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(-1000000), max: Math.fround(-1), noNaN: true }).filter(n => isFinite(n)),
          safeBalance(),
          (negativeValue, balance) => {
            const result = mortgageService.calculateEquity(negativeValue, balance);
            expect(result).toBeNull();
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Negative balance is treated as zero', () => {
      fc.assert(
        fc.property(
          safePropertyValue(),
          fc.float({ min: Math.fround(-1000000), max: Math.fround(-1), noNaN: true }).filter(n => isFinite(n)),
          (propertyValue, negativeBalance) => {
            const result = mortgageService.calculateEquity(propertyValue, negativeBalance);
            
            expect(result).not.toBeNull();
            // When balance is negative, it's treated as 0, so equity = property value
            expect(result.equityAmount).toBeCloseTo(propertyValue, 2);
            expect(result.equityPercentage).toBeCloseTo(100, 2);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });
  });


  /**
   * Property 5: Amortization Schedule Invariants
   *
   * For any generated amortization schedule entry, the sum of principal and
   * interest portions shall equal the total payment amount (within floating-point
   * tolerance), and the remaining balance shall decrease by exactly the principal
   * amount from the previous period.
   *
   * **Validates: Requirements 5.2, 5.3**
   */
  describe('Property 5: Amortization Schedule Invariants', () => {
    test('Principal plus interest equals payment for each entry', () => {
      fc.assert(
        fc.property(
          safeAmount({ min: 50000, max: 1000000 }), // balance
          fc.float({ min: Math.fround(1), max: Math.fround(10), noNaN: true }).filter(n => isFinite(n)), // rate
          fc.integer({ min: 5, max: 30 }), // amortizationYears
          fc.constantFrom('monthly', 'bi-weekly', 'accelerated_bi-weekly'),
          (balance, rate, amortizationYears, paymentFrequency) => {
            const schedule = mortgageService.generateAmortizationSchedule({
              balance,
              rate,
              amortizationYears,
              paymentFrequency
            });

            // Check first 12 entries (or all if less)
            const entriesToCheck = Math.min(schedule.length, 12);
            for (let i = 0; i < entriesToCheck; i++) {
              const entry = schedule[i];
              const sum = entry.principal + entry.interest;
              // Allow for rounding tolerance (0.02 due to rounding to 2 decimal places)
              expect(Math.abs(sum - entry.payment)).toBeLessThanOrEqual(0.02);
            }

            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Remaining balance decreases by principal amount', () => {
      fc.assert(
        fc.property(
          safeAmount({ min: 50000, max: 500000 }), // balance
          fc.float({ min: Math.fround(2), max: Math.fround(8), noNaN: true }).filter(n => isFinite(n)), // rate
          fc.integer({ min: 10, max: 25 }), // amortizationYears
          fc.constantFrom('monthly', 'bi-weekly', 'accelerated_bi-weekly'),
          (balance, rate, amortizationYears, paymentFrequency) => {
            const schedule = mortgageService.generateAmortizationSchedule({
              balance,
              rate,
              amortizationYears,
              paymentFrequency
            });

            if (schedule.length < 2) return true;

            // Check balance decreases correctly for first 10 entries
            let prevBalance = balance;
            const entriesToCheck = Math.min(schedule.length, 10);
            for (let i = 0; i < entriesToCheck; i++) {
              const entry = schedule[i];
              const expectedBalance = prevBalance - entry.principal;
              // Allow for rounding tolerance
              expect(Math.abs(entry.remainingBalance - expectedBalance)).toBeLessThanOrEqual(0.02);
              prevBalance = entry.remainingBalance;
            }

            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Cumulative totals increase monotonically', () => {
      fc.assert(
        fc.property(
          safeAmount({ min: 100000, max: 500000 }), // balance
          fc.float({ min: Math.fround(3), max: Math.fround(7), noNaN: true }).filter(n => isFinite(n)), // rate
          fc.integer({ min: 15, max: 25 }), // amortizationYears
          fc.constantFrom('monthly', 'bi-weekly', 'accelerated_bi-weekly'),
          (balance, rate, amortizationYears, paymentFrequency) => {
            const schedule = mortgageService.generateAmortizationSchedule({
              balance,
              rate,
              amortizationYears,
              paymentFrequency
            });

            if (schedule.length < 2) return true;

            // Check cumulative totals increase
            for (let i = 1; i < Math.min(schedule.length, 12); i++) {
              expect(schedule[i].cumulativePrincipal).toBeGreaterThanOrEqual(schedule[i-1].cumulativePrincipal);
              expect(schedule[i].cumulativeInterest).toBeGreaterThanOrEqual(schedule[i-1].cumulativeInterest);
            }

            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Empty schedule for zero or negative balance', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(0, -100, -1000),
          fc.float({ min: Math.fround(1), max: Math.fround(10), noNaN: true }).filter(n => isFinite(n)),
          fc.integer({ min: 5, max: 30 }),
          fc.constantFrom('monthly', 'bi-weekly', 'accelerated_bi-weekly'),
          (balance, rate, amortizationYears, paymentFrequency) => {
            const schedule = mortgageService.generateAmortizationSchedule({
              balance,
              rate,
              amortizationYears,
              paymentFrequency
            });

            expect(schedule).toEqual([]);
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Schedule handles zero interest rate', () => {
      fc.assert(
        fc.property(
          safeAmount({ min: 10000, max: 100000 }), // balance
          fc.integer({ min: 1, max: 5 }), // amortizationYears
          fc.constantFrom('monthly'),
          (balance, amortizationYears, paymentFrequency) => {
            const schedule = mortgageService.generateAmortizationSchedule({
              balance,
              rate: 0,
              amortizationYears,
              paymentFrequency
            });

            // With zero interest, all payments should be principal only
            for (const entry of schedule.slice(0, 12)) {
              expect(entry.interest).toBe(0);
              expect(entry.principal).toBeCloseTo(entry.payment, 2);
            }

            return true;
          }
        ),
        pbtOptions()
      );
    });
  });

  /**
   * Property 6: Renewal Status Calculation
   *
   * For any mortgage with a renewal_date, the renewal status calculation shall
   * correctly identify:
   * (a) isApproaching as true if and only if the renewal date is within 6 months from today
   * (b) isPastDue as true if and only if the renewal date is before today
   * (c) monthsUntilRenewal as the correct number of months between today and the renewal date
   *
   * **Validates: Requirements 7.1, 7.2, 7.3**
   */
  describe('Property 6: Renewal Status Calculation', () => {
    test('isApproaching is true when within 6 months and not past due', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 6 }), // months ahead (within 6 months)
          (monthsAhead) => {
            const date = new Date();
            date.setMonth(date.getMonth() + monthsAhead);
            const renewalDate = date.toISOString().split('T')[0];

            const result = mortgageService.checkRenewalStatus(renewalDate);

            expect(result.isApproaching).toBe(true);
            expect(result.isPastDue).toBe(false);
            // monthsUntilRenewal should be approximately monthsAhead (within 1 month tolerance due to varying month lengths)
            expect(Math.abs(result.monthsUntilRenewal - monthsAhead)).toBeLessThanOrEqual(1);

            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('isApproaching is false when more than 6 months away', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 8, max: 36 }), // months ahead (more than 6 months)
          (monthsAhead) => {
            const date = new Date();
            date.setMonth(date.getMonth() + monthsAhead);
            const renewalDate = date.toISOString().split('T')[0];

            const result = mortgageService.checkRenewalStatus(renewalDate);

            expect(result.isApproaching).toBe(false);
            expect(result.isPastDue).toBe(false);

            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('isPastDue is true when renewal date is in the past', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 24 }), // months ago
          (monthsAgo) => {
            const date = new Date();
            date.setMonth(date.getMonth() - monthsAgo);
            const renewalDate = date.toISOString().split('T')[0];

            const result = mortgageService.checkRenewalStatus(renewalDate);

            expect(result.isPastDue).toBe(true);
            expect(result.isApproaching).toBe(false);
            expect(result.monthsUntilRenewal).toBeLessThan(0);

            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Null renewal date returns default status', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(null, undefined, ''),
          (invalidDate) => {
            const result = mortgageService.checkRenewalStatus(invalidDate);

            expect(result.isApproaching).toBe(false);
            expect(result.isPastDue).toBe(false);
            expect(result.monthsUntilRenewal).toBeNull();

            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('monthsUntilRenewal is approximately correct', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 36 }), // months ahead
          (monthsAhead) => {
            const date = new Date();
            date.setMonth(date.getMonth() + monthsAhead);
            const renewalDate = date.toISOString().split('T')[0];

            const result = mortgageService.checkRenewalStatus(renewalDate);

            // Allow tolerance of 1 month due to varying month lengths
            expect(Math.abs(result.monthsUntilRenewal - monthsAhead)).toBeLessThanOrEqual(1);

            return true;
          }
        ),
        pbtOptions()
      );
    });
  });
});
