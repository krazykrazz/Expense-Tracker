/**
 * Property-based tests for LoanRow component.
 * Feature: financial-overview-ui-consistency
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import fc from 'fast-check';
import LoanRow from './LoanRow';

const LOAN_TYPES = ['loan', 'line_of_credit', 'mortgage'];

const arbitraryLoan = () =>
  fc.record({
    id: fc.integer({ min: 1, max: 100000 }),
    name: fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9 ]{1,38}[a-zA-Z0-9]$/),
    loan_type: fc.constantFrom(...LOAN_TYPES),
    currentBalance: fc
      .double({ min: 0, max: 999999, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100),
    currentRate: fc
      .double({ min: 0, max: 30, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100),
    payment_tracking_enabled: fc.boolean(),
  });

// Property 1: Loan row content completeness
// For any loan, LoanRow renders name, type badge, balance, and View Details button
describe('LoanRow — Property 1: content completeness', () => {
  it('renders name, type badge, balance, and View Details button for any loan', () => {
    fc.assert(
      fc.property(arbitraryLoan(), loan => {
        const { container, unmount } = render(<LoanRow loan={loan} />);

        // Name appears in the .loan-row-name element
        const nameEl = container.querySelector('.loan-row-name');
        expect(nameEl).not.toBeNull();
        expect(nameEl.textContent).toContain(loan.name);

        // Type badge present
        expect(screen.getByTestId('type-badge')).toBeInTheDocument();

        // Balance element present
        expect(container.querySelector('.loan-row-balance')).not.toBeNull();

        // View Details button present
        expect(screen.getByText(/View Details/i)).toBeInTheDocument();

        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('uses flat row style — no card class names on .loan-row', () => {
    fc.assert(
      fc.property(arbitraryLoan(), loan => {
        const { container, unmount } = render(<LoanRow loan={loan} />);
        const row = container.querySelector('.loan-row');
        expect(row).not.toBeNull();
        expect(row.className).not.toMatch(/card/i);
        unmount();
      }),
      { numRuns: 100 }
    );
  });
});