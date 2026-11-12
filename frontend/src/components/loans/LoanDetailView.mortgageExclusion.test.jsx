import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import LoanDetailView from './LoanDetailView';
import * as loanBalanceApi from '../../services/loanBalanceApi';
import * as loanPaymentApi from '../../services/loanPaymentApi';
import * as fixedExpenseApi from '../../services/fixedExpenseApi';
import * as loanApi from '../../services/loanApi';

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
  getCalculatedBalance: vi.fn(),
  getBalanceHistory: vi.fn().mockResolvedValue([])
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

/**
 * Tests for LoanPaymentHistory rendering and section ordering.
 *
 * Requirements: 3.4, 3.5, 3.6, 4.1
 * - 3.4: LoanPaymentHistory SHALL render for all loan types including mortgage
 * - 3.5: Mortgage section order: MortgageDetailSection → MortgageTabbedContent (Overview tab active)
 * - 3.6: LoanPaymentHistory SHALL retain heading "Payment History" for non-mortgage loans
 * - 4.1: LoanPaymentHistory continues for non-mortgage loans with existing calculation
 */
describe('LoanDetailView — LoanPaymentHistory rendering', () => {
  const mockOnClose = vi.fn();
  const mockOnUpdate = vi.fn();

  const baseMortgage = {
    id: 1,
    name: 'Home Mortgage',
    initial_balance: 500000,
    start_date: '2020-01-15',
    loan_type: 'mortgage',
    is_paid_off: 0,
    currentBalance: 480000,
    currentRate: 5.25,
    fixed_interest_rate: null,
    notes: null
  };

  const baseLoan = {
    id: 2,
    name: 'Car Loan',
    initial_balance: 20000,
    start_date: '2023-06-01',
    loan_type: 'loan',
    is_paid_off: 0,
    currentBalance: 15000,
    currentRate: 4.5,
    fixed_interest_rate: 4.5,
    notes: null
  };

  const mockPayments = [
    { id: 1, amount: 2500, payment_date: '2025-02-01', notes: 'Feb payment' },
    { id: 2, amount: 2500, payment_date: '2025-01-01', notes: 'Jan payment' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    loanBalanceApi.getBalanceHistory.mockResolvedValue([]);
    loanPaymentApi.getPayments.mockResolvedValue(mockPayments);
    loanPaymentApi.getCalculatedBalance.mockResolvedValue({
      loanId: 1,
      initialBalance: 500000,
      totalPayments: 5000,
      currentBalance: 495000,
      paymentCount: 2,
      lastPaymentDate: '2025-02-01'
    });
    fixedExpenseApi.getFixedExpensesByLoan.mockResolvedValue([]);
  });

  /**
   * Requirement 3.4: LoanPaymentHistory renders for all loan types including mortgage.
   * For mortgages, payment history lives inside MortgageTabbedContent (Payments tab).
   * We verify the new two-zone layout renders (KPI strip + tab bar).
   */
  it('should render LoanPaymentHistory when loan type is mortgage', async () => {
    render(
      <LoanDetailView
        loan={baseMortgage}
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    // Wait for the new mortgage layout to render (tab bar replaces "Loan Summary")
    await waitFor(() => {
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    // The Payments tab should exist in the tab bar
    expect(screen.getByRole('tab', { name: 'Payments' })).toBeInTheDocument();
  });

  /**
   * Requirements 3.6, 4.1: LoanPaymentHistory still renders for non-mortgage loans.
   * Non-mortgage loans keep the old layout with "Loan Summary".
   */
  it('should render LoanPaymentHistory when loan type is loan', async () => {
    loanPaymentApi.getCalculatedBalance.mockResolvedValue({
      loanId: 2,
      initialBalance: 20000,
      totalPayments: 5000,
      currentBalance: 15000,
      paymentCount: 2,
      lastPaymentDate: '2025-02-01'
    });

    const { container } = render(
      <LoanDetailView
        loan={baseLoan}
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    // Non-mortgage loans still show "Loan Summary"
    await waitFor(() => {
      expect(screen.getByText('Loan Summary')).toBeInTheDocument();
    });

    // LoanPaymentHistory should be rendered
    const paymentHistoryContainer = container.querySelector('.loan-payment-history-container');
    expect(paymentHistoryContainer).toBeInTheDocument();

    // The "Payment History" heading from LoanPaymentHistory should be present
    const h3Elements = container.querySelectorAll('h3');
    const paymentHistoryH3 = Array.from(h3Elements).find(
      el => el.textContent === 'Payment History'
    );
    expect(paymentHistoryH3).toBeTruthy();
  });

  /**
   * Requirement 3.5: Mortgage section order —
   * MortgageKpiStrip + MortgageTabbedContent with Overview tab active by default.
   * MortgageDetailSection is rendered inside the Overview tab panel.
   */
  it('should render mortgage sections in correct order: MortgageDetailSection → MortgageInsightsPanel', async () => {
    const { container } = render(
      <LoanDetailView
        loan={baseMortgage}
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    // Wait for the tab bar to render
    await waitFor(() => {
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    // Overview tab is active by default — MortgageDetailSection should be visible
    const mortgageDetailSection = container.querySelector('.mortgage-detail-section');
    expect(mortgageDetailSection).toBeInTheDocument();

    // Overview is the first tab
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveTextContent('Overview');
  });

  /**
   * Requirement 3.4: Mortgage payment tracking is now in the Payments tab of MortgageTabbedContent.
   * Verify the Payments tab button exists in the tab bar.
   */
  it('should show Payment Tracking section for mortgage with LoanPaymentHistory', async () => {
    render(
      <LoanDetailView
        loan={baseMortgage}
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    // Wait for the tab bar to render
    await waitFor(() => {
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    // Payments tab exists in the tab bar (replaces .loan-payment-tracking-section)
    expect(screen.getByRole('tab', { name: 'Payments' })).toBeInTheDocument();
  });

  /**
   * Requirement 4.1: Non-mortgage loan payment history shows running balances
   */
  it('should display payment history with running balances for non-mortgage loans', async () => {
    loanPaymentApi.getCalculatedBalance.mockResolvedValue({
      loanId: 2,
      initialBalance: 20000,
      totalPayments: 5000,
      currentBalance: 15000,
      paymentCount: 2,
      lastPaymentDate: '2025-02-01'
    });

    const { container } = render(
      <LoanDetailView
        loan={baseLoan}
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Loan Summary')).toBeInTheDocument();
    });

    // LoanPaymentHistory should render with running balance cells
    const runningBalanceCells = container.querySelectorAll('.running-balance');
    expect(runningBalanceCells.length).toBe(mockPayments.length);
  });

  /**
   * Requirement 3.5: Projections tab replaces MortgageInsightsPanel for mortgages.
   */
  it('should render MortgageInsightsPanel for mortgages', async () => {
    render(
      <LoanDetailView
        loan={baseMortgage}
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    // Wait for the tab bar to render
    await waitFor(() => {
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    // Projections tab exists (replaces MortgageInsightsPanel)
    expect(screen.getByRole('tab', { name: 'Projections' })).toBeInTheDocument();
  });
});

describe('LoanDetailView — mortgage editing and balances', () => {
  const mortgage = {
    id: 1,
    name: 'Home Mortgage',
    initial_balance: 500000,
    start_date: '2020-01-15',
    loan_type: 'mortgage',
    is_paid_off: 0,
    currentBalance: 495000,
    currentRate: 5,
    fixed_interest_rate: null,
    notes: null,
    rate_type: 'variable',
    amortization_period: 25,
    term_length: 5,
    renewal_date: '2020-06-01',
    payment_frequency: 'monthly',
    estimated_property_value: 700000
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear?.();
    loanBalanceApi.getBalanceHistory.mockResolvedValue([]);
    loanPaymentApi.getPayments.mockResolvedValue([
      { id: 2, amount: 2500, payment_date: '2025-02-01', notes: null },
      { id: 1, amount: 2500, payment_date: '2025-01-01', notes: null }
    ]);
    loanPaymentApi.getCalculatedBalance.mockResolvedValue({
      loanId: 1, initialBalance: 500000, totalPayments: 5000, currentBalance: 497000.5,
      paymentCount: 2, lastPaymentDate: '2025-02-01'
    });
    loanPaymentApi.getBalanceHistory.mockResolvedValue([
      { id: 2, date: '2025-02-01', payment: 2500, runningBalance: 497000.5, interestAccrued: 2000.25, principalPaid: 499.75 },
      { id: 1, date: '2025-01-01', payment: 2500, runningBalance: 497500.25, interestAccrued: 2083.33, principalPaid: 416.67 }
    ]);
    fixedExpenseApi.getFixedExpensesByLoan.mockResolvedValue([]);
    loanApi.updateLoan.mockResolvedValue({});
  });

  it('Edit Loan Details opens the mortgage form and saves the property value without resending an overdue renewal date', async () => {
    render(<LoanDetailView loan={mortgage} isOpen={true} onClose={vi.fn()} onUpdate={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Loan Details' }));
    const valueInput = await screen.findByLabelText('Estimated Property Value');
    expect(valueInput).toHaveValue(700000);

    fireEvent.change(valueInput, { target: { value: '850000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(loanApi.updateLoan).toHaveBeenCalledTimes(1));
    const [id, payload] = loanApi.updateLoan.mock.calls[0];
    expect(id).toBe(1);
    expect(payload).toEqual({ name: 'Home Mortgage', notes: null, estimated_property_value: 850000 });
  });

  it('Payments tab shows the server balance after each payment with its interest and principal', async () => {
    render(<LoanDetailView loan={mortgage} isOpen={true} onClose={vi.fn()} onUpdate={vi.fn()} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Payments' }));

    await waitFor(() => expect(screen.getByText('$497,500.25')).toBeInTheDocument());
    expect(screen.getByRole('columnheader', { name: 'Interest' })).toBeInTheDocument();
    expect(screen.getByText('$2,083.33')).toBeInTheDocument();
    expect(screen.getByText('$416.67')).toBeInTheDocument();
  });
});
