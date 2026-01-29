/**
 * Property-Based Tests for MortgageInsightsService Interest Calculations
 *
 * Feature: mortgage-insights
 * Tests Property 5: Interest Calculation Formula
 *
 * Validates: Requirements 3.1, 3.3, 3.4
 */

const fc = require('fast-check');
const mortgageInsightsService = require('./mortgageInsightsService');
const { pbtOptions, safeAmount } = require('../test/pbtArbitraries');

/**
 * Safe balance arbitrary (positive values for interest calculation)
 */
const safeBalance = () => safeAmount({ min: 1000, max: 2000000 });

/**
 * Safe interest rate arbitrary (0.1% to 15%)
 */
const safeInterestRate = () => fc.float({ min: Math.fround(0.1), max: Math.fround(15), noNaN: true })
  .filter(n => !isNaN(n) && isFinite(n) && n > 0);

describe('MortgageInsightsService Interest Calculation Property Tests', () => {
  /**
   * Property 5: Interest Calculation Formula
   *
   * For any mortgage with positive balance B and positive annual rate R,
   * the calculated daily interest shall equal B × (R/100) / 365,
   * weekly interest shall equal daily × 7,
   * and monthly interest shall equal daily × 30.44 (within floating-point tolerance).
   *
   * **Validates: Requirements 3.1, 3.3, 3.4**
   */
  describe('Property 5: Interest Calculation Formula', () => {
    test('Daily interest equals balance × (rate/100) / 365', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          (balance, rate) => {
            const result = mortgageInsightsService.calculateInterestBreakdown(balance, rate);
            
            const expectedDaily = balance * (rate / 100) / 365;
            
            // Allow for rounding tolerance (rounded to 2 decimal places)
            expect(Math.abs(result.daily - Math.round(expectedDaily * 100) / 100)).toBeLessThanOrEqual(0.01);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Weekly interest equals daily × 7', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          (balance, rate) => {
            const result = mortgageInsightsService.calculateInterestBreakdown(balance, rate);
            
            const expectedDaily = balance * (rate / 100) / 365;
            const expectedWeekly = expectedDaily * 7;
            
            // Allow for rounding tolerance
            expect(Math.abs(result.weekly - Math.round(expectedWeekly * 100) / 100)).toBeLessThanOrEqual(0.01);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Monthly interest equals daily × 30.44', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          (balance, rate) => {
            const result = mortgageInsightsService.calculateInterestBreakdown(balance, rate);
            
            const expectedDaily = balance * (rate / 100) / 365;
            const expectedMonthly = expectedDaily * 30.44;
            
            // Allow for rounding tolerance
            expect(Math.abs(result.monthly - Math.round(expectedMonthly * 100) / 100)).toBeLessThanOrEqual(0.01);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Annual interest equals balance × (rate/100)', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          (balance, rate) => {
            const result = mortgageInsightsService.calculateInterestBreakdown(balance, rate);
            
            const expectedAnnual = balance * (rate / 100);
            
            // Allow for rounding tolerance
            expect(Math.abs(result.annual - Math.round(expectedAnnual * 100) / 100)).toBeLessThanOrEqual(0.01);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Zero balance returns zero for all interest values', () => {
      fc.assert(
        fc.property(
          safeInterestRate(),
          (rate) => {
            const result = mortgageInsightsService.calculateInterestBreakdown(0, rate);
            
            expect(result.daily).toBe(0);
            expect(result.weekly).toBe(0);
            expect(result.monthly).toBe(0);
            expect(result.annual).toBe(0);
            expect(result.balance).toBe(0);
            expect(result.rate).toBe(rate);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Zero rate returns zero for all interest values', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          (balance) => {
            const result = mortgageInsightsService.calculateInterestBreakdown(balance, 0);
            
            expect(result.daily).toBe(0);
            expect(result.weekly).toBe(0);
            expect(result.monthly).toBe(0);
            expect(result.annual).toBe(0);
            expect(result.balance).toBe(balance);
            expect(result.rate).toBe(0);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });

    test('Result preserves input balance and rate', () => {
      fc.assert(
        fc.property(
          safeBalance(),
          safeInterestRate(),
          (balance, rate) => {
            const result = mortgageInsightsService.calculateInterestBreakdown(balance, rate);
            
            expect(result.balance).toBe(balance);
            expect(result.rate).toBe(rate);
            
            return true;
          }
        ),
        pbtOptions()
      );
    });
  });
});
