import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    LOAN_PAYMENT_ENTRIES: (loanId) => `/api/loans/${loanId}/loan-payments`,
    LOAN_PAYMENT_ENTRY: (loanId, paymentId) => `/api/loans/${loanId}/loan-payments/${paymentId}`,
    LOAN_PAYMENT_SUGGESTION: (loanId) => `/api/loans/${loanId}/payment-suggestion`
  },
  default: 'http://localhost:2424'
}));

// Mock the loanPaymentApi
vi.mock('../services/loanPaymentApi', () => ({
  createPayment: vi.fn(),
  updatePayment: vi.fn(),
  getPaymentSuggestion: vi.fn()
}));

import * as loanPaymentApi from '../services/loanPaymentApi';
import LoanPaymentForm from './LoanPaymentForm';

describe('LoanPaymentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    loanPaymentApi.createPayment.mockResolvedValue({ id: 1, amount: 500, payment_date: '2026-02-04' });
    loanPaymentApi.updatePayment.mockResolvedValue({ id: 1, amount: 600, payment_date: '2026-02-04' });
    loanPaymentApi.getPaymentSuggestion.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test form renders with all required fields
   * Requirements: 6.3
   */
  it('should render form with amount, date, and notes fields', async () => {
    render(
      <LoanPaymentForm
        loanId={1}
        loanName="Test Loan"
        currentBalance={10000}
        onPaymentRecorded={() => {}}
        onCancel={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/payment amount/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/payment date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /record payment/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  /**
   * Test date defaults to today
   * Requirements: 6.3
   */
  it('should default date to today', async () => {
    render(
      <LoanPaymentForm
        loanId={1}
        loanName="Test Loan"
        currentBalance={10000}
        onPaymentRecorded={() => {}}
        onCancel={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/payment date/i)).toBeInTheDocument();
    });

    const dateInput = screen.getByLabelText(/payment date/i);
    const today = new Date().toISOString().split('T')[0];
    expect(dateInput.value).toBe(today);
  });

  /**
   * Test form validation - empty amount
   * Requirements: 3.1
   */
  it('should show error when amount is empty', async () => {
    render(
      <LoanPaymentForm
        loanId={1}
        loanName="Test Loan"
        currentBalance={10000}
        onPaymentRecorded={() => {}}
        onCancel={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/payment amount/i)).toBeInTheDocument();
    });

    // Submit without entering amount
    const submitBtn = screen.getByRole('button', { name: /record payment/i });
    fireEvent.click(submitBtn);

    // Button should be disabled when amount is empty
    expect(submitBtn).toBeDisabled();
  });

  /**
   * Test form validation - negative amount
   * Requirements: 3.1
   */
  it('should show error for negative amount', async () => {
    render(
      <LoanPaymentForm
        loanId={1}
        loanName="Test Loan"
        currentBalance={10000}
        onPaymentRecorded={() => {}}
        onCancel={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/payment amount/i)).toBeInTheDocument();
    });

    // Enter negative amount (the input sanitizes, so we test with 0)
    const amountInput = screen.getByLabelText(/payment amount/i);
    fireEvent.change(amountInput, { target: { value: '0' } });

    // Submit form
    const form = document.querySelector('.loan-payment-form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/payment amount must be greater than zero/i)).toBeInTheDocument();
    });
  });

  /**
   * Test suggestion display for mortgage
   * Requirements: 3.1, 6.3
   */
  it('should display suggested amount for mortgage with monthly_payment', async () => {
    loanPaymentApi.getPaymentSuggestion.mockResolvedValue({
      suggestedAmount: 1500,
      source: 'monthly_payment',
      confidence: 'high',
      message: 'Based on monthly payment amount'
    });

    render(
      <LoanPaymentForm
        loanId={1}
        loanName="Test Mortgage"
        loanType="mortgage"
        currentBalance={200000}
        onPaymentRecorded={() => {}}
        onCancel={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/monthly payment/i)).toBeInTheDocument();
    });

    // Amount should be pre-filled
    const amountInput = screen.getByLabelText(/payment amount/i);
    expect(amountInput.value).toBe('1500');
  });

  /**
   * Test suggestion display for loan with history
   * Requirements: 3.2, 6.3
   */
  it('should display average payment suggestion for loan with history', async () => {
    loanPaymentApi.getPaymentSuggestion.mockResolvedValue({
      suggestedAmount: 750,
      source: 'average_history',
      confidence: 'medium',
      message: 'Based on average of previous payments'
    });

    render(
      <LoanPaymentForm
        loanId={1}
        loanName="Test Loan"
        loanType="loan"
        currentBalance={5000}
        onPaymentRecorded={() => {}}
        onCancel={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/average payment/i)).toBeInTheDocument();
    });

    // Amount should be pre-filled
    const amountInput = screen.getByLabelText(/payment amount/i);
    expect(amountInput.value).toBe('750');
  });

  /**
   * Test no suggestion for loan without history
   * Requirements: 3.3
   */
  it('should not show suggestion badge when no suggestion available', async () => {
    loanPaymentApi.getPaymentSuggestion.mockResolvedValue({
      suggestedAmount: null,
      source: 'none',
      confidence: 'low',
      message: 'No payment history available'
    });

    render(
      <LoanPaymentForm
        loanId={1}
        loanName="Test Loan"
        loanType="loan"
        currentBalance={5000}
        onPaymentRecorded={() => {}}
        onCancel={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/payment amount/i)).toBeInTheDocument();
    });

    // No suggestion badge should be shown
    expect(screen.queryByText(/suggested/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/monthly payment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/average payment/i)).not.toBeInTheDocument();
  });

  /**
   * Test user can override suggested amount
   * Requirements: 3.4
   */
  it('should allow user to override suggested amount', async () => {
    loanPaymentApi.getPaymentSuggestion.mockResolvedValue({
      suggestedAmount: 1500,
      source: 'monthly_payment',
      confidence: 'high',
      message: 'Based on monthly payment amount'
    });

    render(
      <LoanPaymentForm
        loanId={1}
        loanName="Test Mortgage"
        loanType="mortgage"
        currentBalance={200000}
        onPaymentRecorded={() => {}}
        onCancel={() => {}}
      />
    );

    await waitFor(() => {
      // The suggested badge should be visible initially
      expect(screen.getByText(/monthly payment/i)).toBeInTheDocument();
    });

    // Change the amount
    const amountInput = screen.getByLabelText(/payment amount/i);
    fireEvent.change(amountInput, { target: { value: '2000' } });

    expect(amountInput.value).toBe('2000');
    
    // The "Use Monthly Payment" button should appear when amount differs from suggestion
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /use monthly payment/i })).toBeInTheDocument();
    });
    
    // The badge in the label should not be present (check by looking for the badge class)
    const badge = document.querySelector('.suggested-badge');
    expect(badge).toBeNull();
  });

  /**
   * Test successful payment submission
   * Requirements: 3.1
   */
  it('should call createPayment on successful submission', async () => {
    const mockOnPaymentRecorded = vi.fn();

    render(
      <LoanPaymentForm
        loanId={1}
        loanName="Test Loan"
        currentBalance={10000}
        onPaymentRecorded={mockOnPaymentRecorded}
        onCancel={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/payment amount/i)).toBeInTheDocument();
    });

    // Fill in amount
    const amountInput = screen.getByLabelText(/payment amount/i);
    fireEvent.change(amountInput, { target: { value: '500' } });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /record payment/i }));

    await waitFor(() => {
      expect(loanPaymentApi.createPayment).toHaveBeenCalledWith(1, {
        amount: 500,
        payment_date: expect.any(String),
        notes: null
      });
    });

    expect(mockOnPaymentRecorded).toHaveBeenCalled();
  });

  /**
   * Test edit mode populates form
   * Requirements: 6.3
   */
  it('should populate form when editing existing payment', async () => {
    const existingPayment = {
      id: 1,
      amount: 750,
      payment_date: '2026-01-15',
      notes: 'January payment'
    };

    render(
      <LoanPaymentForm
        loanId={1}
        loanName="Test Loan"
        currentBalance={10000}
        editingPayment={existingPayment}
        onPaymentRecorded={() => {}}
        onCancel={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/payment amount/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/payment amount/i).value).toBe('750');
    expect(screen.getByLabelText(/payment date/i).value).toBe('2026-01-15');
    expect(screen.getByLabelText(/notes/i).value).toBe('January payment');
    expect(screen.getByRole('button', { name: /update payment/i })).toBeInTheDocument();
  });

  /**
   * Test update payment in edit mode
   * Requirements: 6.3
   */
  it('should call updatePayment when editing', async () => {
    const existingPayment = {
      id: 1,
      amount: 750,
      payment_date: '2026-01-15',
      notes: 'January payment'
    };
    const mockOnPaymentRecorded = vi.fn();

    render(
      <LoanPaymentForm
        loanId={1}
        loanName="Test Loan"
        currentBalance={10000}
        editingPayment={existingPayment}
        onPaymentRecorded={mockOnPaymentRecorded}
        onCancel={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/payment amount/i)).toBeInTheDocument();
    });

    // Change amount
    const amountInput = screen.getByLabelText(/payment amount/i);
    fireEvent.change(amountInput, { target: { value: '800' } });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /update payment/i }));

    await waitFor(() => {
      expect(loanPaymentApi.updatePayment).toHaveBeenCalledWith(1, 1, {
        amount: 800,
        payment_date: '2026-01-15',
        notes: 'January payment'
      });
    });

    expect(mockOnPaymentRecorded).toHaveBeenCalled();
  });

  /**
   * Test cancel button calls onCancel
   * Requirements: 6.3
   */
  it('should call onCancel when cancel button is clicked', async () => {
    const mockOnCancel = vi.fn();

    render(
      <LoanPaymentForm
        loanId={1}
        loanName="Test Loan"
        currentBalance={10000}
        onPaymentRecorded={() => {}}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockOnCancel).toHaveBeenCalled();
  });

  /**
   * Test balance display updates with amount
   * Requirements: 6.3
   */
  it('should show updated balance after payment', async () => {
    render(
      <LoanPaymentForm
        loanId={1}
        loanName="Test Loan"
        currentBalance={10000}
        onPaymentRecorded={() => {}}
        onCancel={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/current balance/i)).toBeInTheDocument();
    });

    // Enter amount
    const amountInput = screen.getByLabelText(/payment amount/i);
    fireEvent.change(amountInput, { target: { value: '500' } });

    // Should show "After Payment" balance
    await waitFor(() => {
      expect(screen.getByText(/after payment/i)).toBeInTheDocument();
    });
  });

  /**
   * Test apply suggestion button
   * Requirements: 3.4
   */
  it('should apply suggestion when button is clicked', async () => {
    loanPaymentApi.getPaymentSuggestion.mockResolvedValue({
      suggestedAmount: 1500,
      source: 'monthly_payment',
      confidence: 'high',
      message: 'Based on monthly payment amount'
    });

    render(
      <LoanPaymentForm
        loanId={1}
        loanName="Test Mortgage"
        loanType="mortgage"
        currentBalance={200000}
        onPaymentRecorded={() => {}}
        onCancel={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/payment amount/i)).toBeInTheDocument();
    });

    // Clear the pre-filled amount
    const amountInput = screen.getByLabelText(/payment amount/i);
    fireEvent.change(amountInput, { target: { value: '1000' } });

    // Apply suggestion button should appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /use monthly payment/i })).toBeInTheDocument();
    });

    // Click apply suggestion
    fireEvent.click(screen.getByRole('button', { name: /use monthly payment/i }));

    // Amount should be updated
    expect(amountInput.value).toBe('1500');
  });

  /**
   * Test disabled state
   * Requirements: 6.3
   */
  it('should disable form when disabled prop is true', async () => {
    render(
      <LoanPaymentForm
        loanId={1}
        loanName="Test Loan"
        currentBalance={10000}
        onPaymentRecorded={() => {}}
        onCancel={() => {}}
        disabled={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/payment amount/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/payment amount/i)).toBeDisabled();
    expect(screen.getByLabelText(/payment date/i)).toBeDisabled();
    expect(screen.getByLabelText(/notes/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /record payment/i })).toBeDisabled();
  });

  /**
   * Test error display and clear
   * Requirements: 6.3
   */
  it('should display and clear errors', async () => {
    loanPaymentApi.createPayment.mockRejectedValue(new Error('Network error'));

    render(
      <LoanPaymentForm
        loanId={1}
        loanName="Test Loan"
        currentBalance={10000}
        onPaymentRecorded={() => {}}
        onCancel={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/payment amount/i)).toBeInTheDocument();
    });

    // Fill in amount
    const amountInput = screen.getByLabelText(/payment amount/i);
    fireEvent.change(amountInput, { target: { value: '500' } });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /record payment/i }));

    // Error should be displayed
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // Clear error
    fireEvent.click(screen.getByLabelText(/clear error/i));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
