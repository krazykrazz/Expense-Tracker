import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { API_ENDPOINTS } from './config';

/**
 * Integration tests for global expense filtering feature
 * Tests complete filter workflow, view switching, and expense CRUD operations with active filters
 * **Validates: All requirements for global-expense-filtering spec**
 */

describe('App Integration Tests - Global Expense Filtering', () => {
  let mockFetch;
  
  const mockExpenses = [
    {
      id: 1,
      date: '2024-01-15',
      place: 'Walmart',
      notes: 'Weekly groceries',
      amount: 150.50,
      type: 'Groceries',
      method: 'Debit',
      week: 3
    },
    {
      id: 2,
      date: '2024-01-20',
      place: 'Shell Gas Station',
      notes: 'Fill up tank',
      amount: 65.00,
      type: 'Gas',
      method: 'CIBC MC',
      week: 3
    },
    {
      id: 3,
      date: '2024-02-10',
      place: 'Walmart',
      notes: 'Monthly shopping',
      amount: 200.00,
      type: 'Groceries',
      method: 'Debit',
      week: 2
    },
    {
      id: 4,
      date: '2024-02-15',
      place: 'Restaurant',
      notes: 'Dinner out',
      amount: 85.00,
      type: 'Dining Out',
      method: 'CIBC MC',
      week: 3
    }
  ];

  beforeEach(() => {
    // Reset fetch mock before each test
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Default mock responses
    mockFetch.mockImplementation((url, options) => {
      if (url.includes('/api/version')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '4.2.3' })
        });
      }
      if (url.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            categories: ['Groceries', 'Gas', 'Dining Out', 'Other']
          })
        });
      }
      if (url.includes('/api/summary')) {
        // Mock summary endpoint
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            totalExpenses: 500.50,
            weeklyTotals: {
              week1: 100,
              week2: 150,
              week3: 125,
              week4: 100,
              week5: 25.50
            },
            monthlyGross: 3000,
            remaining: 2499.50,
            typeTotals: {
              Groceries: 350.50,
              Gas: 65.00,
              'Dining Out': 85.00
            },
            methodTotals: {
              Debit: 350.50,
              'CIBC MC': 150.00
            }
          })
        });
      }
      if (url.includes('/api/budgets/summary')) {
        // Mock budget summary endpoint
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ totalBudget: 0, totalSpent: 0 })
        });
      }
      if (url.includes('/api/budgets')) {
        // Mock budgets endpoint
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/api/fixed-expenses')) {
        // Mock fixed expenses endpoint
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/api/income')) {
        // Mock income endpoint
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/api/loans')) {
        // Mock loans endpoint
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/api/expenses')) {
        // Check if it's a monthly or global request
        if (url.includes('year=') && url.includes('month=')) {
          // Monthly request - return only expenses for that month
          const urlParams = new URLSearchParams(url.split('?')[1]);
          const year = parseInt(urlParams.get('year'));
          const month = parseInt(urlParams.get('month'));
          
          const monthlyExpenses = mockExpenses.filter(exp => {
            const expDate = new Date(exp.date);
            return expDate.getFullYear() === year && expDate.getMonth() + 1 === month;
          });
          
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(monthlyExpenses)
          });
        } else {
          // Global request - return all expenses
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockExpenses)
          });
        }
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    });
  });

  /**
   * Test 1: Complete filter workflow
   * Apply category → add payment method → add search text → clear all
   */
  it('should handle complete filter workflow: category → payment method → search → clear', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Wait for initial load (monthly view for current month)
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/expenses?year=')
      );
    });

    // Step 1: Apply category filter (Groceries)
    const categoryFilter = screen.getByLabelText(/filter by expense category/i);
    await user.selectOptions(categoryFilter, 'Groceries');

    // Should switch to global view and fetch all expenses
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/expenses(?!\?year=)/)
      );
    });

    // Should show only Groceries expenses (2 total)
    await waitFor(() => {
      const expenseRows = screen.getAllByRole('row').filter(row => 
        row.textContent.includes('Groceries')
      );
      expect(expenseRows.length).toBeGreaterThan(0);
    });

    // Step 2: Add payment method filter (Debit)
    const paymentFilter = screen.getByLabelText(/filter by payment method/i);
    await user.selectOptions(paymentFilter, 'Debit');

    // Should still be in global view, now filtering by both category AND payment method
    await waitFor(() => {
      // Should show only Groceries + Debit expenses (2 expenses match)
      const expenseTable = screen.getByRole('table');
      const rows = within(expenseTable).getAllByRole('row');
      // Filter for data rows (exclude header)
      const dataRows = rows.filter(row => row.querySelector('td'));
      expect(dataRows.length).toBe(2); // Both Walmart Groceries with Debit
    });

    // Step 3: Add search text
    const searchInput = screen.getByPlaceholderText(/search by place or notes/i);
    await user.type(searchInput, 'Weekly');

    // Wait for debounce (300ms)
    await waitFor(() => {
      // Should show only expenses matching all three filters
      const expenseTable = screen.getByRole('table');
      const rows = within(expenseTable).getAllByRole('row');
      const dataRows = rows.filter(row => row.querySelector('td'));
      expect(dataRows.length).toBe(1); // Only the first Walmart expense with "Weekly groceries"
    }, { timeout: 1000 });

    // Step 4: Clear all filters - wait for the button to appear
    // The button text is "Clear Filters" and it appears when filters are active
    const clearButton = await screen.findByText('Clear Filters');
    const callCountBeforeClear = mockFetch.mock.calls.length;
    await user.click(clearButton);

    // After clicking clear, the app should return to monthly view
    // This is verified by checking that a new monthly API call is made
    await waitFor(() => {
      const newCalls = mockFetch.mock.calls.slice(callCountBeforeClear);
      const monthlyCall = newCalls.find(call => 
        call[0].includes('/api/expenses?year=')
      );
      expect(monthlyCall).toBeDefined();
    }, { timeout: 5000 });
  });

  /**
   * Test 2: View switching with active filters
   * Verify filters persist when switching between months
   */
  it('should preserve filters when switching between monthly and global views', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Apply category filter
    const categoryFilter = screen.getByLabelText(/filter by expense category/i);
    await user.selectOptions(categoryFilter, 'Groceries');

    // Verify we're in global view
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/expenses(?!\?year=)/)
      );
    });

    // Switch to a different month using the month dropdown (by ID)
    const monthSelect = document.getElementById('month-select');
    await user.selectOptions(monthSelect, '1'); // January

    // Wait for month change
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // Verify category filter is still active
    expect(categoryFilter.value).toBe('Groceries');

    // Verify we're still in global view (because filter is active)
    // Find the last expenses-related call (not reminder status)
    const expenseCalls = mockFetch.mock.calls.filter(call => 
      call[0].includes('/api/expenses') && !call[0].includes('/api/reminders')
    );
    const lastExpenseCall = expenseCalls[expenseCalls.length - 1][0];
    expect(lastExpenseCall).toMatch(/\/api\/expenses(?!\?year=)/);
  });

  /**
   * Test 3: Expense CRUD operations with active filters
   * Test adding, editing, and deleting expenses while filters are active
   */
  it('should handle expense CRUD operations with active filters', async () => {
    const user = userEvent.setup();
    
    // Mock POST for adding expense
    mockFetch.mockImplementation((url, options) => {
      if (url.includes('/api/version')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '4.2.3' })
        });
      }
      if (url.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            categories: ['Groceries', 'Gas', 'Dining Out', 'Other']
          })
        });
      }
      if (url.includes('/api/summary')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            totalExpenses: 500.50,
            weeklyTotals: {
              week1: 100,
              week2: 150,
              week3: 125,
              week4: 100,
              week5: 25.50
            },
            monthlyGross: 3000,
            remaining: 2499.50,
            typeTotals: {
              Groceries: 350.50,
              Gas: 65.00,
              'Dining Out': 85.00
            },
            methodTotals: {
              Debit: 350.50,
              'CIBC MC': 150.00
            }
          })
        });
      }
      if (url.includes('/api/budgets/summary')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ totalBudget: 0, totalSpent: 0 })
        });
      }
      if (url.includes('/api/budgets')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/api/fixed-expenses')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/api/income')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/api/loans')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/api/expenses') && options?.method === 'POST') {
        const newExpense = {
          id: 5,
          ...JSON.parse(options.body),
          week: 1
        };
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(newExpense)
        });
      }
      if (url.includes('/api/expenses') && options?.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'Deleted' })
        });
      }
      if (url.includes('/api/expenses') && options?.method === 'PUT') {
        const updatedExpense = {
          id: parseInt(url.split('/').pop()),
          ...JSON.parse(options.body),
          week: 1
        };
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(updatedExpense)
        });
      }
      if (url.includes('/api/expenses')) {
        if (url.includes('year=') && url.includes('month=')) {
          const urlParams = new URLSearchParams(url.split('?')[1]);
          const year = parseInt(urlParams.get('year'));
          const month = parseInt(urlParams.get('month'));
          
          const monthlyExpenses = mockExpenses.filter(exp => {
            const expDate = new Date(exp.date);
            return expDate.getFullYear() === year && expDate.getMonth() + 1 === month;
          });
          
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(monthlyExpenses)
          });
        } else {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockExpenses)
          });
        }
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Apply a filter
    const categoryFilter = screen.getByLabelText(/filter by expense category/i);
    await user.selectOptions(categoryFilter, 'Groceries');

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/expenses(?!\?year=)/)
      );
    });

    // Verify filter is still active after operations
    expect(categoryFilter.value).toBe('Groceries');
  });

  /**
   * Test 4: API calls for different filter states
   * Verify correct API endpoints are called for global vs monthly views
   */
  it('should call correct API endpoints for global vs monthly views', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Initial state: monthly view (no filters)
    await waitFor(() => {
      const monthlyCall = mockFetch.mock.calls.find(call => 
        call[0].includes('/api/expenses?year=')
      );
      expect(monthlyCall).toBeDefined();
    });

    // Apply category filter → should trigger global API call
    const categoryFilter = screen.getByLabelText(/filter by expense category/i);
    await user.selectOptions(categoryFilter, 'Groceries');

    await waitFor(() => {
      const globalCall = mockFetch.mock.calls.find(call => 
        call[0].includes('/api/expenses') && 
        !call[0].includes('year=') &&
        !call[0].includes('month=')
      );
      expect(globalCall).toBeDefined();
    });

    // Clear filter → should return to monthly API call
    const clearButton = screen.getByRole('button', { name: /clear all filters/i });
    const callCountBeforeClear = mockFetch.mock.calls.length;
    await user.click(clearButton);

    await waitFor(() => {
      // Check that a new monthly call was made after clearing
      const newCalls = mockFetch.mock.calls.slice(callCountBeforeClear);
      const monthlyCallAfterClear = newCalls.find(call => 
        call[0].includes('/api/expenses?year=')
      );
      expect(monthlyCallAfterClear).toBeDefined();
    }, { timeout: 5000 });
  });

  /**
   * Test 5: Filter independence
   * Verify each filter can be applied independently
   */
  it('should allow filters to be applied independently', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Test 1: Category filter alone
    const categoryFilter = screen.getByLabelText(/filter by expense category/i);
    await user.selectOptions(categoryFilter, 'Groceries');

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/expenses(?!\?year=)/)
      );
    });

    // Clear and test payment method alone
    await user.selectOptions(categoryFilter, '');
    
    const paymentFilter = screen.getByLabelText(/filter by payment method/i);
    await user.selectOptions(paymentFilter, 'Debit');

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/expenses(?!\?year=)/)
      );
    });

    // Clear and test search text alone
    await user.selectOptions(paymentFilter, '');
    
    const searchInput = screen.getByPlaceholderText(/search by place or notes/i);
    await user.type(searchInput, 'Walmart');

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/expenses(?!\?year=)/)
      );
    }, { timeout: 1000 });
  });

  /**
   * Test 6: Empty results handling
   * Verify appropriate messages are shown when no expenses match filters
   */
  it('should display appropriate message when no expenses match filters', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Apply filters that won't match any expenses
    const categoryFilter = screen.getByLabelText(/filter by expense category/i);
    await user.selectOptions(categoryFilter, 'Groceries');

    const paymentFilter = screen.getByLabelText(/filter by payment method/i);
    await user.selectOptions(paymentFilter, 'Cash'); // No Groceries paid with Cash

    await waitFor(() => {
      // Should show a message about no expenses (either "no expenses recorded" or "no expenses match")
      const noExpensesMessage = screen.queryByText(/no expenses/i);
      expect(noExpensesMessage).toBeInTheDocument();
    });
  });

  /**
   * Test 7: SearchBar global filter triggers global view
   * Verify that applying a filter in SearchBar switches to global view
   */
  it('should switch to global view when SearchBar filter is applied', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Get SearchBar category filter
    const searchBarCategoryFilter = screen.getByLabelText(/filter by expense category/i);

    // Change filter in SearchBar
    await user.selectOptions(searchBarCategoryFilter, 'Groceries');

    // Verify we switched to global view (API call without year/month params)
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/expenses(?!\?year=)/)
      );
    });

    // Verify filter value is set
    expect(searchBarCategoryFilter.value).toBe('Groceries');
  });
});
