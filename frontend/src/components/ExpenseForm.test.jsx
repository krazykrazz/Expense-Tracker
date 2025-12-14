import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExpenseForm from './ExpenseForm';

// Mock all the modules that ExpenseForm depends on
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    CATEGORIES: '/api/categories',
    EXPENSES: '/api/expenses'
  }
}));

vi.mock('../utils/formatters', () => ({
  getTodayLocalDate: () => '2025-01-15'
}));

vi.mock('../utils/constants', () => ({
  PAYMENT_METHODS: ['Cash', 'Credit Card', 'Debit Card']
}));

vi.mock('../services/categorySuggestionApi', () => ({
  fetchCategorySuggestion: vi.fn()
}));

vi.mock('../services/peopleApi', () => ({
  getPeople: vi.fn()
}));

vi.mock('../services/expenseApi', () => ({
  createExpense: vi.fn()
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
      return Promise.reject(new Error('Unknown URL'));
    });

    // Mock people API
    const { getPeople } = require('../services/peopleApi');
    getPeople.mockResolvedValue(mockPeople);

    // Mock expense API
    const { createExpense } = require('../services/expenseApi');
    createExpense.mockResolvedValue({ id: 1, type: 'Tax - Medical' });

    // Mock category suggestion API
    const { fetchCategorySuggestion } = require('../services/categorySuggestionApi');
    fetchCategorySuggestion.mockResolvedValue({ category: null });
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
    const { createExpense } = require('../services/expenseApi');
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
      expect(createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 100,
          type: 'Tax - Medical'
        }),
        [{ personId: 1, amount: 100 }]
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
    const { createExpense } = require('../services/expenseApi');
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

    // Test "Split Equally" button
    const splitEquallyButton = screen.getByText(/split equally/i);
    fireEvent.click(splitEquallyButton);

    // Check that amounts are split equally
    const amountInputs = screen.getAllByDisplayValue('100.00');
    expect(amountInputs).toHaveLength(2);

    // Save allocation
    const saveButton = screen.getByText(/save allocation/i);
    fireEvent.click(saveButton);

    // Modal should close and form should submit
    await waitFor(() => {
      expect(screen.queryByText(/allocate expense amount/i)).not.toBeInTheDocument();
    });

    // Verify createExpense was called with correct allocations
    await waitFor(() => {
      expect(createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 200,
          type: 'Tax - Medical'
        }),
        expect.arrayContaining([
          { personId: 1, amount: 100 },
          { personId: 2, amount: 100 }
        ])
      );
    });
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
    const { createExpense } = require('../services/expenseApi');

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
      expect(createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 50,
          type: 'Tax - Medical'
        }),
        null // No people allocations
      );
    });
  });
});