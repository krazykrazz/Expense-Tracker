import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/fetchProvider', async () => {
  const actual = await vi.importActual('../../utils/fetchProvider');
  return {
    ...actual,
    getFetchFn: () => (...args) => globalThis.fetch(...args),
    authAwareFetch: (...args) => globalThis.fetch(...args),
  };
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExpenseList from './ExpenseList';

// Mock fetch globally
global.fetch = vi.fn();

describe('ExpenseList Local Filter Tests', () => {
  const mockCategories = ['Groceries', 'Dining Out', 'Gas', 'Entertainment'];

  const mockExpenses = [
    {
      id: 1,
      date: '2025-01-15',
      place: 'Grocery Store',
      notes: 'Weekly shopping',
      amount: 150.5,
      type: 'Groceries',
      method: 'CIBC MC',
      week: 3,
    },
    {
      id: 2,
      date: '2025-01-16',
      place: 'Restaurant',
      notes: 'Dinner',
      amount: 45.0,
      type: 'Dining Out',
      method: 'Debit',
      week: 3,
    },
    {
      id: 3,
      date: '2025-01-17',
      place: 'Gas Station',
      notes: 'Fill up',
      amount: 60.0,
      type: 'Gas',
      method: 'VISA',
      week: 3,
    },
  ];

  beforeEach(() => {
    // Reset fetch mock before each test
    fetch.mockReset();

    // Mock the categories API call
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ categories: mockCategories }),
    });
  });

  /**
   * Test: ExpenseList renders with local filter dropdowns
   */
  it('should render local filter dropdowns', async () => {
    render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check that filter dropdowns are rendered
    const filterSelects = screen.getAllByRole('combobox');
    expect(filterSelects.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * Test: Local filters filter the expense list
   */
  it('should filter expenses when local type filter is changed', async () => {
    const { container } = render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Initially all expenses should be visible
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1); // header + data rows

    // Find the type filter dropdown
    const typeFilter = container.querySelector(
      '.filter-select[title*="type"]'
    );
    expect(typeFilter).toBeTruthy();

    // Change the filter to Groceries
    fireEvent.change(typeFilter, { target: { value: 'Groceries' } });

    // Wait for filter to apply
    await waitFor(() => {
      // Should show only Groceries expenses
      const rows = screen.getAllByRole('row').filter(row => row.querySelector('td'));
      expect(rows.length).toBe(1);
    });
  });

  /**
   * Test: bank-confirmed expenses colour their payment method pill instead of showing a separate icon
   */
  it('colours the payment method pill of bank-confirmed expenses, with the bank details on hover', async () => {
    const bankLink = { status: 'added', name: 'Grocery Store', rawName: 'GROCERY #12', date: '2025-01-15', amount: 150.5 };
    render(
      <ExpenseList
        expenses={[
          { ...mockExpenses[0], bankLink },
          { ...mockExpenses[1], amount: 50, bankLink: { ...bankLink, name: 'Restaurant', amount: 45 } },
          mockExpenses[2]
        ]}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getAllByTestId('bank-method-pill')).toHaveLength(2));
    const pills = screen.getAllByTestId('bank-method-pill');
    const confirmed = pills.find(pill => pill.dataset.bankState === 'confirmed');
    const differs = pills.find(pill => pill.dataset.bankState === 'differs');
    expect(confirmed).toHaveClass('method-pill', 'bank-pill-confirmed');
    expect(confirmed).toHaveTextContent('CIBC MC (confirmed by bank)');
    expect(confirmed.getAttribute('title')).toBe('Confirmed by bank: Grocery Store\nJan 15, 2025 · $150.50\nAdded from bank');
    expect(differs).toHaveClass('bank-pill-differs');
    expect(differs.getAttribute('title')).toMatch(/^Amount differs from bank: \$45\.00/);
    expect(screen.queryByTestId('bank-confirmed-indicator')).not.toBeInTheDocument();
  });

  /**
   * Test: Empty state message when no expenses exist
   */
  it('should display message when no expenses exist', async () => {
    render(
      <ExpenseList
        expenses={[]}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check for the no expenses message
    const message = screen.getByText(
      /No expenses have been recorded for this period/i
    );
    expect(message).toBeTruthy();
  });
});
