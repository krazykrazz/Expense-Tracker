/**
 * Property-Based Tests for BillingCycleHistoryService Trend Indicator
 * Feature: unified-billing-cycles
 * 
 * Using fast-check library for property-based testing
 * 
 * **Validates: Requirements 5.2, 5.3, 5.4, 5.6**
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');

// Import the service to test
const billingCycleHistoryService = require('./billingCycleHistoryService');

describe('BillingCycleHistoryService - Trend Indicator Property Tests', () => {
  /**
   * Feature: unified-billing-cycles, Property 7: Trend Indicator Calculation
   * **Validates: Requirements 5.2, 5.3, 5.4, 5.6**
   * 
   * For any two consecutive billing cycles (current and previous) with effective balances Ec and Ep:
   * - If |Ec - Ep| <= 1.00, trend type SHALL be 'same' with icon '✓'
   * - If Ec - Ep > 1.00, trend type SHALL be 'higher' with icon '↑' and amount = |Ec - Ep|
   * - If Ep - Ec > 1.00, trend type SHALL be 'lower' with icon '↓' and amount = |Ep - Ec|
   */
  test('Property 7: Trend Indicator - Higher Spending', async () => {
    await fc.assert(
      fc.property(
        // Generate previous balance
        fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // Generate increase amount > $1
        fc.float({ min: Math.fround(1.01), max: Math.fround(5000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        (previousBalance, increase) => {
          const currentBalance = previousBalance + increase;

          const result = billingCycleHistoryService.calculateTrendIndicator(
            currentBalance,
            previousBalance
          );

          // Should indicate higher spending
          expect(result).not.toBeNull();
          expect(result.type).toBe('higher');
          expect(result.icon).toBe('↑');
          expect(result.cssClass).toBe('trend-higher');
          // Amount should be the absolute difference
          expect(result.amount).toBeCloseTo(increase, 2);

          return true;
        }
      ),
      pbtOptions()
    );
  });

  test('Property 7: Trend Indicator - Lower Spending', async () => {
    await fc.assert(
      fc.property(
        // Generate previous balance (high enough to decrease)
        fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // Generate decrease amount > $1
        fc.float({ min: Math.fround(1.01), max: Math.fround(99), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        (previousBalance, decrease) => {
          const currentBalance = previousBalance - decrease;

          const result = billingCycleHistoryService.calculateTrendIndicator(
            currentBalance,
            previousBalance
          );

          // Should indicate lower spending
          expect(result).not.toBeNull();
          expect(result.type).toBe('lower');
          expect(result.icon).toBe('↓');
          expect(result.cssClass).toBe('trend-lower');
          // Amount should be the absolute difference
          expect(result.amount).toBeCloseTo(decrease, 2);

          return true;
        }
      ),
      pbtOptions()
    );
  });

  test('Property 7: Trend Indicator - Same Spending ($1 Tolerance)', async () => {
    await fc.assert(
      fc.property(
        // Generate base balance
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // Generate small difference within $1 tolerance
        fc.float({ min: Math.fround(-1), max: Math.fround(1), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        (baseBalance, smallDiff) => {
          const currentBalance = baseBalance + smallDiff;
          const previousBalance = baseBalance;

          const result = billingCycleHistoryService.calculateTrendIndicator(
            currentBalance,
            previousBalance
          );

          // Should indicate same spending
          expect(result).not.toBeNull();
          expect(result.type).toBe('same');
          expect(result.icon).toBe('✓');
          expect(result.cssClass).toBe('trend-same');
          expect(result.amount).toBe(0);

          return true;
        }
      ),
      pbtOptions()
    );
  });

  test('Property 7: Trend Indicator - No Previous Cycle', async () => {
    await fc.assert(
      fc.property(
        // Generate any current balance
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        (currentBalance) => {
          // Test with null previous
          const nullResult = billingCycleHistoryService.calculateTrendIndicator(
            currentBalance,
            null
          );
          expect(nullResult).toBeNull();

          // Test with undefined previous
          const undefinedResult = billingCycleHistoryService.calculateTrendIndicator(
            currentBalance,
            undefined
          );
          expect(undefinedResult).toBeNull();

          return true;
        }
      ),
      pbtOptions()
    );
  });

  test('Property 7: Trend Indicator - Edge Cases', () => {
    // Test exact $1 difference (should be 'same')
    const exactOneResult = billingCycleHistoryService.calculateTrendIndicator(101, 100);
    expect(exactOneResult.type).toBe('same');

    // Test just over $1 difference (should be 'higher')
    const justOverResult = billingCycleHistoryService.calculateTrendIndicator(101.01, 100);
    expect(justOverResult.type).toBe('higher');
    expect(justOverResult.amount).toBeCloseTo(1.01, 2);

    // Test zero balances
    const zeroResult = billingCycleHistoryService.calculateTrendIndicator(0, 0);
    expect(zeroResult.type).toBe('same');
    expect(zeroResult.amount).toBe(0);

    // Test large difference
    const largeResult = billingCycleHistoryService.calculateTrendIndicator(5000, 1000);
    expect(largeResult.type).toBe('higher');
    expect(largeResult.amount).toBe(4000);

    // Test negative difference (lower)
    const lowerResult = billingCycleHistoryService.calculateTrendIndicator(500, 1000);
    expect(lowerResult.type).toBe('lower');
    expect(lowerResult.amount).toBe(500);
  });
});
