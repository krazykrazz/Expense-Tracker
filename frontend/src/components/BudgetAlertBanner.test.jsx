/**
 * Unit Tests for BudgetAlertBanner Component
 * Tests rendering, interactions, and accessibility
 * Requirements: 2.1, 2.3, 2.4, 3.1, 4.1, 4.3
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import BudgetAlertBanner from './BudgetAlertBanner';
import { ALERT_SEVERITY } from '../utils/budgetAlerts';

describe('BudgetAlertBanner', () => {
  const mockAlert = {
    id: 'budget-alert-1',
    severity: ALERT_SEVERITY.WARNING,
    category: 'Groceries',
    progress: 85.5,
    spent: 427.50,
    limit: 500.00,
    message: 'Groceries budget is 85.5% used. $72.50 remaining.',
    icon: '⚡'
  };

  const mockCallbacks = {
    onDismiss: vi.fn(),
    onManageBudgets: vi.fn(),
    onViewDetails: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    test('should render alert with all elements', () => {
      render(<BudgetAlertBanner alert={mockAlert} {...mockCallbacks} />);
      
      // Check main container
      const banner = screen.getByRole('alert');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveClass('budget-alert-banner', 'budget-alert-warning');
      
      // Check icon
      expect(screen.getByText('⚡')).toBeInTheDocument();
      
      // Check message
      expect(screen.getByText(mockAlert.message)).toBeInTheDocument();
      
      // Check action buttons
      expect(screen.getByRole('button', { name: /view details/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /manage.*budget/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /dismiss.*budget alert/i })).toBeInTheDocument();
    });

    test('should render null when no alert provided', () => {
      const { container } = render(<BudgetAlertBanner alert={null} {...mockCallbacks} />);
      expect(container.firstChild).toBeNull();
    });

    test('should render with correct severity classes', () => {
      const severityTests = [
        { severity: ALERT_SEVERITY.WARNING, expectedClass: 'budget-alert-warning' },
        { severity: ALERT_SEVERITY.DANGER, expectedClass: 'budget-alert-danger' },
        { severity: ALERT_SEVERITY.CRITICAL, expectedClass: 'budget-alert-critical' }
      ];

      severityTests.forEach(({ severity, expectedClass }) => {
        const alert = { ...mockAlert, severity };
        const { rerender } = render(<BudgetAlertBanner alert={alert} {...mockCallbacks} />);
        
        const banner = screen.getByRole('alert');
        expect(banner).toHaveClass(expectedClass);
        
        rerender(<div />); // Clear for next test
      });
    });

    test('should render different alert icons correctly', () => {
      const iconTests = [
        { severity: ALERT_SEVERITY.WARNING, icon: '⚡' },
        { severity: ALERT_SEVERITY.DANGER, icon: '!' },
        { severity: ALERT_SEVERITY.CRITICAL, icon: '⚠' }
      ];

      iconTests.forEach(({ severity, icon }) => {
        const alert = { ...mockAlert, severity, icon };
        const { rerender } = render(<BudgetAlertBanner alert={alert} {...mockCallbacks} />);
        
        expect(screen.getByText(icon)).toBeInTheDocument();
        
        rerender(<div />); // Clear for next test
      });
    });
  });

  describe('Button Interactions', () => {
    test('should call onDismiss when dismiss button clicked', () => {
      render(<BudgetAlertBanner alert={mockAlert} {...mockCallbacks} />);
      
      const dismissButton = screen.getByRole('button', { name: /dismiss.*budget alert/i });
      fireEvent.click(dismissButton);
      
      expect(mockCallbacks.onDismiss).toHaveBeenCalledTimes(1);
      expect(mockCallbacks.onDismiss).toHaveBeenCalledWith(mockAlert.id);
    });

    test('should call onManageBudgets when manage budgets button clicked', () => {
      render(<BudgetAlertBanner alert={mockAlert} {...mockCallbacks} />);
      
      const manageButton = screen.getByRole('button', { name: /manage.*budget/i });
      fireEvent.click(manageButton);
      
      expect(mockCallbacks.onManageBudgets).toHaveBeenCalledTimes(1);
      expect(mockCallbacks.onManageBudgets).toHaveBeenCalledWith(mockAlert.category);
    });

    test('should call onViewDetails when view details button clicked', () => {
      render(<BudgetAlertBanner alert={mockAlert} {...mockCallbacks} />);
      
      const viewButton = screen.getByRole('button', { name: /view details/i });
      fireEvent.click(viewButton);
      
      expect(mockCallbacks.onViewDetails).toHaveBeenCalledTimes(1);
      expect(mockCallbacks.onViewDetails).toHaveBeenCalledWith(mockAlert.category);
    });

    test('should handle missing callback functions gracefully', () => {
      render(<BudgetAlertBanner alert={mockAlert} />);
      
      // Should not throw errors when callbacks are undefined
      const dismissButton = screen.getByRole('button', { name: /dismiss.*budget alert/i });
      const manageButton = screen.getByRole('button', { name: /manage.*budget/i });
      const viewButton = screen.getByRole('button', { name: /view details/i });
      
      expect(() => {
        fireEvent.click(dismissButton);
        fireEvent.click(manageButton);
        fireEvent.click(viewButton);
      }).not.toThrow();
    });
  });

  describe('Currency Formatting', () => {
    test('should display formatted currency amounts in messages', () => {
      const alertWithCurrency = {
        ...mockAlert,
        message: 'Groceries budget is 85.5% used. $72.50 remaining.'
      };
      
      render(<BudgetAlertBanner alert={alertWithCurrency} {...mockCallbacks} />);
      
      expect(screen.getByText(/\$72\.50/)).toBeInTheDocument();
    });

    test('should handle critical alert overage amounts', () => {
      const criticalAlert = {
        ...mockAlert,
        severity: ALERT_SEVERITY.CRITICAL,
        message: 'Groceries budget exceeded! $25.00 over budget.',
        icon: '⚠'
      };
      
      render(<BudgetAlertBanner alert={criticalAlert} {...mockCallbacks} />);
      
      expect(screen.getByText(/\$25\.00 over budget/)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('should have proper ARIA attributes', () => {
      render(<BudgetAlertBanner alert={mockAlert} {...mockCallbacks} />);
      
      const banner = screen.getByRole('alert');
      expect(banner).toHaveAttribute('aria-live', 'polite');
      expect(banner).toHaveAttribute('aria-label', `Budget alert: ${mockAlert.message}`);
    });

    test('should have accessible button labels', () => {
      render(<BudgetAlertBanner alert={mockAlert} {...mockCallbacks} />);
      
      expect(screen.getByRole('button', { 
        name: `View details for ${mockAlert.category} budget` 
      })).toBeInTheDocument();
      
      expect(screen.getByRole('button', { 
        name: `Manage ${mockAlert.category} budget` 
      })).toBeInTheDocument();
      
      expect(screen.getByRole('button', { 
        name: `Dismiss ${mockAlert.category} budget alert` 
      })).toBeInTheDocument();
    });

    test('should mark icon as decorative', () => {
      render(<BudgetAlertBanner alert={mockAlert} {...mockCallbacks} />);
      
      // Find the icon container div
      const iconContainer = document.querySelector('.budget-alert-icon');
      expect(iconContainer).toHaveAttribute('aria-hidden', 'true');
    });

    test('should be keyboard accessible', () => {
      render(<BudgetAlertBanner alert={mockAlert} {...mockCallbacks} />);
      
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveAttribute('type', 'button');
        
        // Test keyboard interaction
        button.focus();
        expect(document.activeElement).toBe(button);
      });
    });
  });

  describe('Message Display', () => {
    test('should display complete alert message', () => {
      const longMessage = 'This is a very long budget alert message that should be displayed completely without truncation or modification.';
      const alertWithLongMessage = {
        ...mockAlert,
        message: longMessage
      };
      
      render(<BudgetAlertBanner alert={alertWithLongMessage} {...mockCallbacks} />);
      
      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    test('should handle empty or undefined message gracefully', () => {
      const alertWithEmptyMessage = {
        ...mockAlert,
        message: ''
      };
      
      render(<BudgetAlertBanner alert={alertWithEmptyMessage} {...mockCallbacks} />);
      
      // Should still render the banner structure
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Category Context', () => {
    test('should pass correct category to callback functions', () => {
      const categories = ['Housing', 'Utilities', 'Entertainment', 'Gas'];
      
      categories.forEach(category => {
        const alert = { ...mockAlert, category };
        const { rerender } = render(<BudgetAlertBanner alert={alert} {...mockCallbacks} />);
        
        // Test manage budgets callback
        const manageButton = screen.getByRole('button', { name: /manage.*budget/i });
        fireEvent.click(manageButton);
        expect(mockCallbacks.onManageBudgets).toHaveBeenCalledWith(category);
        
        // Test view details callback
        const viewButton = screen.getByRole('button', { name: /view details/i });
        fireEvent.click(viewButton);
        expect(mockCallbacks.onViewDetails).toHaveBeenCalledWith(category);
        
        vi.clearAllMocks();
        rerender(<div />); // Clear for next test
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle alert with missing properties', () => {
      const incompleteAlert = {
        id: 'test-alert',
        severity: ALERT_SEVERITY.WARNING,
        message: 'Test message'
        // Missing category, icon, etc.
      };
      
      expect(() => {
        render(<BudgetAlertBanner alert={incompleteAlert} {...mockCallbacks} />);
      }).not.toThrow();
      
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    test('should handle undefined alert properties gracefully', () => {
      const alertWithUndefined = {
        ...mockAlert,
        category: undefined,
        icon: undefined
      };
      
      render(<BudgetAlertBanner alert={alertWithUndefined} {...mockCallbacks} />);
      
      // Should still render and function
      expect(screen.getByRole('alert')).toBeInTheDocument();
      
      // Buttons should still work (may pass undefined to callbacks)
      const manageButton = screen.getByRole('button', { name: /manage.*budget/i });
      fireEvent.click(manageButton);
      expect(mockCallbacks.onManageBudgets).toHaveBeenCalledWith(undefined);
    });
  });
});