import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import BudgetSummaryPanel from './BudgetSummaryPanel';
import * as budgetApi from '../services/budgetApi';

// Mock the budget API
vi.mock('../services/budgetApi');

describe('BudgetSummaryPanel', () => {
  const mockOnManageBudgets = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Summary Calculations Display', () => {
    it('should display total budgeted amount correctly', async () => {
      const mockBudgets = [
        { id: 1, category: 'Food', limit: 500, spent: 300 },
        { id: 2, category: 'Gas', limit: 200, spent: 150 }
      ];
      
      const mockSummary = {
        totalBudgeted: 700,
        totalSpent: 450,
        remaining: 250,
        progress: 64.3,
        budgetsOnTrack: 2,
        totalBudgets: 2
      };
      
      budgetApi.getBudgets.mockResolvedValue({ budgets: mockBudgets });
      budgetApi.getBudgetSummary.mockResolvedValue(mockSummary);
      
      const { container } = render(
        <BudgetSummaryPanel 
          year={2025} 
          month={11} 
          onManageBudgets={mockOnManageBudgets}
        />
      );
      
      await waitFor(() => {
        const statValues = container.querySelectorAll('.stat-value');
        const totalBudgetedElement = Array.from(statValues).find(el => 
          el.textContent.includes('$700.00')
        );
        expect(totalBudgetedElement).not.toBeNull();
      });
    });

    it('should display total spent amount correctly', async () => {
      const mockBudgets = [
        { id: 1, category: 'Food', limit: 500, spent: 300 },
        { id: 2, category: 'Gas', limit: 200, spent: 150 }
      ];
      
      const mockSummary = {
        totalBudgeted: 700,
        totalSpent: 450,
        remaining: 250,
        progress: 64.3,
        budgetsOnTrack: 2,
        totalBudgets: 2
      };
      
      budgetApi.getBudgets.mockResolvedValue({ budgets: mockBudgets });
      budgetApi.getBudgetSummary.mockResolvedValue(mockSummary);
      
      const { container } = render(
        <BudgetSummaryPanel 
          year={2025} 
          month={11} 
          onManageBudgets={mockOnManageBudgets}
        />
      );
      
      await waitFor(() => {
        const statValues = container.querySelectorAll('.stat-value');
        const totalSpentElement = Array.from(statValues).find(el => 
          el.textContent.includes('$450.00')
        );
        expect(totalSpentElement).not.toBeNull();
      });
    });

    it('should display remaining amount when under budget', async () => {
      const mockBudgets = [
        { id: 1, category: 'Food', limit: 500, spent: 300 }
      ];
      
      const mockSummary = {
        totalBudgeted: 500,
        totalSpent: 300,
        remaining: 200,
        progress: 60,
        budgetsOnTrack: 1,
        totalBudgets: 1
      };
      
      budgetApi.getBudgets.mockResolvedValue({ budgets: mockBudgets });
      budgetApi.getBudgetSummary.mockResolvedValue(mockSummary);
      
      const { container } = render(
        <BudgetSummaryPanel 
          year={2025} 
          month={11} 
          onManageBudgets={mockOnManageBudgets}
        />
      );
      
      await waitFor(() => {
        const statLabels = container.querySelectorAll('.stat-label');
        const remainingLabel = Array.from(statLabels).find(el => 
          el.textContent === 'Remaining'
        );
        expect(remainingLabel).not.toBeNull();
        
        const statValues = container.querySelectorAll('.stat-value');
        const remainingValue = Array.from(statValues).find(el => 
          el.textContent.includes('$200.00')
        );
        expect(remainingValue).not.toBeNull();
        expect(remainingValue.classList.contains('positive')).toBe(true);
      });
    });

    it('should display over budget amount when overspending', async () => {
      const mockBudgets = [
        { id: 1, category: 'Food', limit: 500, spent: 600 }
      ];
      
      const mockSummary = {
        totalBudgeted: 500,
        totalSpent: 600,
        remaining: -100,
        progress: 120,
        budgetsOnTrack: 0,
        totalBudgets: 1
      };
      
      budgetApi.getBudgets.mockResolvedValue({ budgets: mockBudgets });
      budgetApi.getBudgetSummary.mockResolvedValue(mockSummary);
      
      const { container } = render(
        <BudgetSummaryPanel 
          year={2025} 
          month={11} 
          onManageBudgets={mockOnManageBudgets}
        />
      );
      
      await waitFor(() => {
        const statLabels = container.querySelectorAll('.stat-label');
        const overBudgetLabel = Array.from(statLabels).find(el => 
          el.textContent === 'Over Budget'
        );
        expect(overBudgetLabel).not.toBeNull();
        
        const statValues = container.querySelectorAll('.stat-value');
        const overBudgetValue = Array.from(statValues).find(el => 
          el.textContent.includes('$100.00')
        );
        expect(overBudgetValue).not.toBeNull();
        expect(overBudgetValue.classList.contains('negative')).toBe(true);
      });
    });

    it('should display budgets on track count', async () => {
      const mockBudgets = [
        { id: 1, category: 'Food', limit: 500, spent: 300 },
        { id: 2, category: 'Gas', limit: 200, spent: 150 },
        { id: 3, category: 'Other', limit: 300, spent: 350 }
      ];
      
      const mockSummary = {
        totalBudgeted: 1000,
        totalSpent: 800,
        remaining: 200,
        progress: 80,
        budgetsOnTrack: 2,
        totalBudgets: 3
      };
      
      budgetApi.getBudgets.mockResolvedValue({ budgets: mockBudgets });
      budgetApi.getBudgetSummary.mockResolvedValue(mockSummary);
      
      const { container } = render(
        <BudgetSummaryPanel 
          year={2025} 
          month={11} 
          onManageBudgets={mockOnManageBudgets}
        />
      );
      
      await waitFor(() => {
        const statValues = container.querySelectorAll('.stat-value');
        const onTrackElement = Array.from(statValues).find(el => 
          el.textContent === '2 / 3'
        );
        expect(onTrackElement).not.toBeNull();
      });
    });

    it('should display overall progress percentage', async () => {
      const mockBudgets = [
        { id: 1, category: 'Food', limit: 500, spent: 400 }
      ];
      
      const mockSummary = {
        totalBudgeted: 500,
        totalSpent: 400,
        remaining: 100,
        progress: 80,
        budgetsOnTrack: 1,
        totalBudgets: 1
      };
      
      budgetApi.getBudgets.mockResolvedValue({ budgets: mockBudgets });
      budgetApi.getBudgetSummary.mockResolvedValue(mockSummary);
      
      const { container } = render(
        <BudgetSummaryPanel 
          year={2025} 
          month={11} 
          onManageBudgets={mockOnManageBudgets}
        />
      );
      
      await waitFor(() => {
        const progressPercentage = container.querySelector('.progress-percentage');
        expect(progressPercentage).not.toBeNull();
        expect(progressPercentage.textContent).toBe('80.0%');
      });
    });
  });

  describe('Category Cards Rendering', () => {
    it('should render budget card for each category', async () => {
      const mockBudgets = [
        { id: 1, category: 'Food', limit: 500, spent: 300 },
        { id: 2, category: 'Gas', limit: 200, spent: 150 },
        { id: 3, category: 'Other', limit: 300, spent: 250 }
      ];
      
      const mockSummary = {
        totalBudgeted: 1000,
        totalSpent: 700,
        remaining: 300,
        progress: 70,
        budgetsOnTrack: 3,
        totalBudgets: 3
      };
      
      budgetApi.getBudgets.mockResolvedValue({ budgets: mockBudgets });
      budgetApi.getBudgetSummary.mockResolvedValue(mockSummary);
      
      const { container } = render(
        <BudgetSummaryPanel 
          year={2025} 
          month={11} 
          onManageBudgets={mockOnManageBudgets}
        />
      );
      
      await waitFor(() => {
        const budgetCards = container.querySelectorAll('.budget-card');
        expect(budgetCards.length).toBe(3);
      });
    });

    it('should render correct category names', async () => {
      const mockBudgets = [
        { id: 1, category: 'Food', limit: 500, spent: 300 },
        { id: 2, category: 'Gas', limit: 200, spent: 150 }
      ];
      
      const mockSummary = {
        totalBudgeted: 700,
        totalSpent: 450,
        remaining: 250,
        progress: 64.3,
        budgetsOnTrack: 2,
        totalBudgets: 2
      };
      
      budgetApi.getBudgets.mockResolvedValue({ budgets: mockBudgets });
      budgetApi.getBudgetSummary.mockResolvedValue(mockSummary);
      
      render(
        <BudgetSummaryPanel 
          year={2025} 
          month={11} 
          onManageBudgets={mockOnManageBudgets}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument();
        expect(screen.getByText('Gas')).toBeInTheDocument();
      });
    });

    it('should pass correct props to budget cards', async () => {
      const mockBudgets = [
        { 
          id: 1, 
          category: 'Food', 
          limit: 500, 
          spent: 300,
          previousMonthSpent: 250
        }
      ];
      
      const mockSummary = {
        totalBudgeted: 500,
        totalSpent: 300,
        remaining: 200,
        progress: 60,
        budgetsOnTrack: 1,
        totalBudgets: 1
      };
      
      budgetApi.getBudgets.mockResolvedValue({ budgets: mockBudgets });
      budgetApi.getBudgetSummary.mockResolvedValue(mockSummary);
      
      const { container } = render(
        <BudgetSummaryPanel 
          year={2025} 
          month={11} 
          onManageBudgets={mockOnManageBudgets}
        />
      );
      
      await waitFor(() => {
        const budgetCard = container.querySelector('.budget-card');
        expect(budgetCard).not.toBeNull();
        
        // Verify the card displays the correct amounts
        expect(budgetCard.textContent).toContain('$500.00');
        expect(budgetCard.textContent).toContain('$300.00');
      });
    });

    it('should render empty state when no budgets exist', async () => {
      budgetApi.getBudgets.mockResolvedValue({ budgets: [] });
      budgetApi.getBudgetSummary.mockResolvedValue(null);
      
      const { container } = render(
        <BudgetSummaryPanel 
          year={2025} 
          month={11} 
          onManageBudgets={mockOnManageBudgets}
        />
      );
      
      await waitFor(() => {
        const emptyState = container.querySelector('.empty-state');
        expect(emptyState).not.toBeNull();
        expect(emptyState.textContent).toContain('No budgets set for this month');
      });
    });
  });

  describe('Modal Opening', () => {
    it('should call onManageBudgets when manage button is clicked', async () => {
      const mockBudgets = [
        { id: 1, category: 'Food', limit: 500, spent: 300 }
      ];
      
      const mockSummary = {
        totalBudgeted: 500,
        totalSpent: 300,
        remaining: 200,
        progress: 60,
        budgetsOnTrack: 1,
        totalBudgets: 1
      };
      
      budgetApi.getBudgets.mockResolvedValue({ budgets: mockBudgets });
      budgetApi.getBudgetSummary.mockResolvedValue(mockSummary);
      
      render(
        <BudgetSummaryPanel 
          year={2025} 
          month={11} 
          onManageBudgets={mockOnManageBudgets}
        />
      );
      
      await waitFor(() => {
        const manageButton = screen.getByText('Manage Budgets');
        expect(manageButton).toBeInTheDocument();
        manageButton.click();
        expect(mockOnManageBudgets).toHaveBeenCalledTimes(1);
      });
    });

    it('should show "Set Up Budgets" button in empty state', async () => {
      budgetApi.getBudgets.mockResolvedValue({ budgets: [] });
      budgetApi.getBudgetSummary.mockResolvedValue(null);
      
      render(
        <BudgetSummaryPanel 
          year={2025} 
          month={11} 
          onManageBudgets={mockOnManageBudgets}
        />
      );
      
      await waitFor(() => {
        const setupButton = screen.getByText('Set Up Budgets');
        expect(setupButton).toBeInTheDocument();
        setupButton.click();
        expect(mockOnManageBudgets).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Loading and Error States', () => {
    it('should display loading message while fetching data', () => {
      budgetApi.getBudgets.mockImplementation(() => new Promise(() => {}));
      budgetApi.getBudgetSummary.mockImplementation(() => new Promise(() => {}));
      
      const { container } = render(
        <BudgetSummaryPanel 
          year={2025} 
          month={11} 
          onManageBudgets={mockOnManageBudgets}
        />
      );
      
      const loadingMessage = container.querySelector('.loading-message');
      expect(loadingMessage).not.toBeNull();
      expect(loadingMessage.textContent).toContain('Loading budget data');
    });

    it('should display error message when fetch fails', async () => {
      budgetApi.getBudgets.mockRejectedValue(new Error('Network error'));
      budgetApi.getBudgetSummary.mockRejectedValue(new Error('Network error'));
      
      const { container } = render(
        <BudgetSummaryPanel 
          year={2025} 
          month={11} 
          onManageBudgets={mockOnManageBudgets}
        />
      );
      
      await waitFor(() => {
        const errorMessage = container.querySelector('.error-message');
        expect(errorMessage).not.toBeNull();
        expect(errorMessage.textContent).toContain('Network error');
      });
    });
  });

  describe('Refresh Trigger', () => {
    it('should refetch data when refreshTrigger changes', async () => {
      const mockBudgets = [
        { id: 1, category: 'Food', limit: 500, spent: 300 }
      ];
      
      const mockSummary = {
        totalBudgeted: 500,
        totalSpent: 300,
        remaining: 200,
        progress: 60,
        budgetsOnTrack: 1,
        totalBudgets: 1
      };
      
      budgetApi.getBudgets.mockResolvedValue({ budgets: mockBudgets });
      budgetApi.getBudgetSummary.mockResolvedValue(mockSummary);
      
      const { rerender } = render(
        <BudgetSummaryPanel 
          year={2025} 
          month={11} 
          onManageBudgets={mockOnManageBudgets}
          refreshTrigger={0}
        />
      );
      
      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalledTimes(1);
        expect(budgetApi.getBudgetSummary).toHaveBeenCalledTimes(1);
      });
      
      // Change refresh trigger
      rerender(
        <BudgetSummaryPanel 
          year={2025} 
          month={11} 
          onManageBudgets={mockOnManageBudgets}
          refreshTrigger={1}
        />
      );
      
      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalledTimes(2);
        expect(budgetApi.getBudgetSummary).toHaveBeenCalledTimes(2);
      });
    });
  });
});
