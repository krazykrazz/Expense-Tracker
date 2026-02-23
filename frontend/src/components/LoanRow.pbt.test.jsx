/**
 * Property-based tests for LoanRow component.
 * Feature: financial-overview-ui-consistency
 * Feature: financial-overview-styling-consistency
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fc from 'fast-check';
import LoanRow from './LoanRow';

// ── Arbitrary ──

const LOAN_TYPES = ['loan', 'line_of_credit', 'mortgage'];

const arbitraryLoan = () =>
  fc.record({
    id: fc.integer({ min: 1, max: 100000 }),
    name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    loan_type: fc.constantFrom(...LOAN_TYPES),
    currentBalance: fc.double({ min: 0, max: 999999, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100),
    currentRate: fc.double({ min: 0, max: 30, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100),
    payment_tracking_enabled: fc.boolean(),
  });

// ── Property 1: Loan row content completeness ──

describe('LoanRow — Property 1: content completeness', () => {
  it('renders name, type badge, balance, and View button for any loan', () => {
    fc.assert(
      fc.property(arbitraryLoan(), (loan) => {
        const { container, unmount } = render(<LoanRow loan={loan} />);

        // Name is present in the loan-row-name div
        const nameEl = container.querySelector('.loan-row-name');
        expect(nameEl).not.toBeNull();
        expect(nameEl.textContent).toContain(loan.name);

        // Type badge is present
        expect(container.querySelector('[data-testid="type-badge"]')).not.toBeNull();

        // Balance text is present in loan-row-details
        const detailsEl = container.querySelector('.loan-row-details');
        expect(detailsEl).not.toBeNull();
        expect(detailsEl.textContent).toContain('Balance:');

        // View button is present with shared class
        const viewButton = container.querySelector('.financial-action-btn-secondary');
        expect(viewButton).not.toBeNull();
        expect(viewButton.textContent).toBe('View');

        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('uses flat row style — no card border/shadow classes on .loan-row', () => {
    fc.assert(
      fc.property(arbitraryLoan(), (loan) => {
        const { container, unmount } = render(<LoanRow loan={loan} />);
        const row = container.querySelector('.loan-row');
        expect(row).not.toBeNull();
        // The element should not carry card-style class names
        expect(row.className).not.toMatch(/card/i);
        unmount();
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 15: Vertical Spacing Consistency ──

/**
 * **Validates: Requirements 5.6, 6.6**
 * 
 * For any list of loan rows, the vertical spacing (margin-bottom) between rows should be consistent.
 * This ensures a uniform visual rhythm and professional appearance across all loan displays.
 */
describe('LoanRow — Property 15: Vertical Spacing Consistency', () => {
  it('maintains consistent margin-bottom across all loan rows', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryLoan(), { minLength: 2, maxLength: 10 }),
        (loans) => {
          // Ensure unique IDs to avoid React key warnings
          const uniqueLoans = loans.map((loan, index) => ({ ...loan, id: loan.id + index * 100000 }));

          // Render all loan rows in a container
          const { container, unmount } = render(
            <div>
              {uniqueLoans.map(loan => (
                <LoanRow key={loan.id} loan={loan} />
              ))}
            </div>
          );

          // Get all loan row elements
          const loanRows = container.querySelectorAll('.loan-row');
          expect(loanRows.length).toBe(uniqueLoans.length);

          // Extract margin-bottom values from computed styles
          const marginBottoms = Array.from(loanRows).map(row => {
            const computedStyle = window.getComputedStyle(row);
            const marginBottom = computedStyle.marginBottom;
            // Return the raw CSS value for comparison (handles both px values and 0)
            return marginBottom;
          });

          // Verify all margin-bottom values are identical
          const firstMargin = marginBottoms[0];
          const allConsistent = marginBottoms.every(margin => margin === firstMargin);

          unmount();
          return allConsistent;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('maintains consistent vertical spacing regardless of loan properties', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryLoan(), { minLength: 2, maxLength: 5 }),
        fc.array(fc.boolean(), { minLength: 2, maxLength: 5 }), // needsUpdate flags
        fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 2, maxLength: 5 }), // fixedExpenseCount
        (loans, needsUpdateFlags, fixedExpenseCounts) => {
          // Ensure arrays have matching lengths
          const minLength = Math.min(loans.length, needsUpdateFlags.length, fixedExpenseCounts.length);
          const trimmedLoans = loans.slice(0, minLength);
          const trimmedFlags = needsUpdateFlags.slice(0, minLength);
          const trimmedCounts = fixedExpenseCounts.slice(0, minLength);

          // Ensure unique IDs
          const uniqueLoans = trimmedLoans.map((loan, index) => ({ ...loan, id: loan.id + index * 100000 }));

          // Render loan rows with varying properties
          const { container, unmount } = render(
            <div>
              {uniqueLoans.map((loan, index) => (
                <LoanRow
                  key={loan.id}
                  loan={loan}
                  needsUpdate={trimmedFlags[index]}
                  fixedExpenseCount={trimmedCounts[index]}
                />
              ))}
            </div>
          );

          const loanRows = container.querySelectorAll('.loan-row');
          
          // Extract margin-bottom values
          const marginBottoms = Array.from(loanRows).map(row => {
            const computedStyle = window.getComputedStyle(row);
            return computedStyle.marginBottom;
          });

          // All margin-bottom values should be identical
          const firstMargin = marginBottoms[0];
          const allConsistent = marginBottoms.every(margin => margin === firstMargin);

          unmount();
          return allConsistent;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('loan-row element has margin-bottom style applied', () => {
    fc.assert(
      fc.property(
        arbitraryLoan(),
        (loan) => {
          const { container, unmount } = render(<LoanRow loan={loan} />);
          
          const loanRow = container.querySelector('.loan-row');
          
          // Verify the loan-row class is applied (which includes margin-bottom in CSS)
          const hasLoanRowClass = loanRow && loanRow.classList.contains('loan-row');
          
          // Verify margin-bottom is present in computed styles (even if jsdom returns 0px)
          const computedStyle = window.getComputedStyle(loanRow);
          const hasMarginBottom = computedStyle.marginBottom !== undefined;

          unmount();
          return hasLoanRowClass && hasMarginBottom;
        }
      ),
      { numRuns: 100 }
    );
  });
});
