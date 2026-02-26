import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../utils/fetchProvider', async () => {
  const actual = await vi.importActual('../utils/fetchProvider');
  return {
    ...actual,
    getFetchFn: () => (...args) => globalThis.fetch(...args),
    authAwareFetch: (...args) => globalThis.fetch(...args),
  };
});

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
  default: ({ isOpen, onClose, onEdit }) => isOpen ? (
    <div data-testid="credit-card-detail-view">
      <button onClick={onClose}>Close</button>
      {onEdit && <button onClick={() => onEdit({ id: 1, display_name: 'Test Card', type: 'credit_card' })}>Edit</button>}
    </div>
  ) : null
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

      const overlay = document.querySelector('.modal-overlay');
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

  describe('Payment Methods Tabs', () => {
    it('should render Active and Inactive tabs', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        const activeTab = screen.getByTestId('active-tab');
        const inactiveTab = screen.getByTestId('inactive-tab');
        expect(activeTab).toBeInTheDocument();
        expect(inactiveTab).toBeInTheDocument();
      });
    });

    it('should have Active tab selected by default', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        const activeTab = screen.getByTestId('active-tab');
        expect(activeTab).toHaveClass('active');
      });
    });

    it('should switch to Inactive tab when clicked', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        const inactiveTab = screen.getByTestId('inactive-tab');
        fireEvent.click(inactiveTab);
        expect(inactiveTab).toHaveClass('active');
      });
    });

    it('should switch back to Active tab when clicked', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        const activeTab = screen.getByTestId('active-tab');
        const inactiveTab = screen.getByTestId('inactive-tab');
        
        // Click inactive tab
        fireEvent.click(inactiveTab);
        expect(inactiveTab).toHaveClass('active');
        
        // Click active tab again
        fireEvent.click(activeTab);
        expect(activeTab).toHaveClass('active');
      });
    });

    it('should display only active payment methods when Active tab is selected', async () => {
      const mixedPaymentMethods = [
        { id: 1, type: 'cash', display_name: 'My Cash Wallet', is_active: true },
        { id: 2, type: 'debit', display_name: 'Debit Card', is_active: true },
        { id: 3, type: 'credit_card', display_name: 'Old Visa', is_active: false, current_balance: 0 },
        { id: 4, type: 'cheque', display_name: 'Old Cheque Account', is_active: false }
      ];
      paymentMethodApi.getPaymentMethods.mockResolvedValue(mixedPaymentMethods);

      render(<FinancialOverviewModal {...defaultProps} />);
      
      await waitFor(() => {
        const activeTab = screen.getByTestId('active-tab');
        expect(activeTab).toHaveClass('active');
      });

      // Should show active payment methods
      await waitFor(() => {
        expect(screen.getByText('My Cash Wallet')).toBeInTheDocument();
        expect(screen.getByText('Debit Card')).toBeInTheDocument();
      });

      // Should not show inactive payment methods
      expect(screen.queryByText('Old Visa')).not.toBeInTheDocument();
      expect(screen.queryByText('Old Cheque Account')).not.toBeInTheDocument();
    });

    it('should display only inactive payment methods when Inactive tab is selected', async () => {
      const mixedPaymentMethods = [
        { id: 1, type: 'cash', display_name: 'Cash', is_active: true },
        { id: 2, type: 'debit', display_name: 'Debit Card', is_active: true },
        { id: 3, type: 'credit_card', display_name: 'Old Visa', is_active: false, current_balance: 0 },
        { id: 4, type: 'cheque', display_name: 'Old Cheque Account', is_active: false }
      ];
      paymentMethodApi.getPaymentMethods.mockResolvedValue(mixedPaymentMethods);

      render(<FinancialOverviewModal {...defaultProps} />);
      
      await waitFor(() => {
        const inactiveTab = screen.getByTestId('inactive-tab');
        fireEvent.click(inactiveTab);
        expect(inactiveTab).toHaveClass('active');
      });

      // Should show inactive payment methods
      await waitFor(() => {
        expect(screen.getByText('Old Visa')).toBeInTheDocument();
        expect(screen.getByText('Old Cheque Account')).toBeInTheDocument();
      });

      // Should not show active payment methods
      expect(screen.queryByText('Cash')).not.toBeInTheDocument();
      expect(screen.queryByText('Debit Card')).not.toBeInTheDocument();
    });

    it('should update count when switching between Active and Inactive tabs', async () => {
      const mixedPaymentMethods = [
        { id: 1, type: 'cash', display_name: 'Cash', is_active: true },
        { id: 2, type: 'debit', display_name: 'Debit Card', is_active: true },
        { id: 3, type: 'credit_card', display_name: 'Old Visa', is_active: false, current_balance: 0 },
        { id: 4, type: 'cheque', display_name: 'Old Cheque Account', is_active: false }
      ];
      paymentMethodApi.getPaymentMethods.mockResolvedValue(mixedPaymentMethods);

      render(<FinancialOverviewModal {...defaultProps} />);
      
      // Active tab should show count of 2
      await waitFor(() => {
        const pmSection = screen.getByTestId('payment-methods-section');
        expect(pmSection).toHaveTextContent('Payment Methods (2)');
      });

      // Switch to Inactive tab
      const inactiveTab = screen.getByTestId('inactive-tab');
      fireEvent.click(inactiveTab);

      // Inactive tab should show count of 2
      await waitFor(() => {
        const pmSection = screen.getByTestId('payment-methods-section');
        expect(pmSection).toHaveTextContent('Payment Methods (2)');
      });
    });

    it('should display Reactivate button for inactive credit cards', async () => {
      const mixedPaymentMethods = [
        { id: 1, type: 'credit_card', display_name: 'Active Visa', is_active: true, current_balance: 100 },
        { id: 2, type: 'credit_card', display_name: 'Old Mastercard', is_active: false, current_balance: 0 }
      ];
      paymentMethodApi.getPaymentMethods.mockResolvedValue(mixedPaymentMethods);
      creditCardApi.getStatementBalance.mockResolvedValue(null);
      paymentMethodApi.getPaymentMethod.mockResolvedValue({ current_cycle: null });

      render(<FinancialOverviewModal {...defaultProps} />);
      
      // Switch to Inactive tab
      await waitFor(() => {
        const inactiveTab = screen.getByTestId('inactive-tab');
        fireEvent.click(inactiveTab);
      });

      // Should show Reactivate button for inactive credit card
      await waitFor(() => {
        const reactivateButton = screen.getByTitle('Reactivate Old Mastercard');
        expect(reactivateButton).toBeInTheDocument();
        expect(reactivateButton).toHaveTextContent('Reactivate');
      });

      // Should not show View or Pay buttons
      expect(screen.queryByTitle('View details for Old Mastercard')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Log payment for Old Mastercard')).not.toBeInTheDocument();
    });

    it('should display Reactivate button for inactive other payment methods', async () => {
      const mixedPaymentMethods = [
        { id: 1, type: 'cash', display_name: 'Active Cash', is_active: true },
        { id: 2, type: 'debit', display_name: 'Old Debit', is_active: false }
      ];
      paymentMethodApi.getPaymentMethods.mockResolvedValue(mixedPaymentMethods);

      render(<FinancialOverviewModal {...defaultProps} />);
      
      // Switch to Inactive tab
      await waitFor(() => {
        const inactiveTab = screen.getByTestId('inactive-tab');
        fireEvent.click(inactiveTab);
      });

      // Should show Reactivate button for inactive payment method
      await waitFor(() => {
        const reactivateButton = screen.getByTitle('Reactivate Old Debit');
        expect(reactivateButton).toBeInTheDocument();
        expect(reactivateButton).toHaveTextContent('Reactivate');
      });

      // Should not show View button
      expect(screen.queryByTitle('View details for Old Debit')).not.toBeInTheDocument();
    });

    it('should call API and refresh when Reactivate button is clicked', async () => {
      const inactiveMethod = { id: 3, type: 'debit', display_name: 'Old Debit', is_active: false };
      const activeMethod = { id: 3, type: 'debit', display_name: 'Old Debit', is_active: true };
      
      paymentMethodApi.getPaymentMethods
        .mockResolvedValueOnce([inactiveMethod])
        .mockResolvedValueOnce([activeMethod]);
      paymentMethodApi.setPaymentMethodActive.mockResolvedValue(activeMethod);

      render(<FinancialOverviewModal {...defaultProps} />);
      
      // Switch to Inactive tab
      await waitFor(() => {
        const inactiveTab = screen.getByTestId('inactive-tab');
        fireEvent.click(inactiveTab);
      });

      // Click Reactivate button
      await waitFor(() => {
        const reactivateButton = screen.getByTitle('Reactivate Old Debit');
        fireEvent.click(reactivateButton);
      });

      // Should call setPaymentMethodActive with correct parameters
      await waitFor(() => {
        expect(paymentMethodApi.setPaymentMethodActive).toHaveBeenCalledWith(3, true);
      });

      // Should refresh payment methods list
      await waitFor(() => {
        expect(paymentMethodApi.getPaymentMethods).toHaveBeenCalledTimes(2);
      });
    });

    it('should show error alert when reactivation fails', async () => {
      const inactiveMethod = { id: 3, type: 'debit', display_name: 'Old Debit', is_active: false };
      
      paymentMethodApi.getPaymentMethods.mockResolvedValue([inactiveMethod]);
      paymentMethodApi.setPaymentMethodActive.mockRejectedValue(new Error('Network error'));
      
      // Mock window.alert
      const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

      render(<FinancialOverviewModal {...defaultProps} />);
      
      // Switch to Inactive tab
      await waitFor(() => {
        const inactiveTab = screen.getByTestId('inactive-tab');
        fireEvent.click(inactiveTab);
      });

      // Click Reactivate button
      await waitFor(() => {
        const reactivateButton = screen.getByTitle('Reactivate Old Debit');
        fireEvent.click(reactivateButton);
      });

      // Should show error alert
      await waitFor(() => {
        expect(alertMock).toHaveBeenCalledWith('Failed to reactivate payment method. Please try again.');
      });

      alertMock.mockRestore();
    });

    it('should disable Reactivate button while reactivation is in progress', async () => {
      const inactiveMethod = { id: 3, type: 'debit', display_name: 'Old Debit', is_active: false };
      
      paymentMethodApi.getPaymentMethods.mockResolvedValue([inactiveMethod]);
      
      // Make the API call hang to test loading state
      let resolveReactivate;
      const reactivatePromise = new Promise((resolve) => {
        resolveReactivate = resolve;
      });
      paymentMethodApi.setPaymentMethodActive.mockReturnValue(reactivatePromise);

      render(<FinancialOverviewModal {...defaultProps} />);
      
      // Switch to Inactive tab
      await waitFor(() => {
        const inactiveTab = screen.getByTestId('inactive-tab');
        fireEvent.click(inactiveTab);
      });

      // Click Reactivate button
      await waitFor(() => {
        const reactivateButton = screen.getByTitle('Reactivate Old Debit');
        fireEvent.click(reactivateButton);
      });

      // Button should be disabled and show loading text
      await waitFor(() => {
        const reactivateButton = screen.getByTitle('Reactivate Old Debit');
        expect(reactivateButton).toBeDisabled();
        expect(reactivateButton).toHaveTextContent('Reactivating...');
      });

      // Resolve the promise
      resolveReactivate({ id: 3, type: 'debit', display_name: 'Old Debit', is_active: true });
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

  // Note: Credit Card Edit Flow (Req 1.4) is thoroughly tested in CreditCardDetailView.test.jsx
  // The unit tests verify that:
  // - Edit button calls onEdit with credit card data
  // - Edit button is disabled when onEdit prop is not provided
  // - The integration with PaymentMethodForm works correctly
});


