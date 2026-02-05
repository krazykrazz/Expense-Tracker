import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoansModal from './LoansModal';
import * as loanApi from '../services/loanApi';
import * as fixedExpenseApi from '../services/fixedExpenseApi';

// Mock the loan API
vi.mock('../services/loanApi', () => ({
  getAllLoans: vi.fn(),
  createLoan: vi.fn(),
  updateLoan: vi.fn(),
  deleteLoan: vi.fn()
}));

// Mock the fixed expense API
vi.mock('../services/fixedExpenseApi', () => ({
  getFixedExpensesByLoan: vi.fn()
}));

describe('LoansModal', () => {
  const mockOnClose = vi.fn();
  const mockOnUpdate = vi.fn();
  
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    year: 2024,
    month: 12,
    onUpdate: mockOnUpdate,
    highlightIds: []
  };

  const mockLoans = [
    {
      id: 1,
      name: 'Car Loan',
      initial_balance: 20000,
      start_date: '2023-01-15',
      loan_type: 'loan',
      is_paid_off: false,
      currentBalance: 15000,
      currentRate: 5.5,
      notes: 'Test note'
    },
    {
      id: 2,
      name: 'Credit Card',
      initial_balance: 5000,
      start_date: '2022-06-01',
      loan_type: 'line_of_credit',
      is_paid_off: false,
      currentBalance: 2500,
      currentRate: 19.99,
      notes: null
    },
    {
      id: 3,
      name: 'Old Loan',
      initial_balance: 10000,
      start_date: '2020-01-01',
      loan_type: 'loan',
      is_paid_off: true,
      currentBalance: 0,
      currentRate: 4.0,
      notes: null
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    loanApi.getAllLoans.mockResolvedValue(mockLoans);
    // Mock fixed expense API to return empty array by default
    fixedExpenseApi.getFixedExpensesByLoan.mockResolvedValue([]);
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <LoansModal {...defaultProps} isOpen={false} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders modal when isOpen is true', async () => {
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Manage Loans')).toBeInTheDocument();
      });
    });

    it('displays loading state initially', () => {
      render(<LoansModal {...defaultProps} />);
      expect(screen.getByText('Loading loans...')).toBeInTheDocument();
    });

    it('displays loans after loading', async () => {
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Car Loan')).toBeInTheDocument();
        expect(screen.getByText('Credit Card')).toBeInTheDocument();
      });
    });

    it('shows LOC badge for line of credit loans', async () => {
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('LOC')).toBeInTheDocument();
      });
    });
  });

  describe('Tabs', () => {
    it('displays active and paid off tabs', async () => {
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Active Loans/)).toBeInTheDocument();
        expect(screen.getByText(/Paid Off Loans/)).toBeInTheDocument();
      });
    });

    it('shows correct count in tabs', async () => {
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Active Loans (2)')).toBeInTheDocument();
        expect(screen.getByText('Paid Off Loans (1)')).toBeInTheDocument();
      });
    });

    it('switches to paid off tab when clicked', async () => {
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Car Loan')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('Paid Off Loans (1)'));
      
      await waitFor(() => {
        expect(screen.getByText('Old Loan')).toBeInTheDocument();
      });
    });
  });

  describe('Add Loan Form', () => {
    it('shows add form when Add New Loan button is clicked', async () => {
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('+ Add New Loan')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('+ Add New Loan'));
      
      // The form heading is "Add New Loan" (without the +)
      expect(screen.getByRole('heading', { name: 'Add New Loan' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g., Car Loan, Mortgage')).toBeInTheDocument();
    });

    it('creates loan when form is submitted', async () => {
      loanApi.createLoan.mockResolvedValue({ id: 4, name: 'New Loan' });
      
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('+ Add New Loan'));
      });
      
      fireEvent.change(screen.getByPlaceholderText('e.g., Car Loan, Mortgage'), {
        target: { value: 'New Loan' }
      });
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '10000' }
      });
      
      // Find date input by type
      const dateInputs = document.querySelectorAll('input[type="date"]');
      if (dateInputs.length > 0) {
        fireEvent.change(dateInputs[0], { target: { value: '2024-01-01' } });
      }
      
      fireEvent.click(screen.getByText('Create Loan'));
      
      await waitFor(() => {
        expect(loanApi.createLoan).toHaveBeenCalled();
      });
    });

    it('shows validation error for empty name', async () => {
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('+ Add New Loan'));
      });
      
      fireEvent.click(screen.getByText('Create Loan'));
      
      await waitFor(() => {
        expect(screen.getByText(/Please fix the validation errors/)).toBeInTheDocument();
      });
    });
  });

  describe('Edit Loan', () => {
    it('shows edit form when edit button is clicked', async () => {
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Car Loan')).toBeInTheDocument();
      });
      
      const editButtons = screen.getAllByTitle('Edit');
      fireEvent.click(editButtons[0]);
      
      expect(screen.getByText('Edit Loan')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Car Loan')).toBeInTheDocument();
    });
  });

  describe('Delete Loan', () => {
    it('calls deleteLoan when delete is confirmed', async () => {
      window.confirm = vi.fn(() => true);
      loanApi.deleteLoan.mockResolvedValue({});
      
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Car Loan')).toBeInTheDocument();
      });
      
      const deleteButtons = screen.getAllByTitle('Delete');
      fireEvent.click(deleteButtons[0]);
      
      await waitFor(() => {
        expect(loanApi.deleteLoan).toHaveBeenCalledWith(1);
      });
    });

    it('does not delete when confirmation is cancelled', async () => {
      window.confirm = vi.fn(() => false);
      
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Car Loan')).toBeInTheDocument();
      });
      
      const deleteButtons = screen.getAllByTitle('Delete');
      fireEvent.click(deleteButtons[0]);
      
      expect(loanApi.deleteLoan).not.toHaveBeenCalled();
    });
  });

  describe('Highlight functionality', () => {
    it('highlights loans that need updates', async () => {
      render(<LoansModal {...defaultProps} highlightIds={[1]} />);
      
      await waitFor(() => {
        expect(screen.getByText('⚠️ Update Needed')).toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    it('displays error message when API fails', async () => {
      loanApi.getAllLoans.mockRejectedValue(new Error('Network error'));
      
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      loanApi.getAllLoans.mockRejectedValue(new Error('Network error'));
      
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });
  });

  describe('Close modal', () => {
    it('calls onClose and onUpdate when modal is closed', async () => {
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Manage Loans')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('✕'));
      
      expect(mockOnClose).toHaveBeenCalled();
      expect(mockOnUpdate).toHaveBeenCalled();
    });
  });
});


describe('Fixed Interest Rate Field', () => {
  const mockOnClose = vi.fn();
  const mockOnUpdate = vi.fn();
  
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    year: 2024,
    month: 12,
    onUpdate: mockOnUpdate,
    highlightIds: []
  };

  const mockLoans = [
    {
      id: 1,
      name: 'Car Loan',
      initial_balance: 20000,
      start_date: '2023-01-15',
      loan_type: 'loan',
      is_paid_off: false,
      currentBalance: 15000,
      currentRate: 5.5,
      fixed_interest_rate: 5.5,
      notes: 'Test note'
    },
    {
      id: 2,
      name: 'Credit Card',
      initial_balance: 5000,
      start_date: '2022-06-01',
      loan_type: 'line_of_credit',
      is_paid_off: false,
      currentBalance: 2500,
      currentRate: 19.99,
      fixed_interest_rate: null,
      notes: null
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    loanApi.getAllLoans.mockResolvedValue(mockLoans);
    // Mock fixed expense API to return empty array by default
    fixedExpenseApi.getFixedExpensesByLoan.mockResolvedValue([]);
  });

  describe('Conditional Rendering', () => {
    it('shows fixed interest rate field when loan_type is "loan"', async () => {
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('+ Add New Loan'));
      });
      
      // Default loan_type is 'loan', so fixed rate field should be visible
      expect(screen.getByText('Fixed Interest Rate (%)')).toBeInTheDocument();
    });

    it('hides fixed interest rate field when loan_type is "line_of_credit"', async () => {
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('+ Add New Loan'));
      });
      
      // Change loan type to line_of_credit
      const loanTypeSelect = screen.getByRole('combobox');
      fireEvent.change(loanTypeSelect, { target: { value: 'line_of_credit' } });
      
      // Fixed rate field should not be visible
      expect(screen.queryByText('Fixed Interest Rate (%)')).not.toBeInTheDocument();
    });

    it('hides fixed interest rate field when loan_type is "mortgage"', async () => {
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('+ Add New Loan'));
      });
      
      // Change loan type to mortgage
      const loanTypeSelect = screen.getByRole('combobox');
      fireEvent.change(loanTypeSelect, { target: { value: 'mortgage' } });
      
      // Fixed rate field should not be visible
      expect(screen.queryByText('Fixed Interest Rate (%)')).not.toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('shows validation error for negative fixed interest rate', async () => {
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('+ Add New Loan'));
      });
      
      // Fill in required fields
      fireEvent.change(screen.getByPlaceholderText('e.g., Car Loan, Mortgage'), {
        target: { value: 'Test Loan' }
      });
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '10000' }
      });
      
      const dateInputs = document.querySelectorAll('input[type="date"]');
      if (dateInputs.length > 0) {
        fireEvent.change(dateInputs[0], { target: { value: '2024-01-01' } });
      }
      
      // Enter negative fixed interest rate
      fireEvent.change(screen.getByPlaceholderText('e.g., 5.25'), {
        target: { value: '-5' }
      });
      
      fireEvent.click(screen.getByText('Create Loan'));
      
      await waitFor(() => {
        expect(screen.getByText(/Fixed interest rate must be greater than or equal to zero/)).toBeInTheDocument();
      });
    });

    it('allows zero as a valid fixed interest rate', async () => {
      loanApi.createLoan.mockResolvedValue({ id: 3, name: 'Test Loan' });
      
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('+ Add New Loan'));
      });
      
      // Fill in required fields
      fireEvent.change(screen.getByPlaceholderText('e.g., Car Loan, Mortgage'), {
        target: { value: 'Test Loan' }
      });
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '10000' }
      });
      
      const dateInputs = document.querySelectorAll('input[type="date"]');
      if (dateInputs.length > 0) {
        fireEvent.change(dateInputs[0], { target: { value: '2024-01-01' } });
      }
      
      // Enter zero as fixed interest rate
      fireEvent.change(screen.getByPlaceholderText('e.g., 5.25'), {
        target: { value: '0' }
      });
      
      fireEvent.click(screen.getByText('Create Loan'));
      
      await waitFor(() => {
        expect(loanApi.createLoan).toHaveBeenCalledWith(
          expect.objectContaining({
            fixed_interest_rate: 0
          })
        );
      });
    });

    it('allows empty fixed interest rate (null)', async () => {
      loanApi.createLoan.mockResolvedValue({ id: 3, name: 'Test Loan' });
      
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('+ Add New Loan'));
      });
      
      // Fill in required fields only, leave fixed rate empty
      fireEvent.change(screen.getByPlaceholderText('e.g., Car Loan, Mortgage'), {
        target: { value: 'Test Loan' }
      });
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '10000' }
      });
      
      const dateInputs = document.querySelectorAll('input[type="date"]');
      if (dateInputs.length > 0) {
        fireEvent.change(dateInputs[0], { target: { value: '2024-01-01' } });
      }
      
      fireEvent.click(screen.getByText('Create Loan'));
      
      await waitFor(() => {
        expect(loanApi.createLoan).toHaveBeenCalledWith(
          expect.objectContaining({
            fixed_interest_rate: null
          })
        );
      });
    });
  });

  describe('Edit Mode', () => {
    it('populates fixed interest rate when editing a loan with fixed rate', async () => {
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Car Loan')).toBeInTheDocument();
      });
      
      // Click edit on the first loan (Car Loan with fixed_interest_rate: 5.5)
      const editButtons = screen.getAllByTitle('Edit');
      fireEvent.click(editButtons[0]);
      
      // Check that the fixed rate field is populated
      const fixedRateInput = screen.getByPlaceholderText('e.g., 5.25');
      expect(fixedRateInput.value).toBe('5.5');
    });

    it('includes fixed_interest_rate in update API call', async () => {
      loanApi.updateLoan.mockResolvedValue({ id: 1, name: 'Car Loan Updated' });
      
      render(<LoansModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Car Loan')).toBeInTheDocument();
      });
      
      // Click edit on the first loan
      const editButtons = screen.getAllByTitle('Edit');
      fireEvent.click(editButtons[0]);
      
      // Change the fixed rate
      const fixedRateInput = screen.getByPlaceholderText('e.g., 5.25');
      fireEvent.change(fixedRateInput, { target: { value: '6.0' } });
      
      fireEvent.click(screen.getByText('Update Loan'));
      
      await waitFor(() => {
        expect(loanApi.updateLoan).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            fixed_interest_rate: 6.0
          })
        );
      });
    });
  });
});
