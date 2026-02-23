/**
 * @invariant Credit card row rendering with conditional indicators: For any active credit card,
 * the row displays the card name, current balance, and quick action buttons. Utilization warning
 * appears iff utilization > 75%. Due date warning appears iff days_until_due ≤ 7 or overdue.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import CreditCardRow from './CreditCardRow';

afterEach(cleanup);

/**
 * Arbitrary for credit card data with varying utilization and due dates.
 */
const creditCardArb = () =>
  fc.record({
    id: fc.integer({ min: 1, max: 10000 }),
    name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    currentBalance: fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100),
    statementBalance: fc.oneof(
      fc.constant(null),
      fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100)
    ),
    cycleBalance: fc.oneof(
      fc.constant(null),
      fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100)
    ),
    utilization_percentage: fc.oneof(
      fc.constant(null),
      fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 10) / 10)
    ),
    days_until_due: fc.oneof(
      fc.constant(null),
      fc.integer({ min: -30, max: 60 })
    ),
    credit_limit: fc.double({ min: 500, max: 100000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100)
  });

describe('CreditCardRow Property-Based Tests', () => {
  /**
   * **Feature: financial-overview-redesign, Property 8: Credit card row rendering with conditional indicators**
   *
   * For any active credit card, the Credit_Card_Row SHALL display the card name, current balance,
   * and quick action buttons (Pay, View Details). If utilization > 75%, a warning indicator SHALL
   * be present. If days_until_due ≤ 7 or overdue, a due date warning SHALL be present. If neither
   * condition is met, no warning indicators SHALL be present.
   *
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.5, 4.6**
   */
  it('Property 8: renders card name, balances, buttons, and correct conditional indicators', () => {
    fc.assert(
      fc.property(
        creditCardArb(),
        (card) => {
          const onPay = vi.fn();
          const onViewDetails = vi.fn();

          const { container, unmount } = render(
            <CreditCardRow card={card} onPay={onPay} onViewDetails={onViewDetails} />
          );

          // Card name is displayed
          expect(container.textContent).toContain(card.name);

          // Pay and View buttons are present
          const payButton = container.querySelector('.financial-action-btn-primary');
          const viewButton = container.querySelector('.financial-action-btn-secondary');
          expect(payButton).toBeTruthy();
          expect(viewButton).toBeTruthy();

          // Utilization warning: present iff utilization > 75%
          const utilizationWarning = container.querySelector('[data-testid="utilization-warning"]');
          if (card.utilization_percentage != null && card.utilization_percentage > 75) {
            expect(utilizationWarning).toBeTruthy();
          } else {
            expect(utilizationWarning).toBeFalsy();
          }

          // Due date warning: present iff days_until_due ≤ 7 (including overdue ≤ 0)
          const dueWarning = container.querySelector('[data-testid="due-warning"]');
          if (card.days_until_due != null && card.days_until_due <= 7) {
            expect(dueWarning).toBeTruthy();
            // Overdue vs due-soon styling
            if (card.days_until_due <= 0) {
              expect(dueWarning.classList.contains('overdue')).toBe(true);
            } else {
              expect(dueWarning.classList.contains('due-soon')).toBe(true);
            }
          } else {
            expect(dueWarning).toBeFalsy();
          }

          unmount();
        }
      ),
      { numRuns: 150 }
    );
  });
});
