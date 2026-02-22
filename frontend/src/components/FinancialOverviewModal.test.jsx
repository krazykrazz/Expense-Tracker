import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    REMINDER_STATUS: (year, month) => `/api/reminders/status/${year}/${month}`,
  },
  default: 'http://localhost:2424'
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()
  })
}));

// Mock APIs
vi.mock('../services/loanApi', () => ({
  getAllLoans: vi.fn(),
  createLoan: vi.fn(),
  updateLoan: vi.fn(),
  deleteLoan: vi.fn()
}));

vi.mock('../services/fixedExpenseApi', () => ({
  getFixedExpensesByLoan: vi.fn()
}));

vi.mock('../services/investmentApi', () => ({
  getAllInvestments: vi.fn(),
  createInvestment: vi.fn(),
  updateInvestment: vi.fn(),
  deleteInvestment: vi.fn()
}));

vi.mock('../services/paymentMethodApi', () => ({
  getPaymentMethods: vi.fn(),
  getPaymentMethod: vi.fn(),
  deletePaymentMethod: vi.fn(),
  setPaymentMethodActive: vi.fn()
}));

vi.mock('../services/creditCardApi', () => ({
  getStatementBalance: vi.fn()
}));

vi.mock('../utils/validation', () => ({
  validateName: vi.fn(() => null),
  validateAmount: vi.fn(() => null)
}));

vi.mock('../utils/formatters', () => ({
  formatCurrency: (v) => `$${Number(v || 0).toFixed(2)}`,
  formatDate: (d) => d || '',
  formatCAD: (v) => `$${Number(v || 0).toFixed(2)}`
}));

// Mock child components
vi.mock('./LoanDetailView', () => ({
  default: ({ isOpen, onClose }) => isOpen ? <div data-testid="loan-detail-view"><button onClick={onClose}>Close</button></div> : null
}));

vi.mock('./TotalDebtView', () => ({
  default: ({ isOpen, onClose }) => isOpen ? <div data-testid="total-debt-view"><button onClick={onClose}>Close</button></div> : null
}));

vi.mock('./InvestmentDetailView', () => ({
  default: ({ isOpen, onClose }) => isOpen ? <div data-testid="investment-detail-view"><button onClick={onClose}>Close</button></div> : null
}));

vi.mock('./PaymentMethodForm', () => ({
  default: ({ isOpen, onSave, onCancel }) => isOpen ? (
    <div data-testid="payment-method-form">
      <button onClick={onSave}>Save</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ) : null
}));

vi.mock('./CreditCardDetailView', () => ({
  default: ({ isOpen, onClose }) => isOpen ? <div data-testid="credit-card-detail-view"><button onClick={onClose}>Close</button></div> : null
}));

vi.mock('./CreditCardPaymentForm', () => ({
  default: ({ onPaymentRecorded, onCancel }) => (
    <div data-testid="credit-card-payment-form">
      <button onClick={onPaymentRecorded}>Record Payment</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  )
}));

vi.mock('./LoanPaymentForm', () => ({
  default: ({ onPaymentRecorded, onCancel }) => (
    <div data-testid="loan-payment-form">
      <button onClick={onPaymentRecorded}>Record Payment</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  )
}));

// Row components are real — they render simple markup
// No need to mock them since they're lightweight

import * as loanApi from '../services/loanApi';
import * as fixedExpenseApi from '../services/fixedExpenseApi';
import * as investmentApi from '../services/investmentApi';
import * as paymentMethodApi from '../services/paymentMethodApi';
import * as creditCardApi from '../services/creditCardApi';
import FinancialOverviewModal from './FinancialOverviewModal';

