import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

vi.mock('../services/peopleApi', () => ({
  getPeople: vi.fn()
}));

vi.mock('../services/expenseApi', () => ({
  createExpense: vi.fn(),
  getExpenses: vi.fn()
}));

vi.mock('../services/categorySuggestionApi', () => ({
  fetchCategorySuggestion: vi.fn()
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

import ExpenseForm from './ExpenseForm';



// Mock fetch globally
global.fetch = vi.fn();

describe('ExpenseForm - People Selection Enhancement', () => {
  const mockPeople = [
    { id: 1, name: 'John Doe', dateOfBirth: '1990-01-01' },
    { id: 2, name: 'Jane Smith', dateOfBirth: '1985-05-15' },
    { id: 3, name: 'Bob Johnson', dateOfBirth: '1992-12-10' }
  ];

  const mockCategories = [
    'Other', 'Groceries', 'Gas', 'Dining Out', 'Tax - Medical', 'Tax - Donation'
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock API responses
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
          json: () => Promise.resolve(mockPeople)
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    // Mock people API
    peopleApi.getPeople.mockResolvedValue(mockPeople);

    // Mock expense API
    expenseApi.createExpense.mockResolvedValue({ id: 1, type: 'Tax - Medical' });

    // Mock category suggestion API
    categorySuggestionApi.fetchCategorySuggestion.mockResolvedValue({ category: null });
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

    render(<ExpenseForm onExpenseAdded={mockOnExpenseAdded} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Fill in required fields
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2025-01-15' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '100.00' } });
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'Tax - Medical' } });
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'Cash' } });

    // Wait for people dropdown to appear
    await waitFor(() => {
      expect(screen.getByLabelText(/assign to people/i)).toBeInTheDocument();
    });

    // Select a single person
    const peopleSelect = screen.getByLabelText(/assign to people/i);
    fireEvent.change(peopleSelect, { target: { value: ['1'] } });

    // Submit the form
    fireEvent.submit(screen.getByRole('button', { name: /add expense/i }));

    // Verify createExpense was called with correct people allocation
    await waitFor(() => {
      expect(expenseApi.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Tax - Medical'
        }),
        [{ personId: 1, amount: 100 }],
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

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Fill in required fields
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2025-01-15' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '200.00' } });
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'Tax - Medical' } });
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'Cash' } });

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

    render(<ExpenseForm onExpenseAdded={mockOnExpenseAdded} />);

    // Wait for component to load and set up form for multiple people
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Fill in required fields
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2025-01-15' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '200.00' } });
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'Tax - Medical' } });
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'Cash' } });

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

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Fill in required fields for medical expense
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2025-01-15' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '50.00' } });
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'Tax - Medical' } });
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'Cash' } });

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


describe('ExpenseForm - Future Months Feature', () => {
  const mockCategories = [
    'Other', 'Groceries', 'Gas', 'Dining Out', 'Tax - Medical', 'Tax - Donation', 'Subscriptions'
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock API responses
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

    // Mock people API
    peopleApi.getPeople.mockResolvedValue([]);

    // Mock category suggestion API
    categorySuggestionApi.fetchCategorySuggestion.mockResolvedValue({ category: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test future months dropdown renders with correct options
   * Requirements: 1.1, 1.2
   */
  it('should render future months dropdown with options 0-12', async () => {
    render(<ExpenseForm onExpenseAdded={() => {}} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Find the future months dropdown
    const futureMonthsSelect = screen.getByLabelText(/add to future months/i);
    expect(futureMonthsSelect).toBeInTheDocument();

    // Verify it has 13 options (0-12)
    const options = futureMonthsSelect.querySelectorAll('option');
    expect(options).toHaveLength(13);

    // Verify first option is "Don't add"
    expect(options[0].textContent).toContain("Don't add");
    expect(options[0].value).toBe('0');

    // Verify last option is 12 months
    expect(options[12].textContent).toContain('12 future months');
    expect(options[12].value).toBe('12');
  });

  /**
   * Test default value is 0
   * Requirements: 1.7
   */
  it('should have default value of 0 for future months', async () => {
    render(<ExpenseForm onExpenseAdded={() => {}} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    const futureMonthsSelect = screen.getByLabelText(/add to future months/i);
    expect(futureMonthsSelect.value).toBe('0');
  });

  /**
   * Test date range preview display when future months > 0
   * Requirements: 1.1, 1.2
   */
  it('should show date range preview when future months > 0', async () => {
    render(<ExpenseForm onExpenseAdded={() => {}} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Initially, no preview should be shown
    expect(screen.queryByText(/will create/i)).not.toBeInTheDocument();

    // Select 3 future months
    const futureMonthsSelect = screen.getByLabelText(/add to future months/i);
    fireEvent.change(futureMonthsSelect, { target: { value: '3' } });

    // Preview should now be shown
    await waitFor(() => {
      expect(screen.getByText(/will create 3 additional expenses/i)).toBeInTheDocument();
    });

    // Preview should include "through" text
    expect(screen.getByText(/through/i)).toBeInTheDocument();
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

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Fill in required fields
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2025-01-15' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '15.99' } });
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'Subscriptions' } });
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'Credit Card' } });

    // Select 2 future months
    const futureMonthsSelect = screen.getByLabelText(/add to future months/i);
    fireEvent.change(futureMonthsSelect, { target: { value: '2' } });
    expect(futureMonthsSelect.value).toBe('2');

    // Submit the form
    fireEvent.submit(screen.getByRole('button', { name: /add expense/i }));

    // Wait for submission to complete
    await waitFor(() => {
      expect(expenseApi.createExpense).toHaveBeenCalled();
    });

    // Future months should be reset to 0
    await waitFor(() => {
      expect(futureMonthsSelect.value).toBe('0');
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

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Fill in required fields
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2025-01-15' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '15.99' } });
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'Subscriptions' } });
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'Credit Card' } });

    // Select 3 future months
    const futureMonthsSelect = screen.getByLabelText(/add to future months/i);
    fireEvent.change(futureMonthsSelect, { target: { value: '3' } });

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

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Fill in required fields
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2025-01-15' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '15.99' } });
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'Subscriptions' } });
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'Credit Card' } });

    // Select 3 future months
    const futureMonthsSelect = screen.getByLabelText(/add to future months/i);
    fireEvent.change(futureMonthsSelect, { target: { value: '3' } });

    // Submit the form
    fireEvent.submit(screen.getByRole('button', { name: /add expense/i }));

    // Verify success message shows future expenses info
    await waitFor(() => {
      expect(screen.getByText(/added to 3 future months/i)).toBeInTheDocument();
    });
  });

  /**
   * Test no preview shown when future months is 0
   * Requirements: 1.7
   */
  it('should not show preview when future months is 0', async () => {
    render(<ExpenseForm onExpenseAdded={() => {}} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Verify no preview is shown with default value of 0
    expect(screen.queryByText(/will create/i)).not.toBeInTheDocument();

    // Select 2 future months
    const futureMonthsSelect = screen.getByLabelText(/add to future months/i);
    fireEvent.change(futureMonthsSelect, { target: { value: '2' } });

    // Preview should be shown
    await waitFor(() => {
      expect(screen.getByText(/will create/i)).toBeInTheDocument();
    });

    // Change back to 0
    fireEvent.change(futureMonthsSelect, { target: { value: '0' } });

    // Preview should be hidden again
    await waitFor(() => {
      expect(screen.queryByText(/will create/i)).not.toBeInTheDocument();
    });
  });
});
