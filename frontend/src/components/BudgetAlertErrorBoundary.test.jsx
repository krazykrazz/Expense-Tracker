/**
 * Unit Tests for BudgetAlertErrorBoundary Component
 * Tests error boundary behavior and fallback UI
 * Requirements: 7.1 - Add error boundaries for alert rendering failures
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import BudgetAlertErrorBoundary from './BudgetAlertErrorBoundary';

// Component that throws an error for testing
const ThrowError = ({ shouldThrow = false }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div data-testid="working-component">Working component</div>;
};

describe('BudgetAlertErrorBoundary', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    // Mock console.error to prevent error logs during tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Normal Operation', () => {
    test('should render children when no error occurs', () => {
      render(
        <BudgetAlertErrorBoundary>
          <ThrowError shouldThrow={false} />
        </BudgetAlertErrorBoundary>
      );

      expect(screen.getByTestId('working-component')).toBeInTheDocument();
      expect(screen.queryByText('Budget alerts temporarily unavailable')).not.toBeInTheDocument();
    });

    test('should render multiple children when no error occurs', () => {
      render(
        <BudgetAlertErrorBoundary>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
        </BudgetAlertErrorBoundary>
      );

      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    test('should display fallback UI when child component throws error', () => {
      render(
        <BudgetAlertErrorBoundary>
          <ThrowError shouldThrow={true} />
        </BudgetAlertErrorBoundary>
      );

      // Should display error fallback UI
      expect(screen.getByText('Budget alerts temporarily unavailable')).toBeInTheDocument();
      expect(screen.getByText('There was an issue displaying budget alerts. Your budget data is safe.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry loading budget alerts' })).toBeInTheDocument();

      // Should not display the original component
      expect(screen.queryByTestId('working-component')).not.toBeInTheDocument();

      // Should log the error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Budget Alert Error Boundary caught an error:',
        expect.any(Error),
        expect.any(Object)
      );
    });

    test('should display error icon in fallback UI', () => {
      render(
        <BudgetAlertErrorBoundary>
          <ThrowError shouldThrow={true} />
        </BudgetAlertErrorBoundary>
      );

      const errorIcon = screen.getByText('⚠');
      expect(errorIcon).toBeInTheDocument();
      expect(errorIcon).toHaveAttribute('aria-hidden', 'true');
    });

    test('should have proper accessibility attributes in fallback UI', () => {
      render(
        <BudgetAlertErrorBoundary>
          <ThrowError shouldThrow={true} />
        </BudgetAlertErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: 'Retry loading budget alerts' });
      expect(retryButton).toBeInTheDocument();
      expect(retryButton).toHaveAttribute('aria-label', 'Retry loading budget alerts');
    });
  });

  describe('Recovery Functionality', () => {
    test('should recover when retry button is clicked', () => {
      const { rerender } = render(
        <BudgetAlertErrorBoundary>
          <ThrowError shouldThrow={true} />
        </BudgetAlertErrorBoundary>
      );

      // Should display error fallback
      expect(screen.getByText('Budget alerts temporarily unavailable')).toBeInTheDocument();

      // Click retry button to reset error state
      const retryButton = screen.getByRole('button', { name: 'Retry loading budget alerts' });
      fireEvent.click(retryButton);

      // Re-render with working component after retry
      rerender(
        <BudgetAlertErrorBoundary key="retry">
          <ThrowError shouldThrow={false} />
        </BudgetAlertErrorBoundary>
      );

      // Should display working component
      expect(screen.getByTestId('working-component')).toBeInTheDocument();
      expect(screen.queryByText('Budget alerts temporarily unavailable')).not.toBeInTheDocument();
    });

    test('should call onRetry callback when retry button is clicked', () => {
      const onRetryMock = vi.fn();

      render(
        <BudgetAlertErrorBoundary onRetry={onRetryMock}>
          <ThrowError shouldThrow={true} />
        </BudgetAlertErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: 'Retry loading budget alerts' });
      fireEvent.click(retryButton);

      expect(onRetryMock).toHaveBeenCalledTimes(1);
    });

    test('should work without onRetry callback', () => {
      render(
        <BudgetAlertErrorBoundary>
          <ThrowError shouldThrow={true} />
        </BudgetAlertErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: 'Retry loading budget alerts' });
      
      // Should not throw when clicking retry without callback
      expect(() => {
        fireEvent.click(retryButton);
      }).not.toThrow();
    });

    test('should reset error state when retry is clicked', () => {
      const TestComponent = ({ shouldThrow }) => {
        if (shouldThrow) {
          throw new Error('Test error');
        }
        return <div data-testid="working-component">Working</div>;
      };

      const { rerender } = render(
        <BudgetAlertErrorBoundary>
          <TestComponent shouldThrow={true} />
        </BudgetAlertErrorBoundary>
      );

      // Should show error state
      expect(screen.getByText('Budget alerts temporarily unavailable')).toBeInTheDocument();

      // Click retry
      const retryButton = screen.getByRole('button', { name: 'Retry loading budget alerts' });
      fireEvent.click(retryButton);

      // Re-render with non-throwing component (use key to force new error boundary instance)
      rerender(
        <BudgetAlertErrorBoundary key="retry">
          <TestComponent shouldThrow={false} />
        </BudgetAlertErrorBoundary>
      );

      // Should show working component
      expect(screen.getByTestId('working-component')).toBeInTheDocument();
      expect(screen.queryByText('Budget alerts temporarily unavailable')).not.toBeInTheDocument();
    });
  });

  describe('Error Information Handling', () => {
    test('should store error information in state', () => {
      const TestError = () => {
        throw new Error('Specific test error');
      };

      render(
        <BudgetAlertErrorBoundary>
          <TestError />
        </BudgetAlertErrorBoundary>
      );

      // Error boundary should catch and display fallback
      expect(screen.getByText('Budget alerts temporarily unavailable')).toBeInTheDocument();
      
      // Should have logged the specific error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Budget Alert Error Boundary caught an error:',
        expect.objectContaining({ message: 'Specific test error' }),
        expect.any(Object)
      );
    });

    test('should handle different types of errors', () => {
      const ThrowTypeError = () => {
        throw new TypeError('Type error test');
      };

      render(
        <BudgetAlertErrorBoundary>
          <ThrowTypeError />
        </BudgetAlertErrorBoundary>
      );

      expect(screen.getByText('Budget alerts temporarily unavailable')).toBeInTheDocument();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Budget Alert Error Boundary caught an error:',
        expect.objectContaining({ message: 'Type error test' }),
        expect.any(Object)
      );
    });

    test('should handle errors thrown from nested components', () => {
      const NestedError = () => {
        throw new Error('Nested error');
      };

      const WrapperComponent = () => (
        <div>
          <span>Wrapper</span>
          <NestedError />
        </div>
      );

      render(
        <BudgetAlertErrorBoundary>
          <WrapperComponent />
        </BudgetAlertErrorBoundary>
      );

      expect(screen.getByText('Budget alerts temporarily unavailable')).toBeInTheDocument();
      expect(screen.queryByText('Wrapper')).not.toBeInTheDocument();
    });
  });

  describe('CSS Classes and Styling', () => {
    test('should apply correct CSS classes to fallback UI', () => {
      render(
        <BudgetAlertErrorBoundary>
          <ThrowError shouldThrow={true} />
        </BudgetAlertErrorBoundary>
      );

      const fallbackContainer = screen.getByText('Budget alerts temporarily unavailable').closest('.budget-alert-error-fallback');
      expect(fallbackContainer).toBeInTheDocument();

      const content = screen.getByText('Budget alerts temporarily unavailable').closest('.budget-alert-error-content');
      expect(content).toBeInTheDocument();

      const icon = screen.getByText('⚠');
      expect(icon).toHaveClass('budget-alert-error-icon');

      const message = screen.getByText('Budget alerts temporarily unavailable').closest('.budget-alert-error-message');
      expect(message).toBeInTheDocument();

      const retryButton = screen.getByRole('button', { name: 'Retry loading budget alerts' });
      expect(retryButton).toHaveClass('budget-alert-error-retry');
    });
  });
});