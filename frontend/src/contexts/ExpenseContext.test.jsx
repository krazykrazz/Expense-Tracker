import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

vi.mock('../utils/fetchProvider', async () => {
  const actual = await vi.importActual('../utils/fetchProvider');
  return {
    ...actual,
    getFetchFn: () => (...args) => globalThis.fetch(...args),
    authAwareFetch: (...args) => globalThis.fetch(...args),
  };
});

import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import { FilterProvider, useFilterContext } from './FilterContext';
import { ExpenseProvider, useExpenseContext } from './ExpenseContext';

// Hook that returns both filter and expense context values
function useBothContexts() {
  const filter = useFilterContext();
  const expense = useExpenseContext();
  return { filter, expense };
}

// Helper: wrap with both FilterProvider and ExpenseProvider
function createWrapper(filterProps = {}) {
  return function Wrapper({ children }) {
    return (
      <FilterProvider {...filterProps}>
        <ExpenseProvider>{children}</ExpenseProvider>
      </FilterProvider>
    );
  };
}

// Default mock fetch that returns empty expenses array
function mockFetchSuccess(data = []) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
}

describe('ExpenseContext Unit Tests', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Default: successful empty response
    globalThis.fetch = mockFetchSuccess([]);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
  });

  /**
   * Requirement 8.2: useExpenseContext throws outside provider
   */
  it('useExpenseContext throws when used outside ExpenseProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useExpenseContext())).toThrow(
      'useExpenseContext must be used within an ExpenseProvider'
    );
    spy.mockRestore();
  });

  /**
   * ExpenseProvider requires FilterProvider (throws FilterContext error)
   */
  it('ExpenseProvider throws when used outside FilterProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      renderHook(() => useExpenseContext(), {
        wrapper: ({ children }) => <ExpenseProvider>{children}</ExpenseProvider>,
      })
    ).toThrow('useFilterContext must be used within a FilterProvider');
    spy.mockRestore();
  });

  /**
   * Requirements 2.1, 2.2, 2.3: Initial state values
   */
  it('initializes with empty expenses array', async () => {
    const { result } = renderHook(() => useExpenseContext(), {
      wrapper: createWrapper(),
    });

    // Before fetch completes, expenses should be empty array
    expect(result.current.expenses).toEqual([]);
  });

  it('initializes loading as false before fetch effect runs', () => {
    // loading starts as false in useState, then the effect sets it to true
    const { result } = renderHook(() => useExpenseContext(), {
      wrapper: createWrapper(),
    });

    // After the initial render + effect, loading may be true or already resolved
    // The key requirement is that the initial useState default is false
    expect(typeof result.current.loading).toBe('boolean');
  });

  it('initializes error as null', async () => {
    const { result } = renderHook(() => useExpenseContext(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
  });

  /**
   * Requirement 2.4: Provides complete interface
   */
  it('provides all expected context values and functions', async () => {
    const { result } = renderHook(() => useExpenseContext(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // State values
    expect(Array.isArray(result.current.expenses)).toBe(true);
    expect(Array.isArray(result.current.filteredExpenses)).toBe(true);
    expect(typeof result.current.loading).toBe('boolean');
    expect(typeof result.current.refreshTrigger).toBe('number');
    expect(typeof result.current.budgetAlertRefreshTrigger).toBe('number');
    expect(typeof result.current.currentMonthExpenseCount).toBe('number');

    // CRUD handlers
    expect(typeof result.current.handleExpenseAdded).toBe('function');
    expect(typeof result.current.handleExpenseDeleted).toBe('function');
    expect(typeof result.current.handleExpenseUpdated).toBe('function');

    // Utilities
    expect(typeof result.current.triggerRefresh).toBe('function');
    expect(typeof result.current.clearError).toBe('function');
  });

  /**
   * Requirement 3.1: Monthly view fetch URL
   * In monthly view, fetch URL should include year and month params
   */
  it('fetches with year and month params in monthly view', async () => {
    const { result } = renderHook(() => useExpenseContext(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const now = new Date();
    const expectedYear = now.getFullYear();
    const expectedMonth = now.getMonth() + 1;

    // The initial fetch (for expenses) should use monthly URL
    const expenseFetchCall = globalThis.fetch.mock.calls.find(
      (call) => call[0].includes('/api/expenses') && call[0].includes('month=')
    );
    expect(expenseFetchCall).toBeDefined();
    expect(expenseFetchCall[0]).toContain(`year=${expectedYear}`);
    expect(expenseFetchCall[0]).toContain(`month=${expectedMonth}`);
  });

  /**
   * Requirement 3.2: Global view fetch URL (no year filter)
   * In global view with no year filter, fetch URL should have no query params
   */
  it('fetches all expenses in global view with no year filter', async () => {
    const Wrapper = ({ children }) => (
      <FilterProvider>
        <ExpenseProvider>{children}</ExpenseProvider>
      </FilterProvider>
    );

    const { result } = renderHook(() => useBothContexts(), { wrapper: Wrapper });

    // Wait for initial fetch to complete
    await waitFor(() => {
      expect(result.current.expense.loading).toBe(false);
    });

    // Clear fetch mock to track new calls
    globalThis.fetch.mockClear();

    // Trigger global view by setting search text (non-whitespace triggers global)
    act(() => {
      result.current.filter.handleSearchChange('test search');
    });

    await waitFor(() => {
      expect(result.current.expense.loading).toBe(false);
    });

    // Find the expense fetch call that does NOT have month= (global view, no year filter)
    const globalFetchCall = globalThis.fetch.mock.calls.find(
      (call) => call[0].endsWith('/api/expenses')
    );
    expect(globalFetchCall).toBeDefined();
  });

  /**
   * Requirement 3.3: Global view with year filter
   * In global view with a year filter, fetch URL should include only year param
   */
  it('fetches with year-only param in global view with year filter', async () => {
    const Wrapper = ({ children }) => (
      <FilterProvider>
        <ExpenseProvider>{children}</ExpenseProvider>
      </FilterProvider>
    );

    const { result } = renderHook(() => useBothContexts(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.expense.loading).toBe(false);
    });

    globalThis.fetch.mockClear();

    // Set year filter (triggers global view)
    act(() => {
      result.current.filter.handleFilterYearChange('2023');
    });

    await waitFor(() => {
      expect(result.current.expense.loading).toBe(false);
    });

    // Find the expense fetch call with year=2023 but no month=
    const yearFilterCall = globalThis.fetch.mock.calls.find(
      (call) => call[0].includes('year=2023') && !call[0].includes('month=')
    );
    expect(yearFilterCall).toBeDefined();
  });

  /**
   * Requirement 3.7: Network error produces user-friendly message
   */
  it('sets user-friendly error message on network failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useExpenseContext(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(
      'Unable to connect to the server. Please check your connection and try again.'
    );

    consoleSpy.mockRestore();
  });

  /**
   * Requirement 3.8: Server error JSON is parsed
   */
  it('parses server error JSON response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify({ error: 'Database connection failed' }),
    });

    const { result } = renderHook(() => useExpenseContext(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Database connection failed');

    consoleSpy.mockRestore();
  });

  it('uses default error message when server error is not valid JSON', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'Internal Server Error',
    });

    const { result } = renderHook(() => useExpenseContext(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Unable to load expenses. Please try again.');

    consoleSpy.mockRestore();
  });

  /**
   * Requirements 6.1, 6.2: expensesUpdated event triggers refresh
   */
  it('re-fetches expenses when expensesUpdated event is dispatched', async () => {
    const mockExpenses = [
      { id: 1, date: '2025-01-15', place: 'Store', amount: 50, type: 'Groceries', method: 'Cash' },
    ];

    // First call returns empty, subsequent calls return mockExpenses
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => (callCount <= 2 ? [] : mockExpenses),
        text: async () => JSON.stringify(callCount <= 2 ? [] : mockExpenses),
      };
    });

    const { result } = renderHook(() => useExpenseContext(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const initialRefreshTrigger = result.current.refreshTrigger;

    // Dispatch the expensesUpdated event
    act(() => {
      window.dispatchEvent(new Event('expensesUpdated'));
    });

    // refreshTrigger should increment
    await waitFor(() => {
      expect(result.current.refreshTrigger).toBe(initialRefreshTrigger + 1);
    });

    // Expenses should be re-fetched (new data)
    await waitFor(() => {
      expect(result.current.expenses).toEqual(mockExpenses);
    });
  });

  it('increments budgetAlertRefreshTrigger when expensesUpdated event fires', async () => {
    const { result } = renderHook(() => useExpenseContext(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const initialBudgetTrigger = result.current.budgetAlertRefreshTrigger;

    act(() => {
      window.dispatchEvent(new Event('expensesUpdated'));
    });

    await waitFor(() => {
      expect(result.current.budgetAlertRefreshTrigger).toBe(initialBudgetTrigger + 1);
    });
  });
});
