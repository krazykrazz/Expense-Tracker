/**
 * Property-Based Tests for Discrepancy Utils
 * Tests frontend discrepancy calculation equivalence with backend logic.
 *
 * **Validates: Requirements 3.2, 3.6**
 *
 * @invariant Discrepancy Equivalence: For any pair of non-negative balance values,
 * the frontend calculateDiscrepancy produces identical output to the backend
 * BillingCycleHistoryService.calculateDiscrepancy — same amount, type, and description.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';
import { calculateDiscrepancy } from './discrepancyUtils';

// Balance pair generator from design doc
const arbBalancePair = fc.tuple(
  fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true })
    .map(v => Math.round(v * 100) / 100),
  fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true })
    .map(v => Math.round(v * 100) / 100)
);

/**
 * Reference model: re-implements backend BillingCycleHistoryService.calculateDiscrepancy
 * exactly as it appears in backend/services/billingCycleHistoryService.js
 */
function referenceCalculateDiscrepancy(actualBalance, calculatedBalance) {
  const amount = actualBalance - calculatedBalance;
  const roundedAmount = Math.round(amount * 100) / 100;

  let type, description;

  if (roundedAmount > 0) {
    type = 'higher';
    description = `Actual balance is $${Math.abs(roundedAmount).toFixed(2)} higher than tracked (potential untracked expenses)`;
  } else if (roundedAmount < 0) {
    type = 'lower';
    description = `Actual balance is $${Math.abs(roundedAmount).toFixed(2)} lower than tracked (potential untracked returns/credits)`;
  } else {
    type = 'match';
    description = 'Tracking is accurate';
  }

  return { amount: roundedAmount, type, description };
}

describe('Discrepancy Utils Property-Based Tests', () => {
  // Feature: billing-cycle-simplification, Property 2: Frontend discrepancy calculation equivalence
  /**
   * **Validates: Requirements 3.2, 3.6**
   *
   * For any pair of non-negative numbers (actualBalance, calculatedBalance),
   * the frontend calculateDiscrepancy function produces output identical to
   * the backend BillingCycleHistoryService.calculateDiscrepancy method —
   * same amount, same type string, and same description string.
   */
  test('Property 2: Frontend discrepancy calculation equivalence', () => {
    fc.assert(
      fc.property(
        arbBalancePair,
        ([actualBalance, calculatedBalance]) => {
          const frontendResult = calculateDiscrepancy(actualBalance, calculatedBalance);
          const backendResult = referenceCalculateDiscrepancy(actualBalance, calculatedBalance);

          expect(frontendResult.amount).toBe(backendResult.amount);
          expect(frontendResult.type).toBe(backendResult.type);
          expect(frontendResult.description).toBe(backendResult.description);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });
});
