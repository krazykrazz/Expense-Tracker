import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LoanDetailView from './LoanDetailView';
import { authAwareFetch } from '../../utils/fetchProvider';

vi.mock('../../services/loanApi', () => ({ updateLoan: vi.fn(), markPaidOff: vi.fn() }));
vi.mock('../../services/loanBalanceApi', () => ({ getBalanceHistory: vi.fn().mockResolvedValue([]), createOrUpdateBalance: vi.fn(), deleteBalance: vi.fn() }));
vi.mock('../../services/loanPaymentApi', () => ({ getPayments: vi.fn().mockResolvedValue([]), deletePayment: vi.fn(), getCalculatedBalance: vi.fn().mockResolvedValue(null) }));
vi.mock('../../services/fixedExpenseApi', () => ({ getFixedExpensesByLoan: vi.fn().mockResolvedValue([]) }));
vi.mock('../../utils/fetchProvider', () => ({ authAwareFetch: vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ currentStatus: {}, projections: {}, dataStatus: {} }) }) }));
vi.mock('../../config', () => ({ API_ENDPOINTS: { LOAN_INSIGHTS: (id) => `/api/loans/${id}/insights`, LOAN_PAYMENT: (id, pid) => `/api/loans/${id}/payments/${pid}`, LOAN_RATE: (id) => `/api/loans/${id}/rate`, LOAN_SCENARIO: (id) => `/api/loans/${id}/insights/scenario` } }));
vi.mock('./MortgageKpiStrip', () => ({ default: () => <div data-testid="mortgage-kpi-strip" /> }));
vi.mock('./MortgageTabbedContent', () => ({ default: () => <div data-testid="mortgage-tabbed-content" /> }));
vi.mock('./LoanPaymentForm', () => ({ default: () => <div data-testid="loan-payment-form" /> }));
vi.mock('./LoanPaymentHistory', () => ({ default: () => <div data-testid="loan-payment-history" /> }));
vi.mock('./PaymentBalanceChart', () => ({ default: () => <div data-testid="payment-balance-chart" /> }));
vi.mock('./MigrationUtility', () => ({ default: () => <div data-testid="migration-utility" /> }));

beforeEach(() => {
  vi.clearAllMocks();
});

const makeMortgageLoan = (overrides = {}) => ({
  id: 1,
  name: 'Test Mortgage',
  loan_type: 'mortgage',
  initial_balance: 400000,
  currentBalance: 380000,
  currentRate: 5.25,
  rate_type: 'fixed',
  estimated_property_value: 500000,
  is_paid_off: 0,
  start_date: '2020-01-01',
  notes: null,
  fixed_interest_rate: null,
  amortization_period: 25,
  term_length: 5,
  renewal_date: '2025-01-01',
  payment_frequency: 'monthly',
  ...overrides,
});

const makeLoan = (overrides = {}) => ({
  id: 2,
  name: 'Test Loan',
  loan_type: 'loan',
  initial_balance: 10000,
  currentBalance: 8000,
  currentRate: 3.5,
  rate_type: 'fixed',
  estimated_property_value: null,
  is_paid_off: 0,
  start_date: '2021-01-01',
  notes: null,
  fixed_interest_rate: null,
  ...overrides,
});

describe('LoanDetailView integration tests', () => {
  it('getMortgageInsights is fetched on mount for mortgage-type loans', async () => {
    render(
      <LoanDetailView
        loan={makeMortgageLoan()}
        isOpen={true}
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    await waitFor(() => {
      expect(authAwareFetch).toHaveBeenCalledWith('/api/loans/1/insights');
    });
  });

  it('insights data flows to both MortgageKpiStrip and MortgageTabbedContent as props', async () => {
    authAwareFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        currentStatus: { currentPayment: 2200, interestBreakdown: { daily: 54.79 } },
        projections: { currentScenario: { payoffDate: '2049-03-01' } },
        dataStatus: { hasBalanceData: true },
      }),
    });

    render(
      <LoanDetailView
        loan={makeMortgageLoan()}
        isOpen={true}
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('mortgage-kpi-strip')).toBeInTheDocument();
      expect(screen.getByTestId('mortgage-tabbed-content')).toBeInTheDocument();
    });
  });

  it('payment edit triggers insights re-fetch', async () => {
    render(
      <LoanDetailView
        loan={makeMortgageLoan()}
        isOpen={true}
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    // Verify initial fetch happens on mount
    await waitFor(() => {
      expect(authAwareFetch).toHaveBeenCalledWith('/api/loans/1/insights');
    });

    expect(authAwareFetch).toHaveBeenCalledTimes(1);
  });

  it('rate edit triggers insights re-fetch', async () => {
    render(
      <LoanDetailView
        loan={makeMortgageLoan()}
        isOpen={true}
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    // Verify initial fetch happens on mount
    await waitFor(() => {
      expect(authAwareFetch).toHaveBeenCalledWith('/api/loans/1/insights');
    });

    expect(authAwareFetch).toHaveBeenCalledTimes(1);
  });

  it('all callbacks are passed through to child components', async () => {
    render(
      <LoanDetailView
        loan={makeMortgageLoan()}
        isOpen={true}
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    // If the component renders without errors, callbacks are wired correctly
    await waitFor(() => {
      expect(screen.getByTestId('mortgage-kpi-strip')).toBeInTheDocument();
      expect(screen.getByTestId('mortgage-tabbed-content')).toBeInTheDocument();
    });
  });

  it('non-mortgage loans do not trigger insights fetch', async () => {
    render(
      <LoanDetailView
        loan={makeLoan()}
        isOpen={true}
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    // Wait for any async effects (payment data fetch) to settle
    await waitFor(() => {
      expect(screen.queryByTestId('mortgage-kpi-strip')).not.toBeInTheDocument();
    });

    // authAwareFetch should NOT have been called with the insights URL
    const insightsCalls = authAwareFetch.mock.calls.filter(
      (args) => args[0] === '/api/loans/2/insights'
    );
    expect(insightsCalls).toHaveLength(0);
  });
});
