import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FixedExpensesModal from './FixedExpensesModal';
import * as fixedExpenseApi from '../services/fixedExpenseApi';
import * as paymentMethodApi from '../services/paymentMethodApi';

// Mock the fixed expense API
vi.mock('../services/fixedExpenseApi', () => ({
  getMonthlyFixedExpenses: vi.fn(),
  createFixedExpense: vi.fn(),
  updateFixedExpense: vi.fn(),
  deleteFixedExpense: vi.fn(),
  carryForwardFixedExpenses: vi.fn()
}));

// Mock the payment method API
vi.mock('../services/paymentMethodApi', () => ({
  getActivePaymentMethods: vi.fn(),
  getPaymentMethod: vi.fn()
}));

// Mock payment methods data
const mockPaymentMethods = [
  { id: 1, type: 'cash', display_name: 'Cash', is_active: true },
  { id: 2, type: 'debit', display_name: 'Debit', is_active: true },
  { id: 3, type: 'cheque', display_name: 'Cheque', is_active: true },
  { id: 4, type: 'credit_card', display_name: 'CIBC MC', full_name: 'CIBC Mastercard', is_active: true },
  { id: 5, type: 'credit_card', display_name: 'RBC VISA', full_name: 'RBC VISA', is_active: true }
];

describe('FixedExpensesModal', () => {
  const mockOnClose = vi.fn();
  const mockOnUpdate = vi.fn();
  
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    year: 2024,
    month: 12,
    onUpdate: mockOnUpdate
  };

  const mockFixedExpenses = {
    items: [
      { id: 1, name: 'Rent', amount: 1500, category: 'Housing', payment_type: 'Debit' },
      { id: 2, name: 'Internet', amount: 80, category: 'Utilities', payment_type: 'VISA' }
    ],
    total: 1580
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fixedExpenseApi.getMonthlyFixedExpenses.mockResolvedValue(mockFixedExpenses);
    paymentMethodApi.getActivePaymentMethods.mockResolvedValue(mockPaymentMethods);
    paymentMethodApi.getPaymentMethod.mockResolvedValue(null);
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <FixedExpensesModal {...defaultProps} isOpen={false} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders modal with correct title', async () => {
      render(<FixedExpensesModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Manage Fixed Expenses - December 2024/)).toBeInTheDocument();
      });
    });

    it('displays loading state initially', () => {
      render(<FixedExpensesModal {...defaultProps} />);
      expect(screen.getByText('Loading fixed expenses...')).toBeInTheDocument();
    });

    it('displays fixed expenses after loading', async () => {
      render(<FixedExpensesModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Rent')).toBeInTheDocument();
        expect(screen.getByText('Internet')).toBeInTheDocument();
      });
    });

    it('displays total fixed expenses', async () => {
      render(<FixedExpensesModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('$1580.00')).toBeInTheDocument();
      });
    });
  });

  describe('Add Fixed Expense', () => {
    it('shows add form when button is clicked', async () => {
      render(<FixedExpensesModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('+ Add Fixed Expense')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('+ Add Fixed Expense'));
      
      expect(screen.getByPlaceholderText('Fixed expense name (e.g., Rent)')).toBeInTheDocument();
    });

    it('creates fixed expense when form is submitted', async () => {
      fixedExpenseApi.createFixedExpense.mockResolvedValue({
        id: 3, name: 'Phone', amount: 50, category: 'Utilities', payment_type: 'Debit'
      });
      
      render(<FixedExpensesModal {...defaultProps} />);
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('+ Add Fixed Expense'));
      });
      
      fireEvent.change(screen.getByPlaceholderText('Fixed expense name (e.g., Rent)'), {
        target: { value: 'Phone' }
      });
      
      // Select category
      const categorySelect = screen.getAllByRole('combobox')[0];
      fireEvent.change(categorySelect, { target: { value: 'Utilities' } });
      
      // Select payment type
      const paymentSelect = screen.getAllByRole('combobox')[1];
      fireEvent.change(paymentSelect, { target: { value: 'Debit' } });
      
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '50' }
      });
      
      fireEvent.click(screen.getByText('Add'));
      
      await waitFor(() => {
        expect(fixedExpenseApi.createFixedExpense).toHaveBeenCalled();
      });
    });

    it('shows validation error for empty name', async () => {
      render(<FixedExpensesModal {...defaultProps} />);
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('+ Add Fixed Expense'));
      });
      
      fireEvent.click(screen.getByText('Add'));
      
      await waitFor(() => {
        expect(screen.getByText(/Please fix the validation errors/)).toBeInTheDocument();
      });
    });
  });

  describe('Edit Fixed Expense', () => {
    it('shows edit form when edit button is clicked', async () => {
      render(<FixedExpensesModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Rent')).toBeInTheDocument();
      });
      
      const editButtons = screen.getAllByTitle('Edit');
      fireEvent.click(editButtons[0]);
      
      expect(screen.getByDisplayValue('Rent')).toBeInTheDocument();
      expect(screen.getByDisplayValue('1500')).toBeInTheDocument();
    });

    it('updates fixed expense when save is clicked', async () => {
      fixedExpenseApi.updateFixedExpense.mockResolvedValue({
        id: 1, name: 'Rent Updated', amount: 1600, category: 'Housing', payment_type: 'Debit'
      });
      
      render(<FixedExpensesModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Rent')).toBeInTheDocument();
      });
      
      const editButtons = screen.getAllByTitle('Edit');
      fireEvent.click(editButtons[0]);
      
      fireEvent.change(screen.getByDisplayValue('Rent'), {
        target: { value: 'Rent Updated' }
      });
      
      fireEvent.click(screen.getByText('✓'));
      
      await waitFor(() => {
        expect(fixedExpenseApi.updateFixedExpense).toHaveBeenCalled();
      });
    });

    it('cancels edit when cancel button is clicked', async () => {
      render(<FixedExpensesModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Rent')).toBeInTheDocument();
      });
      
      const editButtons = screen.getAllByTitle('Edit');
      fireEvent.click(editButtons[0]);
      
      // Find the cancel button in the edit form (not the modal close button)
      const cancelButtons = screen.getAllByText('✕');
      // The last one should be the edit cancel button
      fireEvent.click(cancelButtons[cancelButtons.length - 1]);
      
      // Should show the display view again
      await waitFor(() => {
        expect(screen.getByText('Rent')).toBeInTheDocument();
      });
    });
  });

  describe('Delete Fixed Expense', () => {
    it('deletes fixed expense when confirmed', async () => {
      window.confirm = vi.fn(() => true);
      fixedExpenseApi.deleteFixedExpense.mockResolvedValue({});
      
      render(<FixedExpensesModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Rent')).toBeInTheDocument();
      });
      
      const deleteButtons = screen.getAllByTitle('Delete');
      fireEvent.click(deleteButtons[0]);
      
      await waitFor(() => {
        expect(fixedExpenseApi.deleteFixedExpense).toHaveBeenCalledWith(1);
      });
    });

    it('does not delete when cancelled', async () => {
      window.confirm = vi.fn(() => false);
      
      render(<FixedExpensesModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Rent')).toBeInTheDocument();
      });
      
      const deleteButtons = screen.getAllByTitle('Delete');
      fireEvent.click(deleteButtons[0]);
      
      expect(fixedExpenseApi.deleteFixedExpense).not.toHaveBeenCalled();
    });
  });

  describe('Carry Forward', () => {
    it('shows carry forward button', async () => {
      render(<FixedExpensesModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Carry Forward from Previous Month/)).toBeInTheDocument();
      });
    });

    it('calls carryForward API when button is clicked', async () => {
      window.confirm = vi.fn(() => true);
      fixedExpenseApi.carryForwardFixedExpenses.mockResolvedValue({ count: 2 });
      
      render(<FixedExpensesModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Carry Forward from Previous Month/)).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText(/Carry Forward from Previous Month/));
      
      await waitFor(() => {
        expect(fixedExpenseApi.carryForwardFixedExpenses).toHaveBeenCalled();
      });
    });
  });

  describe('Empty state', () => {
    it('shows empty message when no fixed expenses', async () => {
      fixedExpenseApi.getMonthlyFixedExpenses.mockResolvedValue({ items: [], total: 0 });
      
      render(<FixedExpensesModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/No fixed expenses for this month/)).toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    it('displays error message when API fails', async () => {
      fixedExpenseApi.getMonthlyFixedExpenses.mockRejectedValue(new Error('Network error'));
      
      render(<FixedExpensesModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });
    });
  });

  describe('Close modal', () => {
    it('calls onClose and onUpdate when closed', async () => {
      render(<FixedExpensesModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Manage Fixed Expenses/)).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('✕'));
      
      expect(mockOnClose).toHaveBeenCalled();
      expect(mockOnUpdate).toHaveBeenCalled();
    });
  });
});
