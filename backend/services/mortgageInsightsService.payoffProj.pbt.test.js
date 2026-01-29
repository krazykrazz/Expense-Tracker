/**
 * Property-Based Tests for MortgageInsightsService Payoff Projections
 *
 * Feature: mortgage-insights
 * Tests Property 6: Payoff Projection Consistency
 * Tests Property 7: Underpayment Detection
 *
 * Validates: Requirements 4.1, 4.2, 4.4, 4.5, 4.6
 */

const fc = require('fast-check');
const mortgageInsightsService = require('./mortgageInsightsService');
const { pbtOptions, safeAmount } = require('../test/pbtArbitraries');

/**
 * Safe balance arbitrary (realistic mortgage balances)
 */
const safeBalance = () => safeAmount({ min: 50000, max: 1000000 });

/**
 * Safe interest rate arbitrary (realistic mortgage rates: 2-10%)
 */
const safeInterestRate = () => fc.float({ min: Math.fround(2), max: Math.fround(10), noNaN: true })
  .filter(n => !isNaN(n) && isFinite(n) && n > 0);

/**
 * Generate a payment amount that is sufficient to pay off the mortgage
 * (greater than interest-only payment)
 */
const sufficientPayment = (balance, rate) => {
  const monthlyInterest = balance * (rate / 100) / 12;
  // Payment must be at least interest + some principal
  const minPayment = monthlyInterest * 1.1;
  const maxPayment = balance / 12; // Pay off in 1 year max
  return fc.float({ min: Math.fround(minPayment), max: Math.fround(Math.max(minPayment * 2, maxPayment)), noNaN: true })
    .filter(n => !isNaN(n) && isFinite(n) && n > minPayment);
};

