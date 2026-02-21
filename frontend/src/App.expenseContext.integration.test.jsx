import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

/**
 * Integration tests for App.jsx with ExpenseContext
 * Validates that expense data flows correctly from ExpenseProvider to child components,
 * CRUD handlers update context state, view mode changes trigger re-fetch,
 * and filtered expenses update when filters change.
 *
 * **Validates: Requirements 10.1, 10.5, 10.7**
 */

describe('App.jsx ExpenseContext Integration', () => {
  let mockFetch;

  const mockExpenses = [
    { id: 1, date: '2026-02-10', place: 'Walmart', notes: 'Groceries', amount: 50, type: 'Groceries', method: 'Debit', week: 2 },
    { id: 2, date: '2026-02-15', place: 'Shell', notes: 'Gas fill', amount: 40, type: 'Gas', method: 'Cash', week: 3 },
    { id: 3, date: '2026-02-20', place: 'Amazon', notes: 'Books', amount: 30, type: 'Entertainment', method: 'Debit', week: 3 },
  ];

  const defaultMockImpl = (url, options) => {
    if (url.includes('/api/version')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '5.6.1' }) });
    }
    if (url.includes('/api/payment-methods')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          paymentMethods: [
            { id: 1, display_name: 'Debit', type: 'debit', is_active: 1 },
            { id: 2, display_name: 'Cash', type: 'cash', is_active: 1 },
          ]
        })
      });
    }
    if (url.includes('/api/people')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (url.includes('/api/summary')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          totalExpenses: 120, weeklyTotals: {}, monthlyGross: 3000,
          remaining: 2880, typeTotals: {}, methodTotals: {}
        })
      });
    }
    if (url.includes('/api/budgets/summary')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ totalBudget: 0, totalSpent: 0 }) });
    }
    if (url.includes('/api/budgets')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (url.includes('/api/fixed-expenses')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (url.includes('/api/income')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (url.includes('/api/loans')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (url.includes('/api/expenses')) {
      if (url.includes('year=') && url.includes('month=')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockExpenses) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockExpenses) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  };

  beforeEach(() => {
    mockFetch = vi.fn().mockImplementation(defaultMockImpl);
    global.fetch = mockFetch;
  });

  /**
   * Test: Expense data flows from ExpenseContext to ExpenseList via props
   * Validates: Requirement 10.1
   */
  it('should display expenses from ExpenseContext in ExpenseList', async () => {
    render(<App />);

    // Wait for expenses to load and render in the table
    await waitFor(() => {
      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row');
      const dataRows = rows.filter(row => row.querySelector('td'));
      expect(dataRows.length).toBe(3);
    });

    // Verify specific expense data is displayed
    expect(screen.getByText('Walmart')).toBeInTheDocument();
    expect(screen.getByText('Shell')).toBeInTheDocument();
    expect(screen.getByText('Amazon')).toBeInTheDocument();
  });

  /**
   * Test: View mode changes trigger re-fetch with correct URL
   * Validates: Requirement 10.7
   */
  it('should re-fetch expenses when view mode changes from monthly to global', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Wait for initial monthly load
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Verify initial monthly fetch was made
    await waitFor(() => {
      const monthlyCall = mockFetch.mock.calls.find(call =>
        call[0].includes('/api/expenses?year=') && call[0].includes('month=')
      );
      expect(monthlyCall).toBeDefined();
    });

    // Apply payment method filter to trigger global view
    const paymentFilter = screen.getByLabelText(/filter by payment method/i);
    await user.selectOptions(paymentFilter, 'Debit');

    // Should trigger a global fetch (no year/month params)
    await waitFor(() => {
      const globalCall = mockFetch.mock.calls.find(call =>
        call[0].includes('/api/expenses') &&
        !call[0].includes('year=') &&
        !call[0].includes('month=')
      );
      expect(globalCall).toBeDefined();
    });
  });

  /**
   * Test: Filtered expenses update when filters change
   * Validates: Requirement 10.5
   */
  it('should filter displayed expenses when category filter is applied', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Wait for all expenses to load
    await waitFor(() => {
      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row');
      const dataRows = rows.filter(row => row.querySelector('td'));
      expect(dataRows.length).toBe(3);
    });

    // Apply category filter for Groceries
    const categoryFilter = screen.getByLabelText(/filter by expense category/i);
    await user.selectOptions(categoryFilter, 'Groceries');

    // Should show only Groceries expenses (client-side filtering from context)
    await waitFor(() => {
      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row');
      const dataRows = rows.filter(row => row.querySelector('td'));
      expect(dataRows.length).toBe(1);
    });

    // Verify the correct expense is shown
    expect(screen.getByText('Walmart')).toBeInTheDocument();
    expect(screen.queryByText('Shell')).not.toBeInTheDocument();
    expect(screen.queryByText('Amazon')).not.toBeInTheDocument();
  });

  /**
   * Test: CRUD handler (delete) updates context state correctly
   * Validates: Requirement 10.1
   */
  it('should remove expense from list when delete handler is called via context', async () => {
    const user = userEvent.setup();

    // Track deleted IDs so re-fetches return the correct list
    const deletedIds = new Set();

    // Add DELETE support to mock, and make GET /expenses exclude deleted items
    mockFetch.mockImplementation((url, options) => {
      if (options?.method === 'DELETE' && url.includes('/api/expenses/')) {
        const idMatch = url.match(/\/api\/expenses\/(\d+)/);
        if (idMatch) deletedIds.add(parseInt(idMatch[1], 10));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ message: 'Deleted' }) });
      }
      if (url.includes('/api/expenses') && !options?.method) {
        const remaining = mockExpenses.filter(e => !deletedIds.has(e.id));
        return Promise.resolve({ ok: true, json: () => Promise.resolve(remaining) });
      }
      return defaultMockImpl(url, options);
    });

    render(<App />);

    // Wait for expenses to load
    await waitFor(() => {
      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row');
      const dataRows = rows.filter(row => row.querySelector('td'));
      expect(dataRows.length).toBe(3);
    });

    // Find and click the delete button for the first expense
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    const firstDataRow = rows.find(row => row.querySelector('td'));
    const deleteButton = within(firstDataRow).getByRole('button', { name: /delete/i });
    await user.click(deleteButton);

    // ExpenseList shows a confirm dialog — click the confirm button
    const confirmButton = await screen.findByRole('button', { name: /^delete$/i });
    await user.click(confirmButton);

    // After deletion, the expense should be removed from the list
    await waitFor(() => {
      const updatedTable = screen.getByRole('table');
      const updatedRows = within(updatedTable).getAllByRole('row');
      const updatedDataRows = updatedRows.filter(row => row.querySelector('td'));
      expect(updatedDataRows.length).toBe(2);
    });
  });
});
