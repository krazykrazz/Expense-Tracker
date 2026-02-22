/**
 * Property-based tests for LoanRow component.
 * Feature: financial-overview-ui-consistency
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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

        // Balance text is present (formatCurrency wraps the value)
        const balanceEl = container.querySelector('.loan-row-balance');
        expect(balanceEl).not.toBeNull();

        // Balance badge is present
        const balanceBadgeEl = container.querySelector('.loan-row-balance-badge');
        expect(balanceBadgeEl).not.toBeNull();

        // View button is present
        const viewButton = container.querySelector('.loan-row-view-button');
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
