import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LoanDetailView from './LoanDetailView';
import * as loanBalanceApi from '../services/loanBalanceApi';
import * as loanPaymentApi from '../services/loanPaymentApi';
import * as fixedExpenseApi from '../services/fixedExpenseApi';

// Mock the APIs
vi.mock('../services/loanApi', () => ({
  updateLoan: vi.fn(),
  markPaidOff: vi.fn()
}));

vi.mock('../services/loanBalanceApi', () => ({
  getBalanceHistory: vi.fn(),
  createOrUpdateBalance: vi.fn(),
  deleteBalance: vi.fn()
}));

vi.mock('../services/loanPaymentApi', () => ({
  getPayments: vi.fn(),
  deletePayment: vi.fn(),
  getCalculatedBalance: vi.fn()
}));

vi.mock('../services/fixedExpenseApi', () => ({
  getFixedExpensesByLoan: vi.fn()
}));

/**
 * Tests for LoanPaymentHistory rendering and section ordering.
 *
 * Requirements: 3.4, 3.5, 3.6, 4.1
 * - 3.4: LoanPaymentHistory SHALL render for all loan types including mortgage
 * - 3.5: Mortgage section order: MortgageDetailSection → MortgageInsightsPanel
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
   * Requirement 3.4: LoanPaymentHistory renders for all loan types including mortgage
   */
  it('should render LoanPaymentHistory when loan type is mortgage', async () => {
    const { container } = render(
      <LoanDetailView
        loan={baseMortgage}
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Loan Summary')).toBeInTheDocument();
    });

    // LoanPaymentHistory renders a container with class "loan-payment-history-container"
    const paymentHistoryContainer = container.querySelector('.loan-payment-history-container');
    expect(paymentHistoryContainer).toBeInTheDocument();
  });

  /**
   * Requirements 3.6, 4.1: LoanPaymentHistory still renders for non-mortgage loans
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
   * MortgageDetailSection → MortgageInsightsPanel
   *
   * We verify the top-level order: MortgageDetailSection appears before MortgageInsightsPanel.
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

    await waitFor(() => {
      expect(screen.getByText('Loan Summary')).toBeInTheDocument();
    });

    // MortgageDetailSection renders with class "mortgage-detail-section"
    const mortgageDetailSection = container.querySelector('.mortgage-detail-section');
    // MortgageInsightsPanel renders with class "mortgage-insights-panel"
    const mortgageInsightsPanel = container.querySelector('.mortgage-insights-panel');

    expect(mortgageDetailSection).toBeInTheDocument();
    expect(mortgageInsightsPanel).toBeInTheDocument();

    // Verify order: MortgageDetailSection comes before MortgageInsightsPanel in the DOM
    const allElements = container.querySelectorAll('.mortgage-detail-section, .mortgage-insights-panel');
    expect(allElements.length).toBeGreaterThanOrEqual(2);
    expect(allElements[0].classList.contains('mortgage-detail-section')).toBe(true);
    expect(allElements[1].classList.contains('mortgage-insights-panel')).toBe(true);
  });

  /**
   * Requirement 3.4: Mortgage should show Payment Tracking section with LoanPaymentHistory
   */
  it('should show Payment Tracking section for mortgage with LoanPaymentHistory', async () => {
    const { container } = render(
      <LoanDetailView
        loan={baseMortgage}
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Loan Summary')).toBeInTheDocument();
    });

    // Payment Tracking section should be visible
    const paymentTrackingSection = container.querySelector('.loan-payment-tracking-section');
    expect(paymentTrackingSection).toBeInTheDocument();

    // LoanPaymentHistory container should be inside it
    const paymentHistoryInTracking = paymentTrackingSection?.querySelector('.loan-payment-history-container');
    expect(paymentHistoryInTracking).toBeInTheDocument();
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
   * Requirement 3.5: MortgageInsightsPanel renders for mortgages
   */
  it('should render MortgageInsightsPanel for mortgages', async () => {
    const { container } = render(
      <LoanDetailView
        loan={baseMortgage}
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Loan Summary')).toBeInTheDocument();
    });

    // MortgageInsightsPanel should contain a section toggle for Payment History
    const insightsPanel = container.querySelector('.mortgage-insights-panel');
    expect(insightsPanel).toBeInTheDocument();
  });
});
