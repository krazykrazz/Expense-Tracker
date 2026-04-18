/**
 * @invariant Mortgage-Only Layout Gate: For any loan object, MortgageKpiStrip and
 * MortgageTabbedContent render if and only if loan_type === 'mortgage'. For all other
 * loan_type values ('loan', 'line_of_credit'), the existing single-column layout renders
 * without any KPI strip or tabbed content.
 *
 * Feature: mortgage-detail-view-redesign, Property 5: Mortgage-Only Layout Gate
 * Validates: Requirements 11.1, 11.2, 11.3, 15.1, 15.2, 15.3, 15.4
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as fc from 'fast-check';
import LoanDetailView from './LoanDetailView';

// Mock all API modules
vi.mock('../../services/loanApi', () => ({ updateLoan: vi.fn(), markPaidOff: vi.fn() }));
vi.mock('../../services/loanBalanceApi', () => ({ getBalanceHistory: vi.fn().mockResolvedValue([]), createOrUpdateBalance: vi.fn(), deleteBalance: vi.fn() }));
vi.mock('../../services/loanPaymentApi', () => ({ getPayments: vi.fn().mockResolvedValue([]), deletePayment: vi.fn(), getCalculatedBalance: vi.fn().mockResolvedValue(null) }));
vi.mock('../../services/fixedExpenseApi', () => ({ getFixedExpensesByLoan: vi.fn().mockResolvedValue([]) }));
vi.mock('../../utils/fetchProvider', () => ({ authAwareFetch: vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) }) }));
vi.mock('../../config', () => ({ API_ENDPOINTS: { LOAN_INSIGHTS: (id) => `/api/loans/${id}/insights`, LOAN_PAYMENT: (id, pid) => `/api/loans/${id}/payments/${pid}`, LOAN_RATE: (id) => `/api/loans/${id}/rate`, LOAN_SCENARIO: (id) => `/api/loans/${id}/insights/scenario` } }));

// Mock child components
vi.mock('./MortgageKpiStrip', () => ({ default: () => <div data-testid="mortgage-kpi-strip" /> }));
vi.mock('./MortgageTabbedContent', () => ({ default: () => <div data-testid="mortgage-tabbed-content" /> }));
vi.mock('./LoanPaymentForm', () => ({ default: () => <div data-testid="loan-payment-form" /> }));
vi.mock('./LoanPaymentHistory', () => ({ default: () => <div data-testid="loan-payment-history" /> }));
vi.mock('./PaymentBalanceChart', () => ({ default: () => <div data-testid="payment-balance-chart" /> }));
vi.mock('./MigrationUtility', () => ({ default: () => <div data-testid="migration-utility" /> }));

/**
 * Build a minimal loan object for the given loan_type.
 */
function makeLoan(loanType) {
  return {
    id: 1,
    name: 'Test Loan',
    loan_type: loanType,
    initial_balance: 100000,
    currentBalance: 90000,
    currentRate: 5.0,
    rate_type: 'fixed',
    estimated_property_value: loanType === 'mortgage' ? 200000 : null,
    is_paid_off: 0,
    start_date: '2020-01-01',
    notes: null,
    fixed_interest_rate: null,
    amortization_period: loanType === 'mortgage' ? 25 : null,
    term_length: loanType === 'mortgage' ? 5 : null,
    renewal_date: loanType === 'mortgage' ? '2025-01-01' : null,
    payment_frequency: loanType === 'mortgage' ? 'monthly' : null,
  };
}

/**
 * **Feature: mortgage-detail-view-redesign, Property 5: Mortgage-Only Layout Gate**
 *
 * For any loan_type from ['mortgage', 'loan', 'line_of_credit']:
 * - When loan_type === 'mortgage': mortgage-kpi-strip and mortgage-tabbed-content are rendered
 * - When loan_type === 'loan' or 'line_of_credit': neither component is rendered
 *
 * **Validates: Requirements 11.1, 11.2, 11.3, 15.1, 15.2, 15.3, 15.4**
 */
describe('Property 5: Mortgage-Only Layout Gate', () => {
  it('renders mortgage layout iff loan_type is mortgage', () => {
    const loanTypeArb = fc.constantFrom('mortgage', 'loan', 'line_of_credit');

    fc.assert(
      fc.property(loanTypeArb, (loanType) => {
        const { unmount } = render(
          <LoanDetailView
            loan={makeLoan(loanType)}
            isOpen={true}
            onClose={() => {}}
            onUpdate={() => {}}
          />
        );

        if (loanType === 'mortgage') {
          // Mortgage layout: both KPI strip and tabbed content must be present
          expect(screen.queryByTestId('mortgage-kpi-strip')).not.toBeNull();
          expect(screen.queryByTestId('mortgage-tabbed-content')).not.toBeNull();
        } else {
          // Non-mortgage layout: neither component should be present
          expect(screen.queryByTestId('mortgage-kpi-strip')).toBeNull();
          expect(screen.queryByTestId('mortgage-tabbed-content')).toBeNull();
        }

        unmount();
      }),
      { numRuns: 100 }
    );
  });
});
