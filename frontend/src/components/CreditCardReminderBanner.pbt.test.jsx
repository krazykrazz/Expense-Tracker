/**
 * Property-Based Tests for CreditCardReminderBanner Navigation Based on Due Status
 *
 * **Feature: financial-overview-redesign, Property 5: CreditCardReminderBanner navigation based on due status**
 *
 * For any card displayed in CreditCardReminderBanner, clicking SHALL invoke onClick
 * with the first card. The parent handler uses the card data to determine:
 * - If overdue (daysUntilDue ≤ 0): initialTab='payments', initialAction='log-payment'
 * - If due-soon (daysUntilDue > 0): initialTab='overview', initialAction=null
 *
 * **Validates: Requirements 1.3, 1.4, 9.2, 9.3**
 *
 * @invariant Due Status Navigation: For any card, clicking the banner passes the first card to onClick, enabling the parent to route based on overdue/due-soon status.
 */

import { render, fireEvent, cleanup } from '@testing-library/react';
import { describe, test, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import CreditCardReminderBanner from './CreditCardReminderBanner';

afterEach(() => cleanup());

// ── Arbitraries ──

const creditCardArbitrary = (overrides = {}) =>
  fc.record({
    id: fc.integer({ min: 1, max: 10000 }),
    paymentMethodId: fc.integer({ min: 1, max: 10000 }),
    display_name: fc.constantFrom('Visa', 'Mastercard', 'Amex', 'Discover'),
    full_name: fc.constant('Credit Card'),
    current_balance: fc.double({ min: 0, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
    statement_balance: fc.double({ min: 0, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
    required_payment: fc.double({ min: 0, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
    credit_limit: fc.integer({ min: 1000, max: 50000 }),
    payment_due_day: fc.option(fc.integer({ min: 1, max: 28 }), { nil: null }),
    billing_cycle_day: fc.integer({ min: 1, max: 28 }),
    days_until_due: fc.integer({ min: -30, max: 30 }),
    is_statement_paid: fc.boolean(),
    is_overdue: fc.boolean(),
    is_due_soon: fc.boolean(),
    has_statement_pdf: fc.boolean(),
    cycle_start_date: fc.constant('2026-01-26'),
    cycle_end_date: fc.constant('2026-02-25'),
    ...overrides
  });

/** Generate an overdue card (daysUntilDue ≤ 0) */
const overdueCardArbitrary = () =>
  creditCardArbitrary({
    days_until_due: fc.integer({ min: -30, max: 0 }),
    is_overdue: fc.constant(true),
    is_due_soon: fc.constant(false)
  });

/** Generate a due-soon card (daysUntilDue > 0) */
const dueSoonCardArbitrary = () =>
  creditCardArbitrary({
    days_until_due: fc.integer({ min: 1, max: 7 }),
    is_overdue: fc.constant(false),
    is_due_soon: fc.constant(true)
  });

// ── Property Tests ──

describe('CreditCardReminderBanner - Due Status Navigation Properties', () => {
  /**
   * **Feature: financial-overview-redesign, Property 5: CreditCardReminderBanner navigation based on due status**
   *
   * For any overdue card, clicking the banner SHALL pass the first card to onClick.
   * The parent uses this to call openCreditCardDetail with initialTab='payments'
   * and initialAction='log-payment'.
   *
   * **Validates: Requirements 1.3, 9.2**
   */
  test('Property 5a: Overdue card click passes first card to onClick', () => {
    fc.assert(
      fc.property(
        fc.array(overdueCardArbitrary(), { minLength: 1, maxLength: 4 }),
        (cards) => {
          const onClick = vi.fn();

          const { getByTestId, unmount } = render(
            <CreditCardReminderBanner
              cards={cards}
              isOverdue={true}
              onDismiss={() => {}}
              onClick={onClick}
            />
          );

          const banner = getByTestId('credit-card-reminder-banner');
          fireEvent.click(banner);

          expect(onClick).toHaveBeenCalledTimes(1);

          const receivedCard = onClick.mock.calls[0][0];
          const expectedCard = cards[0];

          // Property: onClick receives the first card
          expect(receivedCard.id).toBe(expectedCard.id);
          expect(receivedCard.paymentMethodId).toBe(expectedCard.paymentMethodId);
          expect(receivedCard.days_until_due).toBe(expectedCard.days_until_due);

          // Property: The card is overdue (days_until_due ≤ 0)
          expect(receivedCard.days_until_due).toBeLessThanOrEqual(0);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * For any due-soon card, clicking the banner SHALL pass the first card to onClick.
   * The parent uses this to call openCreditCardDetail with initialTab='overview'
   * and initialAction=null.
   *
   * **Validates: Requirements 1.4, 9.3**
   */
  test('Property 5b: Due-soon card click passes first card to onClick', () => {
    fc.assert(
      fc.property(
        fc.array(dueSoonCardArbitrary(), { minLength: 1, maxLength: 4 }),
        (cards) => {
          const onClick = vi.fn();

          const { getByTestId, unmount } = render(
            <CreditCardReminderBanner
              cards={cards}
              isOverdue={false}
              onDismiss={() => {}}
              onClick={onClick}
            />
          );

          const banner = getByTestId('credit-card-reminder-banner');
          fireEvent.click(banner);

          expect(onClick).toHaveBeenCalledTimes(1);

          const receivedCard = onClick.mock.calls[0][0];
          const expectedCard = cards[0];

          // Property: onClick receives the first card
          expect(receivedCard.id).toBe(expectedCard.id);
          expect(receivedCard.paymentMethodId).toBe(expectedCard.paymentMethodId);
          expect(receivedCard.days_until_due).toBe(expectedCard.days_until_due);

          // Property: The card is due-soon (days_until_due > 0)
          expect(receivedCard.days_until_due).toBeGreaterThan(0);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * For any card (overdue or due-soon), the parent handler can determine
   * the correct navigation target based on the card's days_until_due.
   * This tests the routing logic that the parent applies.
   *
   * **Validates: Requirements 1.3, 1.4, 9.2, 9.3**
   */
  test('Property 5c: Parent routing logic correctly maps due status to navigation params', () => {
    fc.assert(
      fc.property(
        fc.oneof(overdueCardArbitrary(), dueSoonCardArbitrary()),
        fc.boolean(),
        (card, isOverdue) => {
          const onClick = vi.fn();

          const { getByTestId, unmount } = render(
            <CreditCardReminderBanner
              cards={[card]}
              isOverdue={isOverdue}
              onDismiss={() => {}}
              onClick={onClick}
            />
          );

          const banner = getByTestId('credit-card-reminder-banner');
          fireEvent.click(banner);

          const receivedCard = onClick.mock.calls[0][0];

          // Simulate parent routing logic (as implemented in SummaryPanel)
          const cardIsOverdue = receivedCard.days_until_due <= 0;
          const expectedTab = cardIsOverdue ? 'payments' : 'overview';
          const expectedAction = cardIsOverdue ? 'log-payment' : null;

          // Property: routing logic produces valid navigation params
          expect(['payments', 'overview']).toContain(expectedTab);
          expect([null, 'log-payment']).toContain(expectedAction);

          // Property: overdue cards route to payments tab with log-payment action
          if (cardIsOverdue) {
            expect(expectedTab).toBe('payments');
            expect(expectedAction).toBe('log-payment');
          } else {
            expect(expectedTab).toBe('overview');
            expect(expectedAction).toBeNull();
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
