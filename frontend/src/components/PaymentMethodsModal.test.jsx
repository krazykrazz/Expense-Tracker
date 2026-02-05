import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    PAYMENT_METHODS: '/api/payment-methods'
  },
  default: 'http://localhost:2424'
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

// Mock payment method API
import * as paymentMethodApi from '../services/paymentMethodApi';
vi.mock('../services/paymentMethodApi', () => ({
  getPaymentMethods: vi.fn(),
  deletePaymentMethod: vi.fn(),
  setPaymentMethodActive: vi.fn()
}));

// Mock child components
vi.mock('./PaymentMethodForm', () => ({
  default: ({ isOpen, onSave, onCancel }) => 
    isOpen ? (
      <div data-testid="payment-method-form">
        <button onClick={onSave}>Save</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null
}));

vi.mock('./CreditCardDetailView', () => ({
  default: ({ isOpen, onClose, paymentMethodId }) => 
    isOpen ? (
      <div data-testid="credit-card-detail-view">
        Credit Card Detail: {paymentMethodId}
        <button onClick={onClose}>Close Detail</button>
      </div>
    ) : null
}));

import PaymentMethodsModal from './PaymentMethodsModal';

describe('PaymentMethodsModal', () => {
  const mockOnClose = vi.fn();
  const mockOnUpdate = vi.fn();

  const mockPaymentMethods = [
    {
      id: 1,
      type: 'cash',
      display_name: 'Cash',
      full_name: 'Cash',
      is_active: true,
      expense_count: 5,
      total_expense_count: 10
    },
    {
      id: 2,
      type: 'debit',
      display_name: 'Debit Card',
      full_name: 'Bank Debit Card',
      is_active: true,
      expense_count: 15,
      total_expense_count: 50
    },
    {
      id: 3,
      type: 'credit_card',
      display_name: 'Visa',
      full_name: 'Visa Credit Card',
      is_active: true,
      expense_count: 20,
      total_expense_count: 100,
      current_balance: 1500,
      credit_limit: 5000,
      utilization_percentage: 30,
      days_until_due: 15
    },
    {
      id: 4,
      type: 'cheque',
      display_name: 'Cheque',
      full_name: 'Personal Cheque',
      is_active: false,
      expense_count: 0,
      total_expense_count: 5
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    paymentMethodApi.getPaymentMethods.mockResolvedValue(mockPaymentMethods);
    paymentMethodApi.deletePaymentMethod.mockResolvedValue({});
    paymentMethodApi.setPaymentMethodActive.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Modal rendering', () => {
    it('should not render when isOpen is false', () => {
      render(
        <PaymentMethodsModal 
          isOpen={false} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      expect(screen.queryByText('Payment Methods')).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Payment Methods')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', async () => {
      paymentMethodApi.getPaymentMethods.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([]), 100))
      );

      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      expect(screen.getByText('Loading payment methods...')).toBeInTheDocument();
    });

    it('should close modal when close button is clicked', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Payment Methods')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('✕'));
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should close modal when clicking overlay', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Payment Methods')).toBeInTheDocument();
      });

      // Click on the overlay (the outer div)
      const overlay = document.querySelector('.payment-methods-modal-overlay');
      fireEvent.click(overlay);
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Payment methods loading', () => {
    it('should fetch payment methods when modal opens', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(paymentMethodApi.getPaymentMethods).toHaveBeenCalled();
      });
    });

    it('should display payment methods grouped by type', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        // Use getAllByText since there are group titles and method names with same text
        expect(screen.getAllByText('Cash').length).toBeGreaterThan(0);
        expect(screen.getByText('Debit')).toBeInTheDocument();
        expect(screen.getByText('Credit Cards')).toBeInTheDocument();
      });
    });

    it('should show error message when fetch fails', async () => {
      paymentMethodApi.getPaymentMethods.mockRejectedValue(new Error('Network error'));

      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should show retry button when fetch fails with no data', async () => {
      paymentMethodApi.getPaymentMethods.mockRejectedValue(new Error('Network error'));

      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });
  });

  describe('Active/Inactive tabs', () => {
    it('should show active tab by default', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        const activeTab = screen.getByText(/Active \(3\)/);
        expect(activeTab).toHaveClass('active');
      });
    });

    it('should filter active payment methods correctly', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        // Active methods should be visible - use getAllByText since there are group titles too
        expect(screen.getAllByText('Cash').length).toBeGreaterThan(0);
        expect(screen.getByText('Debit Card')).toBeInTheDocument();
        expect(screen.getByText('Visa')).toBeInTheDocument();
      });
    });

    it('should switch to inactive tab when clicked', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Inactive \(1\)/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Inactive \(1\)/));

      await waitFor(() => {
        const inactiveTab = screen.getByText(/Inactive \(1\)/);
        expect(inactiveTab).toHaveClass('active');
      });
    });

    it('should show inactive payment methods when inactive tab is selected', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Inactive \(1\)/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Inactive \(1\)/));

      await waitFor(() => {
        // The inactive cheque should be visible - use getAllByText since there's group title too
        expect(screen.getAllByText('Cheque').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Add payment method', () => {
    it('should show add button', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('+ Add Payment Method')).toBeInTheDocument();
      });
    });

    it('should open form when add button is clicked', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('+ Add Payment Method')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('+ Add Payment Method'));

      await waitFor(() => {
        expect(screen.getByTestId('payment-method-form')).toBeInTheDocument();
      });
    });
  });

  describe('Edit payment method', () => {
    it('should show edit button for each payment method', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        const editButtons = screen.getAllByTitle('Edit');
        expect(editButtons.length).toBeGreaterThan(0);
      });
    });

    it('should open form when edit button is clicked', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getAllByTitle('Edit').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTitle('Edit')[0]);

      await waitFor(() => {
        expect(screen.getByTestId('payment-method-form')).toBeInTheDocument();
      });
    });
  });

  describe('Delete payment method', () => {
    it('should show delete button only for methods with no expenses', async () => {
      // Add a method with 0 total expenses
      const methodsWithDeletable = [
        ...mockPaymentMethods,
        {
          id: 5,
          type: 'cash',
          display_name: 'New Cash',
          is_active: true,
          expense_count: 0,
          total_expense_count: 0
        }
      ];
      paymentMethodApi.getPaymentMethods.mockResolvedValue(methodsWithDeletable);

      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('New Cash')).toBeInTheDocument();
      });

      // Should have at least one delete button
      const deleteButtons = screen.getAllByTitle('Delete');
      expect(deleteButtons.length).toBeGreaterThan(0);
    });

    it('should show confirmation dialog when delete is clicked', async () => {
      const methodsWithDeletable = [
        {
          id: 5,
          type: 'cash',
          display_name: 'Deletable Cash',
          is_active: true,
          expense_count: 0,
          total_expense_count: 0
        }
      ];
      paymentMethodApi.getPaymentMethods.mockResolvedValue(methodsWithDeletable);

      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Deletable Cash')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Delete'));

      await waitFor(() => {
        expect(screen.getByText('Delete Payment Method')).toBeInTheDocument();
        expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
      });
    });

    it('should delete payment method when confirmed', async () => {
      const methodsWithDeletable = [
        {
          id: 5,
          type: 'cash',
          display_name: 'Deletable Cash',
          is_active: true,
          expense_count: 0,
          total_expense_count: 0
        }
      ];
      paymentMethodApi.getPaymentMethods.mockResolvedValue(methodsWithDeletable);

      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Deletable Cash')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Delete'));

      await waitFor(() => {
        expect(screen.getByText('Delete Payment Method')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Delete'));

      await waitFor(() => {
        expect(paymentMethodApi.deletePaymentMethod).toHaveBeenCalledWith(5);
      });
    });

    it('should cancel delete when cancel is clicked', async () => {
      const methodsWithDeletable = [
        {
          id: 5,
          type: 'cash',
          display_name: 'Deletable Cash',
          is_active: true,
          expense_count: 0,
          total_expense_count: 0
        }
      ];
      paymentMethodApi.getPaymentMethods.mockResolvedValue(methodsWithDeletable);

      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Deletable Cash')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Delete'));

      await waitFor(() => {
        expect(screen.getByText('Delete Payment Method')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.queryByText('Delete Payment Method')).not.toBeInTheDocument();
      });
    });
  });

  describe('Deactivate payment method', () => {
    it('should show deactivate button for active methods', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        const deactivateButtons = screen.getAllByText('Deactivate');
        expect(deactivateButtons.length).toBeGreaterThan(0);
      });
    });

    it('should show confirmation dialog when deactivate is clicked', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getAllByText('Deactivate').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByText('Deactivate')[0]);

      await waitFor(() => {
        expect(screen.getByText('Deactivate Payment Method')).toBeInTheDocument();
      });
    });

    it('should deactivate payment method when confirmed', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getAllByText('Deactivate').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByText('Deactivate')[0]);

      await waitFor(() => {
        expect(screen.getByText('Deactivate Payment Method')).toBeInTheDocument();
      });

      // Click the confirm deactivate button in the dialog
      const confirmButton = screen.getAllByText('Deactivate').find(
        btn => btn.closest('.payment-methods-confirm-dialog')
      );
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(paymentMethodApi.setPaymentMethodActive).toHaveBeenCalled();
      });
    });

    it('should prevent deactivating the last active payment method', async () => {
      // Only one active payment method
      const singleActiveMethod = [
        {
          id: 1,
          type: 'cash',
          display_name: 'Cash',
          is_active: true,
          expense_count: 5,
          total_expense_count: 10
        }
      ];
      paymentMethodApi.getPaymentMethods.mockResolvedValue(singleActiveMethod);

      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        // Use getAllByText since there's both group title and method name
        expect(screen.getAllByText('Cash').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getByText('Deactivate'));

      await waitFor(() => {
        expect(screen.getByText(/Cannot deactivate the last active payment method/)).toBeInTheDocument();
      });
    });
  });

  describe('Activate payment method', () => {
    it('should show activate button for inactive methods', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Inactive \(1\)/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Inactive \(1\)/));

      await waitFor(() => {
        expect(screen.getByText('Activate')).toBeInTheDocument();
      });
    });

    it('should activate payment method directly without confirmation', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Inactive \(1\)/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Inactive \(1\)/));

      await waitFor(() => {
        expect(screen.getByText('Activate')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Activate'));

      await waitFor(() => {
        expect(paymentMethodApi.setPaymentMethodActive).toHaveBeenCalledWith(4, true);
      });
    });
  });

  describe('Credit card detail view', () => {
    it('should show credit card specific info', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Visa')).toBeInTheDocument();
        expect(screen.getByText(/Balance:/)).toBeInTheDocument();
        expect(screen.getByText('View Details →')).toBeInTheDocument();
      });
    });

    it('should open credit card detail view when clicking on credit card info', async () => {
      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('View Details →')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View Details →'));

      await waitFor(() => {
        expect(screen.getByTestId('credit-card-detail-view')).toBeInTheDocument();
      });
    });
  });

  describe('Empty states', () => {
    it('should show empty message when no active payment methods', async () => {
      paymentMethodApi.getPaymentMethods.mockResolvedValue([
        { id: 1, type: 'cash', display_name: 'Cash', is_active: false }
      ]);

      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('No active payment methods. Add one to get started.')).toBeInTheDocument();
      });
    });

    it('should show empty message when no inactive payment methods', async () => {
      paymentMethodApi.getPaymentMethods.mockResolvedValue([
        { id: 1, type: 'cash', display_name: 'Cash', is_active: true }
      ]);

      render(
        <PaymentMethodsModal 
          isOpen={true} 
          onClose={mockOnClose} 
          onUpdate={mockOnUpdate} 
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Inactive \(0\)/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Inactive \(0\)/));

      await waitFor(() => {
        expect(screen.getByText('No inactive payment methods.')).toBeInTheDocument();
      });
    });
  });
});
