import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

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

// Mock useTabState to control tab state in tests
vi.mock('../hooks/useTabState', () => ({
  default: vi.fn((key, defaultTab) => {
    const { useState } = require('react');
    const [tab, setTab] = useState(defaultTab);
    return [tab, setTab];
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
  deletePaymentMethod: vi.fn(),
  setPaymentMethodActive: vi.fn()
}));

vi.mock('../utils/validation', () => ({
  validateName: vi.fn(() => null),
  validateAmount: vi.fn(() => null)
}));

vi.mock('../utils/formatters', () => ({
  formatCurrency: (v) => `$${Number(v || 0).toFixed(2)}`,
  formatDate: (d) => d || ''
}));

// Mock child components that render complex sub-views
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

import * as loanApi from '../services/loanApi';
import * as fixedExpenseApi from '../services/fixedExpenseApi';
import * as investmentApi from '../services/investmentApi';
import * as paymentMethodApi from '../services/paymentMethodApi';
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

    it('should render all three tab labels', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByText('🏦 Loans')).toBeInTheDocument();
        expect(screen.getByText('📈 Investments')).toBeInTheDocument();
        expect(screen.getByText('💳 Payment Methods')).toBeInTheDocument();
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
  });

  describe('Tab switching', () => {
    it('should show Loans tab content by default', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByText('+ Add New Loan')).toBeInTheDocument();
      });
    });

    it('should switch to Investments tab and show investments content', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => expect(screen.getByText('📈 Investments')).toBeInTheDocument());

      fireEvent.click(screen.getByText('📈 Investments'));

      await waitFor(() => {
        expect(screen.getByText('+ Add New Investment')).toBeInTheDocument();
      });
    });

    it('should switch to Payment Methods tab and show payment methods content', async () => {
      render(<FinancialOverviewModal {...defaultProps} />);
      await waitFor(() => expect(screen.getByText('💳 Payment Methods')).toBeInTheDocument());

      fireEvent.click(screen.getByText('💳 Payment Methods'));

      await waitFor(() => {
        expect(screen.getByText('+ Add Payment Method')).toBeInTheDocument();
      });
    });
  });

  describe('initialTab prop', () => {
    it('should open to Investments tab when initialTab is "investments"', async () => {
      render(<FinancialOverviewModal {...defaultProps} initialTab="investments" />);
      await waitFor(() => {
        expect(screen.getByText('+ Add New Investment')).toBeInTheDocument();
      });
    });

    it('should open to Payment Methods tab when initialTab is "payment-methods"', async () => {
      render(<FinancialOverviewModal {...defaultProps} initialTab="payment-methods" />);
      await waitFor(() => {
        expect(screen.getByText('+ Add Payment Method')).toBeInTheDocument();
      });
    });

    it('should open to Loans tab when initialTab is "loans"', async () => {
      render(<FinancialOverviewModal {...defaultProps} initialTab="loans" />);
      await waitFor(() => {
        expect(screen.getByText('+ Add New Loan')).toBeInTheDocument();
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
      // Loans tab loads first, investments tab loads when switched
      render(<FinancialOverviewModal {...defaultProps} />);

      // Switch to investments to trigger investment data load
      await waitFor(() => expect(screen.getByText('📈 Investments')).toBeInTheDocument());
      fireEvent.click(screen.getByText('📈 Investments'));

      await waitFor(() => {
        // Net worth values should be displayed
        expect(screen.getByText('Assets')).toBeInTheDocument();
        expect(screen.getByText('Liabilities')).toBeInTheDocument();
      });
    });

    it('should apply positive CSS class when investments exceed debt', async () => {
      // investments = 25000, debt = 10000 → net worth positive
      render(<FinancialOverviewModal {...defaultProps} />);

      // Load both tabs to populate values
      await waitFor(() => expect(screen.getByText('📈 Investments')).toBeInTheDocument());
      fireEvent.click(screen.getByText('📈 Investments'));
      await waitFor(() => expect(screen.getByText('+ Add New Investment')).toBeInTheDocument());

      // Switch back to loans to ensure debt is loaded
      fireEvent.click(screen.getByText('🏦 Loans'));
      await waitFor(() => expect(screen.getByText('+ Add New Loan')).toBeInTheDocument());

      // Net worth element should have positive class
      const netWorthValues = document.querySelectorAll('.financial-net-worth-value');
      const netWorthEl = Array.from(netWorthValues).find(el =>
        el.closest('.financial-net-worth-item.net-worth')
      );
      expect(netWorthEl).toBeTruthy();
      expect(netWorthEl.classList.contains('positive')).toBe(true);
    });

    it('should apply negative CSS class when debt exceeds investments', async () => {
      // Override: debt > investments
      loanApi.getAllLoans.mockResolvedValue([
        { id: 1, name: 'Big Loan', loan_type: 'loan', currentBalance: 50000, currentRate: 5, start_date: '2022-01-01', is_paid_off: false, initial_balance: 60000 }
      ]);
      investmentApi.getAllInvestments.mockResolvedValue([
        { id: 1, name: 'Small TFSA', type: 'TFSA', currentValue: 5000, initial_value: 1000 }
      ]);

      render(<FinancialOverviewModal {...defaultProps} />);

      // Load investments tab
      await waitFor(() => expect(screen.getByText('📈 Investments')).toBeInTheDocument());
      fireEvent.click(screen.getByText('📈 Investments'));
      await waitFor(() => expect(screen.getByText('+ Add New Investment')).toBeInTheDocument());

      // Switch back to loans
      fireEvent.click(screen.getByText('🏦 Loans'));
      await waitFor(() => expect(screen.getByText('+ Add New Loan')).toBeInTheDocument());

      const netWorthValues = document.querySelectorAll('.financial-net-worth-value');
      const netWorthEl = Array.from(netWorthValues).find(el =>
        el.closest('.financial-net-worth-item.net-worth')
      );
      expect(netWorthEl).toBeTruthy();
      expect(netWorthEl.classList.contains('negative')).toBe(true);
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
});
