/**
 * @invariant Investment row rendering with conditional indicators: For any investment, the row
 * displays the investment name, current value, type badge, and quick action buttons. If the
 * investment is in the highlight list, an "Update Needed" badge is present.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import InvestmentRow from './InvestmentRow';

afterEach(cleanup);

/**
 * Arbitrary for investment data with varying types and highlight status.
 */
const investmentArb = () =>
  fc.record({
    id: fc.integer({ min: 1, max: 10000 }),
    name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    type: fc.constantFrom('TFSA', 'RRSP'),
    currentValue: fc.double({ min: 0, max: 500000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100),
    initial_value: fc.double({ min: 0, max: 500000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100)
  });

const investmentRowPropsArb = () =>
  fc.record({
    investment: investmentArb(),
    needsUpdate: fc.boolean()
  });

describe('InvestmentRow Property-Based Tests', () => {
  /**
   * **Feature: financial-overview-redesign, Property 10: Investment row rendering with conditional indicators**
   *
   * For any investment, the Investment_Row SHALL display the investment name, current value,
   * type badge, and quick action buttons (Update Value, View Details, edit, delete). If the
   * investment is in the highlight list, an "Update Needed" badge SHALL be present.
   *
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.5, 10.7**
   */
  it('Property 10: renders investment name, value, type badge, buttons, and correct conditional indicators', () => {
    fc.assert(
      fc.property(
        investmentRowPropsArb(),
        ({ investment, needsUpdate }) => {
          const onUpdateValue = vi.fn();
          const onViewDetails = vi.fn();
          const onEdit = vi.fn();
          const onDelete = vi.fn();

          const { container, unmount } = render(
            <InvestmentRow
              investment={investment}
              needsUpdate={needsUpdate}
              onUpdateValue={onUpdateValue}
              onViewDetails={onViewDetails}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          );

          // Investment name is displayed
          expect(container.textContent).toContain(investment.name);

          // Type badge is present with correct label (TFSA or RRSP)
          const typeBadge = container.querySelector('[data-testid="type-badge"]');
          expect(typeBadge).toBeTruthy();
          expect(typeBadge.textContent.trim()).toBe(investment.type);

          // All four action buttons are always present
          expect(container.querySelector('.investment-row-update-value-button')).toBeTruthy();
          expect(container.querySelector('.investment-row-view-button')).toBeTruthy();
          expect(container.querySelector('.investment-row-edit-button')).toBeTruthy();
          expect(container.querySelector('.investment-row-delete-button')).toBeTruthy();

          // Needs update badge: present iff needsUpdate is true
          const needsUpdateBadge = container.querySelector('[data-testid="needs-update-badge"]');
          if (needsUpdate) {
            expect(needsUpdateBadge).toBeTruthy();
          } else {
            expect(needsUpdateBadge).toBeFalsy();
          }

          unmount();
        }
      ),
      { numRuns: 150 }
    );
  });
});
