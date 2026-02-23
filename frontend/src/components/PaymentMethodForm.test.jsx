import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    PAYMENT_METHODS: '/api/payment-methods',
    PAYMENT_METHODS_DISPLAY_NAMES: '/api/payment-methods/display-names'
  },
  default: 'http://localhost:2424'
}));

import * as paymentMethodApi from '../services/paymentMethodApi';

vi.mock('../services/paymentMethodApi', () => ({
  createPaymentMethod: vi.fn(),
  updatePaymentMethod: vi.fn(),
  getDisplayNames: vi.fn(),
  setPaymentMethodActive: vi.fn()
}));

import PaymentMethodForm from './PaymentMethodForm';

describe('PaymentMethodForm - Billing Cycle Day Field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentMethodApi.getDisplayNames.mockResolvedValue([]);
    paymentMethodApi.createPaymentMethod.mockResolvedValue({ id: 1 });
    paymentMethodApi.updatePaymentMethod.mockResolvedValue({ id: 1 });
    paymentMethodApi.setPaymentMethodActive.mockResolvedValue({ id: 1, is_active: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test billing_cycle_day field renders for credit cards
   * Requirements: 6.1
   */
  it('should render billing_cycle_day field only for credit cards', async () => {
    render(<PaymentMethodForm isOpen={true} method={null} onSave={() => {}} onCancel={() => {}} />);

    // Wait for form to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Initially type is 'cash', billing_cycle_day should not be visible
    expect(screen.queryByLabelText(/statement closing day/i)).not.toBeInTheDocument();

    // Change to credit card type
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'credit_card' } });

    // billing_cycle_day field should now be visible
    await waitFor(() => {
      expect(screen.getByLabelText(/statement closing day/i)).toBeInTheDocument();
    });

    // Change back to debit
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'debit' } });

    // billing_cycle_day field should be hidden
    expect(screen.queryByLabelText(/statement closing day/i)).not.toBeInTheDocument();
  });

  /**
   * Test billing_cycle_day field is marked as required
   * Requirements: 6.2
   */
  it('should mark billing_cycle_day as required for credit cards', async () => {
    render(<PaymentMethodForm isOpen={true} method={null} onSave={() => {}} onCancel={() => {}} />);

    // Change to credit card type
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'credit_card' } });

    await waitFor(() => {
      expect(screen.getByLabelText(/statement closing day/i)).toBeInTheDocument();
    });

    // Check that the label has asterisk (required indicator)
    const label = screen.getByText(/statement closing day \*/i);
    expect(label).toBeInTheDocument();

    // Check that the input has required attribute
    const input = screen.getByLabelText(/statement closing day/i);
    expect(input).toHaveAttribute('required');
  });

  /**
   * Test payment_due_day field is marked as required
   * Requirements: 6.3
   */
  it('should mark payment_due_day as required for credit cards', async () => {
    render(<PaymentMethodForm isOpen={true} method={null} onSave={() => {}} onCancel={() => {}} />);

    // Change to credit card type
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'credit_card' } });

    await waitFor(() => {
      expect(screen.getByLabelText(/payment due day/i)).toBeInTheDocument();
    });

    // Check that the label has asterisk (required indicator)
    const label = screen.getByText(/payment due day \*/i);
    expect(label).toBeInTheDocument();

    // Check that the input has required attribute
    const input = screen.getByLabelText(/payment due day/i);
    expect(input).toHaveAttribute('required');
  });

  /**
   * Test validation for billing_cycle_day range (1-31)
   * Requirements: 6.4
   */
  it('should validate billing_cycle_day is between 1 and 31', async () => {
    render(<PaymentMethodForm isOpen={true} method={null} onSave={() => {}} onCancel={() => {}} />);

    // Change to credit card type
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'credit_card' } });

    await waitFor(() => {
      expect(screen.getByLabelText(/statement closing day/i)).toBeInTheDocument();
    });

    // Fill required fields
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Test Card' } });
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Test Credit Card' } });
    fireEvent.change(screen.getByLabelText(/payment due day/i), { target: { value: '15' } });

    // Enter invalid value (0)
    fireEvent.change(screen.getByLabelText(/statement closing day/i), { target: { value: '0' } });

    // Submit form using form submit event (bypasses native validation)
    const form = document.querySelector('.payment-method-form');
    fireEvent.submit(form);

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText(/statement closing day must be between 1 and 31/i)).toBeInTheDocument();
    });

    // Enter invalid value (32)
    fireEvent.change(screen.getByLabelText(/statement closing day/i), { target: { value: '32' } });

    // Submit form
    fireEvent.submit(form);

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText(/statement closing day must be between 1 and 31/i)).toBeInTheDocument();
    });
  });

  /**
   * Test validation error when billing_cycle_day is missing
   * Requirements: 6.2
   */
  it('should show validation error when billing_cycle_day is missing for credit card', async () => {
    render(<PaymentMethodForm isOpen={true} method={null} onSave={() => {}} onCancel={() => {}} />);

    // Change to credit card type
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'credit_card' } });

    await waitFor(() => {
      expect(screen.getByLabelText(/statement closing day/i)).toBeInTheDocument();
    });

    // Fill required fields except billing_cycle_day
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Test Card' } });
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Test Credit Card' } });
    fireEvent.change(screen.getByLabelText(/payment due day/i), { target: { value: '15' } });

    // Submit form without billing_cycle_day using form submit event (bypasses native validation)
    const form = document.querySelector('.payment-method-form');
    fireEvent.submit(form);

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText(/statement closing day is required for credit cards/i)).toBeInTheDocument();
    });
  });

  /**
   * Test helpful hint text is displayed
   * Requirements: 6.5
   */
  it('should display helpful hint text for billing_cycle_day field', async () => {
    render(<PaymentMethodForm isOpen={true} method={null} onSave={() => {}} onCancel={() => {}} />);

    // Change to credit card type
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'credit_card' } });

    await waitFor(() => {
      expect(screen.getByLabelText(/statement closing day/i)).toBeInTheDocument();
    });

    // Check for HelpTooltip presence (hint text is now in tooltip)
    const tooltips = screen.getAllByRole('button', { name: /help information/i });
    expect(tooltips.length).toBeGreaterThan(0);
  });

  /**
   * Test form submission includes billing_cycle_day
   * Requirements: 6.6
   */
  it('should include billing_cycle_day in form submission payload', async () => {
    const mockOnSave = vi.fn();
    
    render(<PaymentMethodForm isOpen={true} method={null} onSave={mockOnSave} onCancel={() => {}} />);

    // Change to credit card type
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'credit_card' } });

    await waitFor(() => {
      expect(screen.getByLabelText(/statement closing day/i)).toBeInTheDocument();
    });

    // Fill all required fields
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Test Card' } });
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Test Credit Card' } });
    fireEvent.change(screen.getByLabelText(/payment due day/i), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/statement closing day/i), { target: { value: '25' } });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    // Verify createPaymentMethod was called with billing_cycle_day
    await waitFor(() => {
      expect(paymentMethodApi.createPaymentMethod).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'credit_card',
          display_name: 'Test Card',
          full_name: 'Test Credit Card',
          payment_due_day: 15,
          billing_cycle_day: 25
        })
      );
    });
  });

  /**
   * Test editing existing credit card loads billing_cycle_day
   * Requirements: 6.1
   */
  it('should load billing_cycle_day when editing existing credit card', async () => {
    const existingCard = {
      id: 1,
      type: 'credit_card',
      display_name: 'My Card',
      full_name: 'My Credit Card',
      payment_due_day: 15,
      billing_cycle_day: 25
    };

    render(<PaymentMethodForm isOpen={true} method={existingCard} onSave={() => {}} onCancel={() => {}} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/statement closing day/i)).toBeInTheDocument();
    });

    // Verify the billing_cycle_day field has the correct value
    const input = screen.getByLabelText(/statement closing day/i);
    expect(input.value).toBe('25');
  });

  /**
   * Test valid billing_cycle_day values are accepted
   * Requirements: 6.4
   */
  it('should accept valid billing_cycle_day values (1-31)', async () => {
    const mockOnSave = vi.fn();
    
    render(<PaymentMethodForm isOpen={true} method={null} onSave={mockOnSave} onCancel={() => {}} />);

    // Change to credit card type
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'credit_card' } });

    await waitFor(() => {
      expect(screen.getByLabelText(/statement closing day/i)).toBeInTheDocument();
    });

    // Fill all required fields with valid values
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Test Card' } });
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Test Credit Card' } });
    fireEvent.change(screen.getByLabelText(/payment due day/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/statement closing day/i), { target: { value: '31' } });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    // Should not show validation errors
    await waitFor(() => {
      expect(screen.queryByText(/statement closing day must be between/i)).not.toBeInTheDocument();
    });

    // Verify API was called
    await waitFor(() => {
      expect(paymentMethodApi.createPaymentMethod).toHaveBeenCalledWith(
        expect.objectContaining({
          billing_cycle_day: 31
        })
      );
    });
  });
});

