/**
 * Property-Based Tests for BillingCycleReminderBanner Navigation Contract
 *
 * Feature: financial-overview-ui-consistency
 *
 * Tests the updated navigation contract where the banner passes the full cards
 * array to onClick, enabling context-aware navigation in the parent.
 */

import { render, fireEvent, cleanup } from '@testing-library/react';
import { describe, test, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import BillingCycleReminderBanner from './BillingCycleReminderBanner';
import { safeDate, safeAmount } from '../test-utils/arbitraries';

afterEach(() => cleanup());

// ── Arbitraries ──

const billingCycleCardArbitrary = () =>
  fc.record({
    paymentMethodId: fc.integer({ min: 1, max: 10000 }),
    displayName: fc.constantFrom('Visa', 'Mastercard', 'Amex', 'Discover', 'Capital One'),
    cycleStartDate: safeDate(),
    cycleEndDate: safeDate(),
    calculatedBalance: safeAmount({ min: 0, max: 50000 }),
    needsEntry: fc.constant(true),
    hasEntry: fc.constant(false)
  });

// ── Property Tests ──

describe('BillingCycleReminderBanner - Navigation Contract Properties', () => {
  /**
   * Feature: financial-overview-ui-consistency, Property 7: Banner navigation contract — single card
   *
   * For any single-card BillingCycleReminderBanner, clicking the banner should invoke
   * onClick with an array of length 1 containing that card's data.
   *
   * **Validates: Requirements 8.1**
   */
  test('Property 7: Single card — onClick receives array of length 1 with that card', () => {
    fc.assert(
      fc.property(
        billingCycleCardArbitrary(),
        (card) => {
          const onClick = vi.fn();

          const { getByTestId, unmount } = render(
            <BillingCycleReminderBanner
              cards={[card]}
              onDismiss={() => {}}
              onClick={onClick}
            />
          );

          fireEvent.click(getByTestId('billing-cycle-reminder-banner'));

          expect(onClick).toHaveBeenCalledTimes(1);

          const received = onClick.mock.calls[0][0];
          expect(Array.isArray(received)).toBe(true);
          expect(received).toHaveLength(1);
          expect(received[0]).toEqual(card);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: financial-overview-ui-consistency, Property 8: Banner navigation contract — multiple cards
   *
   * For any multi-card BillingCycleReminderBanner (cards.length >= 2), clicking the banner
   * should invoke onClick with the full cards array.
   *
   * **Validates: Requirements 8.2**
   */
  test('Property 8: Multiple cards — onClick receives the full cards array', () => {
    fc.assert(
      fc.property(
        fc.array(billingCycleCardArbitrary(), { minLength: 2, maxLength: 5 }),
        (cards) => {
          const onClick = vi.fn();

          const { getByTestId, unmount } = render(
            <BillingCycleReminderBanner
              cards={cards}
              onDismiss={() => {}}
              onClick={onClick}
            />
          );

          fireEvent.click(getByTestId('billing-cycle-reminder-banner'));

          expect(onClick).toHaveBeenCalledTimes(1);

          const received = onClick.mock.calls[0][0];
          expect(Array.isArray(received)).toBe(true);
          expect(received).toHaveLength(cards.length);
          expect(received).toEqual(cards);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: financial-overview-ui-consistency, Property 9: Banner visibility matches pending card count
   *
   * For any list of cards passed to BillingCycleReminderBanner, the banner should render
   * (not return null) if and only if the list is non-empty.
   *
   * **Validates: Requirements 8.3, 8.5**
   */
  test('Property 9: Banner renders iff cards array is non-empty', () => {
    fc.assert(
      fc.property(
        fc.array(billingCycleCardArbitrary(), { minLength: 0, maxLength: 5 }),
        (cards) => {
          const { container, unmount } = render(
            <BillingCycleReminderBanner
              cards={cards}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );

          if (cards.length > 0) {
            expect(container.firstChild).not.toBeNull();
          } else {
            expect(container.firstChild).toBeNull();
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
