/**
 * Property-Based Tests for Effective Balance Utility
 * Feature: billing-cycle-simplification, Property 1: Effective balance utility equivalence
 *
 * Tests that the extracted effectiveBalanceUtil.calculateEffectiveBalance produces
 * identical results to the original BillingCycleHistoryService.calculateEffectiveBalance
 * for all valid billing cycle records.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.8**
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const { calculateEffectiveBalance } = require('./effectiveBalanceUtil');
const billingCycleHistoryService = require('../services/billingCycleHistoryService');

// Generator from design doc
const arbBillingCycleRecord = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  payment_method_id: fc.integer({ min: 1, max: 100 }),
  cycle_start_date: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') })
    .map(d => d.toISOString().split('T')[0]),
  cycle_end_date: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') })
    .map(d => d.toISOString().split('T')[0]),
  actual_statement_balance: fc.oneof(
    fc.constant(0),
    fc.constant(null),
    fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100)
  ),
  calculated_statement_balance: fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true })
    .map(v => Math.round(v * 100) / 100),
  is_user_entered: fc.oneof(fc.constant(0), fc.constant(1), fc.constant(null), fc.constant(undefined)),
  minimum_payment: fc.option(fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true })),
  notes: fc.option(fc.string({ maxLength: 200 })),
  statement_pdf_path: fc.option(fc.string({ maxLength: 100 }))
});

describe('effectiveBalanceUtil - Property 1: Effective balance utility equivalence', () => {
  // Feature: billing-cycle-simplification, Property 1: Effective balance utility equivalence
  test('utility produces identical output to original BillingCycleHistoryService.calculateEffectiveBalance for all valid billing cycle records', () => {
    fc.assert(
      fc.property(arbBillingCycleRecord, (cycle) => {
        const utilResult = calculateEffectiveBalance(cycle);
        const originalResult = billingCycleHistoryService.calculateEffectiveBalance(cycle);

        expect(utilResult.effectiveBalance).toBe(originalResult.effectiveBalance);
        expect(utilResult.balanceType).toBe(originalResult.balanceType);
      }),
      pbtOptions()
    );
  });
});
