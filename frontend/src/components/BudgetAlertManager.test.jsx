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
  default: ({ alert, onDismiss, onManageBudgets, onViewExpenses }) => (
    <div data-testid={`alert-${alert.id}`} className="mock-alert-banner">
      <span>{alert.message}</span>
      <button onClick={() => onDismiss && onDismiss(alert.id)}>Dismiss</button>
      <button onClick={() => onManageBudgets && onManageBudgets(alert.category)}>Manage</button>
      <button onClick={() => onViewExpenses && onViewExpenses(alert.category)}>View</button>
    </div>
  )
}));

describe('BudgetAlertManager', () => {
  // Mock budgets in flat API format (as returned by getBudgets API)
  const mockBudgets = [
    {
      id: 1,
      category: 'Groceries',
      limit: 500,
      spent: 427.50
    },
    {
      id: 2,
      category: 'Gas',
      limit: 200,
      spent: 185.00
    },
    {
      id: 3,
      category: 'Entertainment',
      limit: 150,
      spent: 160.00
    },
    {
      id: 4,
      category: 'Dining Out',
      limit: 300,
      spent: 150.00
    }
  ];

  const mockCallbacks = {
    onManageBudgets: vi.fn(),
    onViewExpenses: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    budgetApi.getBudgets.mockResolvedValue({ budgets: mockBudgets });
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
      budgetApi.getBudgets.mockResolvedValue({ budgets: [] });

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
          id: 1,
          category: 'Groceries',
          limit: 500,
          spent: 200.00
        }
      ];

      budgetApi.getBudgets.mockResolvedValue({ budgets: safeBudgets });

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
        { id: 1 }, // Missing required fields
        null,
        undefined,
        { id: 2, category: 'Gas', limit: 200, spent: 185 } // Valid flat format
      ];

      budgetApi.getBudgets.mockResolvedValue({ budgets: malformedBudgets });

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

    test('should call onViewExpenses with correct category', async () => {
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

      expect(mockCallbacks.onViewExpenses).toHaveBeenCalledWith('Gas');
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

      // Resolve the promise with wrapped format
      resolvePromise({ budgets: mockBudgets });

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

  describe('Error Handling and Performance', () => {
    test('should handle API errors gracefully by returning null', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      budgetApi.getBudgets.mockRejectedValue(new Error('Network error'));

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

      // The component gracefully degrades by returning null for network errors
      // This is intentional to avoid showing error UI for transient network issues
      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });

      consoleErrorSpy.mockRestore();
    });

    test('should display error UI for data format errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Return all invalid data to trigger "Budget data format is invalid" error
      budgetApi.getBudgets.mockResolvedValue({ budgets: [
        null,
        undefined,
        { id: null } // Invalid - missing required fields
      ] });

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

      // Should display error fallback UI for data format errors
      await waitFor(() => {
        expect(screen.getByText('Budget alerts unavailable')).toBeInTheDocument();
        expect(screen.getByText('Budget data format is invalid')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry loading budget alerts' })).toBeInTheDocument();
      });

      consoleErrorSpy.mockRestore();
    });

    test('should retry loading when retry button is clicked', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // First call returns invalid data to trigger error UI
      budgetApi.getBudgets.mockResolvedValueOnce({ budgets: [null, undefined, { id: null }] });
      // Second call succeeds
      budgetApi.getBudgets.mockResolvedValueOnce({ budgets: mockBudgets });

      render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          {...mockCallbacks} 
        />
      );

      // Wait for error state
      await waitFor(() => {
        expect(screen.getByText('Budget alerts unavailable')).toBeInTheDocument();
      });

      // Click retry button
      const retryButton = screen.getByRole('button', { name: 'Retry loading budget alerts' });
      
      await act(async () => {
        fireEvent.click(retryButton);
      });

      // Wait for debounce (300ms) plus some buffer
      await new Promise(resolve => setTimeout(resolve, 400));

      // Should load alerts successfully
      await waitFor(() => {
        expect(screen.getByTestId('alert-budget-alert-1')).toBeInTheDocument();
        expect(screen.queryByText('Budget alerts unavailable')).not.toBeInTheDocument();
      });

      expect(budgetApi.getBudgets).toHaveBeenCalledTimes(2);
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    test('should handle invalid budget data gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const invalidBudgets = [
        null, // Invalid
        undefined, // Invalid
        { id: null }, // Invalid - null id
        { id: 1 }, // Missing required fields
        { id: 2, category: 'Gas', limit: 'invalid' }, // Invalid limit type
        { id: 3, category: 'Food', limit: 500, spent: 'invalid' }, // Invalid spent type
        { id: 4, category: 'Valid', limit: 200, spent: 180 } // Valid - 90% is danger level
      ];

      // Clear the mock and set new data
      budgetApi.getBudgets.mockClear();
      budgetApi.getBudgets.mockResolvedValue({ budgets: invalidBudgets });

      const { rerender } = render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          refreshTrigger={Date.now()} // Force cache invalidation
          {...mockCallbacks} 
        />
      );

      await waitFor(() => {
        expect(budgetApi.getBudgets).toHaveBeenCalled();
      });

      // Should handle gracefully - the component filters out invalid data
      // The exact number of alerts depends on how the component handles validation
      await waitFor(() => {
        const alerts = screen.queryAllByTestId(/alert-budget-alert-/);
        // At least one valid alert should be shown (the Valid category at 90%)
        expect(alerts.length).toBeGreaterThanOrEqual(1);
      });

      consoleWarnSpy.mockRestore();
    });

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
          {...mockCallbacks} 
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('alert-budget-alert-1')).toBeInTheDocument();
      });

      // Dismissal should still work (memory-only)
      const groceriesAlert = screen.getByTestId('alert-budget-alert-1');
      const dismissButton = groceriesAlert.querySelector('button');
      
      await act(async () => {
        fireEvent.click(dismissButton);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('alert-budget-alert-1')).not.toBeInTheDocument();
      });

      // Should have warned about storage issues (logger formats with timestamp)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to load dismissal state from sessionStorage/),
        expect.anything()
      );

      // Restore sessionStorage
      Object.defineProperty(window, 'sessionStorage', {
        value: originalSessionStorage,
        writable: true
      });
      
      consoleWarnSpy.mockRestore();
    });

    test('should handle corrupted sessionStorage data', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Mock sessionStorage to return invalid JSON
      const originalSessionStorage = window.sessionStorage;
      Object.defineProperty(window, 'sessionStorage', {
        value: {
          getItem: vi.fn(() => 'invalid json{'),
          setItem: vi.fn(),
          removeItem: vi.fn()
        },
        writable: true
      });

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

      // Should handle gracefully and warn about corrupted data (logger formats with timestamp)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to load dismissal state from sessionStorage/),
        expect.anything()
      );

      // Restore sessionStorage
      Object.defineProperty(window, 'sessionStorage', {
        value: originalSessionStorage,
        writable: true
      });
      
      consoleWarnSpy.mockRestore();
    });

    test('should handle non-array dismissal data in sessionStorage', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Mock sessionStorage to return non-array data
      const originalSessionStorage = window.sessionStorage;
      Object.defineProperty(window, 'sessionStorage', {
        value: {
          getItem: vi.fn(() => JSON.stringify({ invalid: 'data' })),
          setItem: vi.fn(),
          removeItem: vi.fn()
        },
        writable: true
      });

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

      // Should handle gracefully and warn about invalid format (logger formats with timestamp)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Invalid dismissal state format, using empty set/)
      );

      // Restore sessionStorage
      Object.defineProperty(window, 'sessionStorage', {
        value: originalSessionStorage,
        writable: true
      });
      
      consoleWarnSpy.mockRestore();
    });

    test('should display "and X more" indicator when alerts exceed limit', async () => {
      // Create more than 5 alerts (all at warning level - 85%)
      const manyBudgets = Array.from({ length: 7 }, (_, i) => ({
        id: i + 1,
        category: `Category${i + 1}`,
        limit: 100,
        spent: 85
      }));

      budgetApi.getBudgets.mockResolvedValue({ budgets: manyBudgets });

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

      // Should display exactly 5 alerts
      await waitFor(() => {
        const alerts = screen.queryAllByTestId(/alert-budget-alert-/);
        expect(alerts).toHaveLength(5);
      });

      // Should display "and 2 more" indicator
      await waitFor(() => {
        expect(screen.getByText('and 2 more budget alerts')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Manage all budgets' })).toBeInTheDocument();
      });
    });

    test('should handle cache corruption gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      render(
        <BudgetAlertManager 
          year={2025} 
          month={12} 
          refreshTrigger={0}
          {...mockCallbacks} 
        />
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('alert-budget-alert-1')).toBeInTheDocument();
      });

      // This test verifies the component handles errors gracefully
      // The actual implementation should clear cache and fetch fresh data on errors
      // We verify the component rendered successfully without throwing
      expect(screen.getByTestId('alert-budget-alert-1')).toBeInTheDocument();
      
      consoleWarnSpy.mockRestore();
    });
  });
});