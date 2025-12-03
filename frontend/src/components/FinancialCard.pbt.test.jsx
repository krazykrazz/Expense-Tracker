import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import * as fc from 'fast-check';
import FinancialCard from './FinancialCard';

describe('FinancialCard Property-Based Tests', () => {
  /**
   * **Feature: summary-panel-redesign, Property 10: Modal Opening**
   * 
   * For any management button click (View/Edit or Manage), 
   * the corresponding modal dialog SHALL be opened.
   * **Validates: Requirements 5.6**
   */
  it('Property 10: clicking action button calls onAction handler', async () => {
    // Generator for card props
    const titleArb = fc.constantFrom('Income', 'Fixed Expenses', 'Loans', 'Investments');
    const iconArb = fc.constantFrom('💰', '🏠', '🏦', '📈');
    const valueArb = fc.float({ min: 0, max: 1000000, noNaN: true });
    const valueColorArb = fc.constantFrom('positive', 'negative', 'neutral');
    const actionLabelArb = fc.constantFrom('View/Edit', 'Manage', 'Manage Loans', 'Manage Investments');

    await fc.assert(
      fc.asyncProperty(
        titleArb,
        iconArb,
        valueArb,
        valueColorArb,
        actionLabelArb,
        async (title, icon, value, valueColor, actionLabel) => {
          const onAction = vi.fn();

          const { container, unmount } = render(
            <FinancialCard
              title={title}
              icon={icon}
              value={value}
              valueColor={valueColor}
              actionLabel={actionLabel}
              onAction={onAction}
            />
          );

          // Find the action button
          const actionButton = container.querySelector('.financial-card-action-btn');
          expect(actionButton).toBeTruthy();
          expect(actionButton.textContent).toBe(actionLabel);

          // Click the button
          fireEvent.click(actionButton);

          // Verify onAction was called exactly once
          expect(onAction).toHaveBeenCalledTimes(1);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Value color class is correctly applied
   */
  it('applies correct color class based on valueColor prop', async () => {
    const valueColorArb = fc.constantFrom('positive', 'negative', 'neutral');
    const valueArb = fc.float({ min: 0, max: 1000000, noNaN: true });

    await fc.assert(
      fc.asyncProperty(
        valueColorArb,
        valueArb,
        async (valueColor, value) => {
          const { container, unmount } = render(
            <FinancialCard
              title="Test"
              icon="💰"
              value={value}
              valueColor={valueColor}
              actionLabel="Test"
              onAction={() => {}}
            />
          );

          const valueElement = container.querySelector('.financial-card-value');
          expect(valueElement).toBeTruthy();

          // Check that the correct color class is applied
          const expectedClass = `value-${valueColor}`;
          expect(valueElement.classList.contains(expectedClass)).toBe(true);

          // Check that other color classes are NOT applied
          const otherColors = ['positive', 'negative', 'neutral'].filter(c => c !== valueColor);
          otherColors.forEach(color => {
            expect(valueElement.classList.contains(`value-${color}`)).toBe(false);
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Details list renders all provided items
   */
  it('renders all detail items when provided', async () => {
    const detailArb = fc.record({
      label: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
      value: fc.float({ min: 0, max: 100000, noNaN: true })
    });

    const detailsArb = fc.array(detailArb, { minLength: 0, maxLength: 5 });

    await fc.assert(
      fc.asyncProperty(
        detailsArb,
        async (details) => {
          const { container, unmount } = render(
            <FinancialCard
              title="Test"
              icon="💰"
              value={1000}
              valueColor="neutral"
              actionLabel="Test"
              onAction={() => {}}
              details={details}
            />
          );

          const detailItems = container.querySelectorAll('.financial-card-detail-item');
          
          // Number of rendered items should match provided details
          expect(detailItems.length).toBe(details.length);

          // Each detail should have correct label
          details.forEach((detail, index) => {
            const labelElement = detailItems[index].querySelector('.detail-label');
            expect(labelElement.textContent).toBe(detail.label);
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Button is not rendered when onAction is not provided
   */
  it('does not render action button when onAction is not provided', async () => {
    const valueArb = fc.float({ min: 0, max: 1000000, noNaN: true });

    await fc.assert(
      fc.asyncProperty(
        valueArb,
        async (value) => {
          const { container, unmount } = render(
            <FinancialCard
              title="Test"
              icon="💰"
              value={value}
              valueColor="neutral"
            />
          );

          // Button should not be rendered
          const actionButton = container.querySelector('.financial-card-action-btn');
          expect(actionButton).toBeNull();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
