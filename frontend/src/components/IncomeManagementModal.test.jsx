import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import IncomeManagementModal from './IncomeManagementModal';
import * as incomeApi from '../services/incomeApi';

// Mock the income API
vi.mock('../services/incomeApi', () => ({
  getMonthlyIncomeSources: vi.fn(),
  createIncomeSource: vi.fn(),
  updateIncomeSource: vi.fn(),
  deleteIncomeSource: vi.fn(),
  carryForwardIncomeSources: vi.fn()
}));

describe('IncomeManagementModal', () => {
  const mockOnClose = vi.fn();
  const mockOnUpdate = vi.fn();
  
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    year: 2024,
    month: 12,
    onUpdate: mockOnUpdate
  };

  const mockIncomeSources = {
    sources: [
      { id: 1, name: 'Main Job', amount: 5000, category: 'Salary' },
      { id: 2, name: 'Side Gig', amount: 500, category: 'Other' }
    ],
    total: 5500,
    byCategory: {
      'Salary': 5000,
      'Other': 500
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    incomeApi.getMonthlyIncomeSources.mockResolvedValue(mockIncomeSources);
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <IncomeManagementModal {...defaultProps} isOpen={false} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders modal with correct title', async () => {
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Manage Income - December 2024/)).toBeInTheDocument();
      });
    });

    it('displays loading state initially', () => {
      render(<IncomeManagementModal {...defaultProps} />);
      expect(screen.getByText('Loading income sources...')).toBeInTheDocument();
    });

    it('displays income sources after loading', async () => {
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Main Job')).toBeInTheDocument();
        expect(screen.getByText('Side Gig')).toBeInTheDocument();
      });
    });

    it('displays total monthly gross', async () => {
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('$5500.00')).toBeInTheDocument();
      });
    });

    it('displays category breakdown', async () => {
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('By Category')).toBeInTheDocument();
      });
      
      // Salary appears in both the breakdown and the list, so use getAllByText
      await waitFor(() => {
        expect(screen.getAllByText('Salary').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Add Income Source', () => {
    it('shows add form when button is clicked', async () => {
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('+ Add Income Source')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('+ Add Income Source'));
      
      expect(screen.getByPlaceholderText('Income source name (e.g., Salary)')).toBeInTheDocument();
    });

    it('creates income source when form is submitted', async () => {
      incomeApi.createIncomeSource.mockResolvedValue({
        id: 3, name: 'Bonus', amount: 1000, category: 'Other'
      });
      
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('+ Add Income Source'));
      });
      
      fireEvent.change(screen.getByPlaceholderText('Income source name (e.g., Salary)'), {
        target: { value: 'Bonus' }
      });
      
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '1000' }
      });
      
      fireEvent.click(screen.getByText('Add'));
      
      await waitFor(() => {
        expect(incomeApi.createIncomeSource).toHaveBeenCalled();
      });
    });

    it('shows validation error for empty name', async () => {
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('+ Add Income Source'));
      });
      
      fireEvent.click(screen.getByText('Add'));
      
      await waitFor(() => {
        expect(screen.getByText(/Please fix the validation errors/)).toBeInTheDocument();
      });
    });

    it('allows selecting category', async () => {
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('+ Add Income Source'));
      });
      
      const categorySelect = screen.getByRole('combobox');
      fireEvent.change(categorySelect, { target: { value: 'Government' } });
      
      expect(categorySelect.value).toBe('Government');
    });
  });

  describe('Edit Income Source', () => {
    it('shows edit form when edit button is clicked', async () => {
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Main Job')).toBeInTheDocument();
      });
      
      const editButtons = screen.getAllByTitle('Edit');
      fireEvent.click(editButtons[0]);
      
      expect(screen.getByDisplayValue('Main Job')).toBeInTheDocument();
      expect(screen.getByDisplayValue('5000')).toBeInTheDocument();
    });

    it('updates income source when save is clicked', async () => {
      incomeApi.updateIncomeSource.mockResolvedValue({
        id: 1, name: 'Main Job Updated', amount: 5500, category: 'Salary'
      });
      
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Main Job')).toBeInTheDocument();
      });
      
      const editButtons = screen.getAllByTitle('Edit');
      fireEvent.click(editButtons[0]);
      
      fireEvent.change(screen.getByDisplayValue('Main Job'), {
        target: { value: 'Main Job Updated' }
      });
      
      fireEvent.click(screen.getByText('✓'));
      
      await waitFor(() => {
        expect(incomeApi.updateIncomeSource).toHaveBeenCalled();
      });
    });

    it('cancels edit when cancel button is clicked', async () => {
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Main Job')).toBeInTheDocument();
      });
      
      const editButtons = screen.getAllByTitle('Edit');
      fireEvent.click(editButtons[0]);
      
      // Find the cancel button in the edit form (not the modal close button)
      const cancelButtons = screen.getAllByText('✕');
      // The last one should be the edit cancel button
      fireEvent.click(cancelButtons[cancelButtons.length - 1]);
      
      await waitFor(() => {
        expect(screen.getByText('Main Job')).toBeInTheDocument();
      });
    });
  });

  describe('Delete Income Source', () => {
    it('deletes income source when confirmed', async () => {
      window.confirm = vi.fn(() => true);
      incomeApi.deleteIncomeSource.mockResolvedValue({});
      
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Main Job')).toBeInTheDocument();
      });
      
      const deleteButtons = screen.getAllByTitle('Delete');
      fireEvent.click(deleteButtons[0]);
      
      await waitFor(() => {
        expect(incomeApi.deleteIncomeSource).toHaveBeenCalledWith(1);
      });
    });

    it('does not delete when cancelled', async () => {
      window.confirm = vi.fn(() => false);
      
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Main Job')).toBeInTheDocument();
      });
      
      const deleteButtons = screen.getAllByTitle('Delete');
      fireEvent.click(deleteButtons[0]);
      
      expect(incomeApi.deleteIncomeSource).not.toHaveBeenCalled();
    });
  });

  describe('Copy from Previous Month', () => {
    it('shows copy button when no income sources', async () => {
      incomeApi.getMonthlyIncomeSources.mockResolvedValue({ sources: [], total: 0, byCategory: {} });
      
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Copy from Previous Month/)).toBeInTheDocument();
      });
    });

    it('calls carryForward API when button is clicked', async () => {
      incomeApi.getMonthlyIncomeSources.mockResolvedValue({ sources: [], total: 0, byCategory: {} });
      window.confirm = vi.fn(() => true);
      incomeApi.carryForwardIncomeSources.mockResolvedValue({ count: 2 });
      
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Copy from Previous Month/)).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText(/Copy from Previous Month/));
      
      await waitFor(() => {
        expect(incomeApi.carryForwardIncomeSources).toHaveBeenCalled();
      });
    });
  });

  describe('Empty state', () => {
    it('shows empty message when no income sources', async () => {
      incomeApi.getMonthlyIncomeSources.mockResolvedValue({ sources: [], total: 0, byCategory: {} });
      
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/No income sources for this month/)).toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    it('displays error message when API fails', async () => {
      incomeApi.getMonthlyIncomeSources.mockRejectedValue(new Error('Network error'));
      
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });
    });
  });

  describe('Close modal', () => {
    it('calls onClose and onUpdate when closed', async () => {
      render(<IncomeManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Manage Income/)).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('✕'));
      
      expect(mockOnClose).toHaveBeenCalled();
      expect(mockOnUpdate).toHaveBeenCalled();
    });
  });
});