describe('MortgageInsightsService Payoff Projection Property Tests', () => {
  /**
   * Property 6: Payoff Projection Consistency
   *
   * For any mortgage with positive balance, positive rate, and payment amount
   * greater than or equal to the interest-only payment, the projected payoff shall satisfy:
   * (a) payoff date is in the future
   * (b) total interest equals total paid minus original balance
   * (c) higher payment amounts result in earlier payoff dates and lower total interest
   *
   * **Validates: Requirements 4.1, 4.2, 4.4, 4.5**
   */
  describe('Property 6: Payoff Projection Consistency', () => {
    test('Payoff date is in the future for valid inputs', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          (balance, rate) => {
            // Calculate a sufficient payment
            const monthlyInterest = balance * (rate / 100) / 12;
            const paymentAmount = monthlyInterest * 1.5; // 50% more than interest

            const result = mortgageInsightsService.projectPayoff({
              balance,
              rate,
              paymentAmount
            });

            // Payoff date should be in the future
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const payoffDate = new Date(result.payoffDate);
            
            expect(payoffDate.getTime()).toBeGreaterThanOrEqual(today.getTime());
            expect(result.isUnderpayment).toBe(false);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Total interest equals total paid minus original balance', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          (balance, rate) => {
            // Calculate a sufficient payment
            const monthlyInterest = balance * (rate / 100) / 12;
            const paymentAmount = monthlyInterest * 2; // Double the interest

            const result = mortgageInsightsService.projectPayoff({
              balance,
              rate,
              paymentAmount
            });

            if (!result.isUnderpayment) {
              // Total paid = principal (balance) + interest
              const expectedTotalPaid = balance + result.totalInterest;
              // Allow for rounding tolerance
              expect(Math.abs(result.totalPaid - expectedTotalPaid)).toBeLessThanOrEqual(1);
            }
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Higher payment results in earlier payoff and less interest', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          fc.float({ min: Math.fround(1.2), max: Math.fround(2), noNaN: true }).filter(n => isFinite(n)),
          (balance, rate, multiplier) => {
            // Calculate base payment (sufficient to pay off)
            const monthlyInterest = balance * (rate / 100) / 12;
            const basePayment = monthlyInterest * 1.5;
            const higherPayment = basePayment * multiplier;

            const baseResult = mortgageInsightsService.projectPayoff({
              balance,
              rate,
              paymentAmount: basePayment
            });

            const higherResult = mortgageInsightsService.projectPayoff({
              balance,
              rate,
              paymentAmount: higherPayment
            });

            if (!baseResult.isUnderpayment && !higherResult.isUnderpayment) {
              // Higher payment should result in fewer months
              expect(higherResult.totalMonths).toBeLessThanOrEqual(baseResult.totalMonths);
              
              // Higher payment should result in less total interest
              expect(higherResult.totalInterest).toBeLessThanOrEqual(baseResult.totalInterest);
            }
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Total months is positive for valid projections', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          (balance, rate) => {
            const monthlyInterest = balance * (rate / 100) / 12;
            const paymentAmount = monthlyInterest * 1.5;

            const result = mortgageInsightsService.projectPayoff({
              balance,
              rate,
              paymentAmount
            });

            if (!result.isUnderpayment) {
              expect(result.totalMonths).toBeGreaterThan(0);
            }
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Zero balance returns immediate payoff', () => {
      fc.assert(
        fc.property(
          safeInterestRate(),
          safeAmount({ min: 100, max: 5000 }),
          (rate, payment) => {
            const result = mortgageInsightsService.projectPayoff({
              balance: 0,
              rate,
              paymentAmount: payment
            });

            expect(result.totalMonths).toBe(0);
            expect(result.totalInterest).toBe(0);
            expect(result.isUnderpayment).toBe(false);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });
  });

  /**
   * Property 7: Underpayment Detection
   *
   * For any mortgage where the current payment amount is less than the calculated
   * minimum payment (interest-only payment), the system shall flag this as an
   * underpayment condition.
   *
   * **Validates: Requirements 4.6**
   */
  describe('Property 7: Underpayment Detection', () => {
    test('Payment less than or equal to interest is flagged as underpayment', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          fc.float({ min: Math.fround(0.1), max: Math.fround(0.99), noNaN: true }).filter(n => isFinite(n)),
          (balance, rate, fraction) => {
            // Calculate interest-only payment
            const monthlyInterest = balance * (rate / 100) / 12;
            // Payment is a fraction of the interest (underpayment)
            const paymentAmount = monthlyInterest * fraction;

            const result = mortgageInsightsService.projectPayoff({
              balance,
              rate,
              paymentAmount
            });

            expect(result.isUnderpayment).toBe(true);
            expect(result.payoffDate).toBeNull();
            expect(result.totalMonths).toBeNull();
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Payment greater than interest is not flagged as underpayment', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          fc.float({ min: Math.fround(1.1), max: Math.fround(3), noNaN: true }).filter(n => isFinite(n)),
          (balance, rate, multiplier) => {
            // Calculate interest-only payment
            const monthlyInterest = balance * (rate / 100) / 12;
            // Payment is greater than interest
            const paymentAmount = monthlyInterest * multiplier;

            const result = mortgageInsightsService.projectPayoff({
              balance,
              rate,
              paymentAmount
            });

            expect(result.isUnderpayment).toBe(false);
            expect(result.payoffDate).not.toBeNull();
            expect(result.totalMonths).toBeGreaterThan(0);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('comparePaymentScenarios flags underpayment when current < minimum', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          (balance, rate) => {
            // Calculate minimum payment (interest + some principal)
            const monthlyInterest = balance * (rate / 100) / 12;
            const minimumPayment = monthlyInterest * 1.5;
            // Current payment is less than minimum
            const currentPayment = minimumPayment * 0.8;

            const result = mortgageInsightsService.comparePaymentScenarios({
              balance,
              rate,
              currentPayment,
              minimumPayment
            });

            expect(result.isUnderpayment).toBe(true);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('comparePaymentScenarios does not flag underpayment when current >= minimum', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          fc.float({ min: Math.fround(1), max: Math.fround(2), noNaN: true }).filter(n => isFinite(n)),
          (balance, rate, multiplier) => {
            // Calculate minimum payment
            const monthlyInterest = balance * (rate / 100) / 12;
            const minimumPayment = monthlyInterest * 1.5;
            // Current payment is >= minimum
            const currentPayment = minimumPayment * multiplier;

            const result = mortgageInsightsService.comparePaymentScenarios({
              balance,
              rate,
              currentPayment,
              minimumPayment
            });

            expect(result.isUnderpayment).toBe(false);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Zero or negative payment is flagged as underpayment', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          fc.constantFrom(0, -100, -1000),
          (balance, rate, payment) => {
            const result = mortgageInsightsService.projectPayoff({
              balance,
              rate,
              paymentAmount: payment
            });

            expect(result.isUnderpayment).toBe(true);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });
  });
});
