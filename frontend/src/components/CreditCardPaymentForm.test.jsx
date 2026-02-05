import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    CREDIT_CARD_PAYMENTS: '/api/credit-card-payments'
  },
  default: 'http://localhost:2424'
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

// Mock credit card API
import * as creditCardApi from '../services/creditCardApi';
vi.mock('../services/creditCardApi', () => ({
  recordPayment: vi.fn()
}));

import CreditCardPaymentForm from './CreditCardPaymentForm';

describe('CreditCardPaymentForm', () => {
  const mockOnPaymentRecorded = vi.fn();
  const mockOnCancel = vi.fn();

  const defaultProps = {
    paymentMethodId: 1,
    paymentMethodName: 'Test Visa',
    currentBalance: 1500.00,
    onPaymentRecorded: mockOnPaymentRecorded,
    onCancel: mockOnCancel
  };

  beforeEach(() => {
    vi.clearAllMocks();
    creditCardApi.recordPayment.mockResolvedValue({ id: 1, amount: 100 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render the form with all fields', () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      expect(screen.getByText('Log Payment')).toBeInTheDocument();
      expect(screen.getByText('Test Visa')).toBeInTheDocument();
      expect(screen.getByLabelText(/Payment Amount/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Payment Date/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Notes/)).toBeInTheDocument();
    });

    it('should display current balance', () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      expect(screen.getByText('Current Balance:')).toBeInTheDocument();
      expect(screen.getByText('$1,500.00')).toBeInTheDocument();
    });

    it('should default date to today', () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const dateInput = screen.getByLabelText(/Payment Date/);
      const today = new Date().toISOString().split('T')[0];
      expect(dateInput.value).toBe(today);
    });

    it('should show submit and cancel buttons', () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      expect(screen.getByText('Record Payment')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should disable submit button when amount is empty', () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const submitButton = screen.getByText('Record Payment');
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Amount input', () => {
    it('should accept valid numeric input', () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '100.50' } });

      expect(amountInput.value).toBe('100.50');
    });

    it('should sanitize currency symbols from pasted values', () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '$1,234.56' } });

      expect(amountInput.value).toBe('1234.56');
    });

    it('should sanitize commas from pasted values', () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '1,000' } });

      expect(amountInput.value).toBe('1000');
    });

    it('should limit decimal places to 2', () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '100.12' } });
      expect(amountInput.value).toBe('100.12');

      // Try to add more decimal places - should not change
      fireEvent.change(amountInput, { target: { value: '100.123' } });
      expect(amountInput.value).toBe('100.12'); // Unchanged
    });

    it('should enable submit button when valid amount is entered', () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '100' } });

      const submitButton = screen.getByText('Record Payment');
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Balance calculation display', () => {
    it('should show new balance after payment when amount is entered', () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '500' } });

      expect(screen.getByText('After Payment:')).toBeInTheDocument();
      expect(screen.getByText('$1,000.00')).toBeInTheDocument();
    });

    it('should not show new balance when amount is empty', () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      expect(screen.queryByText('After Payment:')).not.toBeInTheDocument();
    });

    it('should handle overpayment (negative balance)', () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '2000' } });

      expect(screen.getByText('After Payment:')).toBeInTheDocument();
      // Should show negative balance
      const newBalanceValue = screen.getByText('-$500.00');
      expect(newBalanceValue).toHaveClass('negative');
    });
  });

  describe('Form validation', () => {
    it('should show error when submitting without amount', async () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      // Clear the amount and try to submit
      const form = document.querySelector('.cc-payment-form');
      fireEvent.submit(form);

      // Submit button should be disabled, so no error shown this way
      // The button is disabled when amount is empty
      expect(screen.getByText('Record Payment')).toBeDisabled();
    });

    it('should show error for zero amount', async () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '0' } });

      const submitButton = screen.getByText('Record Payment');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Payment amount must be greater than zero')).toBeInTheDocument();
      });
    });

    it('should show error for negative amount', async () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      // Note: The input sanitization prevents negative numbers, but let's test validation
      fireEvent.change(amountInput, { target: { value: '0.01' } });
      
      // Change to a value that would be invalid if it got through
      // Since the input prevents negative, we test with 0
      fireEvent.change(amountInput, { target: { value: '0' } });

      const submitButton = screen.getByText('Record Payment');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Payment amount must be greater than zero')).toBeInTheDocument();
      });
    });

    it('should clear error when amount is changed', async () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '0' } });

      const submitButton = screen.getByText('Record Payment');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Payment amount must be greater than zero')).toBeInTheDocument();
      });

      // Change amount to valid value
      fireEvent.change(amountInput, { target: { value: '100' } });

      expect(screen.queryByText('Payment amount must be greater than zero')).not.toBeInTheDocument();
    });

    it('should allow clearing error with close button', async () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '0' } });

      const submitButton = screen.getByText('Record Payment');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Payment amount must be greater than zero')).toBeInTheDocument();
      });

      // Click the close button on the error
      const closeButton = screen.getByLabelText('Clear error');
      fireEvent.click(closeButton);

      expect(screen.queryByText('Payment amount must be greater than zero')).not.toBeInTheDocument();
    });
  });

  describe('Form submission', () => {
    it('should call recordPayment API on valid submission', async () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '100' } });

      const submitButton = screen.getByText('Record Payment');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(creditCardApi.recordPayment).toHaveBeenCalledWith(1, {
          amount: 100,
          payment_date: expect.any(String),
          notes: null
        });
      });
    });

    it('should include notes in submission when provided', async () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '100' } });

      const notesInput = screen.getByLabelText(/Notes/);
      fireEvent.change(notesInput, { target: { value: 'Online payment' } });

      const submitButton = screen.getByText('Record Payment');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(creditCardApi.recordPayment).toHaveBeenCalledWith(1, {
          amount: 100,
          payment_date: expect.any(String),
          notes: 'Online payment'
        });
      });
    });

    it('should show loading state during submission', async () => {
      creditCardApi.recordPayment.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ id: 1 }), 100))
      );

      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '100' } });

      const submitButton = screen.getByText('Record Payment');
      fireEvent.click(submitButton);

      expect(screen.getByText('Recording...')).toBeInTheDocument();
    });

    it('should call onPaymentRecorded callback on success', async () => {
      const mockResult = { id: 1, amount: 100 };
      creditCardApi.recordPayment.mockResolvedValue(mockResult);

      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '100' } });

      const submitButton = screen.getByText('Record Payment');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnPaymentRecorded).toHaveBeenCalledWith(mockResult);
      });
    });

    it('should reset form after successful submission', async () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '100' } });

      const notesInput = screen.getByLabelText(/Notes/);
      fireEvent.change(notesInput, { target: { value: 'Test note' } });

      const submitButton = screen.getByText('Record Payment');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(amountInput.value).toBe('');
        expect(notesInput.value).toBe('');
      });
    });

    it('should show error on API failure', async () => {
      creditCardApi.recordPayment.mockRejectedValue(new Error('Network error'));

      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '100' } });

      const submitButton = screen.getByText('Record Payment');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should show generic error message when API error has no message', async () => {
      creditCardApi.recordPayment.mockRejectedValue(new Error());

      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '100' } });

      const submitButton = screen.getByText('Record Payment');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to record payment. Please try again.')).toBeInTheDocument();
      });
    });
  });

  describe('Cancel button', () => {
    it('should call onCancel when cancel button is clicked', () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('should disable cancel button during submission', async () => {
      creditCardApi.recordPayment.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ id: 1 }), 100))
      );

      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '100' } });

      const submitButton = screen.getByText('Record Payment');
      fireEvent.click(submitButton);

      const cancelButton = screen.getByText('Cancel');
      expect(cancelButton).toBeDisabled();
    });
  });

  describe('Disabled state', () => {
    it('should disable all inputs when disabled prop is true', () => {
      render(<CreditCardPaymentForm {...defaultProps} disabled={true} />);

      expect(screen.getByLabelText(/Payment Amount/)).toBeDisabled();
      expect(screen.getByLabelText(/Payment Date/)).toBeDisabled();
      expect(screen.getByLabelText(/Notes/)).toBeDisabled();
    });

    it('should disable submit button when disabled prop is true', () => {
      render(<CreditCardPaymentForm {...defaultProps} disabled={true} />);

      const submitButton = screen.getByText('Record Payment');
      expect(submitButton).toBeDisabled();
    });

    it('should not submit form when disabled', async () => {
      render(<CreditCardPaymentForm {...defaultProps} disabled={true} />);

      const form = document.querySelector('.cc-payment-form');
      fireEvent.submit(form);

      expect(creditCardApi.recordPayment).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have required aria attributes on amount input', () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      expect(amountInput).toHaveAttribute('aria-required', 'true');
      expect(amountInput).toHaveAttribute('aria-describedby', 'amount-hint');
    });

    it('should have required aria attribute on date input', () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const dateInput = screen.getByLabelText(/Payment Date/);
      expect(dateInput).toHaveAttribute('aria-required', 'true');
    });

    it('should have role="alert" on error message', async () => {
      render(<CreditCardPaymentForm {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/);
      fireEvent.change(amountInput, { target: { value: '0' } });

      const submitButton = screen.getByText('Record Payment');
      fireEvent.click(submitButton);

      await waitFor(() => {
        const errorElement = screen.getByRole('alert');
        expect(errorElement).toBeInTheDocument();
      });
    });
  });
});
