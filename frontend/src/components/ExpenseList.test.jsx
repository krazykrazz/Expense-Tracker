import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExpenseList from './ExpenseList';
import { PAYMENT_METHODS } from '../utils/constants';

// Mock fetch globally
global.fetch = vi.fn();

describe('ExpenseList Filter Synchronization Tests', () => {
  const mockCategories = ['Groceries', 'Dining Out', 'Gas', 'Entertainment'];
  
  const mockExpenses = [
    {
      id: 1,
      date: '2025-01-15',
      place: 'Grocery Store',
      notes: 'Weekly shopping',
      amount: 150.50,
      type: 'Groceries',
      method: 'CIBC MC',
      week: 3
    },
    {
      id: 2,
      date: '2025-01-16',
      place: 'Restaurant',
      notes: 'Dinner',
      amount: 45.00,
      type: 'Dining Out',
      method: 'Debit',
      week: 3
    },
    {
      id: 3,
      date: '2025-01-17',
      place: 'Gas Station',
      notes: 'Fill up',
      amount: 60.00,
      type: 'Gas',
      method: 'VISA',
      week: 3
    }
  ];

  beforeEach(() => {
    // Reset fetch mock before each test
    fetch.mockReset();
    
    // Mock the categories API call
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ categories: mockCategories })
    });
  });

  /**
   * Test: ExpenseList filters update when SearchBar filters change
   * This verifies that both sets of filters share the same state from App component
   */
  it('should update ExpenseList filters when filter props change (simulating SearchBar changes)', async () => {
    const onFilterTypeChange = vi.fn();
    const onFilterMethodChange = vi.fn();

    // Initial render with no filters
    const { rerender, container } = render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
        filterType=""
        filterMethod=""
        onFilterTypeChange={onFilterTypeChange}
        onFilterMethodChange={onFilterMethodChange}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      const selects = container.querySelectorAll('.filter-select');
      expect(selects.length).toBe(2);
    });

    // Get the filter dropdowns by title attribute
    let categorySelect = container.querySelector('.filter-select[title="Filter by type"]');
    let paymentMethodSelect = container.querySelector('.filter-select[title="Filter by payment method"]');

    // Verify initial state (no filters selected)
    expect(categorySelect.value).toBe('');
    expect(paymentMethodSelect.value).toBe('');

    // Simulate SearchBar changing the category filter (via App component state)
    rerender(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
        filterType="Groceries"
        filterMethod=""
        onFilterTypeChange={onFilterTypeChange}
        onFilterMethodChange={onFilterMethodChange}
      />
    );

    // Re-query after rerender
    categorySelect = container.querySelector('.filter-select[title="Filter by type"]');

    // Verify ExpenseList filter dropdown reflects the change
    expect(categorySelect.value).toBe('Groceries');

    // Simulate SearchBar changing both filters (via App component state)
    rerender(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
        filterType="Dining Out"
        filterMethod="Debit"
        onFilterTypeChange={onFilterTypeChange}
        onFilterMethodChange={onFilterMethodChange}
      />
    );

    // Re-query after rerender
    categorySelect = container.querySelector('.filter-select[title="Filter by type"]');
    paymentMethodSelect = container.querySelector('.filter-select[title="Filter by payment method"]');

    // Verify both ExpenseList filter dropdowns reflect the changes
    expect(categorySelect.value).toBe('Dining Out');
    expect(paymentMethodSelect.value).toBe('Debit');
  });

  /**
   * Test: SearchBar filters update when ExpenseList filters change
   * This verifies bidirectional synchronization through shared state
   */
  it('should call filter change callbacks when ExpenseList filters are changed', async () => {
    const onFilterTypeChange = vi.fn();
    const onFilterMethodChange = vi.fn();

    const { container } = render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
        filterType=""
        filterMethod=""
        onFilterTypeChange={onFilterTypeChange}
        onFilterMethodChange={onFilterMethodChange}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      const selects = container.querySelectorAll('.filter-select');
      expect(selects.length).toBe(2);
    });

    // Get the filter dropdowns by title attribute
    const categorySelect = container.querySelector('.filter-select[title="Filter by type"]');
    const paymentMethodSelect = container.querySelector('.filter-select[title="Filter by payment method"]');

    // Change category filter in ExpenseList
    fireEvent.change(categorySelect, { target: { value: 'Dining Out' } });
    expect(onFilterTypeChange).toHaveBeenCalledWith('Dining Out');
    expect(onFilterTypeChange).toHaveBeenCalledTimes(1);

    // Reset mocks
    vi.clearAllMocks();

    // Change payment method filter in ExpenseList (test separately to avoid interference)
    fireEvent.change(paymentMethodSelect, { target: { value: 'Cash' } });
    expect(onFilterMethodChange).toHaveBeenCalledWith('Cash');
    expect(onFilterMethodChange).toHaveBeenCalledTimes(1);
  });

  /**
   * Test: Empty state message displays when no expenses match filters
   */
  it('should display appropriate message when no expenses match filters', async () => {
    render(
      <ExpenseList
        expenses={[]}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText="nonexistent"
        onAddExpense={vi.fn()}
        filterType="Groceries"
        filterMethod="Cash"
        onFilterTypeChange={vi.fn()}
        onFilterMethodChange={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check for the no results message
    const message = screen.getByText(/No expenses match the selected filters/i);
    expect(message).toBeTruthy();
    
    // Verify the message includes filter details
    expect(message.textContent).toContain('search: "nonexistent"');
    expect(message.textContent).toContain('category: Groceries');
    expect(message.textContent).toContain('payment: Cash');
  });

  /**
   * Test: Empty state message for no filters active
   */
  it('should display default message when no expenses exist and no filters are active', async () => {
    render(
      <ExpenseList
        expenses={[]}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
        filterType=""
        filterMethod=""
        onFilterTypeChange={vi.fn()}
        onFilterMethodChange={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check for the default no expenses message
    const message = screen.getByText(/No expenses have been recorded for this period/i);
    expect(message).toBeTruthy();
  });

  /**
   * Test: Result count displays correctly when filters are active
   */
  it('should display result count when filters are active and expenses match', async () => {
    const filteredExpenses = [mockExpenses[0]]; // Only one expense

    render(
      <ExpenseList
        expenses={filteredExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
        filterType="Groceries"
        filterMethod=""
        onFilterTypeChange={vi.fn()}
        onFilterMethodChange={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check for the result count message
    const message = screen.getByText(/Showing 1 expense matching: Groceries/i);
    expect(message).toBeTruthy();
  });

  /**
   * Test: Result count displays correctly with multiple expenses
   */
  it('should display correct plural form for multiple matching expenses', async () => {
    const filteredExpenses = [mockExpenses[0], mockExpenses[2]]; // Two expenses

    render(
      <ExpenseList
        expenses={filteredExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText="store"
        onAddExpense={vi.fn()}
        filterType=""
        filterMethod="VISA"
        onFilterTypeChange={vi.fn()}
        onFilterMethodChange={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check for the result count message with plural form
    const message = screen.getByText(/Showing 2 expenses matching/i);
    expect(message).toBeTruthy();
    expect(message.textContent).toContain('"store"');
    expect(message.textContent).toContain('VISA');
  });

  /**
   * Test: No result count message when no filters are active
   */
  it('should not display result count message when no filters are active', async () => {
    render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
        filterType=""
        filterMethod=""
        onFilterTypeChange={vi.fn()}
        onFilterMethodChange={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check that no filter status message is displayed
    const message = screen.queryByText(/Showing.*matching/i);
    expect(message).toBeNull();
  });

  /**
   * Test: Clear filters button in ExpenseList clears both filters
   */
  it('should clear both filters when clear button is clicked in ExpenseList', async () => {
    const onFilterTypeChange = vi.fn();
    const onFilterMethodChange = vi.fn();

    render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
        filterType="Groceries"
        filterMethod="Credit Card"
        onFilterTypeChange={onFilterTypeChange}
        onFilterMethodChange={onFilterMethodChange}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Find and click the clear filters button
    const clearButton = screen.getByTitle('Clear filters');
    fireEvent.click(clearButton);

    // Verify both filter callbacks were called with empty strings
    expect(onFilterTypeChange).toHaveBeenCalledWith('');
    expect(onFilterMethodChange).toHaveBeenCalledWith('');
  });

  /**
   * Test: Clear filters button only appears when filters are active
   */
  it('should only show clear filters button when at least one filter is active', async () => {
    const { rerender } = render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
        filterType=""
        filterMethod=""
        onFilterTypeChange={vi.fn()}
        onFilterMethodChange={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // No filters active - button should not be present
    let clearButton = screen.queryByTitle('Clear filters');
    expect(clearButton).toBeNull();

    // Add a filter
    rerender(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
        filterType="Groceries"
        filterMethod=""
        onFilterTypeChange={vi.fn()}
        onFilterMethodChange={vi.fn()}
      />
    );

    // Filter active - button should be present
    clearButton = screen.getByTitle('Clear filters');
    expect(clearButton).toBeTruthy();
  });
});
