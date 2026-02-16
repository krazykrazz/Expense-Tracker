/**
 * Property-Based Tests for MortgageInsightsService Extra Payment Scenarios
 *
 * Feature: mortgage-insights
 * Tests Property 8: Extra Payment Scenario Benefits
 *
 * Validates: Requirements 5.2, 5.3, 5.4
  *
 * @invariant Extra Payment Benefits: For any mortgage scenario, making extra payments always results in equal or earlier payoff and equal or less total interest compared to the base scenario; the benefit is monotonically non-decreasing with extra payment amount. Randomization covers diverse extra payment amounts and mortgage terms.
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
 * Safe extra payment arbitrary (realistic extra payment amounts)
 */
const safeExtraPayment = () => safeAmount({ min: 50, max: 2000 });

describe('MortgageInsightsService Extra Payment Scenario Property Tests', () => {
  /**
   * Property 8: Extra Payment Scenario Benefits
   *
   * For any mortgage with valid projection data and any extra payment amount
   * greater than zero, the scenario calculation shall show:
   * (a) new payoff date earlier than current payoff date
   * (b) months saved greater than zero
   * (c) interest saved greater than zero
   *
   * **Validates: Requirements 5.2, 5.3, 5.4**
   */
  describe('Property 8: Extra Payment Scenario Benefits', () => {
    test('Extra payment results in earlier payoff date', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          safeExtraPayment(),
          (balance, rate, extraPayment) => {
            // Calculate a sufficient base payment
            const monthlyInterest = balance * (rate / 100) / 12;
            const currentPayment = monthlyInterest * 1.5;

            const result = mortgageInsightsService.calculateExtraPaymentScenario({
              balance,
              rate,
              currentPayment,
              extraPayment
            });

            // Get current scenario for comparison
            const currentScenario = mortgageInsightsService.projectPayoff({
              balance,
              rate,
              paymentAmount: currentPayment
            });

            if (!currentScenario.isUnderpayment && result.newPayoffDate) {
              const newDate = new Date(result.newPayoffDate);
              const currentDate = new Date(currentScenario.payoffDate);
              
              // New payoff date should be earlier or equal
              expect(newDate.getTime()).toBeLessThanOrEqual(currentDate.getTime());
            }
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Extra payment results in months saved >= 0', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          safeExtraPayment(),
          (balance, rate, extraPayment) => {
            const monthlyInterest = balance * (rate / 100) / 12;
            const currentPayment = monthlyInterest * 1.5;

            const result = mortgageInsightsService.calculateExtraPaymentScenario({
              balance,
              rate,
              currentPayment,
              extraPayment
            });

            if (result.monthsSaved !== null) {
              expect(result.monthsSaved).toBeGreaterThanOrEqual(0);
            }
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Extra payment results in interest saved >= 0', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          safeExtraPayment(),
          (balance, rate, extraPayment) => {
            const monthlyInterest = balance * (rate / 100) / 12;
            const currentPayment = monthlyInterest * 1.5;

            const result = mortgageInsightsService.calculateExtraPaymentScenario({
              balance,
              rate,
              currentPayment,
              extraPayment
            });

            if (result.interestSaved !== null) {
              expect(result.interestSaved).toBeGreaterThanOrEqual(0);
            }
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('New total interest is less than or equal to original', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          safeExtraPayment(),
          (balance, rate, extraPayment) => {
            const monthlyInterest = balance * (rate / 100) / 12;
            const currentPayment = monthlyInterest * 1.5;

            const result = mortgageInsightsService.calculateExtraPaymentScenario({
              balance,
              rate,
              currentPayment,
              extraPayment
            });

            if (result.newTotalInterest !== null && result.originalTotalInterest !== null) {
              expect(result.newTotalInterest).toBeLessThanOrEqual(result.originalTotalInterest);
            }
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('New payment equals current payment plus extra payment', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          safeExtraPayment(),
          (balance, rate, extraPayment) => {
            const monthlyInterest = balance * (rate / 100) / 12;
            const currentPayment = monthlyInterest * 1.5;

            const result = mortgageInsightsService.calculateExtraPaymentScenario({
              balance,
              rate,
              currentPayment,
              extraPayment
            });

            expect(result.newPayment).toBeCloseTo(currentPayment + extraPayment, 2);
            expect(result.extraPayment).toBe(extraPayment);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Larger extra payment results in more savings', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          safeAmount({ min: 100, max: 500 }),
          fc.float({ min: Math.fround(1.5), max: Math.fround(3), noNaN: true }).filter(n => isFinite(n)),
          (balance, rate, baseExtra, multiplier) => {
            const monthlyInterest = balance * (rate / 100) / 12;
            const currentPayment = monthlyInterest * 1.5;

            const smallerExtra = baseExtra;
            const largerExtra = baseExtra * multiplier;

            const smallerResult = mortgageInsightsService.calculateExtraPaymentScenario({
              balance,
              rate,
              currentPayment,
              extraPayment: smallerExtra
            });

            const largerResult = mortgageInsightsService.calculateExtraPaymentScenario({
              balance,
              rate,
              currentPayment,
              extraPayment: largerExtra
            });

            if (smallerResult.interestSaved !== null && largerResult.interestSaved !== null) {
              // Larger extra payment should save at least as much interest
              expect(largerResult.interestSaved).toBeGreaterThanOrEqual(smallerResult.interestSaved);
            }

            if (smallerResult.monthsSaved !== null && largerResult.monthsSaved !== null) {
              // Larger extra payment should save at least as many months
              expect(largerResult.monthsSaved).toBeGreaterThanOrEqual(smallerResult.monthsSaved);
            }
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Zero extra payment returns no savings', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          (balance, rate) => {
            const monthlyInterest = balance * (rate / 100) / 12;
            const currentPayment = monthlyInterest * 1.5;

            const result = mortgageInsightsService.calculateExtraPaymentScenario({
              balance,
              rate,
              currentPayment,
              extraPayment: 0
            });

            expect(result.monthsSaved).toBe(0);
            expect(result.interestSaved).toBe(0);
            expect(result.extraPayment).toBe(0);
            expect(result.newPayment).toBe(currentPayment);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Negative extra payment is treated as zero', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          fc.float({ min: Math.fround(-1000), max: Math.fround(-1), noNaN: true }).filter(n => isFinite(n)),
          (balance, rate, negativeExtra) => {
            const monthlyInterest = balance * (rate / 100) / 12;
            const currentPayment = monthlyInterest * 1.5;

            const result = mortgageInsightsService.calculateExtraPaymentScenario({
              balance,
              rate,
              currentPayment,
              extraPayment: negativeExtra
            });

            expect(result.monthsSaved).toBe(0);
            expect(result.interestSaved).toBe(0);
            expect(result.extraPayment).toBe(0);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });
  });
});
