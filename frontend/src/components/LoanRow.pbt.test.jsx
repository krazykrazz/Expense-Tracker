/**
 * @invariant Loan row rendering with conditional indicators: For any loan, the row displays
 * the loan name, current balance, interest rate, type badge, and quick action buttons. If the
 * loan is in the highlight list, an "Update Needed" badge is present. If the loan has linked
 * fixed expenses, a count badge is present. If payment tracking is enabled, a "Log Payment"
 * button is present.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import LoanRow from './LoanRow';

afterEach(cleanup);

/**
 * Arbitrary for loan data with varying types, highlight status, and fixed expense counts.
 */
const loanArb = () =>
  fc.record({
    id: fc.integer({ min: 1, max: 10000 }),
    name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    loan_type: fc.constantFrom('loan', 'line_of_credit', 'mortgage'),
    currentBalance: fc.double({ min: 0, max: 500000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100),
    currentRate: fc.oneof(
      fc.constant(null),
      fc.constant(0),
      fc.double({ min: 0.01, max: 25, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100)
    ),
    payment_tracking_enabled: fc.boolean()
  });

const loanRowPropsArb = () =>
  fc.record({
    loan: loanArb(),
    needsUpdate: fc.boolean(),
    fixedExpenseCount: fc.integer({ min: 0, max: 10 })
  });

describe('LoanRow Property-Based Tests', () => {
  /**
   * **Feature: financial-overview-redesign, Property 9: Loan row rendering with conditional indicators**
   *
   * For any loan, the Loan_Row SHALL display the loan name, current balance, interest rate,
   * type badge, and quick action buttons (View Details, edit, delete). If the loan is in the
   * highlight list, an "Update Needed" badge SHALL be present. If the loan has linked fixed
   * expenses, a count badge SHALL be present. If payment tracking is enabled, a "Log Payment"
   * button SHALL be present.
   *
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.6, 10.6**
   */
  it('Property 9: renders loan name, balance, rate, type badge, buttons, and correct conditional indicators', () => {
    fc.assert(
      fc.property(
        loanRowPropsArb(),
        ({ loan, needsUpdate, fixedExpenseCount }) => {
          const onLogPayment = vi.fn();
          const onViewDetails = vi.fn();
          const onEdit = vi.fn();
          const onDelete = vi.fn();

          const { container, unmount } = render(
            <LoanRow
              loan={loan}
              needsUpdate={needsUpdate}
              fixedExpenseCount={fixedExpenseCount}
              onLogPayment={onLogPayment}
              onViewDetails={onViewDetails}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          );

          // Loan name is displayed
          expect(container.textContent).toContain(loan.name);

          // Type badge is present with correct label
          const typeBadge = container.querySelector('[data-testid="type-badge"]');
          expect(typeBadge).toBeTruthy();
          const expectedLabel = loan.loan_type === 'line_of_credit' ? 'LOC'
            : loan.loan_type === 'mortgage' ? 'Mortgage' : 'Loan';
          expect(typeBadge.textContent.trim()).toBe(expectedLabel);

          // View Details, edit, delete buttons always present
          expect(container.querySelector('.loan-row-view-button')).toBeTruthy();
          expect(container.querySelector('.loan-row-edit-button')).toBeTruthy();
          expect(container.querySelector('.loan-row-delete-button')).toBeTruthy();

          // Log Payment button: present iff payment_tracking_enabled
          const logPaymentBtn = container.querySelector('[data-testid="log-payment-button"]');
          if (loan.payment_tracking_enabled) {
            expect(logPaymentBtn).toBeTruthy();
          } else {
            expect(logPaymentBtn).toBeFalsy();
          }

          // Needs update badge: present iff needsUpdate is true
          const needsUpdateBadge = container.querySelector('[data-testid="needs-update-badge"]');
          if (needsUpdate) {
            expect(needsUpdateBadge).toBeTruthy();
          } else {
            expect(needsUpdateBadge).toBeFalsy();
          }

          // Fixed expense badge: present iff fixedExpenseCount > 0
          const fixedExpenseBadge = container.querySelector('[data-testid="fixed-expense-badge"]');
          if (fixedExpenseCount > 0) {
            expect(fixedExpenseBadge).toBeTruthy();
            expect(fixedExpenseBadge.textContent).toContain(String(fixedExpenseCount));
          } else {
            expect(fixedExpenseBadge).toBeFalsy();
          }

          unmount();
        }
      ),
      { numRuns: 150 }
    );
  });
});
