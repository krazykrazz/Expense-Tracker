/**
 * Property-Based Tests for useInsuranceStatus
 *
 * Tests the quick status state round-trip property: opening the quick status
 * with any expense sets quickStatusExpense to that expense, and closing it
 * sets quickStatusExpense to null.
 *
 * Feature: frontend-custom-hooks
  *
 * @invariant Quick Status Round-Trip: For any expense, opening the quick status sets quickStatusExpense to that expense, and closing it sets quickStatusExpense to null. Randomization covers diverse expense objects.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';
import useInsuranceStatus from './useInsuranceStatus';

// Mock the expenseApi module
vi.mock('../services/expenseApi', () => ({
  updateInsuranceStatus: vi.fn(),
}));

// --- Smart Generators ---

/**
 * Generates a random expense-like object with an id and a claim status.
 */
const expenseArb = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  amount: fc.float({ min: Math.fround(0.01), max: Math.fround(99999), noNaN: true }),
  claimStatus: fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied'),
  type: fc.constantFrom('Tax - Medical', 'Tax - Donation'),
  place: fc.string({ minLength: 1, maxLength: 50 }),
});

// --- Property Tests ---

describe('useInsuranceStatus Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Feature: frontend-custom-hooks, Property 2: Quick status state round-trip
   * **Validates: Requirements 2.3**
   *
   * For any expense object, calling openQuickStatus(expense) sets
   * quickStatusExpense to that expense, and then calling closeQuickStatus()
   * sets quickStatusExpense to null.
   */
  describe('Property 2: Quick status state round-trip', () => {
    test('openQuickStatus(expense) then closeQuickStatus() round-trips correctly for any expense', () => {
      fc.assert(
        fc.property(
          expenseArb,
          (expense) => {
            const { result, unmount } = renderHook(() => useInsuranceStatus());

            // Initially null
            expect(result.current.quickStatusExpense).toBeNull();

            // Open with the expense
            act(() => {
              result.current.openQuickStatus(expense);
            });

            // quickStatusExpense should be the expense
            expect(result.current.quickStatusExpense).toEqual(expense);

            // Close
            act(() => {
              result.current.closeQuickStatus();
            });

            // quickStatusExpense should be null again
            expect(result.current.quickStatusExpense).toBeNull();

            unmount();
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('consecutive opens overwrite correctly - last expense wins', () => {
      fc.assert(
        fc.property(
          expenseArb,
          expenseArb,
          (expense1, expense2) => {
            const { result, unmount } = renderHook(() => useInsuranceStatus());

            // Open with first expense
            act(() => {
              result.current.openQuickStatus(expense1);
            });
            expect(result.current.quickStatusExpense).toEqual(expense1);

            // Open with second expense (overwrite)
            act(() => {
              result.current.openQuickStatus(expense2);
            });
            expect(result.current.quickStatusExpense).toEqual(expense2);

            // Close
            act(() => {
              result.current.closeQuickStatus();
            });
            expect(result.current.quickStatusExpense).toBeNull();

            unmount();
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });
  });
});
