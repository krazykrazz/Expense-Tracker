/**
 * Property-Based Tests for Interest Calculation Utility
 *
 * Feature: mortgage-balance-interest-tracking
 * Tests Property 1: Monthly Interest Formula Correctness
 *
 * For any balance B >= 0 and annual rate R where 0.01 <= R <= 15,
 * calculateMonthlyInterest(B, R) returns a value within 0.01 of
 * B × (R / 100) / 12. For B = 0 or R = 0, the result is 0.
 *
 * **Validates: Requirements 1.6, 9.1**
 *
 * @invariant Monthly Interest Formula Correctness: For any balance B >= 0
 * and annual rate R (0.01-15%), calculateMonthlyInterest(B, R) equals
 * B × (R / 100) / 12 within 0.01 tolerance. Returns 0 when B=0 or R=0.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const { calculateMonthlyInterest } = require('./interestCalculation');
const mortgageInsightsService = require('../services/mortgageInsightsService');

describe('Interest Calculation Utility Property Tests', () => {
  /**
   * Property 1: Monthly Interest Formula Correctness
   * Feature: mortgage-balance-interest-tracking, Property 1
   *
   * **Validates: Requirements 1.6, 9.1**
   */
  describe('Property 1: Monthly Interest Formula Correctness', () => {
    // Tag: Feature: mortgage-balance-interest-tracking, Property 1: Monthly interest formula correctness

    test('calculateMonthlyInterest(B, R) is within 0.01 of B × (R / 100) / 12 for positive B and R', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 2_000_000, noNaN: true }),
          fc.double({ min: 0.01, max: 15, noNaN: true }),
          (balance, rate) => {
            const result = calculateMonthlyInterest(balance, rate);
            const expected = balance * (rate / 100) / 12;

            expect(Math.abs(result - expected)).toBeLessThanOrEqual(0.01);
          }
        ),
        pbtOptions()
      );
    });

    test('calculateMonthlyInterest returns 0 when balance is 0', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 15, noNaN: true }),
          (rate) => {
            const result = calculateMonthlyInterest(0, rate);
            expect(result).toBe(0);
          }
        ),
        pbtOptions()
      );
    });

    test('calculateMonthlyInterest returns 0 when rate is 0', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 2_000_000, noNaN: true }),
          (balance) => {
            const result = calculateMonthlyInterest(balance, 0);
            expect(result).toBe(0);
          }
        ),
        pbtOptions()
      );
    });
  });

  /**
   * Property 6: Mortgage Insights Monthly Interest Consistency
   * Feature: mortgage-balance-interest-tracking, Property 6
   *
   * For any balance B > 0 and rate R > 0,
   * mortgageInsightsService.calculateInterestBreakdown(B, R).monthly
   * equals calculateMonthlyInterest(B, R).
   *
   * **Validates: Requirements 9.3**
   */
  describe('Property 6: Mortgage Insights Monthly Interest Consistency', () => {
    // Tag: Feature: mortgage-balance-interest-tracking, Property 6: Mortgage insights monthly interest consistency

    test('calculateInterestBreakdown(B, R).monthly === calculateMonthlyInterest(B, R) for positive B and R', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 2_000_000, noNaN: true }),
          fc.double({ min: 0.01, max: 15, noNaN: true }),
          (balance, rate) => {
            const breakdown = mortgageInsightsService.calculateInterestBreakdown(balance, rate);
            const expected = calculateMonthlyInterest(balance, rate);

            expect(breakdown.monthly).toBe(expected);
          }
        ),
        pbtOptions()
      );
    });
  });
});
