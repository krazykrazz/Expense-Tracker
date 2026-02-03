/**
 * Property-Based Tests for BillingCycleHistoryService Effective Balance
 * Feature: unified-billing-cycles
 * 
 * Using fast-check library for property-based testing
 * 
 * **Validates: Requirements 4.1, 4.2**
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');

// Import the service to test
const billingCycleHistoryService = require('./billingCycleHistoryService');

describe('BillingCycleHistoryService - Effective Balance Property Tests', () => {
  /**
   * Feature: unified-billing-cycles, Property 6: Effective Balance Calculation
   * **Validates: Requirements 4.1, 4.2**
   * 
   * For any billing cycle:
   * - If actual_statement_balance > 0, effective_balance SHALL equal actual_statement_balance 
   *   and balance_type SHALL be 'actual'
   * - If actual_statement_balance = 0, effective_balance SHALL equal calculated_statement_balance 
   *   and balance_type SHALL be 'calculated'
   */
  test('Property 6: Effective Balance Calculation - Actual Balance Priority', async () => {
    await fc.assert(
      fc.property(
        // Generate actual balance > 0
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // Generate calculated balance (any value)
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        (actualBalance, calculatedBalance) => {
          const cycle = {
            actual_statement_balance: actualBalance,
            calculated_statement_balance: calculatedBalance
          };

          const result = billingCycleHistoryService.calculateEffectiveBalance(cycle);

          // When actual > 0, effective balance should be actual
          expect(result.effectiveBalance).toBe(actualBalance);
          expect(result.balanceType).toBe('actual');

          return true;
        }
      ),
      pbtOptions()
    );
  });

  test('Property 6: Effective Balance Calculation - Calculated Balance Fallback', async () => {
    await fc.assert(
      fc.property(
        // Generate calculated balance (any value)
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        (calculatedBalance) => {
          const cycle = {
            actual_statement_balance: 0,
            calculated_statement_balance: calculatedBalance
          };

          const result = billingCycleHistoryService.calculateEffectiveBalance(cycle);

          // When actual = 0, effective balance should be calculated
          expect(result.effectiveBalance).toBe(calculatedBalance);
          expect(result.balanceType).toBe('calculated');

          return true;
        }
      ),
      pbtOptions()
    );
  });

  test('Property 6: Effective Balance Calculation - Edge Cases', () => {
    // Test null cycle
    const nullResult = billingCycleHistoryService.calculateEffectiveBalance(null);
    expect(nullResult.effectiveBalance).toBe(0);
    expect(nullResult.balanceType).toBe('calculated');

    // Test undefined cycle
    const undefinedResult = billingCycleHistoryService.calculateEffectiveBalance(undefined);
    expect(undefinedResult.effectiveBalance).toBe(0);
    expect(undefinedResult.balanceType).toBe('calculated');

    // Test cycle with missing fields
    const emptyResult = billingCycleHistoryService.calculateEffectiveBalance({});
    expect(emptyResult.effectiveBalance).toBe(0);
    expect(emptyResult.balanceType).toBe('calculated');

    // Test cycle with only actual balance
    const actualOnlyResult = billingCycleHistoryService.calculateEffectiveBalance({
      actual_statement_balance: 100
    });
    expect(actualOnlyResult.effectiveBalance).toBe(100);
    expect(actualOnlyResult.balanceType).toBe('actual');

    // Test cycle with only calculated balance
    const calculatedOnlyResult = billingCycleHistoryService.calculateEffectiveBalance({
      calculated_statement_balance: 200
    });
    expect(calculatedOnlyResult.effectiveBalance).toBe(200);
    expect(calculatedOnlyResult.balanceType).toBe('calculated');
  });
});
