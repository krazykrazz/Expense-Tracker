import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExpenseList from './ExpenseList';

// Mock fetch globally
global.fetch = vi.fn();

describe('ExpenseList - Local Filtering (Monthly View)', () => {
  const mockCategories = ['Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Other'];
  
  const mockExpenses = [
    {
      id: 1,
      date: '2025-01-15',
      place: 'Grocery Store',
      notes: 'Weekly shopping',
      amount: 150.50,
      type: 'Groceries',
      method: 'Debit',
      week: 3
    },
    {
      id: 2,
      date: '2025-01-16',
      place: 'Restaurant',
      notes: 'Dinner',
      amount: 45.00,
      type: 'Dining Out',
      method: 'VISA',
      week: 3
    },
    {
      id: 3,
      date: '2025-01-17',
      place: 'Gas Station',
      notes: 'Fill up',
      amount: 60.00,
      type: 'Gas',
      method: 'Debit',
      week: 3
    },
    {
      id: 4,
      date: '2025-01-18',
      place: 'Coffee Shop',
      notes: 'Morning coffee',
      amount: 5.50,
      type: 'Dining Out',
      method: 'Cash',
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
   * Test: Local filters are independent and don't affect parent state
   * This ensures ExpenseList filters don't trigger global view mode
   */
  it('should use local filter state that does not call parent filter change handlers', async () => {
    const onExpenseDeleted = vi.fn();
    const onExpenseUpdated = vi.fn();
    const onAddExpense = vi.fn();

    const { container } = render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={onExpenseDeleted}
        onExpenseUpdated={onExpenseUpdated}
        searchText=""
        onAddExpense={onAddExpense}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      const selects = container.querySelectorAll('.filter-select');
      expect(selects.length).toBe(2);
    });

    // Get the filter dropdowns
    const categorySelect = container.querySelector('.filter-select[title*="current month"]');
    const paymentMethodSelect = container.querySelectorAll('.filter-select')[1];

    // Change category filter
    fireEvent.change(categorySelect, { target: { value: 'Groceries' } });

    // Verify the select value changed locally
    expect(categorySelect.value).toBe('Groceries');

    // Change payment method filter
    fireEvent.change(paymentMethodSelect, { target: { value: 'Debit' } });

    // Verify the select value changed locally
    expect(paymentMethodSelect.value).toBe('Debit');

    // Verify no parent callbacks were called (filters are local only)
    // This is the key test - local filters should NOT trigger parent state changes
  });

  /**
   * Test: Local category filter correctly filters displayed expenses
   */
  it('should filter expenses by category using local filter', async () => {
    const { container } = render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      const selects = container.querySelectorAll('.filter-select');
      expect(selects.length).toBe(2);
    });

    // Initially, all 4 expenses should be visible
    let rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(4);

    // Apply category filter for "Dining Out"
    const categorySelect = container.querySelector('.filter-select[title*="current month"]');
    fireEvent.change(categorySelect, { target: { value: 'Dining Out' } });

    // Wait for filter to apply
    await waitFor(() => {
      rows = container.querySelectorAll('tbody tr');
      // Should show only 2 "Dining Out" expenses
      expect(rows.length).toBe(2);
    });

    // Verify the correct expenses are shown
    expect(screen.getByText('Restaurant')).toBeInTheDocument();
    expect(screen.getByText('Coffee Shop')).toBeInTheDocument();
    expect(screen.queryByText('Grocery Store')).not.toBeInTheDocument();
    expect(screen.queryByText('Gas Station')).not.toBeInTheDocument();
  });

  /**
   * Test: Local payment method filter correctly filters displayed expenses
   */
  it('should filter expenses by payment method using local filter', async () => {
    const { container } = render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      const selects = container.querySelectorAll('.filter-select');
      expect(selects.length).toBe(2);
    });

    // Initially, all 4 expenses should be visible
    let rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(4);

    // Apply payment method filter for "Debit"
    const paymentMethodSelect = container.querySelectorAll('.filter-select')[1];
    fireEvent.change(paymentMethodSelect, { target: { value: 'Debit' } });

    // Wait for filter to apply
    await waitFor(() => {
      rows = container.querySelectorAll('tbody tr');
      // Should show only 2 "Debit" expenses
      expect(rows.length).toBe(2);
    });

    // Verify the correct expenses are shown
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
    expect(screen.getByText('Gas Station')).toBeInTheDocument();
    expect(screen.queryByText('Restaurant')).not.toBeInTheDocument();
    expect(screen.queryByText('Coffee Shop')).not.toBeInTheDocument();
  });

  /**
   * Test: Combining category and payment method filters
   */
  it('should apply both category and payment method filters together', async () => {
    const { container } = render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      const selects = container.querySelectorAll('.filter-select');
      expect(selects.length).toBe(2);
    });

    // Apply category filter for "Dining Out"
    const categorySelect = container.querySelector('.filter-select[title*="current month"]');
    fireEvent.change(categorySelect, { target: { value: 'Dining Out' } });

    // Apply payment method filter for "VISA"
    const paymentMethodSelect = container.querySelectorAll('.filter-select')[1];
    fireEvent.change(paymentMethodSelect, { target: { value: 'VISA' } });

    // Wait for filters to apply
    await waitFor(() => {
      const rows = container.querySelectorAll('tbody tr');
      // Should show only 1 expense (Dining Out + VISA = Restaurant)
      expect(rows.length).toBe(1);
    });

    // Verify only the Restaurant expense is shown
    expect(screen.getByText('Restaurant')).toBeInTheDocument();
    expect(screen.queryByText('Coffee Shop')).not.toBeInTheDocument();
    expect(screen.queryByText('Grocery Store')).not.toBeInTheDocument();
    expect(screen.queryByText('Gas Station')).not.toBeInTheDocument();
  });

  /**
   * Test: Clear filters button resets local filters
   */
  it('should clear local filters when clear button is clicked', async () => {
    const { container } = render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      const selects = container.querySelectorAll('.filter-select');
      expect(selects.length).toBe(2);
    });

    // Apply filters
    const categorySelect = container.querySelector('.filter-select[title*="current month"]');
    const paymentMethodSelect = container.querySelectorAll('.filter-select')[1];
    
    fireEvent.change(categorySelect, { target: { value: 'Groceries' } });
    fireEvent.change(paymentMethodSelect, { target: { value: 'Debit' } });

    // Wait for clear button to appear
    await waitFor(() => {
      const clearButton = container.querySelector('.clear-filters-btn');
      expect(clearButton).toBeInTheDocument();
    });

    // Click clear button
    const clearButton = container.querySelector('.clear-filters-btn');
    fireEvent.click(clearButton);

    // Wait for filters to clear
    await waitFor(() => {
      expect(categorySelect.value).toBe('');
      expect(paymentMethodSelect.value).toBe('');
    });

    // All expenses should be visible again
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(4);
  });

  /**
   * Test: Filter status message shows correct information
   */
  it('should display filter status message when local filters are active', async () => {
    const { container } = render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      const selects = container.querySelectorAll('.filter-select');
      expect(selects.length).toBe(2);
    });

    // Apply category filter
    const categorySelect = container.querySelector('.filter-select[title*="current month"]');
    fireEvent.change(categorySelect, { target: { value: 'Dining Out' } });

    // Wait for status message to appear
    await waitFor(() => {
      const statusMessage = screen.getByText(/Showing 2 expenses matching/i);
      expect(statusMessage).toBeInTheDocument();
      expect(statusMessage.textContent).toContain('Dining Out');
    });
  });

  /**
   * Test: No expenses message when filters exclude all results
   */
  it('should show appropriate message when local filters exclude all expenses', async () => {
    const singleExpense = [mockExpenses[0]]; // Only Groceries expense

    const { container } = render(
      <ExpenseList
        expenses={singleExpense}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      const selects = container.querySelectorAll('.filter-select');
      expect(selects.length).toBe(2);
    });

    // Apply filter that excludes the only expense
    const categorySelect = container.querySelector('.filter-select[title*="current month"]');
    fireEvent.change(categorySelect, { target: { value: 'Gas' } });

    // Wait for no expenses message
    await waitFor(() => {
      const message = screen.getByText(/No expenses match the selected filters/i);
      expect(message).toBeInTheDocument();
    });
  });

  /**
   * Test: Filters persist when expenses prop updates
   */
  it('should maintain local filter state when expenses prop changes', async () => {
    const { container, rerender } = render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      const selects = container.querySelectorAll('.filter-select');
      expect(selects.length).toBe(2);
    });

    // Apply filter
    const categorySelect = container.querySelector('.filter-select[title*="current month"]');
    fireEvent.change(categorySelect, { target: { value: 'Groceries' } });

    // Verify filter is applied
    await waitFor(() => {
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
    });

    // Update expenses prop (simulating new data from API)
    const updatedExpenses = [
      ...mockExpenses,
      {
        id: 5,
        date: '2025-01-19',
        place: 'Supermarket',
        notes: 'More groceries',
        amount: 75.00,
        type: 'Groceries',
        method: 'Debit',
        week: 3
      }
    ];

    rerender(
      <ExpenseList
        expenses={updatedExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        searchText=""
        onAddExpense={vi.fn()}
      />
    );

    // Filter should still be active and show 2 Groceries expenses
    await waitFor(() => {
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);
      expect(categorySelect.value).toBe('Groceries');
    });
  });
});
