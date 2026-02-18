/**
 * @file ExpenseForm.futureMonths.test.jsx
 * @description
 * Tests for the Future Months feature in ExpenseForm component.
 * 
 * This file contains tests for:
 * - Future months checkbox rendering and behavior
 * - Date range preview display
 * - Future months dropdown selection
 * - API parameter passing (futureMonths)
 * - Success messages with future expense count
 * - Form reset after submission
 * 
 * Part of the test suite optimization effort to split the monolithic
 * ExpenseForm.test.jsx into focused, maintainable test files.
 * 
 * @see ExpenseForm.core.test.jsx - Basic form functionality
 * @see ExpenseForm.sections.test.jsx - Collapsible sections
 * @see ExpenseForm.people.test.jsx - People assignment feature
 * @see ExpenseForm.dataPreservation.test.jsx - Data persistence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  setupExpenseFormMocks,
  mockCategories as baseMockCategories,
  mockPaymentMethods,
  expandSection,
  fillBasicFieldsWithValues
} from '../test-utils/expenseFormHelpers';

// Extended categories for future months tests (includes Subscriptions)
const mockCategories = [
  ...baseMockCategories,
  'Subscriptions'
];

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

import * as expenseApi from '../services/expenseApi';
import * as categoriesApi from '../services/categoriesApi';

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

vi.mock('../contexts/ModalContext', () => ({
  useModalContext: () => ({ openFinancialOverview: vi.fn() }),
}));

import ExpenseForm from './ExpenseForm';

// Mock fetch globally
global.fetch = vi.fn();

// Global beforeEach to clear sessionStorage for all tests
beforeEach(() => {
  sessionStorage.clear();
});

describe('ExpenseForm - Future Months Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupExpenseFormMocks();
    
    // Override categories to include Subscriptions
    categoriesApi.getCategories.mockResolvedValue(mockCategories);
    
    // Override global fetch for categories
    global.fetch.mockImplementation((url) => {
      if (url.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            categories: mockCategories,
            budgetableCategories: [],
            taxDeductibleCategories: []
          })
        });
      }
      if (url.includes('/places')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/api/people')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test future months checkbox renders
   * Requirements: 1.1, 1.2
   */
  it('should render future months checkbox', async () => {
    render(<ExpenseForm onExpenseAdded={() => {}} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Expand Advanced Options section first
    const advancedOptionsHeader = screen.getByRole('button', { name: /Advanced Options/i });
    fireEvent.click(advancedOptionsHeader);

    // Wait for section to expand
    await waitFor(() => {
      expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('true');
    });

    // Find the future months checkbox by its label text
    expect(screen.getByText(/add to future months/i)).toBeInTheDocument();
  });

  /**
   * Test default value is unchecked (0 months)
   * Requirements: 1.7
   */
  it('should have future months checkbox unchecked by default', async () => {
    render(<ExpenseForm onExpenseAdded={() => {}} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Expand Advanced Options section first
    const advancedOptionsHeader = screen.getByRole('button', { name: /Advanced Options/i });
    fireEvent.click(advancedOptionsHeader);

    // Wait for section to expand
    await waitFor(() => {
      expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('true');
    });

    // Find the checkbox in the future-months-section
    const futureMonthsSection = document.querySelector('.future-months-section');
    const checkbox = futureMonthsSection.querySelector('input[type="checkbox"]');
    expect(checkbox.checked).toBe(false);
  });

  /**
   * Test date range preview display when future months > 0
   * Requirements: 1.1, 1.2
   */
  it('should show date range preview when future months checkbox is checked', async () => {
    render(<ExpenseForm onExpenseAdded={() => {}} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Expand Advanced Options section first
    const advancedOptionsHeader = screen.getByRole('button', { name: /Advanced Options/i });
    fireEvent.click(advancedOptionsHeader);

    // Wait for section to expand
    await waitFor(() => {
      expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('true');
    });

    // Initially, no preview should be shown
    expect(screen.queryByText(/will create/i)).not.toBeInTheDocument();

    // Check the future months checkbox
    const futureMonthsSection = document.querySelector('.future-months-section');
    const checkbox = futureMonthsSection.querySelector('input[type="checkbox"]');
    fireEvent.click(checkbox);

    // Preview should now be shown (default is 1 month when checked)
    await waitFor(() => {
      expect(screen.getByText(/will create 1 additional expense/i)).toBeInTheDocument();
    });
  });

  /**
   * Test future months resets to 0 after successful submission
   * Requirements: 1.7
   */
  it('should reset future months to 0 after successful submission', async () => {
    const mockOnExpenseAdded = vi.fn();
    
    // Mock successful expense creation with future expenses
    expenseApi.createExpense.mockResolvedValue({
      expense: { id: 1, type: 'Subscriptions' },
      futureExpenses: [
        { id: 2, date: '2025-02-15' },
        { id: 3, date: '2025-03-15' }
      ]
    });

    render(<ExpenseForm onExpenseAdded={mockOnExpenseAdded} />);

    // Wait for component to load and payment methods to be available - use specific selector
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/payment method/i)).toBeInTheDocument();
    });

    // Fill in required fields - use specific selector for date
    fireEvent.change(screen.getByLabelText(/^Date \*/i), { target: { value: '2025-01-15' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '15.99' } });
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'Subscriptions' } });
    // Use payment method ID (2 = Credit Card)
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: '2' } });

    // Expand Advanced Options section first
    const advancedOptionsHeader = screen.getByRole('button', { name: /Advanced Options/i });
    fireEvent.click(advancedOptionsHeader);

    // Wait for section to expand
    await waitFor(() => {
      expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('true');
    });

    // Check the future months checkbox and select 2 months
    const futureMonthsSection = document.querySelector('.future-months-section');
    const checkbox = futureMonthsSection.querySelector('input[type="checkbox"]');
    fireEvent.click(checkbox);

    // Wait for dropdown to appear and select 2 months
    await waitFor(() => {
      const dropdown = futureMonthsSection.querySelector('select');
      expect(dropdown).toBeInTheDocument();
      fireEvent.change(dropdown, { target: { value: '2' } });
    });

    // Submit the form
    fireEvent.submit(screen.getByRole('button', { name: /add expense/i }));

    // Wait for submission to complete
    await waitFor(() => {
      expect(expenseApi.createExpense).toHaveBeenCalled();
    });

    // After form reset, Advanced Options section should collapse
    // We need to expand it again to check the checkbox state
    await waitFor(() => {
      const advancedOptionsHeaderAfterReset = screen.getByRole('button', { name: /Advanced Options/i });
      expect(advancedOptionsHeaderAfterReset.getAttribute('aria-expanded')).toBe('false');
    });

    // Expand Advanced Options section again
    const advancedOptionsHeaderAfterReset = screen.getByRole('button', { name: /Advanced Options/i });
    fireEvent.click(advancedOptionsHeaderAfterReset);

    // Wait for section to expand
    await waitFor(() => {
      expect(advancedOptionsHeaderAfterReset.getAttribute('aria-expanded')).toBe('true');
    });

    // Future months checkbox should be unchecked after reset
    await waitFor(() => {
      const futureMonthsSectionAfterReset = document.querySelector('.future-months-section');
      const checkboxAfterReset = futureMonthsSectionAfterReset.querySelector('input[type="checkbox"]');
      expect(checkboxAfterReset.checked).toBe(false);
    });
  });

  /**
   * Test createExpense is called with futureMonths parameter
   * Requirements: 1.3
   */
  it('should pass futureMonths to createExpense API', async () => {
    const mockOnExpenseAdded = vi.fn();
    
    expenseApi.createExpense.mockResolvedValue({
      expense: { id: 1, type: 'Subscriptions' },
      futureExpenses: []
    });

    render(<ExpenseForm onExpenseAdded={mockOnExpenseAdded} />);

    // Wait for component to load and payment methods to be available
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/payment method/i)).toBeInTheDocument();
    });

    // Fill in required fields - use more specific selector for date to avoid matching posted_date
    fireEvent.change(screen.getByLabelText(/^date \*/i), { target: { value: '2025-01-15' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '15.99' } });
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'Subscriptions' } });
    // Use payment method ID (2 = Credit Card)
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: '2' } });

    // Expand Advanced Options section first
    const advancedOptionsHeader = screen.getByRole('button', { name: /Advanced Options/i });
    fireEvent.click(advancedOptionsHeader);

    // Wait for section to expand
    await waitFor(() => {
      expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('true');
    });

    // Check the future months checkbox and select 3 months
    const futureMonthsSection = document.querySelector('.future-months-section');
    const checkbox = futureMonthsSection.querySelector('input[type="checkbox"]');
    fireEvent.click(checkbox);

    // Wait for dropdown to appear and select 3 months
    await waitFor(() => {
      const dropdown = futureMonthsSection.querySelector('select');
      expect(dropdown).toBeInTheDocument();
      fireEvent.change(dropdown, { target: { value: '3' } });
    });

    // Submit the form
    fireEvent.submit(screen.getByRole('button', { name: /add expense/i }));

    // Verify createExpense was called with futureMonths parameter
    await waitFor(() => {
      expect(expenseApi.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Subscriptions'
        }),
        null, // no people allocations
        3     // futureMonths
      );
    });
  });

  /**
   * Test success message shows future expenses count
   * Requirements: 4.1, 4.2
   */
  it('should show success message with future expenses count', async () => {
    const mockOnExpenseAdded = vi.fn();
    
    expenseApi.createExpense.mockResolvedValue({
      expense: { id: 1, type: 'Subscriptions' },
      futureExpenses: [
        { id: 2, date: '2025-02-15' },
        { id: 3, date: '2025-03-15' },
        { id: 4, date: '2025-04-15' }
      ]
    });

    render(<ExpenseForm onExpenseAdded={mockOnExpenseAdded} />);

    // Wait for component to load and payment methods to be available
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/payment method/i)).toBeInTheDocument();
    });

    // Fill in required fields - use more specific selector for date to avoid matching posted_date
    fireEvent.change(screen.getByLabelText(/^date \*/i), { target: { value: '2025-01-15' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '15.99' } });
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'Subscriptions' } });
    // Use payment method ID (2 = Credit Card)
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: '2' } });

    // Expand Advanced Options section first
    const advancedOptionsHeader = screen.getByRole('button', { name: /Advanced Options/i });
    fireEvent.click(advancedOptionsHeader);

    // Wait for section to expand
    await waitFor(() => {
      expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('true');
    });

    // Check the future months checkbox and select 3 months
    const futureMonthsSection = document.querySelector('.future-months-section');
    const checkbox = futureMonthsSection.querySelector('input[type="checkbox"]');
    fireEvent.click(checkbox);

    // Wait for dropdown to appear and select 3 months
    await waitFor(() => {
      const dropdown = futureMonthsSection.querySelector('select');
      expect(dropdown).toBeInTheDocument();
      fireEvent.change(dropdown, { target: { value: '3' } });
    });

    // Submit the form
    fireEvent.submit(screen.getByRole('button', { name: /add expense/i }));

    // Verify success message shows future expenses info
    await waitFor(() => {
      expect(screen.getByText(/added to 3 future months/i)).toBeInTheDocument();
    });
  });

  /**
   * Test no preview shown when future months checkbox is unchecked
   * Requirements: 1.7
   */
  it('should not show preview when future months checkbox is unchecked', async () => {
    render(<ExpenseForm onExpenseAdded={() => {}} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Expand Advanced Options section first
    const advancedOptionsHeader = screen.getByRole('button', { name: /Advanced Options/i });
    fireEvent.click(advancedOptionsHeader);

    // Wait for section to expand
    await waitFor(() => {
      expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('true');
    });

    // Verify no preview is shown with default unchecked state
    expect(screen.queryByText(/will create/i)).not.toBeInTheDocument();

    // Check the future months checkbox
    const futureMonthsSection = document.querySelector('.future-months-section');
    const checkbox = futureMonthsSection.querySelector('input[type="checkbox"]');
    fireEvent.click(checkbox);

    // Preview should be shown
    await waitFor(() => {
      expect(screen.getByText(/will create/i)).toBeInTheDocument();
    });

    // Uncheck the checkbox
    fireEvent.click(checkbox);

    // Preview should be hidden again
    await waitFor(() => {
      expect(screen.queryByText(/will create/i)).not.toBeInTheDocument();
    });
  });
});
