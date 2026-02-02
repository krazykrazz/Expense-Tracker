import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import * as fc from 'fast-check';
import ReimbursementIndicator from './ReimbursementIndicator';

describe('ReimbursementIndicator Property-Based Tests', () => {
  /**
   * **Feature: generic-expense-reimbursement, Property 5: Reimbursement Indicator Display**
   * 
   * Property 5: Reimbursement Indicator Display
   * For any expense where original_cost is set and differs from amount,
   * the expense list SHALL display a reimbursement indicator.
   * For any expense where original_cost is NULL or equals amount,
   * no indicator SHALL be displayed.
   * **Validates: Requirements 5.1, 7.2**
   */
  it('Property 5: should show indicator only when original_cost differs from amount', async () => {
    // Generator for positive amounts using Math.fround for 32-bit float compatibility
    const positiveAmountArb = fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
      .filter(n => n > 0 && isFinite(n));

    await fc.assert(
      fc.asyncProperty(
        positiveAmountArb,
        positiveAmountArb.filter(n => n > 0.01), // Ensure we can have a smaller net amount
        async (originalCost, reimbursementRatio) => {
          // Calculate net amount ensuring it's less than original
          const reimbursement = Math.min(originalCost * (reimbursementRatio / 10000), originalCost - 0.01);
          const netAmount = originalCost - reimbursement;

          // Case 1: With reimbursement (original_cost differs from amount)
          const { container: withReimbursement } = render(
            <ReimbursementIndicator
              originalCost={originalCost}
              netAmount={netAmount}
            />
          );

          // Should render the indicator when original_cost differs from netAmount
          const indicator = withReimbursement.querySelector('.reimbursement-indicator');
          expect(indicator).toBeTruthy();
          expect(indicator.querySelector('.reimbursement-icon')).toBeTruthy();

          // Verify tooltip contains breakdown
          const title = indicator.getAttribute('title');
          expect(title).toContain('Charged:');
          expect(title).toContain('Reimbursed:');
          expect(title).toContain('Net:');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 5: should NOT show indicator when original_cost is null', async () => {
    const positiveAmountArb = fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
      .filter(n => n > 0 && isFinite(n));

    await fc.assert(
      fc.asyncProperty(
        positiveAmountArb,
        async (netAmount) => {
          // Case: original_cost is null (no reimbursement)
          const { container } = render(
            <ReimbursementIndicator
              originalCost={null}
              netAmount={netAmount}
            />
          );

          // Should NOT render the indicator
          const indicator = container.querySelector('.reimbursement-indicator');
          expect(indicator).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 5: should NOT show indicator when original_cost equals amount', async () => {
    const positiveAmountArb = fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
      .filter(n => n > 0 && isFinite(n));

    await fc.assert(
      fc.asyncProperty(
        positiveAmountArb,
        async (amount) => {
          // Case: original_cost equals amount (no reimbursement)
          const { container } = render(
            <ReimbursementIndicator
              originalCost={amount}
              netAmount={amount}
            />
          );

          // Should NOT render the indicator
          const indicator = container.querySelector('.reimbursement-indicator');
          expect(indicator).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 5: should correctly calculate and display reimbursement breakdown', async () => {
    const positiveAmountArb = fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true })
      .filter(n => n >= 1 && isFinite(n));

    const reimbursementPercentArb = fc.float({ min: Math.fround(0.01), max: Math.fround(0.99), noNaN: true })
      .filter(n => n > 0 && n < 1 && isFinite(n));

    await fc.assert(
      fc.asyncProperty(
        positiveAmountArb,
        reimbursementPercentArb,
        async (originalCost, reimbursementPercent) => {
          const reimbursement = originalCost * reimbursementPercent;
          const netAmount = originalCost - reimbursement;

          const { container } = render(
            <ReimbursementIndicator
              originalCost={originalCost}
              netAmount={netAmount}
            />
          );

          const indicator = container.querySelector('.reimbursement-indicator');
          expect(indicator).toBeTruthy();

          // Verify the tooltip contains correct values
          const title = indicator.getAttribute('title');
          expect(title).toContain(`Charged: $${originalCost.toFixed(2)}`);
          expect(title).toContain(`Reimbursed: $${reimbursement.toFixed(2)}`);
          expect(title).toContain(`Net: $${netAmount.toFixed(2)}`);

          // Verify aria-label for accessibility
          const ariaLabel = indicator.getAttribute('aria-label');
          expect(ariaLabel).toContain(`Charged $${originalCost.toFixed(2)}`);
          expect(ariaLabel).toContain(`Reimbursed $${reimbursement.toFixed(2)}`);
          expect(ariaLabel).toContain(`Net $${netAmount.toFixed(2)}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 5: should support both small and medium sizes', async () => {
    const sizeArb = fc.constantFrom('small', 'medium');
    const positiveAmountArb = fc.float({ min: Math.fround(1), max: Math.fround(1000), noNaN: true })
      .filter(n => n >= 1 && isFinite(n));

    await fc.assert(
      fc.asyncProperty(
        sizeArb,
        positiveAmountArb,
        async (size, originalCost) => {
          const netAmount = originalCost * 0.75; // 25% reimbursement

          const { container } = render(
            <ReimbursementIndicator
              originalCost={originalCost}
              netAmount={netAmount}
              size={size}
            />
          );

          const indicator = container.querySelector('.reimbursement-indicator');
          expect(indicator).toBeTruthy();
          expect(indicator.classList.contains(size)).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });
});
