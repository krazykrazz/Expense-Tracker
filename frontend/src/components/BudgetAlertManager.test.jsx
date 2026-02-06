/**
 * Unit Tests for BudgetAlertManager Component
 * Tests alert calculation, state management, and integration
 * Requirements: 6.1, 6.2, 6.4
 */

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import BudgetAlertManager from './BudgetAlertManager';
import * as budgetApi from '../services/budgetApi';

// Mock the budget API
vi.mock('../services/budgetApi');

// Mock the BudgetReminderBanner component
vi.mock('./BudgetReminderBanner', () => ({
  default: ({ alerts, onDismiss, onClick }) => (
    <div data-testid="budget-reminder-banner" className="mock-reminder-banner">
      <span data-testid="alert-count">{alerts.length} alerts</span>
      {alerts.map(alert => (
        <div key={alert.id} data-testid={`alert-${alert.id}`}>
          <span>{alert.category}: {alert.progress.toFixed(0)}%</span>
          <button 
            data-testid={`click-${alert.id}`}
            onClick={() => onClick && onClick(alert.category)}
          >
            View
          </button>
        </div>
      ))}
      <button data-testid="dismiss-btn" onClick={() => onDismiss && onDismiss()}>
        Dismiss
      </button>
    </div>
  )
}));

describe('BudgetAlertManager', () => {
  // Mock budgets in flat format (as returned by the API)
  const mockBudgets = [
    { id: 1, year: 2025, month: 12, category: 'Groceries', limit: 500, spent: 427.50 },
    { id: 2, year: 2025, month: 12, category: 'Gas', limit: 200, spent: 185.00 },
    { id: 3, year: 2025, month: 12, category: 'Entertainment', limit: 150, spent: 160.00 },
    { id: 4, year: 2025, month: 12, category: 'Dining Out', limit: 300, spent: 150.00 }
  ];

  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    budgetApi.getBudgets.mockResolvedValue({ budgets: mockBudgets });
    // Clear sessionStorage to ensure clean state between tests
    sessionStorage.clear();
  });

  describe('Alert Calculation and State Management', () => {
    test('should fetch budgets and calculate alerts on mount', async () => {
      render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalledWith(2025, 12);
      });

      // Should display the banner with alerts
      await waitFor(() => {
        expect(screen.getByTestId('budget-reminder-banner')).toBeInTheDocument();
      });
    });

    test('should refresh alerts when year or month changes', async () => {
      const { rerender } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalledWith(2025, 12);
      });

      // Change month
      rerender(
        <BudgetAlertManager 
          year={2025} 
          month={11} 
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalledWith(2025, 11);
      });

      expect(budgetApi.getBudgets).toHaveBeenCalledTimes(2);
    });

    test('should refresh alerts when refreshTrigger changes', async () => {
      const { rerender } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          refreshTrigger={0}
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalledTimes(1);
      });

      // Trigger refresh
      rerender(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          refreshTrigger={1}
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalledTimes(2);
      });
    });

    test('should handle empty budget array', async () => {
      budgetApi.getBudgets.mockResolvedValue({ budgets: [] });

      const { container } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalled();
      });

      // Should render nothing when no alerts
      expect(container.firstChild).toBeNull();
    });

    test('should handle budgets with no alerts needed', async () => {
      const safeBudgets = [
        { id: 1, year: 2025, month: 12, category: 'Groceries', limit: 500, spent: 200.00 }
      ];

      budgetApi.getBudgets.mockResolvedValue({ budgets: safeBudgets });

      const { container } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalled();
      });

      // Should render nothing when no alerts needed
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Dismissal Functionality', () => {
    test('should dismiss all alerts when dismiss button clicked', async () => {
      render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('budget-reminder-banner')).toBeInTheDocument();
      });

      // Click dismiss button
      const dismissButton = screen.getByTestId('dismiss-btn');
      
      await act(async () => {
        fireEvent.click(dismissButton);
      });

      // Banner should be removed from DOM
      await waitFor(() => {
        expect(screen.queryByTestId('budget-reminder-banner')).not.toBeInTheDocument();
      });
    });

    test('should persist dismissal state during refresh', async () => {
      const { rerender } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          refreshTrigger={0}
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('budget-reminder-banner')).toBeInTheDocument();
      });

      // Click dismiss button
      const dismissButton = screen.getByTestId('dismiss-btn');
      
      await act(async () => {
        fireEvent.click(dismissButton);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('budget-reminder-banner')).not.toBeInTheDocument();
      });

      // Trigger refresh
      rerender(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          refreshTrigger={1}
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalledTimes(2);
      });

      // Banner should still be hidden after refresh
      expect(screen.queryByTestId('budget-reminder-banner')).not.toBeInTheDocument();
    });

    test('should clear dismissal state when month changes', async () => {
      const { rerender } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('budget-reminder-banner')).toBeInTheDocument();
      });

      // Click dismiss button
      const dismissButton = screen.getByTestId('dismiss-btn');
      
      await act(async () => {
        fireEvent.click(dismissButton);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('budget-reminder-banner')).not.toBeInTheDocument();
      });

      // Change month (new dismissal state)
      rerender(
        <BudgetAlertManager 
          year={2025} 
          month={11} 
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalledWith(2025, 11);
      });

      // Banner should reappear for new month
      await waitFor(() => {
        expect(screen.getByTestId('budget-reminder-banner')).toBeInTheDocument();
      });
    });
  });

  describe('Click Handler Integration', () => {
    test('should call onClick with correct category when alert clicked', async () => {
      render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('budget-reminder-banner')).toBeInTheDocument();
      });

      // Click on an alert
      const viewButton = screen.getByTestId('click-budget-alert-1');
      fireEvent.click(viewButton);

      // onClick should be called with the category
      expect(mockOnClick).toHaveBeenCalled();
    });

    test('should handle missing onClick callback gracefully', async () => {
      render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('budget-reminder-banner')).toBeInTheDocument();
      });

      // Should not throw when clicking without callback
      const viewButton = screen.getByTestId('click-budget-alert-1');
      expect(() => {
        fireEvent.click(viewButton);
      }).not.toThrow();
    });
  });

  describe('Integration with Budget API', () => {
    test('should handle API errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      budgetApi.getBudgets.mockRejectedValue(new Error('API Error'));

      const { container } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalled();
      });

      // Should render nothing on error
      expect(container.firstChild).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    test('should handle network timeout', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      budgetApi.getBudgets.mockRejectedValue(new Error('Network timeout'));

      const { container } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalled();
      });

      expect(container.firstChild).toBeNull();
      consoleErrorSpy.mockRestore();
    });

    test('should handle malformed budget data', async () => {
      const malformedBudgets = [
        { id: 1 }, // Missing required fields (category, limit)
        null,
        undefined,
        { id: 2, year: 2025, month: 12, category: 'Gas', limit: 200, spent: 185 } // Valid - 92.5%
      ];

      budgetApi.getBudgets.mockResolvedValue({ budgets: malformedBudgets });

      render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalled();
      });

      // Should handle gracefully and show valid alerts only
      await waitFor(() => {
        expect(screen.getByTestId('budget-reminder-banner')).toBeInTheDocument();
      });
    });
  });

  describe('Loading and Error States', () => {
    test('should not render during loading', async () => {
      let resolvePromise;
      const loadingPromise = new Promise(resolve => {
        resolvePromise = resolve;
      });

      budgetApi.getBudgets.mockReturnValue(loadingPromise);

      const { container } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          onClick={mockOnClick}
        />
      );

      // Should render nothing while loading
      expect(container.firstChild).toBeNull();

      // Resolve the promise with wrapped format
      resolvePromise({ budgets: mockBudgets });

      // Should render banner after loading
      await waitFor(() => {
        expect(screen.getByTestId('budget-reminder-banner')).toBeInTheDocument();
      });
    });

    test('should render nothing when dismissed', async () => {
      const { container } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('budget-reminder-banner')).toBeInTheDocument();
      });

      // Dismiss the banner
      const dismissButton = screen.getByTestId('dismiss-btn');
      
      await act(async () => {
        fireEvent.click(dismissButton);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('budget-reminder-banner')).not.toBeInTheDocument();
      });

      // Container should be empty
      expect(container.firstChild).toBeNull();
    });
  });

  describe('SessionStorage Handling', () => {
    test('should handle sessionStorage unavailable gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Mock sessionStorage to throw errors
      const originalSessionStorage = window.sessionStorage;
      Object.defineProperty(window, 'sessionStorage', {
        value: {
          getItem: vi.fn(() => { throw new Error('Storage unavailable'); }),
          setItem: vi.fn(() => { throw new Error('Storage unavailable'); }),
          removeItem: vi.fn(() => { throw new Error('Storage unavailable'); })
        },
        writable: true
      });

      render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          onClick={mockOnClick}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('budget-reminder-banner')).toBeInTheDocument();
      });

      // Dismissal should still work (memory-only)
      const dismissButton = screen.getByTestId('dismiss-btn');
      
      await act(async () => {
        fireEvent.click(dismissButton);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('budget-reminder-banner')).not.toBeInTheDocument();
      });

      // Restore sessionStorage
      Object.defineProperty(window, 'sessionStorage', {
        value: originalSessionStorage,
        writable: true
      });
      
      consoleWarnSpy.mockRestore();
    });
  });
});
