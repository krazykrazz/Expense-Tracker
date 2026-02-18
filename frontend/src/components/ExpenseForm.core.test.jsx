/**
 * @file ExpenseForm.core.test.jsx
 * @description
 * Core functionality tests for ExpenseForm component.
 * 
 * This file contains tests for:
 * - Basic form rendering and initial state
 * - Required field validation
 * - Form submission (happy path)
 * - Form reset after successful submission
 * - Default values (date, payment method memory)
 * - Error handling
 * 
 * This is part of the test suite optimization effort to split the monolithic
 * ExpenseForm.test.jsx into focused, maintainable test files that can run
 * in parallel for faster test execution.
 * 
 * Related test files:
 * - ExpenseForm.sections.test.jsx - Collapsible sections and badges
 * - ExpenseForm.people.test.jsx - People assignment feature
 * - ExpenseForm.futureMonths.test.jsx - Future months recurring feature
 * - ExpenseForm.dataPreservation.test.jsx - Data persistence during collapse/expand
 * 
 * @see {@link module:test-utils/expenseFormHelpers} for shared test utilities
 * @requirements 1.1, 1.5, 3.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  setupExpenseFormMocks,
  fillBasicFields,
  fillBasicFieldsWithValues,
  submitForm,
  mockCategories,
  mockPaymentMethods,
  mockPeople
} from '../test-utils/expenseFormHelpers';

// Mock ALL dependencies that might import config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    CATEGORIES: '/api/categories',
    EXPENSES: '/api/expenses',
    PEOPLE: '/api/people',
    SUGGEST_CATEGORY: '/api/expenses/suggest-category',
    PLACE_NAMES_ANALYZE: '/api/expenses/place-names/analyze',
    PLACE_NAMES_STANDARDIZE: '/api/expenses/place-names/standardize',
    REMINDER_STATUS: (year, month) => `/api/reminders/status/${year}/${month}`
  },
  default: 'http://localhost:2424'
}));

import * as peopleApi from '../services/peopleApi';
import * as expenseApi from '../services/expenseApi';
import * as categorySuggestionApi from '../services/categorySuggestionApi';
import * as categoriesApi from '../services/categoriesApi';
import * as paymentMethodApi from '../services/paymentMethodApi';

vi.mock('../services/peopleApi', () => ({
  getPeople: vi.fn()
}));

vi.mock('../services/expenseApi', () => ({
  createExpense: vi.fn(),
  getExpenses: vi.fn(),
  getPlaces: vi.fn(),
  updateExpense: vi.fn(),
  getExpenseWithPeople: vi.fn()
}));

vi.mock('../services/categorySuggestionApi', () => ({
  fetchCategorySuggestion: vi.fn()
}));

vi.mock('../services/categoriesApi', () => ({
  getCategories: vi.fn()
}));

vi.mock('../services/paymentMethodApi', () => ({
  getActivePaymentMethods: vi.fn(),
  getPaymentMethod: vi.fn()
}));

vi.mock('../utils/formatters', () => ({
  getTodayLocalDate: () => '2025-01-15'
}));

vi.mock('../utils/constants', () => ({
  PAYMENT_METHODS: ['Cash', 'Credit Card', 'Debit Card']
}));

vi.mock('./PersonAllocationModal', () => {
  return {
    default: ({ isOpen, onSave, onCancel, selectedPeople }) => {
      if (!isOpen) return null;
      return (
        <div data-testid="person-allocation-modal">
          <h3>Allocate Expense Amount</h3>
          <button onClick={() => onSave(selectedPeople.map(p => ({ ...p, amount: 100 })))}>
            Save Allocation
          </button>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={() => {
            // Simulate split equally
            const equalAmount = 200 / selectedPeople.length;
            onSave(selectedPeople.map(p => ({ ...p, amount: equalAmount })));
          }}>
            Split Equally
          </button>
        </div>
      );
    }
  };
});

vi.mock('../contexts/ModalContext', () => ({
  useModalContext: () => ({ openFinancialOverview: vi.fn() }),
}));

import ExpenseForm from './ExpenseForm';

// Mock fetch globally
global.fetch = vi.fn();

/**
 * ExpenseForm - Core Functionality Tests
 * 
 * Tests the fundamental operations of the ExpenseForm component including
 * rendering, validation, submission, and reset behavior.
 */
