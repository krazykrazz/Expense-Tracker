/**
 * Property-Based Tests for BillingCycleReminderBanner Deep-Link Navigation
 *
 * **Feature: financial-overview-redesign, Property 4: BillingCycleReminderBanner deep-link navigation**
 *
 * For any non-empty list of cards in BillingCycleReminderBanner, clicking the banner
 * SHALL invoke onClick with the first card, enabling the parent to call
 * openCreditCardDetail with the correct paymentMethodId, initialTab='billing-cycles',
 * initialAction='enter-statement', and reminderData containing that card's cycle dates
 * and calculated balance.
 *
 * **Validates: Requirements 1.1, 1.2**
 *
 * @invariant Deep-Link Navigation: For any non-empty card list, clicking the banner passes the first card to onClick, preserving paymentMethodId, cycleStartDate, cycleEndDate, and calculatedBalance for deep-link navigation.
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

const nonEmptyCardList = () =>
  fc.array(billingCycleCardArbitrary(), { minLength: 1, maxLength: 5 });

// ── Property Tests ──

describe('BillingCycleReminderBanner - Deep-Link Navigation Properties', () => {
  /**
   * **Feature: financial-overview-redesign, Property 4: BillingCycleReminderBanner deep-link navigation**
   *
   * For any non-empty list of cards, clicking the banner SHALL invoke onClick
   * with the first card object containing paymentMethodId, cycleStartDate,
   * cycleEndDate, and calculatedBalance needed for deep-link navigation.
   *
   * **Validates: Requirements 1.1, 1.2**
   */
  test('Property 4: Clicking banner passes first card to onClick for deep-link navigation', () => {
    fc.assert(
      fc.property(
        nonEmptyCardList(),
        (cards) => {
          const onClick = vi.fn();
          const onDismiss = vi.fn();

          const { getByTestId, unmount } = render(
            <BillingCycleReminderBanner
              cards={cards}
              onDismiss={onDismiss}
              onClick={onClick}
            />
          );

          const banner = getByTestId('billing-cycle-reminder-banner');
          fireEvent.click(banner);

          // Property: onClick is called exactly once
          expect(onClick).toHaveBeenCalledTimes(1);

          // Property: onClick receives the first card in the list
          const receivedCard = onClick.mock.calls[0][0];
          const expectedCard = cards[0];

          expect(receivedCard.paymentMethodId).toBe(expectedCard.paymentMethodId);
          expect(receivedCard.cycleStartDate).toBe(expectedCard.cycleStartDate);
          expect(receivedCard.cycleEndDate).toBe(expectedCard.cycleEndDate);
          expect(receivedCard.calculatedBalance).toBe(expectedCard.calculatedBalance);
          expect(receivedCard.displayName).toBe(expectedCard.displayName);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Supplementary property: Keyboard navigation also passes first card
   */
  test('Property 4 (keyboard): Enter/Space key passes first card to onClick', () => {
    fc.assert(
      fc.property(
        nonEmptyCardList(),
        fc.constantFrom('Enter', ' '),
        (cards, key) => {
          const onClick = vi.fn();

          const { getByTestId, unmount } = render(
            <BillingCycleReminderBanner
              cards={cards}
              onDismiss={() => {}}
              onClick={onClick}
            />
          );

          const banner = getByTestId('billing-cycle-reminder-banner');
          fireEvent.keyDown(banner, { key });

          expect(onClick).toHaveBeenCalledTimes(1);

          const receivedCard = onClick.mock.calls[0][0];
          expect(receivedCard.paymentMethodId).toBe(cards[0].paymentMethodId);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
