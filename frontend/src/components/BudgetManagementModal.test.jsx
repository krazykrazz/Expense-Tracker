import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BudgetManagementModal from './BudgetManagementModal';
import * as budgetApi from '../services/budgetApi';

// Mock the budget API
vi.mock('../services/budgetApi');

describe('BudgetManagementModal', () => {
  const mockOnClose = vi.fn();
  const mockOnBudgetUpdated = vi.fn();
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    year: 2025,
    month: 11,
    onBudgetUpdated: mockOnBudgetUpdated
  };

  const mockBudgets = [
    { id: 1, year: 2025, month: 11, category: 'Groceries', limit: 500 },
    { id: 2, year: 2025, month: 11, category: 'Gas', limit: 200 }
  ];

  const mockBudgetableCategories = [
    'Groceries', 'Gas', 'Housing', 'Utilities', 'Subscriptions',
    'Insurance', 'Dining Out', 'Entertainment', 'Clothing',
    'Pet Care', 'Recreation Activities', 'Other'
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    budgetApi.getBudgets.mockResolvedValue({ budgets: mockBudgets });
    budgetApi.getBudgetSuggestion.mockResolvedValue({ suggestedAmount: 300 });
    
    // Mock fetch for categories endpoint
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ budgetableCategories: mockBudgetableCategories })
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Budget Creation', () => {
    it('should create a new budget when setting limit for category without budget', async () => {
      const newBudget = {
        id: 1,
        year: 2025,
        month: 11,
        category: 'Housing',
        limit: 500
      };
      
      // Initial call returns empty budgets
      budgetApi.getBudgets.mockResolvedValueOnce({ budgets: [] });
      budgetApi.getBudgetSummary.mockResolvedValue({ totalBudget: 0, totalSpent: 0 });
      
      // After creation, return the new budget
      budgetApi.createBudget.mockResolvedValue(newBudget);
      budgetApi.getBudgets.mockResolvedValueOnce({ budgets: [newBudget] });

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Housing')).toBeInTheDocument();
      });

      // Click edit button for Housing category (first in the list)
      const editButtons = screen.getAllByTitle(/Set budget|Edit budget/);
      fireEvent.click(editButtons[0]);

      // Enter amount
      const input = screen.getByPlaceholderText('0.00');
      fireEvent.change(input, { target: { value: '500' } });

      // Click save
      const saveButton = screen.getByTitle('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(budgetApi.createBudget).toHaveBeenCalledWith(2025, 11, 'Housing', 500);
      });

      expect(mockOnBudgetUpdated).toHaveBeenCalled();
    });

    it('should validate amount is positive before creating budget', async () => {
      budgetApi.getBudgets.mockResolvedValue({ budgets: [] });

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Housing')).toBeInTheDocument();
      });

      // Click edit button for Housing category (first in the list)
      const editButtons = screen.getAllByTitle(/Set budget|Edit budget/);
      fireEvent.click(editButtons[0]);

      // Enter invalid amount
      const input = screen.getByPlaceholderText('0.00');
      fireEvent.change(input, { target: { value: '-100' } });

      // Click save
      const saveButton = screen.getByTitle('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/Please fix the validation errors/)).toBeInTheDocument();
      });

      expect(budgetApi.createBudget).not.toHaveBeenCalled();
    });

    it('should validate amount is not zero before creating budget', async () => {
      budgetApi.getBudgets.mockResolvedValue({ budgets: [] });

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Housing')).toBeInTheDocument();
      });

      // Click edit button for Housing category (first in the list)
      const editButtons = screen.getAllByTitle(/Set budget|Edit budget/);
      fireEvent.click(editButtons[0]);

      // Enter zero amount
      const input = screen.getByPlaceholderText('0.00');
      fireEvent.change(input, { target: { value: '0' } });

      // Click save
      const saveButton = screen.getByTitle('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/Please fix the validation errors/)).toBeInTheDocument();
      });

      expect(budgetApi.createBudget).not.toHaveBeenCalled();
    });
  });

  describe('Budget Update', () => {
    it('should update existing budget when changing limit', async () => {
      budgetApi.updateBudget.mockResolvedValue({
        id: 1,
        year: 2025,
        month: 11,
        category: 'Groceries',
        limit: 600
      });

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('$500.00')).toBeInTheDocument();
      });

      // Click edit button for Groceries category (first edit button)
      const editButtons = screen.getAllByTitle(/Edit budget/);
      fireEvent.click(editButtons[0]);

      // Change amount
      const input = screen.getByDisplayValue('500');
      fireEvent.change(input, { target: { value: '600' } });

      // Click save
      const saveButton = screen.getByTitle('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(budgetApi.updateBudget).toHaveBeenCalledWith(1, 600);
      });

      expect(mockOnBudgetUpdated).toHaveBeenCalled();
    });

    it('should validate amount is positive before updating budget', async () => {
      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('$500.00')).toBeInTheDocument();
      });

      // Click edit button for Groceries category
      const editButtons = screen.getAllByTitle(/Edit budget/);
      fireEvent.click(editButtons[0]);

      // Enter invalid amount
      const input = screen.getByDisplayValue('500');
      fireEvent.change(input, { target: { value: '-100' } });

      // Click save
      const saveButton = screen.getByTitle('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/Please fix the validation errors/)).toBeInTheDocument();
      });

      expect(budgetApi.updateBudget).not.toHaveBeenCalled();
    });
  });

  describe('Budget Deletion', () => {
    it('should delete budget when remove button is clicked and confirmed', async () => {
      budgetApi.deleteBudget.mockResolvedValue();
      window.confirm = vi.fn(() => true);

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('$500.00')).toBeInTheDocument();
      });

      // Click delete button for Groceries category
      const deleteButtons = screen.getAllByTitle('Remove budget');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(budgetApi.deleteBudget).toHaveBeenCalledWith(1);
      });

      expect(mockOnBudgetUpdated).toHaveBeenCalled();
    });

    it('should not delete budget when user cancels confirmation', async () => {
      window.confirm = vi.fn(() => false);

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('$500.00')).toBeInTheDocument();
      });

      // Click delete button for Groceries category
      const deleteButtons = screen.getAllByTitle('Remove budget');
      fireEvent.click(deleteButtons[0]);

      expect(budgetApi.deleteBudget).not.toHaveBeenCalled();
      expect(mockOnBudgetUpdated).not.toHaveBeenCalled();
    });
  });

  describe('Validation Errors', () => {
    it('should display validation error for empty amount', async () => {
      budgetApi.getBudgets.mockResolvedValue({ budgets: [] });

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Groceries')).toBeInTheDocument();
      });

      // Click edit button for Groceries category
      const editButtons = screen.getAllByTitle(/Set budget/);
      fireEvent.click(editButtons[0]);

      // Leave amount empty and click save
      const saveButton = screen.getByTitle('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/Please fix the validation errors/)).toBeInTheDocument();
      });
    });

    it('should display validation error for non-numeric amount', async () => {
      budgetApi.getBudgets.mockResolvedValue({ budgets: [] });

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Groceries')).toBeInTheDocument();
      });

      // Click edit button for Groceries category
      const editButtons = screen.getAllByTitle(/Set budget/);
      fireEvent.click(editButtons[0]);

      // Enter non-numeric value
      const input = screen.getByPlaceholderText('0.00');
      fireEvent.change(input, { target: { value: 'abc' } });

      // Click save
      const saveButton = screen.getByTitle('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/Please fix the validation errors/)).toBeInTheDocument();
      });
    });

    it('should clear validation errors when canceling edit', async () => {
      budgetApi.getBudgets.mockResolvedValue({ budgets: [] });

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Groceries')).toBeInTheDocument();
      });

      // Click edit button for Groceries category
      const editButtons = screen.getAllByTitle(/Set budget/);
      fireEvent.click(editButtons[0]);

      // Enter invalid amount
      const input = screen.getByPlaceholderText('0.00');
      fireEvent.change(input, { target: { value: '-100' } });

      // Click save to trigger validation error
      const saveButton = screen.getByTitle('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/Please fix the validation errors/)).toBeInTheDocument();
      });

      // Click cancel
      const cancelButton = screen.getByTitle('Cancel');
      fireEvent.click(cancelButton);

      // Validation error should be cleared
      expect(screen.queryByText(/Please fix the validation errors/)).not.toBeInTheDocument();
    });
  });

  describe('Copy Functionality', () => {
    it('should copy budgets from previous month', async () => {
      budgetApi.getBudgets.mockResolvedValue({ budgets: [] });
      budgetApi.copyBudgets.mockResolvedValue({ copied: 2, skipped: 0, overwritten: 0 });
      window.confirm = vi.fn(() => true);

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Groceries')).toBeInTheDocument();
      });

      // Click copy button
      const copyButton = screen.getByText(/Copy from Previous Month/);
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(budgetApi.copyBudgets).toHaveBeenCalledWith(2025, 10, 2025, 11, true);
      });

      expect(mockOnBudgetUpdated).toHaveBeenCalled();
    });

    it('should show alert when no budgets to copy', async () => {
      budgetApi.getBudgets.mockResolvedValue({ budgets: [] });
      budgetApi.copyBudgets.mockResolvedValue({ copied: 0, skipped: 0, overwritten: 0 });
      window.alert = vi.fn();

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Groceries')).toBeInTheDocument();
      });

      // Click copy button
      const copyButton = screen.getByText(/Copy from Previous Month/);
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('No budgets found'));
      });
    });

    it('should prompt for confirmation when overwriting existing budgets', async () => {
      budgetApi.copyBudgets.mockResolvedValue({ copied: 2, skipped: 0, overwritten: 2 });
      window.confirm = vi.fn(() => true);

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('$500.00')).toBeInTheDocument();
      });

      // Click copy button
      const copyButton = screen.getByText(/Copy from Previous Month/);
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('overwrite'));
      });
    });

    it('should handle copy across year boundary', async () => {
      const januaryProps = { ...defaultProps, month: 1 };
      budgetApi.getBudgets.mockResolvedValue({ budgets: [] });
      budgetApi.copyBudgets.mockResolvedValue({ copied: 2, skipped: 0, overwritten: 0 });

      render(<BudgetManagementModal {...januaryProps} />);

      await waitFor(() => {
        expect(screen.getByText('Groceries')).toBeInTheDocument();
      });

      // Click copy button
      const copyButton = screen.getByText(/Copy from Previous Month/);
      fireEvent.click(copyButton);

      await waitFor(() => {
        // Should copy from December of previous year
        expect(budgetApi.copyBudgets).toHaveBeenCalledWith(2024, 12, 2025, 1, true);
      });
    });
  });

  describe('Modal Behavior', () => {
    it('should not render when isOpen is false', () => {
      const { container } = render(
        <BudgetManagementModal {...defaultProps} isOpen={false} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should call onClose when close button is clicked', async () => {
      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Groceries')).toBeInTheDocument();
      });

      const closeButton = screen.getByText('✕');
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when clicking overlay', async () => {
      const { container } = render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Groceries')).toBeInTheDocument();
      });

      const overlay = container.querySelector('.budget-modal-overlay');
      fireEvent.click(overlay);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should not close when clicking modal content', async () => {
      const { container } = render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Groceries')).toBeInTheDocument();
      });

      const modalContent = container.querySelector('.budget-modal-container');
      fireEvent.click(modalContent);

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should display correct month and year in header', async () => {
      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/November 2025/)).toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    it('should display loading state while fetching budgets', () => {
      budgetApi.getBudgets.mockImplementation(() => new Promise(() => {}));

      render(<BudgetManagementModal {...defaultProps} />);

      expect(screen.getByText('Loading budgets...')).toBeInTheDocument();
    });

    it('should disable buttons while loading', async () => {
      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('$500.00')).toBeInTheDocument();
      });

      // Start editing
      const editButtons = screen.getAllByTitle(/Edit budget/);
      fireEvent.click(editButtons[0]);

      // Mock a slow save operation
      budgetApi.updateBudget.mockImplementation(() => new Promise(() => {}));

      const saveButton = screen.getByTitle('Save');
      fireEvent.click(saveButton);

      // Button should be disabled during save
      await waitFor(() => {
        expect(saveButton).toBeDisabled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when fetch fails', async () => {
      budgetApi.getBudgets.mockRejectedValue(new Error('Network error'));

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });
    });

    it('should display retry button on fetch error', async () => {
      budgetApi.getBudgets.mockRejectedValue(new Error('Network error'));

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('should retry fetch when retry button is clicked', async () => {
      budgetApi.getBudgets.mockRejectedValueOnce(new Error('Network error'));
      budgetApi.getBudgets.mockResolvedValueOnce({ budgets: mockBudgets });

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      const retryButton = screen.getByText('Retry');
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('$500.00')).toBeInTheDocument();
      });
    });

    it('should display error message when save fails', async () => {
      budgetApi.createBudget.mockRejectedValue(new Error('Failed to save'));

      budgetApi.getBudgets.mockResolvedValue({ budgets: [] });

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Groceries')).toBeInTheDocument();
      });

      // Click edit button
      const editButtons = screen.getAllByTitle(/Set budget/);
      fireEvent.click(editButtons[0]);

      // Enter amount and save
      const input = screen.getByPlaceholderText('0.00');
      fireEvent.change(input, { target: { value: '500' } });

      const saveButton = screen.getByTitle('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to save/)).toBeInTheDocument();
      });
    });
  });

  describe('Category Display', () => {
    it('should display all budgetable categories', async () => {
      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Groceries')).toBeInTheDocument();
        expect(screen.getByText('Gas')).toBeInTheDocument();
        expect(screen.getByText('Other')).toBeInTheDocument();
      });
    });

    it('should show "Not set" for categories without budgets', async () => {
      budgetApi.getBudgets.mockResolvedValue({ budgets: [] });

      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        const notSetElements = screen.getAllByText('Not set');
        expect(notSetElements).toHaveLength(12); // All 12 budgetable categories
      });
    });

    it('should display budget amounts for categories with budgets', async () => {
      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('$500.00')).toBeInTheDocument();
        expect(screen.getByText('$200.00')).toBeInTheDocument();
      });
    });

    it('should show info message about budgetable categories', async () => {
      render(<BudgetManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Budgets apply to all categories except tax-deductible expenses/)).toBeInTheDocument();
      });
    });
  });
});



