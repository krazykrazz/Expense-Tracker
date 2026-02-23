/**
 * @invariant Investment row rendering with conditional indicators: For any investment, the row
 * displays the investment name, current value, type badge, and quick action buttons. If the
 * investment is in the highlight list, an "Update Needed" badge is present.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
   * type badge, and quick action buttons (View Details, edit, delete). If the investment is in
   * the highlight list, an "Update Needed" badge SHALL be present.
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

  /**
   * **Feature: financial-overview-ui-consistency, Property 2: Investment row has exactly one action button and no Update Value button**
   *
   * For any investment, rendering InvestmentRow should produce output that contains a View Details
   * button and should NOT contain any element with the text "Update Value".
   *
   * **Validates: Requirements 2.2**
   */
  it('Property 2: renders View Details button and no Update Value button', () => {
    fc.assert(
      fc.property(
        investmentArb(),
        (investment) => {
          const { unmount } = render(
            <InvestmentRow
              investment={investment}
              onUpdateValue={vi.fn()}
              onViewDetails={vi.fn()}
              onEdit={vi.fn()}
              onDelete={vi.fn()}
            />
          );

          // No Update Value button
          expect(screen.queryByText(/Update Value/i)).toBeNull();

          // View Details button is present
          expect(screen.getByText(/View Details/i)).toBeInTheDocument();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: financial-overview-styling-consistency, Property 8: No Icon-Based Actions**
   *
   * For all action elements in the Financial Overview Modal, they should be button elements,
   * not icon-based actions. Investment rows should use button elements with text labels
   * (View Details, Edit, Delete) instead of icon-only buttons (✏️, 🗑️).
   *
   * **Validates: Requirements 7.9**
   */
  it('Property 8: uses button elements with text labels, not icon-only actions', () => {
    fc.assert(
      fc.property(
        investmentArb(),
        (investment) => {
          const { container, unmount } = render(
            <InvestmentRow
              investment={investment}
              onViewDetails={vi.fn()}
              onEdit={vi.fn()}
              onDelete={vi.fn()}
            />
          );

          // All action buttons should be button elements
          const buttons = container.querySelectorAll('.investment-row-actions button');
          expect(buttons.length).toBeGreaterThanOrEqual(3);

          // Check that buttons have text content (not just icons)
          const viewDetailsBtn = screen.getByText('View Details');
          const editBtn = screen.getByText('Edit');
          const deleteBtn = screen.getByText('Delete');

          expect(viewDetailsBtn.tagName).toBe('BUTTON');
          expect(editBtn.tagName).toBe('BUTTON');
          expect(deleteBtn.tagName).toBe('BUTTON');

          // Verify buttons don't contain only emoji/icons
          expect(viewDetailsBtn.textContent).not.toMatch(/^[✏️🗑️👁️]+$/);
          expect(editBtn.textContent).not.toMatch(/^[✏️🗑️👁️]+$/);
          expect(deleteBtn.textContent).not.toMatch(/^[✏️🗑️👁️]+$/);

          // Verify buttons use shared CSS classes
          expect(editBtn.className).toContain('financial-action-btn');
          expect(deleteBtn.className).toContain('financial-action-btn');

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
