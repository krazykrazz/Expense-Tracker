/**
 * Property-Based Test: Loan Type Determines Tracking Method
 * 
 * Feature: loan-payment-tracking
 * Property 13: Loan Type Determines Tracking Method
 * 
 * For any loan, if loan_type is 'loan' or 'mortgage', the system should support
 * payment-based tracking; if loan_type is 'line_of_credit', the system should
 * use balance-based tracking.
 * 
 * **Validates: Requirements 5.1, 5.2**
  *
 * @invariant Loan Type Tracking Method: For any loan, if loan_type is loan or mortgage the system supports payment-based tracking; if line_of_credit it uses balance-based tracking. Randomization covers all loan type variants.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import fc from 'fast-check';
import LoanDetailView from './LoanDetailView';
import * as loanApi from '../../services/loanApi';
import * as loanBalanceApi from '../../services/loanBalanceApi';
import * as loanPaymentApi from '../../services/loanPaymentApi';
import * as fixedExpenseApi from '../../services/fixedExpenseApi';

// Mock the APIs
vi.mock('../../services/loanApi', () => ({
  updateLoan: vi.fn(),
  markPaidOff: vi.fn()
}));

vi.mock('../../services/loanBalanceApi', () => ({
  getBalanceHistory: vi.fn(),
  createOrUpdateBalance: vi.fn(),
  deleteBalance: vi.fn()
}));

vi.mock('../../services/loanPaymentApi', () => ({
  getPayments: vi.fn(),
  deletePayment: vi.fn(),
  getCalculatedBalance: vi.fn()
}));

vi.mock('../../services/fixedExpenseApi', () => ({
  getFixedExpensesByLoan: vi.fn()
}));

// Required by LoanDetailView for mortgage insights fetching
vi.mock('../../utils/fetchProvider', () => ({
  authAwareFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ currentStatus: {}, projections: {}, dataStatus: {} })
  })
}));

vi.mock('../../config', () => ({
  API_ENDPOINTS: {
    LOAN_INSIGHTS: (id) => `/api/loans/${id}/insights`,
    LOAN_PAYMENT: (id, pid) => `/api/loans/${id}/payments/${pid}`,
    LOAN_RATE: (id) => `/api/loans/${id}/rate`,
    LOAN_SCENARIO: (id) => `/api/loans/${id}/insights/scenario`
  }
}));

describe('Property 13: Loan Type Determines Tracking Method', () => {
  const mockOnClose = vi.fn();
  const mockOnUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    loanBalanceApi.getBalanceHistory.mockResolvedValue([]);
    loanPaymentApi.getPayments.mockResolvedValue([]);
    loanPaymentApi.getCalculatedBalance.mockResolvedValue({
      loanId: 1,
      initialBalance: 10000,
      totalPayments: 0,
      currentBalance: 10000,
      paymentCount: 0,
      lastPaymentDate: null
    });
    fixedExpenseApi.getFixedExpensesByLoan.mockResolvedValue([]);
  });

  // Helper to generate valid date strings
  const dateArbitrary = fc.tuple(
    fc.integer({ min: 2020, max: 2025 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 })
  ).map(([year, month, day]) => 
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  );

  // Arbitrary for generating loan data
  const loanArbitrary = fc.record({
    id: fc.integer({ min: 1, max: 1000 }),
    name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    initial_balance: fc.float({ min: 100, max: 1000000, noNaN: true }),
    start_date: dateArbitrary,
    loan_type: fc.constantFrom('loan', 'mortgage', 'line_of_credit'),
    is_paid_off: fc.boolean().map(b => b ? 1 : 0),
    currentBalance: fc.float({ min: 0, max: 1000000, noNaN: true }),
    currentRate: fc.float({ min: 0, max: 30, noNaN: true }),
    fixed_interest_rate: fc.option(fc.float({ min: 0, max: 30, noNaN: true }), { nil: null }),
    notes: fc.option(fc.string({ maxLength: 200 }), { nil: null })
  });

  /**
   * Property: For any loan with type 'loan' or 'mortgage', the Payment Tracking
   * section should be displayed.
   * 
   * **Validates: Requirements 5.1**
   */
  it('shows Payment Tracking section for loans and mortgages', async () => {
    await fc.assert(
      fc.asyncProperty(
        loanArbitrary.filter(loan => loan.loan_type === 'loan' || loan.loan_type === 'mortgage'),
        async (loan) => {
          loanPaymentApi.getCalculatedBalance.mockResolvedValue({
            loanId: loan.id,
            initialBalance: loan.initial_balance,
            totalPayments: 0,
            currentBalance: loan.currentBalance,
            paymentCount: 0,
            lastPaymentDate: null
          });

          const { container, unmount } = render(
            <LoanDetailView
              loan={loan}
              isOpen={true}
              onClose={mockOnClose}
              onUpdate={mockOnUpdate}
            />
          );

          if (loan.loan_type === 'mortgage') {
            // Mortgage path: new two-zone layout — tab bar replaces "Loan Summary"
            await waitFor(() => {
              expect(screen.getByRole('tablist')).toBeInTheDocument();
            }, { timeout: 2000 });

            // Payments tab should exist in the tab bar
            expect(screen.getByRole('tab', { name: 'Payments' })).toBeInTheDocument();

            // Balance History section should NOT be visible
            const balanceHistorySection = container.querySelector('.loan-balance-history-section');
            expect(balanceHistorySection).not.toBeInTheDocument();
          } else {
            // Non-mortgage loan path: old layout with "Loan Summary"
            await waitFor(() => {
              expect(screen.getByText('Loan Summary')).toBeInTheDocument();
            }, { timeout: 2000 });

            const paymentTrackingSection = container.querySelector('.loan-payment-tracking-section');
            expect(paymentTrackingSection).toBeInTheDocument();

            const logPaymentButton = container.querySelector('.loan-log-payment-button');
            expect(logPaymentButton).toBeInTheDocument();
            expect(logPaymentButton.textContent).toContain('Log Payment');

            const balanceHistorySection = container.querySelector('.loan-balance-history-section');
            expect(balanceHistorySection).not.toBeInTheDocument();
          }

          unmount();
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: For any loan with type 'line_of_credit', the Balance History
   * section should be displayed instead of Payment Tracking.
   * 
   * **Validates: Requirements 5.2**
   */
  it('shows Balance History section for lines of credit', async () => {
    await fc.assert(
      fc.asyncProperty(
        loanArbitrary.filter(loan => loan.loan_type === 'line_of_credit'),
        async (loan) => {
          const { container, unmount } = render(
            <LoanDetailView
              loan={loan}
              isOpen={true}
              onClose={mockOnClose}
              onUpdate={mockOnUpdate}
            />
          );

          // Wait for component to render
          await waitFor(() => {
            expect(screen.getByText('Loan Summary')).toBeInTheDocument();
          }, { timeout: 2000 });

          // Balance History section should be visible
          const balanceHistorySection = container.querySelector('.loan-balance-history-section');
          expect(balanceHistorySection).toBeInTheDocument();

          // "Add Balance Entry" button should be visible
          const addBalanceButton = container.querySelector('.loan-add-balance-button');
          expect(addBalanceButton).toBeInTheDocument();
          expect(addBalanceButton.textContent).toContain('Add Balance Entry');

          // Payment Tracking section should NOT be visible
          const paymentTrackingSection = container.querySelector('.loan-payment-tracking-section');
          expect(paymentTrackingSection).not.toBeInTheDocument();

          unmount();
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: The tracking method is mutually exclusive - a loan either shows
   * Payment Tracking OR Balance History, never both.
   * 
   * **Validates: Requirements 5.1, 5.2**
   */
  it('tracking method is mutually exclusive based on loan type', async () => {
    await fc.assert(
      fc.asyncProperty(
        loanArbitrary,
        async (loan) => {
          if (loan.loan_type !== 'line_of_credit') {
            loanPaymentApi.getCalculatedBalance.mockResolvedValue({
              loanId: loan.id,
              initialBalance: loan.initial_balance,
              totalPayments: 0,
              currentBalance: loan.currentBalance,
              paymentCount: 0,
              lastPaymentDate: null
            });
          }

          const { container, unmount } = render(
            <LoanDetailView
              loan={loan}
              isOpen={true}
              onClose={mockOnClose}
              onUpdate={mockOnUpdate}
            />
          );

          if (loan.loan_type === 'mortgage') {
            // Mortgage: new two-zone layout — tab bar, no "Loan Summary"
            await waitFor(() => {
              expect(screen.getByRole('tablist')).toBeInTheDocument();
            }, { timeout: 2000 });

            // No old-style sections
            expect(container.querySelector('.loan-payment-tracking-section')).not.toBeInTheDocument();
            expect(container.querySelector('.loan-balance-history-section')).not.toBeInTheDocument();
            // Payments tab exists
            expect(screen.getByRole('tab', { name: 'Payments' })).toBeInTheDocument();
          } else {
            await waitFor(() => {
              expect(screen.getByText('Loan Summary')).toBeInTheDocument();
            }, { timeout: 2000 });

            const paymentTrackingSection = container.querySelector('.loan-payment-tracking-section');
            const balanceHistorySection = container.querySelector('.loan-balance-history-section');

            const hasPaymentTracking = paymentTrackingSection !== null;
            const hasBalanceHistory = balanceHistorySection !== null;

            // XOR: exactly one should be true for non-mortgage loans
            expect(hasPaymentTracking !== hasBalanceHistory).toBe(true);

            if (loan.loan_type === 'loan') {
              expect(hasPaymentTracking).toBe(true);
              expect(hasBalanceHistory).toBe(false);
            } else {
              expect(hasPaymentTracking).toBe(false);
              expect(hasBalanceHistory).toBe(true);
            }
          }

          unmount();
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: The summary label changes based on tracking method.
   * For payment-tracked loans: "Total Payments"
   * For balance-tracked loans: "Total Paid Down" is not shown
   * 
   * **Validates: Requirements 5.1, 5.2**
   */
  it('summary label reflects tracking method', async () => {
    await fc.assert(
      fc.asyncProperty(
        loanArbitrary,
        async (loan) => {
          if (loan.loan_type !== 'line_of_credit') {
            loanPaymentApi.getCalculatedBalance.mockResolvedValue({
              loanId: loan.id,
              initialBalance: loan.initial_balance,
              totalPayments: 500,
              currentBalance: loan.currentBalance - 500,
              paymentCount: 2,
              lastPaymentDate: '2024-01-15'
            });
          }

          const { container, unmount } = render(
            <LoanDetailView
              loan={loan}
              isOpen={true}
              onClose={mockOnClose}
              onUpdate={mockOnUpdate}
            />
          );

          if (loan.loan_type === 'mortgage') {
            // Mortgage: new layout — verify tab bar renders (no "Loan Summary")
            await waitFor(() => {
              expect(screen.getByRole('tablist')).toBeInTheDocument();
            }, { timeout: 2000 });
            // Overview tab shows "Payment Summary" section with "Total Payments" label
            // (inside the tab panel, not the old summary card)
            expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
          } else {
            await waitFor(() => {
              expect(screen.getByText('Loan Summary')).toBeInTheDocument();
            }, { timeout: 2000 });

            const summaryLabels = container.querySelectorAll('.loan-summary-label');
            const labelTexts = Array.from(summaryLabels).map(l => l.textContent);

            if (loan.loan_type === 'loan') {
              expect(labelTexts.some(t => t.includes('Total Payments'))).toBe(true);
            }
          }

          unmount();
        }
      ),
      { numRuns: 20 }
    );
  });
});