const mockLoans = [
  { id: 1, name: 'Car Loan', loan_type: 'loan', currentBalance: 10000, currentRate: 5, start_date: '2022-01-01', is_paid_off: false, initial_balance: 15000 }
];
const mockInvestments = [
  { id: 1, name: 'My TFSA', type: 'TFSA', currentValue: 25000, initial_value: 10000 }
];
const mockPaymentMethods = [
  { id: 1, type: 'cash', display_name: 'Cash', is_active: true, expense_count: 2, total_expense_count: 5 }
];

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  year: 2026,
  month: 2,
  onUpdate: vi.fn(),
  onPaymentMethodsUpdate: vi.fn(),
  initialTab: null
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();

  loanApi.getAllLoans.mockResolvedValue(mockLoans);
  fixedExpenseApi.getFixedExpensesByLoan.mockResolvedValue([]);
  investmentApi.getAllInvestments.mockResolvedValue(mockInvestments);
  paymentMethodApi.getPaymentMethods.mockResolvedValue(mockPaymentMethods);
  paymentMethodApi.getPaymentMethod.mockResolvedValue({ current_cycle: null });
  creditCardApi.getStatementBalance.mockResolvedValue(null);

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ loans: [], investments: [] })
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FinancialOverviewModal', () => {
  describe('Rendering', () => {
    it('should not render when isOpen is false', () => {
      render(<FinancialOverviewModal {...defaultProps} isOpen={false} />);
      expect(screen.queryByText('💼 Financial Overview')).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByText('💼 Financial Overview')).toBeInTheDocument();
      });
    });

    it('should render all three section headers in unified view', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByTestId('payment-methods-section')).toBeInTheDocument();
        expect(screen.getByTestId('loans-section')).toBeInTheDocument();
        expect(screen.getByTestId('investments-section')).toBeInTheDocument();
      });
    });

    it('should render the net worth summary header', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByText('Assets')).toBeInTheDocument();
        expect(screen.getByText('Liabilities')).toBeInTheDocument();
        expect(screen.getByText('Net Worth')).toBeInTheDocument();
      });
    });

    it('should render all sections without requiring tab clicks', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      // All sections visible at once — no tab switching needed
      await waitFor(() => {
        expect(screen.getByText('Car Loan')).toBeInTheDocument();
        expect(screen.getByText('My TFSA')).toBeInTheDocument();
      });
    });
  });

  describe('onClose callback', () => {
    it('should call onClose when close button is clicked', async () => {
      const onClose = vi.fn();
      render(<FinancialOverviewModal {...defaultProps} onClose={onClose} />);
      await waitFor(() => expect(screen.getByLabelText('Close')).toBeInTheDocument());

      fireEvent.click(screen.getByLabelText('Close'));
      expect(onClose).toHaveBeenCalled();
    });

    it('should call onClose when overlay is clicked', async () => {
      const onClose = vi.fn();
      render(<FinancialOverviewModal {...defaultProps} onClose={onClose} />);
      await waitFor(() => expect(screen.getByText('💼 Financial Overview')).toBeInTheDocument());

      const overlay = document.querySelector('.financial-modal-overlay');
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalled();
    });

    it('should call onUpdate when closing', async () => {
      const onUpdate = vi.fn();
      render(<FinancialOverviewModal {...defaultProps} onUpdate={onUpdate} />);
      await waitFor(() => expect(screen.getByLabelText('Close')).toBeInTheDocument());

      fireEvent.click(screen.getByLabelText('Close'));
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  describe('Net worth header', () => {
    it('should display net worth values from loans and investments data', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByText('Assets')).toBeInTheDocument();
        expect(screen.getByText('Liabilities')).toBeInTheDocument();
      });
    });

    it('should apply positive CSS class when investments exceed debt', async () => {
      render(<FinancialOverviewModal {...defaultProps} _testNetWorth={{ totalInvestments: 25000, totalDebt: 10000 }} />);
      await waitFor(() => {
        const netWorthEl = screen.getByTestId('net-worth-value');
        expect(netWorthEl.classList.contains('positive')).toBe(true);
      });
    });

    it('should apply negative CSS class when debt exceeds investments', async () => {
      render(<FinancialOverviewModal {...defaultProps} _testNetWorth={{ totalInvestments: 5000, totalDebt: 50000 }} />);
      await waitFor(() => {
        const netWorthEl = screen.getByTestId('net-worth-value');
        expect(netWorthEl.classList.contains('negative')).toBe(true);
      });
    });
  });

  describe('Reminder status fetch', () => {
    it('should fetch reminder status on open', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/reminders/status/2026/2');
      });
    });
  });

  describe('Section headers', () => {
    it('should show loan count in section header', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        const loansSection = screen.getByTestId('loans-section');
        expect(loansSection).toHaveTextContent('Loans (1)');
      });
    });

    it('should show investment count in section header', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        const investmentsSection = screen.getByTestId('investments-section');
        expect(investmentsSection).toHaveTextContent('Investments (1)');
      });
    });

    it('should show payment methods count in section header', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        const pmSection = screen.getByTestId('payment-methods-section');
        expect(pmSection).toHaveTextContent('Payment Methods (1)');
      });
    });
  });

  describe('Add buttons', () => {
    it('should show Add button in loans section header', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        const loansSection = screen.getByTestId('loans-section');
        const addBtn = loansSection.querySelector('.financial-section-add-button');
        expect(addBtn).toBeInTheDocument();
      });
    });

    it('should show Add button in investments section header', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        const investmentsSection = screen.getByTestId('investments-section');
        const addBtn = investmentsSection.querySelector('.financial-section-add-button');
        expect(addBtn).toBeInTheDocument();
      });
    });

    it('should show View Total Debt Trend button in loans section', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByText('📊 View Total Debt Trend')).toBeInTheDocument();
      });
    });
  });

  describe('Active/Paid-off loans toggle', () => {
    it('should show active and paid-off loan tabs within loans section', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByText(/Active Loans/)).toBeInTheDocument();
        expect(screen.getByText(/Paid Off/)).toBeInTheDocument();
      });
    });
  });

  describe('Independent loading states (Req 3.6)', () => {
    it('should show loading indicator per section while data is being fetched', async () => {
      // Make loans slow, investments fast
      loanApi.getAllLoans.mockImplementation(() => new Promise(() => {})); // never resolves
      investmentApi.getAllInvestments.mockResolvedValue(mockInvestments);
      paymentMethodApi.getPaymentMethods.mockResolvedValue(mockPaymentMethods);

      render(<FinancialOverviewModal {...defaultProps} />);

      // Loans section should show loading
      await waitFor(() => {
        const loansSection = screen.getByTestId('loans-section');
        expect(loansSection).toHaveTextContent('Loading loans...');
      });

      // Investments section should have loaded and show data
      await waitFor(() => {
        expect(screen.getByText('My TFSA')).toBeInTheDocument();
      });
    });
  });

  describe('Empty states', () => {
    it('should show empty state for payment methods when none exist', async () => {
      paymentMethodApi.getPaymentMethods.mockResolvedValue([]);

      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        const pmSection = screen.getByTestId('payment-methods-section');
        expect(pmSection).toHaveTextContent(/No payment methods/i);
      });
    });

    it('should show empty state for investments when none exist', async () => {
      investmentApi.getAllInvestments.mockResolvedValue([]);

      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        const investmentsSection = screen.getByTestId('investments-section');
        expect(investmentsSection).toHaveTextContent(/No investments yet/i);
      });
    });

    it('should show empty state for active loans when none are active', async () => {
      loanApi.getAllLoans.mockResolvedValue([
        { ...mockLoans[0], is_paid_off: true }
      ]);

      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByText(/No active loans/i)).toBeInTheDocument();
      });
    });
  });

  describe('Add buttons open correct forms (Req 10.2, 10.3, 10.4)', () => {
    it('should open loan creation form when Add button in loans section is clicked', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByTestId('loans-section')).toBeInTheDocument();
      });

      const loansSection = screen.getByTestId('loans-section');
      const addBtn = loansSection.querySelector('.financial-section-add-button');
      fireEvent.click(addBtn);

      await waitFor(() => {
        expect(screen.getByText('Add New Loan')).toBeInTheDocument();
        expect(screen.getByText('Loan Name *')).toBeInTheDocument();
      });
    });

    it('should open investment creation form when Add button in investments section is clicked', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByTestId('investments-section')).toBeInTheDocument();
      });

      const investmentsSection = screen.getByTestId('investments-section');
      const addBtn = investmentsSection.querySelector('.financial-section-add-button');
      fireEvent.click(addBtn);

      await waitFor(() => {
        expect(screen.getByText('Add New Investment')).toBeInTheDocument();
        expect(screen.getByText('Investment Name *')).toBeInTheDocument();
      });
    });

    it('should open PaymentMethodForm when Add button in payment methods section is clicked', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByTestId('payment-methods-section')).toBeInTheDocument();
      });

      const pmSection = screen.getByTestId('payment-methods-section');
      const addBtn = pmSection.querySelector('.financial-section-add-button');
      fireEvent.click(addBtn);

      await waitFor(() => {
        expect(screen.getByTestId('payment-method-form')).toBeInTheDocument();
      });
    });
  });

  describe('Total Debt Trend (Req 10.5)', () => {
    it('should open TotalDebtView when View Total Debt Trend button is clicked', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByText('📊 View Total Debt Trend')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('📊 View Total Debt Trend'));

      await waitFor(() => {
        expect(screen.getByTestId('total-debt-view')).toBeInTheDocument();
      });
    });
  });

  describe('Standalone CreditCardDetailView close (Req 8.3)', () => {
    it('should close CreditCardDetailView and return to unified view when close is clicked', async () => {
      const mockCreditCards = [
        {
          id: 10, type: 'credit_card', display_name: 'Visa', is_active: true,
          current_balance: 500, credit_limit: 5000, utilization_percentage: 10,
          days_until_due: 15, expense_count: 3, total_expense_count: 10
        }
      ];
      paymentMethodApi.getPaymentMethods.mockResolvedValue(mockCreditCards);
      paymentMethodApi.getPaymentMethod.mockResolvedValue({ current_cycle: null });
      creditCardApi.getStatementBalance.mockResolvedValue(null);

      render(<FinancialOverviewModal {...defaultProps} />);

      // Wait for credit card row to appear and click View Details
      await waitFor(() => {
        expect(screen.getByText('Visa')).toBeInTheDocument();
      });

      const viewDetailsBtn = screen.getByTitle('View details for Visa');
      fireEvent.click(viewDetailsBtn);

      // CreditCardDetailView should be open
      await waitFor(() => {
        expect(screen.getByTestId('credit-card-detail-view')).toBeInTheDocument();
      });

      // Close it
      fireEvent.click(screen.getByText('Close'));

      // Should return to unified view — CreditCardDetailView gone, sections still visible
      await waitFor(() => {
        expect(screen.queryByTestId('credit-card-detail-view')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('loans-section')).toBeInTheDocument();
      expect(screen.getByTestId('investments-section')).toBeInTheDocument();
    });
  });

  describe('Unified view replaces tabs (Req 3.2)', () => {
    it('should not render any tab navigation buttons for switching between sections', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByTestId('payment-methods-section')).toBeInTheDocument();
      });

      // There should be no top-level tab buttons like "Loans", "Investments", "Payment Methods"
      // that switch between sections (the loans active/paid-off toggle is fine — it's within a section)
      const container = document.querySelector('.financial-unified-content');
      expect(container).toBeInTheDocument();

      // All three sections should be visible simultaneously
      expect(screen.getByTestId('payment-methods-section')).toBeVisible();
      expect(screen.getByTestId('loans-section')).toBeVisible();
      expect(screen.getByTestId('investments-section')).toBeVisible();
    });
  });
});
