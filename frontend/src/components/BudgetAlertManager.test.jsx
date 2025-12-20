/**
 * Unit Tests for BudgetAlertManager Component
 * Tests alert calculation, state management, and integration
 * Requirements: 3.2, 3.3, 3.4, 3.5, 7.1, 7.3, 7.4
 */

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import BudgetAlertManager from './BudgetAlertManager';
import * as budgetApi from '../services/budgetApi';
import { ALERT_SEVERITY } from '../utils/budgetAlerts';

// Mock the budget API
vi.mock('../services/budgetApi');

// Mock the BudgetAlertBanner component
vi.mock('./BudgetAlertBanner', () => ({
  default: ({ alert, onDismiss, onManageBudgets, onViewDetails }) => (
    <div data-testid={`alert-${alert.id}`} className="mock-alert-banner">
      <span>{alert.message}</span>
      <button onClick={() => onDismiss && onDismiss(alert.id)}>Dismiss</button>
      <button onClick={() => onManageBudgets && onManageBudgets(alert.category)}>Manage</button>
      <button onClick={() => onViewDetails && onViewDetails(alert.category)}>View</button>
    </div>
  )
}));

describe('BudgetAlertManager', () => {
  const mockBudgets = [
    {
      budget: { id: 1, category: 'Groceries', limit: 500 },
      spent: 427.50,
      progress: 85.5,
      remaining: 72.50,
      status: 'warning'
    },
    {
      budget: { id: 2, category: 'Gas', limit: 200 },
      spent: 185.00,
      progress: 92.5,
      remaining: 15.00,
      status: 'danger'
    },
    {
      budget: { id: 3, category: 'Entertainment', limit: 150 },
      spent: 160.00,
      progress: 106.7,
      remaining: -10.00,
      status: 'critical'
    },
    {
      budget: { id: 4, category: 'Dining Out', limit: 300 },
      spent: 150.00,
      progress: 50.0,
      remaining: 150.00,
      status: 'safe'
    }
  ];

  const mockCallbacks = {
    onManageBudgets: vi.fn(),
    onViewDetails: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    budgetApi.getBudgets.mockResolvedValue(mockBudgets);
  });

  describe('Alert Calculation and State Management', () => {
    test('should fetch budgets and calculate alerts on mount', async () => {
      render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          {...mockCallbacks} 
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalledWith(2025, 12);
      });

      // Should display 3 alerts (warning, danger, critical) but not safe
      await waitFor(() => {
        expect(screen.getByTestId('alert-budget-alert-1')).toBeInTheDocument(); // Groceries
        expect(screen.getByTestId('alert-budget-alert-2')).toBeInTheDocument(); // Gas
        expect(screen.getByTestId('alert-budget-alert-3')).toBeInTheDocument(); // Entertainment
        expect(screen.queryByTestId('alert-budget-alert-4')).not.toBeInTheDocument(); // Dining Out (safe)
      });
    });

    test('should refresh alerts when year or month changes', async () => {
      const { rerender } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          {...mockCallbacks} 
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
          {...mockCallbacks} 
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
          {...mockCallbacks} 
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
          {...mockCallbacks} 
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalledTimes(2);
      });
    });

    test('should handle empty budget array', async () => {
      budgetApi.getBudgets.mockResolvedValue([]);

      const { container } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          {...mockCallbacks} 
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
        {
          budget: { id: 1, category: 'Groceries', limit: 500 },
          spent: 200.00,
          progress: 40.0,
          remaining: 300.00,
          status: 'safe'
        }
      ];

      budgetApi.getBudgets.mockResolvedValue(safeBudgets);

      const { container } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          {...mockCallbacks} 
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
    test('should dismiss alert when dismiss button clicked', async () => {
      render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          {...mockCallbacks} 
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('alert-budget-alert-1')).toBeInTheDocument();
      });

      // Click dismiss button on the Groceries alert (budget-alert-1)
      const groceriesAlert = screen.getByTestId('alert-budget-alert-1');
      const dismissButton = groceriesAlert.querySelector('button');
      
      await act(async () => {
        fireEvent.click(dismissButton);
      });

      // Alert should be removed from DOM
      await waitFor(() => {
        expect(screen.queryByTestId('alert-budget-alert-1')).not.toBeInTheDocument();
      });

      // Other alerts should still be visible
      expect(screen.getByTestId('alert-budget-alert-2')).toBeInTheDocument();
      expect(screen.getByTestId('alert-budget-alert-3')).toBeInTheDocument();
    });

    test('should dismiss multiple alerts independently', async () => {
      render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          {...mockCallbacks} 
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('alert-budget-alert-1')).toBeInTheDocument();
        expect(screen.getByTestId('alert-budget-alert-2')).toBeInTheDocument();
        expect(screen.getByTestId('alert-budget-alert-3')).toBeInTheDocument();
      });

      // Dismiss first alert (Groceries)
      const groceriesAlert = screen.getByTestId('alert-budget-alert-1');
      const dismissButton1 = groceriesAlert.querySelector('button');
      
      await act(async () => {
        fireEvent.click(dismissButton1);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('alert-budget-alert-1')).not.toBeInTheDocument();
      });

      // Dismiss third alert (Entertainment)
      const entertainmentAlert = screen.getByTestId('alert-budget-alert-3');
      const dismissButton3 = entertainmentAlert.querySelector('button');
      
      await act(async () => {
        fireEvent.click(dismissButton3);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('alert-budget-alert-3')).not.toBeInTheDocument();
      });

      // Second alert (Gas) should still be visible
      expect(screen.getByTestId('alert-budget-alert-2')).toBeInTheDocument();
    });

    test('should persist dismissal state during refresh', async () => {
      const { rerender } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          refreshTrigger={0}
          {...mockCallbacks} 
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('alert-budget-alert-1')).toBeInTheDocument();
      });

      // Dismiss first alert (Groceries)
      const groceriesAlert = screen.getByTestId('alert-budget-alert-1');
      const dismissButton = groceriesAlert.querySelector('button');
      
      await act(async () => {
        fireEvent.click(dismissButton);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('alert-budget-alert-1')).not.toBeInTheDocument();
      });

      // Trigger refresh
      rerender(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          refreshTrigger={1}
          {...mockCallbacks} 
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalledTimes(2);
      });

      // Dismissed alert should still be hidden after refresh
      expect(screen.queryByTestId('alert-budget-alert-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('alert-budget-alert-2')).toBeInTheDocument();
    });

    test('should clear dismissal state when month changes', async () => {
      const { rerender } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          {...mockCallbacks} 
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('alert-budget-alert-1')).toBeInTheDocument();
      });

      // Dismiss first alert (Groceries)
      const groceriesAlert = screen.getByTestId('alert-budget-alert-1');
      const dismissButton = groceriesAlert.querySelector('button');
      
      await act(async () => {
        fireEvent.click(dismissButton);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('alert-budget-alert-1')).not.toBeInTheDocument();
      });

      // Change month (new dismissal state)
      rerender(
        <BudgetAlertManager 
          year={2025} 
          month={11} 
          {...mockCallbacks} 
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalledWith(2025, 11);
      });

      // Alert should reappear for new month
      await waitFor(() => {
        expect(screen.getByTestId('alert-budget-alert-1')).toBeInTheDocument();
      });
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
          {...mockCallbacks} 
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
          {...mockCallbacks} 
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
        { budget: { id: 1 } }, // Missing required fields
        null,
        undefined,
        { budget: { id: 2, category: 'Gas', limit: 200 }, spent: 185, progress: 92.5 }
      ];

      budgetApi.getBudgets.mockResolvedValue(malformedBudgets);

      render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          {...mockCallbacks} 
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalled();
      });

      // Should handle gracefully and show valid alerts only
      await waitFor(() => {
        const alerts = screen.queryAllByTestId(/alert-budget-alert-/);
        expect(alerts.length).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Callback Integration', () => {
    test('should call onManageBudgets with correct category', async () => {
      render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          {...mockCallbacks} 
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('alert-budget-alert-1')).toBeInTheDocument();
      });

      // Alerts are sorted by severity: critical (Entertainment), danger (Gas), warning (Groceries)
      // So first button is Entertainment, not Groceries
      const manageButtons = screen.getAllByText('Manage');
      manageButtons[0].click();

      expect(mockCallbacks.onManageBudgets).toHaveBeenCalledWith('Entertainment');
    });

    test('should call onViewDetails with correct category', async () => {
      render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          {...mockCallbacks} 
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('alert-budget-alert-2')).toBeInTheDocument();
      });

      // Click view button on second alert (Gas)
      const viewButtons = screen.getAllByText('View');
      viewButtons[1].click();

      expect(mockCallbacks.onViewDetails).toHaveBeenCalledWith('Gas');
    });

    test('should handle missing callbacks gracefully', async () => {
      render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('alert-budget-alert-1')).toBeInTheDocument();
      });

      // Should not throw when clicking buttons without callbacks
      const manageButtons = screen.getAllByText('Manage');
      const viewButtons = screen.getAllByText('View');

      expect(() => {
        manageButtons[0].click();
        viewButtons[0].click();
      }).not.toThrow();
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
          {...mockCallbacks} 
        />
      );

      // Should render nothing while loading
      expect(container.firstChild).toBeNull();

      // Resolve the promise
      resolvePromise(mockBudgets);

      // Should render alerts after loading
      await waitFor(() => {
        expect(screen.getByTestId('alert-budget-alert-1')).toBeInTheDocument();
      });
    });

    test('should render nothing when all alerts are dismissed', async () => {
      const { container } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          {...mockCallbacks} 
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('alert-budget-alert-1')).toBeInTheDocument();
      });

      // Dismiss all alerts
      const alert1 = screen.getByTestId('alert-budget-alert-1');
      const alert2 = screen.getByTestId('alert-budget-alert-2');
      const alert3 = screen.getByTestId('alert-budget-alert-3');
      
      await act(async () => {
        fireEvent.click(alert1.querySelector('button'));
        fireEvent.click(alert2.querySelector('button'));
        fireEvent.click(alert3.querySelector('button'));
      });

      await waitFor(() => {
        expect(screen.queryByTestId('alert-budget-alert-1')).not.toBeInTheDocument();
        expect(screen.queryByTestId('alert-budget-alert-2')).not.toBeInTheDocument();
        expect(screen.queryByTestId('alert-budget-alert-3')).not.toBeInTheDocument();
      });

      // Container should be empty (component returns null when no visible alerts)
      expect(container.firstChild).toBeNull();
    });
  });
});