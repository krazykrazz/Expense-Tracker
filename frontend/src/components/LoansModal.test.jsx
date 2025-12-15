import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoansModal from './LoansModal';
import * as loanApi from '../services/loanApi';

// Mock the loan API
vi.mock('../services/loanApi', () => ({
  getAllLoans: vi.fn(),
  createLoan: vi.fn(),
  updateLoan: vi.fn(),
  deleteLoan: vi.fn()
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
      
      expect(screen.getByText('Add New Loan')).toBeInTheDocument();
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
