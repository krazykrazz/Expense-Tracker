import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BudgetHistoryView from './BudgetHistoryView';
import * as budgetApi from '../services/budgetApi';

// Mock the budget API
vi.mock('../services/budgetApi');

describe('BudgetHistoryView', () => {
  const mockOnClose = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Data Rendering', () => {
    it('should render historical data for multiple categories', async () => {
      const mockHistoryData = {
        period: {
          start: '2025-06-01',
          end: '2025-11-30',
          months: 6
        },
        categories: {
          Food: {
            history: [
              { year: 2025, month: 11, budgeted: 500, spent: 450, met: true },
              { year: 2025, month: 10, budgeted: 500, spent: 520, met: false }
            ],
            successRate: 50,
            averageBudgeted: 500,
            averageSpent: 485
          },
          Gas: {
            history: [
              { year: 2025, month: 11, budgeted: 200, spent: 180, met: true },
              { year: 2025, month: 10, budgeted: 200, spent: 190, met: true }
            ],
            successRate: 100,
            averageBudgeted: 200,
            averageSpent: 185
          }
        }
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        // Check for category titles in the monthly breakdown section
        const categoryTitles = container.querySelectorAll('.category-title');
        const categoryNames = Array.from(categoryTitles).map(el => el.textContent);
        expect(categoryNames).toContain('Food');
        expect(categoryNames).toContain('Gas');
      });
    });

    it('should display average budgeted amounts correctly', async () => {
      const mockHistoryData = {
        period: {
          start: '2025-06-01',
          end: '2025-11-30',
          months: 6
        },
        categories: {
          Food: {
            history: [
              { year: 2025, month: 11, budgeted: 500, spent: 450, met: true }
            ],
            successRate: 100,
            averageBudgeted: 500,
            averageSpent: 450
          }
        }
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        const amountCells = container.querySelectorAll('.amount-cell');
        const avgBudgetedCell = Array.from(amountCells).find(el => 
          el.textContent.includes('$500.00')
        );
        expect(avgBudgetedCell).not.toBeNull();
      });
    });

    it('should display average spent amounts correctly', async () => {
      const mockHistoryData = {
        period: {
          start: '2025-06-01',
          end: '2025-11-30',
          months: 6
        },
        categories: {
          Food: {
            history: [
              { year: 2025, month: 11, budgeted: 500, spent: 450, met: true }
            ],
            successRate: 100,
            averageBudgeted: 500,
            averageSpent: 450
          }
        }
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        const amountCells = container.querySelectorAll('.amount-cell');
        const avgSpentCell = Array.from(amountCells).find(el => 
          el.textContent.includes('$450.00')
        );
        expect(avgSpentCell).not.toBeNull();
      });
    });

    it('should display monthly breakdown for each category', async () => {
      const mockHistoryData = {
        period: {
          start: '2025-10-01',
          end: '2025-11-30',
          months: 2
        },
        categories: {
          Food: {
            history: [
              { year: 2025, month: 11, budgeted: 500, spent: 450, met: true },
              { year: 2025, month: 10, budgeted: 500, spent: 520, met: false }
            ],
            successRate: 50,
            averageBudgeted: 500,
            averageSpent: 485
          }
        }
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        const monthlyTables = container.querySelectorAll('.monthly-table');
        expect(monthlyTables.length).toBeGreaterThan(0);
        
        // Check for month labels
        expect(screen.getByText(/Nov 2025/)).toBeInTheDocument();
        expect(screen.getByText(/Oct 2025/)).toBeInTheDocument();
      });
    });

    it('should show "No budget" for months without budgets', async () => {
      const mockHistoryData = {
        period: {
          start: '2025-11-01',
          end: '2025-11-30',
          months: 1
        },
        categories: {
          Food: {
            history: [
              { year: 2025, month: 11, budgeted: 0, spent: 100, met: false }
            ],
            successRate: 0,
            averageBudgeted: 0,
            averageSpent: 100
          }
        }
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        // Use getAllByText since "No budget" appears twice (in budgeted column and status badge)
        const noBudgetElements = screen.getAllByText('No budget');
        expect(noBudgetElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Period Selection', () => {
    it('should default to 6 months period', async () => {
      const mockHistoryData = {
        period: { start: '2025-06-01', end: '2025-11-30', months: 6 },
        categories: {}
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        const activeButton = container.querySelector('.period-btn.active');
        expect(activeButton).not.toBeNull();
        expect(activeButton.textContent).toBe('6 Months');
      });
    });

    it('should fetch 3 months data when 3 months button is clicked', async () => {
      const mockHistoryData6 = {
        period: { start: '2025-06-01', end: '2025-11-30', months: 6 },
        categories: {}
      };
      
      const mockHistoryData3 = {
        period: { start: '2025-09-01', end: '2025-11-30', months: 3 },
        categories: {}
      };
      
      budgetApi.getBudgetHistory
        .mockResolvedValueOnce(mockHistoryData6)
        .mockResolvedValueOnce(mockHistoryData3);
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        expect(budgetApi.getBudgetHistory).toHaveBeenCalledWith(2025, 11, 6);
      });
      
      const threeMonthsButton = Array.from(container.querySelectorAll('.period-btn'))
        .find(btn => btn.textContent === '3 Months');
      
      fireEvent.click(threeMonthsButton);
      
      await waitFor(() => {
        expect(budgetApi.getBudgetHistory).toHaveBeenCalledWith(2025, 11, 3);
      });
    });

    it('should fetch 12 months data when 12 months button is clicked', async () => {
      const mockHistoryData6 = {
        period: { start: '2025-06-01', end: '2025-11-30', months: 6 },
        categories: {}
      };
      
      const mockHistoryData12 = {
        period: { start: '2024-12-01', end: '2025-11-30', months: 12 },
        categories: {}
      };
      
      budgetApi.getBudgetHistory
        .mockResolvedValueOnce(mockHistoryData6)
        .mockResolvedValueOnce(mockHistoryData12);
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        expect(budgetApi.getBudgetHistory).toHaveBeenCalledWith(2025, 11, 6);
      });
      
      const twelveMonthsButton = Array.from(container.querySelectorAll('.period-btn'))
        .find(btn => btn.textContent === '12 Months');
      
      fireEvent.click(twelveMonthsButton);
      
      await waitFor(() => {
        expect(budgetApi.getBudgetHistory).toHaveBeenCalledWith(2025, 11, 12);
      });
    });

    it('should update active button when period changes', async () => {
      const mockHistoryData = {
        period: { start: '2025-06-01', end: '2025-11-30', months: 6 },
        categories: {}
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        const activeButton = container.querySelector('.period-btn.active');
        expect(activeButton.textContent).toBe('6 Months');
      });
      
      const threeMonthsButton = Array.from(container.querySelectorAll('.period-btn'))
        .find(btn => btn.textContent === '3 Months');
      
      fireEvent.click(threeMonthsButton);
      
      await waitFor(() => {
        const activeButton = container.querySelector('.period-btn.active');
        expect(activeButton.textContent).toBe('3 Months');
      });
    });
  });

  describe('Success Rate Display', () => {
    it('should display success rate as percentage', async () => {
      const mockHistoryData = {
        period: { start: '2025-06-01', end: '2025-11-30', months: 6 },
        categories: {
          Food: {
            history: [
              { year: 2025, month: 11, budgeted: 500, spent: 450, met: true }
            ],
            successRate: 83.3,
            averageBudgeted: 500,
            averageSpent: 450
          }
        }
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        const successRate = container.querySelector('.success-rate');
        expect(successRate).not.toBeNull();
        expect(successRate.textContent).toBe('83.3%');
      });
    });

    it('should apply "good" class for success rate >= 80%', async () => {
      const mockHistoryData = {
        period: { start: '2025-06-01', end: '2025-11-30', months: 6 },
        categories: {
          Food: {
            history: [
              { year: 2025, month: 11, budgeted: 500, spent: 450, met: true }
            ],
            successRate: 85,
            averageBudgeted: 500,
            averageSpent: 450
          }
        }
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        const successRate = container.querySelector('.success-rate');
        expect(successRate.classList.contains('good')).toBe(true);
      });
    });

    it('should apply "moderate" class for success rate between 50% and 79%', async () => {
      const mockHistoryData = {
        period: { start: '2025-06-01', end: '2025-11-30', months: 6 },
        categories: {
          Food: {
            history: [
              { year: 2025, month: 11, budgeted: 500, spent: 450, met: true }
            ],
            successRate: 65,
            averageBudgeted: 500,
            averageSpent: 450
          }
        }
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        const successRate = container.querySelector('.success-rate');
        expect(successRate.classList.contains('moderate')).toBe(true);
      });
    });

    it('should apply "poor" class for success rate < 50%', async () => {
      const mockHistoryData = {
        period: { start: '2025-06-01', end: '2025-11-30', months: 6 },
        categories: {
          Food: {
            history: [
              { year: 2025, month: 11, budgeted: 500, spent: 450, met: true }
            ],
            successRate: 30,
            averageBudgeted: 500,
            averageSpent: 450
          }
        }
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        const successRate = container.querySelector('.success-rate');
        expect(successRate.classList.contains('poor')).toBe(true);
      });
    });
  });

  describe('Loading and Error States', () => {
    it('should display loading message while fetching data', () => {
      budgetApi.getBudgetHistory.mockImplementation(() => new Promise(() => {}));
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      const loadingMessage = container.querySelector('.loading-message');
      expect(loadingMessage).not.toBeNull();
      expect(loadingMessage.textContent).toContain('Loading budget history');
    });

    it('should display error message when fetch fails', async () => {
      budgetApi.getBudgetHistory.mockRejectedValue(new Error('Network error'));
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        const errorMessage = container.querySelector('.error-message');
        expect(errorMessage).not.toBeNull();
        expect(errorMessage.textContent).toContain('Network error');
      });
    });

    it('should display empty state when no history data exists', async () => {
      const mockHistoryData = {
        period: { start: '2025-06-01', end: '2025-11-30', months: 6 },
        categories: {}
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        const emptyState = container.querySelector('.empty-state');
        expect(emptyState).not.toBeNull();
        expect(emptyState.textContent).toContain('No budget history available');
      });
    });
  });

  describe('Modal Interaction', () => {
    it('should call onClose when close button is clicked', async () => {
      const mockHistoryData = {
        period: { start: '2025-06-01', end: '2025-11-30', months: 6 },
        categories: {}
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        const closeButton = container.querySelector('.close-btn');
        expect(closeButton).not.toBeNull();
      });
      
      const closeButton = container.querySelector('.close-btn');
      fireEvent.click(closeButton);
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when clicking outside modal', async () => {
      const mockHistoryData = {
        period: { start: '2025-06-01', end: '2025-11-30', months: 6 },
        categories: {}
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        const modal = container.querySelector('.budget-history-modal');
        expect(modal).not.toBeNull();
      });
      
      const modal = container.querySelector('.budget-history-modal');
      fireEvent.click(modal);
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClose when clicking inside modal content', async () => {
      const mockHistoryData = {
        period: { start: '2025-06-01', end: '2025-11-30', months: 6 },
        categories: {}
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      const { container } = render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        const modalContent = container.querySelector('.budget-history-content');
        expect(modalContent).not.toBeNull();
      });
      
      const modalContent = container.querySelector('.budget-history-content');
      fireEvent.click(modalContent);
      
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('CSV Export', () => {
    it('should render export button when data exists', async () => {
      const mockHistoryData = {
        period: { start: '2025-06-01', end: '2025-11-30', months: 6 },
        categories: {
          Food: {
            history: [
              { year: 2025, month: 11, budgeted: 500, spent: 450, met: true }
            ],
            successRate: 100,
            averageBudgeted: 500,
            averageSpent: 450
          }
        }
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText(/Export to CSV/)).toBeInTheDocument();
      });
    });

    it('should not render export button when no data exists', async () => {
      const mockHistoryData = {
        period: { start: '2025-06-01', end: '2025-11-30', months: 6 },
        categories: {}
      };
      
      budgetApi.getBudgetHistory.mockResolvedValue(mockHistoryData);
      
      render(
        <BudgetHistoryView 
          year={2025} 
          month={11} 
          onClose={mockOnClose}
        />
      );
      
      await waitFor(() => {
        expect(screen.queryByText(/Export to CSV/)).not.toBeInTheDocument();
      });
    });
  });
});