describe('ExpenseForm - Core Functionality', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    setupExpenseFormMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Form Rendering Tests ──

  /**
   * Test: Form renders with all required fields
   * Validates that the form displays all necessary input fields
   * Requirements: 1.1, 1.5
   */
  it('should render all required fields', async () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    // Wait for form to load
    await waitFor(() => {
      expect(screen.getByLabelText(/^Date \*/i)).toBeInTheDocument();
    });

    // Verify all required fields are present
    expect(screen.getByLabelText(/^Date \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Payment Method/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add expense/i })).toBeInTheDocument();
  });

  /**
   * Test: Form renders with optional Place field
   * Requirements: 1.1
   */
  it('should render optional Place field', async () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Place/i)).toBeInTheDocument();
    });
  });

  // ── Validation Tests ──

  /**
   * Test: Required field validation
   * Validates that form requires date, amount, type, and payment method
   * Requirements: 1.4
   */
  it('should validate required fields before submission', async () => {
    const user = userEvent.setup();
    const mockOnExpenseAdded = vi.fn();
    render(<ExpenseForm onExpenseAdded={mockOnExpenseAdded} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add expense/i })).toBeInTheDocument();
    });

    // Try to submit without filling any fields
    const submitButton = screen.getByRole('button', { name: /add expense/i });
    await user.click(submitButton);

    // Form should not submit (API should not be called)
    await waitFor(() => {
      expect(expenseApi.createExpense).not.toHaveBeenCalled();
    });
  });

  /**
   * Test: Amount field validation
   * Validates that amount must be a positive number
   * Requirements: 1.4
   */
  it('should validate amount is a positive number', async () => {
    const user = userEvent.setup();
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument();
    });

    const amountInput = screen.getByLabelText(/Amount/i);
    
    // Try negative amount
    await user.clear(amountInput);
    await user.type(amountInput, '-50');
    expect(amountInput.value).toBe('-50');

    // Fill other required fields
    const dateInput = screen.getByLabelText(/^Date \*/i);
    await user.clear(dateInput);
    await user.type(dateInput, '2025-01-15');
    
    const typeSelect = screen.getByLabelText(/Type/i);
    await user.selectOptions(typeSelect, 'Other');
    
    const paymentMethodSelect = screen.getByLabelText(/Payment Method/i);
    await user.selectOptions(paymentMethodSelect, '1');

    // Submit form
    const submitButton = screen.getByRole('button', { name: /add expense/i });
    await user.click(submitButton);

    // Should not submit with negative amount
    await waitFor(() => {
      expect(expenseApi.createExpense).not.toHaveBeenCalled();
    });
  });

  // ── Submission Tests ──

  /**
   * Test: Successful form submission with valid data
   * Requirements: 1.3, 1.4
   */
  it('should submit form with valid data', async () => {
    const mockOnExpenseAdded = vi.fn();
    expenseApi.createExpense.mockResolvedValue({ 
      id: 1, 
      date: '2025-01-15',
      amount: 100,
      type: 'Other',
      payment_method_id: 1
    });

    render(<ExpenseForm onExpenseAdded={mockOnExpenseAdded} />);

    // Fill in all required fields using helper
    await fillBasicFields();

    // Submit the form
    await submitForm();

    // Verify API was called with correct data
    await waitFor(() => {
      expect(expenseApi.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2025-01-15',
          amount: '100',
          type: 'Other',
          payment_method_id: 1
        }),
        null, // no people allocations
        0     // no future months
      );
    });

    // Verify callback was called
    expect(mockOnExpenseAdded).toHaveBeenCalled();
  });

  /**
   * Test: Form submission with Place field
   * Requirements: 1.3
   */
  it('should submit form with place field when provided', async () => {
    const user = userEvent.setup();
    const mockOnExpenseAdded = vi.fn();
    expenseApi.createExpense.mockResolvedValue({ id: 1 });

    render(<ExpenseForm onExpenseAdded={mockOnExpenseAdded} />);

    await fillBasicFields();

    // Add place
    const placeInput = screen.getByLabelText(/Place/i);
    await user.type(placeInput, 'Test Store');

    await submitForm();

    await waitFor(() => {
      expect(expenseApi.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          place: 'Test Store'
        }),
        null,
        0
      );
    });
  });

  // ── Form Reset Tests ──

  /**
   * Test: Form resets after successful submission
   * Requirements: 1.4
   */
  it('should reset form fields after successful submission', async () => {
    const user = userEvent.setup();
    const mockOnExpenseAdded = vi.fn();
    expenseApi.createExpense.mockResolvedValue({ id: 1 });

    render(<ExpenseForm onExpenseAdded={mockOnExpenseAdded} />);

    await fillBasicFields();

    // Add place for verification
    const placeInput = screen.getByLabelText(/Place/i);
    await user.type(placeInput, 'Test Store');

    await submitForm();

    // Wait for submission to complete
    await waitFor(() => {
      expect(mockOnExpenseAdded).toHaveBeenCalled();
    });

    // Verify form fields are reset (except payment method which is preserved)
    await waitFor(() => {
      expect(screen.getByLabelText(/Place/i).value).toBe('');
      expect(screen.getByLabelText(/Amount/i).value).toBe('');
      expect(screen.getByLabelText(/Type/i).value).toBe('Other'); // Default value
    });
  });

  /**
   * Test: Form clears amount after submission
   * Requirements: 1.4
   */
  it('should clear amount field after successful submission', async () => {
    const mockOnExpenseAdded = vi.fn();
    expenseApi.createExpense.mockResolvedValue({ id: 1 });

    render(<ExpenseForm onExpenseAdded={mockOnExpenseAdded} />);

    await fillBasicFields();
    await submitForm();

    await waitFor(() => {
      expect(mockOnExpenseAdded).toHaveBeenCalled();
    });

    // Amount should be cleared
    expect(screen.getByLabelText(/Amount/i).value).toBe('');
  });

  // ── Default Values Tests ──

  /**
   * Test: Date defaults to today
   * Requirements: 1.4
   */
  it('should default date to today', async () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^Date \*/i)).toBeInTheDocument();
    });

    const dateInput = screen.getByLabelText(/^Date \*/i);
    // getTodayLocalDate is mocked to return '2025-01-15'
    expect(dateInput.value).toBe('2025-01-15');
  });

  /**
   * Test: Type defaults to "Other"
   * Requirements: 1.4
   */
  it('should default type to "Other"', async () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    const typeSelect = screen.getByLabelText(/Type/i);
    expect(typeSelect.value).toBe('Other');
  });

  /**
   * Test: Payment method memory (preserves last used)
   * Requirements: 1.4
   */
  it('should preserve payment method after submission', async () => {
    const user = userEvent.setup();
    const mockOnExpenseAdded = vi.fn();
    expenseApi.createExpense.mockResolvedValue({ id: 1 });

    render(<ExpenseForm onExpenseAdded={mockOnExpenseAdded} />);

    await fillBasicFields();

    // Change to Credit Card (ID 2)
    const paymentMethodSelect = screen.getByLabelText(/Payment Method/i);
    await user.selectOptions(paymentMethodSelect, '2');

    await submitForm();

    await waitFor(() => {
      expect(mockOnExpenseAdded).toHaveBeenCalled();
    });

    // Payment method should still be Credit Card
    expect(screen.getByLabelText(/Payment Method/i).value).toBe('2');
  });

  // ── Error Handling Tests ──

  /**
   * Test: Handles API error gracefully
   * Requirements: 1.4
   */
  it('should handle API error during submission', async () => {
    const mockOnExpenseAdded = vi.fn();
    expenseApi.createExpense.mockRejectedValue(new Error('API Error'));

    render(<ExpenseForm onExpenseAdded={mockOnExpenseAdded} />);

    await fillBasicFields();
    await submitForm();

    // Wait for error handling
    await waitFor(() => {
      expect(expenseApi.createExpense).toHaveBeenCalled();
    });

    // Callback should not be called on error
    expect(mockOnExpenseAdded).not.toHaveBeenCalled();
  });

  /**
   * Test: Form remains usable after error
   * Requirements: 1.4
   */
  it('should allow resubmission after error', async () => {
    const mockOnExpenseAdded = vi.fn();
    
    // First call fails, second succeeds
    expenseApi.createExpense
      .mockRejectedValueOnce(new Error('API Error'))
      .mockResolvedValueOnce({ id: 1 });

    render(<ExpenseForm onExpenseAdded={mockOnExpenseAdded} />);

    await fillBasicFields();
    await submitForm();

    // Wait for first submission to fail
    await waitFor(() => {
      expect(expenseApi.createExpense).toHaveBeenCalledTimes(1);
    });

    // Try again
    await submitForm();

    // Second submission should succeed
    await waitFor(() => {
      expect(expenseApi.createExpense).toHaveBeenCalledTimes(2);
      expect(mockOnExpenseAdded).toHaveBeenCalled();
    });
  });
});
