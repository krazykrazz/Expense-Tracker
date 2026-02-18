/**
 * @file ExpenseForm.people.test.jsx
 * @description
 * Tests for the People Assignment feature in ExpenseForm.
 * 
 * This file focuses on:
 * - People dropdown visibility (medical expenses only)
 * - Single person selection
 * - Multiple people selection
 * - Person allocation modal
 * - People selection clearing
 * 
 * Part of the test suite optimization effort to split the monolithic
 * ExpenseForm.test.jsx into focused, maintainable test files.
 * 
 * @see ExpenseForm.core.test.jsx - Basic form functionality
 * @see ExpenseForm.sections.test.jsx - Collapsible sections
 * @see ExpenseForm.futureMonths.test.jsx - Future months feature
 * @see ExpenseForm.dataPreservation.test.jsx - Data persistence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { setupExpenseFormMocks, expandSection } from '../test-utils/expenseFormHelpers';

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
  ModalProvider: ({ children }) => children,
  useModalContext: () => ({ openFinancialOverview: vi.fn() }),
}));

import ExpenseForm from './ExpenseForm';

// Mock fetch globally
global.fetch = vi.fn();

describe('ExpenseForm - People Selection Enhancement', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    setupExpenseFormMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test people dropdown visibility for medical expenses
   * Requirements: 2.1, 2.2
   */
  it('should show people dropdown only for medical expenses', async () => {
    render(<ExpenseForm onExpenseAdded={() => {}} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    const typeSelect = screen.getByLabelText(/type/i);

    // Initially, people dropdown should not be visible (default type is "Other")
    expect(screen.queryByLabelText(/assign to people/i)).not.toBeInTheDocument();

    // Change to medical expense type
    fireEvent.change(typeSelect, { target: { value: 'Tax - Medical' } });

    // People Assignment collapsible section should appear
    await waitFor(() => {
      expect(screen.getByText('People Assignment')).toBeInTheDocument();
    });

    // Expand the People Assignment section to reveal the dropdown
    const headerButton = screen.getByText('People Assignment').closest('[role="button"]');
    fireEvent.click(headerButton);

    // People dropdown should now be visible
    await waitFor(() => {
      expect(screen.getByLabelText(/assign to people/i)).toBeInTheDocument();
    });

    // Change back to non-medical type
    fireEvent.change(typeSelect, { target: { value: 'Groceries' } });

    // People dropdown should be hidden again
    expect(screen.queryByLabelText(/assign to people/i)).not.toBeInTheDocument();
  });

  /**
   * Test single person selection
   * Requirements: 4.1, 4.2
   */
  it('should handle single person selection correctly', async () => {
    const mockOnExpenseAdded = vi.fn();

    const { container } = render(<ExpenseForm onExpenseAdded={mockOnExpenseAdded} />);

    // Wait for component to load and payment methods to be available
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/payment method/i)).toBeInTheDocument();
    });

    // Fill in required fields
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2025-01-15' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '100.00' } });
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'Tax - Medical' } });
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: '1' } });

    // Wait for People Assignment section to appear
    await waitFor(() => {
      expect(screen.getByText('People Assignment')).toBeInTheDocument();
    });

    // Expand People Assignment section using the helper
    await expandSection(container, 'People Assignment');

    // Wait for people dropdown to appear
    await waitFor(() => {
      expect(screen.getByLabelText(/assign to people/i)).toBeInTheDocument();
    });

    // Select a single person by clicking the option
    const peopleSelect = screen.getByLabelText(/assign to people/i);
    const options = peopleSelect.querySelectorAll('option');
    // Select John Doe (second option - first is the disabled placeholder)
    options[1].selected = true;
    fireEvent.change(peopleSelect);

    // Submit the form
    fireEvent.submit(screen.getByRole('button', { name: /add expense/i }));

    // Verify createExpense was called with correct people allocation
    await waitFor(() => {
      expect(expenseApi.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Tax - Medical'
        }),
        [{ personId: 1, amount: 100, originalAmount: null }],
        0 // futureMonths default
      );
    });
  });

  /**
   * Test multiple people selection triggers allocation modal
   * Requirements: 2.3, 4.3
   */
  it('should trigger allocation modal for multiple people selection', async () => {
    render(<ExpenseForm onExpenseAdded={() => {}} />);

    // Wait for component to load and payment methods to be available
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/payment method/i)).toBeInTheDocument();
    });

    // Fill in required fields
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2025-01-15' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '200.00' } });
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'Tax - Medical' } });
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: '1' } });

    // Expand People Assignment section
    await waitFor(() => {
      expect(screen.getByText('People Assignment')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('People Assignment').closest('[role="button"]'));

    // Wait for people dropdown to appear
    await waitFor(() => {
      expect(screen.getByLabelText(/assign to people/i)).toBeInTheDocument();
    });

    // Select multiple people
    const peopleSelect = screen.getByLabelText(/assign to people/i);
    
    // Simulate selecting multiple options (this is a bit tricky with jsdom)
    const options = peopleSelect.querySelectorAll('option');
    options[1].selected = true; // John Doe
    options[2].selected = true; // Jane Smith
    fireEvent.change(peopleSelect);

    // Submit the form - should trigger allocation modal instead of submitting
    fireEvent.submit(screen.getByRole('button', { name: /add expense/i }));

    // Allocation modal should appear
    await waitFor(() => {
      expect(screen.getByText(/allocate expense amount/i)).toBeInTheDocument();
    });
  });

  /**
   * Test allocation modal functionality
   * Requirements: 2.4, 4.4, 4.5
   */
  it('should handle allocation modal correctly', async () => {
    const mockOnExpenseAdded = vi.fn();

    const { container } = render(<ExpenseForm onExpenseAdded={mockOnExpenseAdded} />);

    // Wait for component to load and payment methods to be available
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/payment method/i)).toBeInTheDocument();
    });

    // Fill in required fields
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2025-01-15' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '200.00' } });
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'Tax - Medical' } });
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: '1' } });

    // Wait for People Assignment section to appear
    await waitFor(() => {
      expect(screen.getByText('People Assignment')).toBeInTheDocument();
    });

    // Expand People Assignment section using the helper
    await expandSection(container, 'People Assignment');

    // Wait for people dropdown and select multiple people
    await waitFor(() => {
      expect(screen.getByLabelText(/assign to people/i)).toBeInTheDocument();
    });

    const peopleSelect = screen.getByLabelText(/assign to people/i);
    const options = peopleSelect.querySelectorAll('option');
    options[1].selected = true; // John Doe
    options[2].selected = true; // Jane Smith
    fireEvent.change(peopleSelect);

    // Submit to trigger allocation modal
    fireEvent.submit(screen.getByRole('button', { name: /add expense/i }));

    // Wait for allocation modal
    await waitFor(() => {
      expect(screen.getByText(/allocate expense amount/i)).toBeInTheDocument();
    });

    // Verify modal has the expected buttons
    expect(screen.getByText(/split equally/i)).toBeInTheDocument();
    expect(screen.getByText(/save allocation/i)).toBeInTheDocument();
    expect(screen.getByText(/cancel/i)).toBeInTheDocument();

    // Test cancel button - modal should close without submitting
    const cancelButton = screen.getByText(/cancel/i);
    fireEvent.click(cancelButton);

    // Modal should close
    await waitFor(() => {
      expect(screen.queryByText(/allocate expense amount/i)).not.toBeInTheDocument();
    });

    // createExpense should not have been called since we cancelled
    expect(expenseApi.createExpense).not.toHaveBeenCalled();
  });

  /**
   * Test people selection clearing when changing away from medical expenses
   * Requirements: 2.1
   */
  it('should clear people selection when changing away from medical expenses', async () => {
    render(<ExpenseForm onExpenseAdded={() => {}} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    const typeSelect = screen.getByLabelText(/type/i);

    // Change to medical expense type
    fireEvent.change(typeSelect, { target: { value: 'Tax - Medical' } });

    // Expand People Assignment section
    await waitFor(() => {
      expect(screen.getByText('People Assignment')).toBeInTheDocument();
    });
    
    const headerButton = screen.getByText('People Assignment').closest('[role="button"]');
    fireEvent.click(headerButton);

    // Wait for section to expand
    await waitFor(() => {
      expect(headerButton.getAttribute('aria-expanded')).toBe('true');
    });

    // Wait for people dropdown and select someone
    await waitFor(() => {
      expect(screen.getByLabelText(/assign to people/i)).toBeInTheDocument();
    });

    const peopleSelect = screen.getByLabelText(/assign to people/i);
    fireEvent.change(peopleSelect, { target: { value: ['1'] } });

    // Verify selection info is shown
    await waitFor(() => {
      expect(screen.getByText(/selected: john doe/i)).toBeInTheDocument();
    });

    // Change to non-medical type
    fireEvent.change(typeSelect, { target: { value: 'Groceries' } });

    // People dropdown should be hidden
    expect(screen.queryByLabelText(/assign to people/i)).not.toBeInTheDocument();

    // Change back to medical - selection should be cleared
    fireEvent.change(typeSelect, { target: { value: 'Tax - Medical' } });

    // Wait for People Assignment section to reappear
    await waitFor(() => {
      expect(screen.getByText('People Assignment')).toBeInTheDocument();
    });
    
    // Get the header button again (it's a new element after type change)
    const headerButton2 = screen.getByText('People Assignment').closest('[role="button"]');
    
    // Check if it's already expanded or collapsed
    const isExpanded = headerButton2.getAttribute('aria-expanded') === 'true';
    
    // If collapsed, expand it
    if (!isExpanded) {
      fireEvent.click(headerButton2);
      
      // Wait for section to expand
      await waitFor(() => {
        expect(headerButton2.getAttribute('aria-expanded')).toBe('true');
      });
    }

    // Wait for people dropdown to be visible
    await waitFor(() => {
      expect(screen.getByLabelText(/assign to people/i)).toBeInTheDocument();
    });

    // Selection info should not be shown (selection was cleared)
    expect(screen.queryByText(/selected: john doe/i)).not.toBeInTheDocument();
  });

  /**
   * Test form validation with people selection
   * Requirements: 2.2, 4.1
   */
  it('should validate form correctly with people selection', async () => {
    render(<ExpenseForm onExpenseAdded={() => {}} />);

    // Wait for component to load and payment methods to be available
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/payment method/i)).toBeInTheDocument();
    });

    // Fill in required fields for medical expense
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2025-01-15' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '50.00' } });
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'Tax - Medical' } });
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: '1' } });

    // Submit without selecting people (should still work - people selection is optional)
    fireEvent.submit(screen.getByRole('button', { name: /add expense/i }));

    // Should submit successfully without people allocations
    await waitFor(() => {
      expect(expenseApi.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Tax - Medical'
        }),
        null, // No people allocations
        0 // futureMonths default
      );
    });
  });
});