describe('PaymentMethodForm - Deactivation UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentMethodApi.getDisplayNames.mockResolvedValue([]);
    paymentMethodApi.setPaymentMethodActive.mockResolvedValue({ id: 1, is_active: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test deactivate button is shown when editing active payment method
   * Requirements: 4.1
   */
  it('should display deactivate button when editing active payment method', async () => {
    const activeMethod = {
      id: 1,
      type: 'cash',
      display_name: 'Cash',
      is_active: true
    };

    render(<PaymentMethodForm isOpen={true} method={activeMethod} onSave={() => {}} onCancel={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /deactivate/i })).toBeInTheDocument();
    });
  });

  /**
   * Test activate button is shown when editing inactive payment method
   * Requirements: 4.3
   */
  it('should display activate button when editing inactive payment method', async () => {
    const inactiveMethod = {
      id: 1,
      type: 'cash',
      display_name: 'Cash',
      is_active: false
    };

    render(<PaymentMethodForm isOpen={true} method={inactiveMethod} onSave={() => {}} onCancel={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /activate/i })).toBeInTheDocument();
    });
  });

  /**
   * Test deactivate button is not shown when creating new payment method
   * Requirements: 4.1
   */
  it('should not display deactivate button when creating new payment method', async () => {
    render(<PaymentMethodForm isOpen={true} method={null} onSave={() => {}} onCancel={() => {}} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /deactivate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /activate/i })).not.toBeInTheDocument();
  });

  /**
   * Test clicking deactivate button calls setPaymentMethodActive
   * Requirements: 4.2
   */
  it('should call setPaymentMethodActive when deactivate button is clicked', async () => {
    const mockOnSave = vi.fn();
    const activeMethod = {
      id: 1,
      type: 'cash',
      display_name: 'Cash',
      is_active: true
    };

    render(<PaymentMethodForm isOpen={true} method={activeMethod} onSave={mockOnSave} onCancel={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /deactivate/i })).toBeInTheDocument();
    });

    // Click deactivate button
    fireEvent.click(screen.getByRole('button', { name: /deactivate/i }));

    // Verify setPaymentMethodActive was called with correct arguments
    await waitFor(() => {
      expect(paymentMethodApi.setPaymentMethodActive).toHaveBeenCalledWith(1, false);
    });

    // Verify onSave was called to refresh the list
    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalled();
    });
  });

  /**
   * Test clicking activate button calls setPaymentMethodActive
   * Requirements: 4.4
   */
  it('should call setPaymentMethodActive when activate button is clicked', async () => {
    const mockOnSave = vi.fn();
    const inactiveMethod = {
      id: 1,
      type: 'cash',
      display_name: 'Cash',
      is_active: false
    };

    paymentMethodApi.setPaymentMethodActive.mockResolvedValue({ id: 1, is_active: true });

    render(<PaymentMethodForm isOpen={true} method={inactiveMethod} onSave={mockOnSave} onCancel={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /activate/i })).toBeInTheDocument();
    });

    // Click activate button
    fireEvent.click(screen.getByRole('button', { name: /activate/i }));

    // Verify setPaymentMethodActive was called with correct arguments
    await waitFor(() => {
      expect(paymentMethodApi.setPaymentMethodActive).toHaveBeenCalledWith(1, true);
    });

    // Verify onSave was called to refresh the list
    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalled();
    });
  });

  /**
   * Test error handling when deactivation fails
   * Requirements: 4.6
   */
  it('should display error message when deactivation fails', async () => {
    const activeMethod = {
      id: 1,
      type: 'cash',
      display_name: 'Cash',
      is_active: true
    };

    const errorMessage = 'Cannot deactivate payment method with pending transactions';
    paymentMethodApi.setPaymentMethodActive.mockRejectedValue(new Error(errorMessage));

    render(<PaymentMethodForm isOpen={true} method={activeMethod} onSave={() => {}} onCancel={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /deactivate/i })).toBeInTheDocument();
    });

    // Click deactivate button
    fireEvent.click(screen.getByRole('button', { name: /deactivate/i }));

    // Verify error message is displayed
    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  /**
   * Test deactivate button is disabled while loading
   * Requirements: 4.2
   */
  it('should disable deactivate button while loading', async () => {
    const activeMethod = {
      id: 1,
      type: 'cash',
      display_name: 'Cash',
      is_active: true
    };

    // Make the API call take some time
    paymentMethodApi.setPaymentMethodActive.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ id: 1, is_active: false }), 100))
    );

    render(<PaymentMethodForm isOpen={true} method={activeMethod} onSave={() => {}} onCancel={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /deactivate/i })).toBeInTheDocument();
    });

    const deactivateButton = screen.getByRole('button', { name: /deactivate/i });
    
    // Click deactivate button
    fireEvent.click(deactivateButton);

    // Button should be disabled immediately
    expect(deactivateButton).toBeDisabled();
  });
});
