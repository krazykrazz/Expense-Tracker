import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';
import { useFilterContext } from './FilterContext';
import { useExpenseContext } from './ExpenseContext';
import { wrapperBuilder } from '../test-utils/wrappers.jsx';

// Hook that returns both filter and expense context values
function useBothContexts() {
  const filter = useFilterContext();
  const expense = useExpenseContext();
  return { filter, expense };
}

describe('ExpenseContext Property-Based Tests', () => {
  let originalFetch;
  const wrapper = wrapperBuilder().withFilter().withExpense().build();

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
  });

  // Helper: create a mock fetch that records URLs
  function createMockFetch() {
    const calls = [];
    const mockFn = vi.fn().mockImplementation(async (url) => {
      calls.push(url);
      return {
        ok: true,
        json: async () => [],
        text: async () => '[]',
      };
    });
    return { mockFn, calls };
  }

  /**
   * **Feature: expense-context, Property 1: Fetch URL construction matches view mode**
   *
   * For any combination of view mode (monthly vs global), selectedYear, selectedMonth,
   * and filterYear, the expense fetch URL SHALL be:
   * - `?year={selectedYear}&month={selectedMonth}` when in monthly view
   * - no query params when in global view with no year filter
   * - `?year={filterYear}` when in global view with a year filter
   *
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
   */
  describe('Property 1: Fetch URL construction matches view mode', () => {
    /**
     * Property 1a: Monthly view fetch URL includes year and month
     * (Req 3.1) - In monthly view, URL = EXPENSES?year={selectedYear}&month={selectedMonth}
     */
    it('1a: monthly view constructs URL with year and month params', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2000, max: 2100 }),
          fc.integer({ min: 1, max: 12 }),
          async (year, month) => {
            cleanup();
            const { mockFn, calls } = createMockFetch();
            globalThis.fetch = mockFn;

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Clear recorded calls, then change month
            calls.length = 0;

            act(() => {
              result.current.filter.handleMonthChange(year, month);
            });

            // Wait for the re-fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Verify we're in monthly view
            expect(result.current.filter.isGlobalView).toBe(false);

            // Find the expense fetch call with the correct year and month
            const expenseFetchUrl = calls.find(
              (url) => url.includes('/api/expenses') &&
                       url.includes(`year=${year}`) &&
                       url.includes(`month=${month}`)
            );

            expect(expenseFetchUrl).toBeDefined();
            // Verify it has both year AND month params
            expect(expenseFetchUrl).toMatch(/\?year=\d+&month=\d+/);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1b: Global view without year filter constructs URL with no query params
     * (Req 3.2) - In global view with no year filter, URL = EXPENSES (no params)
     */
    it('1b: global view without year filter constructs URL with no query params', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Use a non-empty search text to trigger global view without setting filterYear
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          fc.integer({ min: 2000, max: 2100 }),
          fc.integer({ min: 1, max: 12 }),
          async (searchText, year, month) => {
            cleanup();
            const { mockFn, calls } = createMockFetch();
            globalThis.fetch = mockFn;

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Set month first
            act(() => {
              result.current.filter.handleMonthChange(year, month);
            });

            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Clear recorded calls, then trigger global view via search text
            calls.length = 0;

            act(() => {
              result.current.filter.handleSearchChange(searchText);
            });

            // Wait for re-fetch
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Verify we're in global view
            expect(result.current.filter.isGlobalView).toBe(true);

            // The expense fetch URL should have NO query params (ends with /api/expenses)
            const globalFetchUrl = calls.find(
              (url) => url.endsWith('/api/expenses')
            );

            expect(globalFetchUrl).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1c: Global view with year filter constructs URL with only year param
     * (Req 3.3) - In global view with year filter, URL = EXPENSES?year={filterYear}
     */
    it('1c: global view with year filter constructs URL with year-only param', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2000, max: 2100 }),
          fc.integer({ min: 2000, max: 2100 }),
          fc.integer({ min: 1, max: 12 }),
          async (filterYear, selectedYear, selectedMonth) => {
            cleanup();
            const { mockFn, calls } = createMockFetch();
            globalThis.fetch = mockFn;

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Set month
            act(() => {
              result.current.filter.handleMonthChange(selectedYear, selectedMonth);
            });

            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Clear recorded calls, then set filterYear (triggers global view)
            calls.length = 0;

            act(() => {
              result.current.filter.handleFilterYearChange(String(filterYear));
            });

            // Wait for re-fetch
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Verify we're in global view
            expect(result.current.filter.isGlobalView).toBe(true);

            // The expense fetch URL should have year=filterYear but NO month param
            const yearFilterUrl = calls.find(
              (url) => url.includes('/api/expenses') &&
                       url.includes(`year=${filterYear}`) &&
                       !url.includes('month=')
            );

            expect(yearFilterUrl).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1d: View mode change triggers re-fetch with correct URL
     * (Req 3.4) - When isGlobalView or filterYear changes, re-fetch occurs
     * Tests the transition from monthly → global → monthly
     */
    it('1d: view mode transitions trigger re-fetch with correct URL pattern', { timeout: 120000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2000, max: 2100 }),
          fc.integer({ min: 1, max: 12 }),
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          async (year, month, searchText) => {
            cleanup();
            const { mockFn, calls } = createMockFetch();
            globalThis.fetch = mockFn;

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial monthly fetch
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Set specific month
            act(() => {
              result.current.filter.handleMonthChange(year, month);
            });

            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Verify we're in monthly view
            expect(result.current.filter.isGlobalView).toBe(false);

            // Clear and switch to global view
            calls.length = 0;

            act(() => {
              result.current.filter.handleSearchChange(searchText);
            });

            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Should have fetched with global URL (no params)
            expect(result.current.filter.isGlobalView).toBe(true);
            const globalUrl = calls.find(url => url.endsWith('/api/expenses'));
            expect(globalUrl).toBeDefined();

            // Clear and return to monthly view
            calls.length = 0;

            act(() => {
              result.current.filter.handleReturnToMonthlyView();
            });

            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Should have fetched with monthly URL (year + month params)
            expect(result.current.filter.isGlobalView).toBe(false);
            const monthlyUrl = calls.find(
              (url) => url.includes(`year=${year}`) && url.includes(`month=${month}`)
            );
            expect(monthlyUrl).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: expense-context, Property 2: Loading state transitions during fetch**
   *
   * For any expense fetch cycle (triggered by view mode or filter changes),
   * loading SHALL be true while the fetch is in progress and false after it
   * completes (whether success or failure).
   *
   * **Validates: Requirements 3.5, 3.6, 3.7, 3.8**
   */
  describe('Property 2: Loading state transitions during fetch', () => {
    // Helper: create a deferred fetch mock that we can resolve/reject manually
    function createDeferredFetch() {
      let resolvePromise;
      let rejectPromise;
      const calls = [];
      const mockFn = vi.fn().mockImplementation((url) => {
        calls.push(url);
        return new Promise((resolve, reject) => {
          resolvePromise = resolve;
          rejectPromise = reject;
        });
      });
      return {
        mockFn,
        calls,
        resolve: (data = []) => resolvePromise({
          ok: true,
          json: async () => data,
          text: async () => JSON.stringify(data),
        }),
        reject: (err) => rejectPromise(err),
        resolveError: (status = 500, body = '{"error":"Server error"}') => resolvePromise({
          ok: false,
          status,
          json: async () => JSON.parse(body),
          text: async () => body,
        }),
      };
    }

    /**
     * Property 2a: Loading is true during fetch on successful completion
     * (Req 3.5, 3.6) - loading=true when fetch begins, loading=false after success
     */
    it('2a: loading is true during fetch and false after successful completion', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2000, max: 2100 }),
          fc.integer({ min: 1, max: 12 }),
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 10000 }),
              date: fc.constant('2024-01-15'),
              place: fc.string({ minLength: 1, maxLength: 20 }),
              amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
              type: fc.constant('Groceries'),
              method: fc.constant('Cash'),
            }),
            { minLength: 0, maxLength: 5 }
          ),
          async (year, month, expenseData) => {
            cleanup();

            // Start with a quick-resolving fetch for the initial mount
            const initialFetch = createMockFetch();
            globalThis.fetch = initialFetch.mockFn;

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Now set up a deferred fetch so we can observe loading=true
            const deferred = createDeferredFetch();
            globalThis.fetch = deferred.mockFn;

            // Trigger a re-fetch by changing month
            act(() => {
              result.current.filter.handleMonthChange(year, month);
            });

            // Loading should be true while fetch is in progress
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(true);
            });

            // Resolve the fetch with expense data
            await act(async () => {
              deferred.resolve(expenseData);
            });

            // Loading should be false after successful completion
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Error should be null on success
            expect(result.current.expense.error).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2b: Loading is true during fetch and false after server error
     * (Req 3.5, 3.8) - loading=true when fetch begins, loading=false after server error
     */
    it('2b: loading is true during fetch and false after server error', { timeout: 60000 }, async () => {
      // Suppress console.error for expected error logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 2000, max: 2100 }),
            fc.integer({ min: 1, max: 12 }),
            fc.constantFrom(400, 404, 500, 502, 503),
            fc.string({ minLength: 1, maxLength: 50 }),
            async (year, month, statusCode, errorMsg) => {
              cleanup();

              // Start with a quick-resolving fetch for the initial mount
              const initialFetch = createMockFetch();
              globalThis.fetch = initialFetch.mockFn;

              const { result } = renderHook(() => useBothContexts(), {
                wrapper,
              });

              // Wait for initial fetch to complete
              await waitFor(() => {
                expect(result.current.expense.loading).toBe(false);
              });

              // Now set up a deferred fetch so we can observe loading=true
              const deferred = createDeferredFetch();
              globalThis.fetch = deferred.mockFn;

              // Trigger a re-fetch by changing month
              act(() => {
                result.current.filter.handleMonthChange(year, month);
              });

              // Loading should be true while fetch is in progress
              await waitFor(() => {
                expect(result.current.expense.loading).toBe(true);
              });

              // Resolve with a server error
              await act(async () => {
                deferred.resolveError(statusCode, JSON.stringify({ error: errorMsg }));
              });

              // Loading should be false after error
              await waitFor(() => {
                expect(result.current.expense.loading).toBe(false);
              });

              // Error should be set (non-null)
              expect(result.current.expense.error).toBeTruthy();
            }
          ),
          { numRuns: 100 }
        );
      } finally {
        consoleSpy.mockRestore();
      }
    });

    /**
     * Property 2c: Loading is true during fetch and false after network error
     * (Req 3.5, 3.7) - loading=true when fetch begins, loading=false after network failure
     */
    it('2c: loading is true during fetch and false after network error', { timeout: 60000 }, async () => {
      // Suppress console.error for expected error logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 2000, max: 2100 }),
            fc.integer({ min: 1, max: 12 }),
            fc.constantFrom('Failed to fetch', 'NetworkError when attempting to fetch resource', 'fetch failed'),
            async (year, month, networkErrorMsg) => {
              cleanup();

              // Start with a quick-resolving fetch for the initial mount
              const initialFetch = createMockFetch();
              globalThis.fetch = initialFetch.mockFn;

              const { result } = renderHook(() => useBothContexts(), {
                wrapper,
              });

              // Wait for initial fetch to complete
              await waitFor(() => {
                expect(result.current.expense.loading).toBe(false);
              });

              // Now set up a deferred fetch so we can observe loading=true
              const deferred = createDeferredFetch();
              globalThis.fetch = deferred.mockFn;

              // Trigger a re-fetch by changing month
              act(() => {
                result.current.filter.handleMonthChange(year, month);
              });

              // Loading should be true while fetch is in progress
              await waitFor(() => {
                expect(result.current.expense.loading).toBe(true);
              });

              // Reject with a network error
              await act(async () => {
                deferred.reject(new TypeError(networkErrorMsg));
              });

              // Loading should be false after network error
              await waitFor(() => {
                expect(result.current.expense.loading).toBe(false);
              });

              // Error should be set to the user-friendly network error message
              expect(result.current.expense.error).toBe(
                'Unable to connect to the server. Please check your connection and try again.'
              );
            }
          ),
          { numRuns: 100 }
        );
      } finally {
        consoleSpy.mockRestore();
      }
    });

    /**
     * Property 2d: Loading transitions correctly across consecutive fetches
     * (Req 3.5, 3.6) - Each fetch cycle independently transitions loading true→false
     */
    it('2d: loading transitions correctly across consecutive view mode changes', { timeout: 120000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2000, max: 2100 }),
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 2000, max: 2100 }),
          fc.integer({ min: 1, max: 12 }),
          async (year1, month1, year2, month2) => {
            // Ensure the two year/month pairs differ so the second change triggers a re-fetch
            fc.pre(year1 !== year2 || month1 !== month2);
            cleanup();

            // Start with a quick-resolving fetch for the initial mount
            const initialFetch = createMockFetch();
            globalThis.fetch = initialFetch.mockFn;

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // First fetch cycle: deferred
            const deferred1 = createDeferredFetch();
            globalThis.fetch = deferred1.mockFn;

            act(() => {
              result.current.filter.handleMonthChange(year1, month1);
            });

            await waitFor(() => {
              expect(result.current.expense.loading).toBe(true);
            });

            await act(async () => {
              deferred1.resolve([{ id: 1, date: `${year1}-${String(month1).padStart(2, '0')}-15`, place: 'Test', amount: 10, type: 'Groceries', method: 'Cash' }]);
            });

            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Second fetch cycle: deferred
            const deferred2 = createDeferredFetch();
            globalThis.fetch = deferred2.mockFn;

            act(() => {
              result.current.filter.handleMonthChange(year2, month2);
            });

            await waitFor(() => {
              expect(result.current.expense.loading).toBe(true);
            });

            await act(async () => {
              deferred2.resolve([]);
            });

            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // After both cycles, loading should be false and no error
            expect(result.current.expense.loading).toBe(false);
            expect(result.current.expense.error).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: expense-context, Property 3: handleExpenseAdded inserts in date-sorted order**
   *
   * For any expenses array and any new expense whose date falls within the current view
   * (matching year/month in monthly view, or any date in global view), calling
   * handleExpenseAdded SHALL result in the expenses array containing the new expense
   * and being sorted by date ascending.
   *
   * **Validates: Requirements 4.1**
   */
  describe('Property 3: handleExpenseAdded inserts in date-sorted order', () => {
    // Helper: check if an array of expenses is sorted by date ascending
    function isSortedByDate(arr) {
      for (let i = 1; i < arr.length; i++) {
        if (new Date(arr[i].date) < new Date(arr[i - 1].date)) return false;
      }
      return true;
    }

    // Helper: generate a YYYY-MM-DD date string
    function makeDate(year, month, day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    /**
     * Property 3a: In monthly view, adding an expense with matching year/month
     * results in a date-sorted array containing the new expense.
     */
    it('3a: monthly view - new expense with matching date is inserted in sorted order', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2000, max: 2100 }),
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 0, max: 10 }),
          fc.integer({ min: 1, max: 28 }),
          async (year, month, existingCount, newDay) => {
            cleanup();

            // Build existing expenses for this year/month with unique IDs
            const existing = [];
            for (let i = 0; i < existingCount; i++) {
              const day = (i % 28) + 1;
              existing.push({
                id: i + 1,
                date: makeDate(year, month, day),
                place: `Place${i}`,
                notes: null,
                amount: 10 + i,
                type: 'Groceries',
                method: 'Cash',
                week: 1,
              });
            }
            existing.sort((a, b) => new Date(a.date) - new Date(b.date));

            const newExpense = {
              id: existingCount + 100,
              date: makeDate(year, month, newDay),
              place: 'NewPlace',
              notes: null,
              amount: 50,
              type: 'Dining Out',
              method: 'Debit',
              week: 1,
            };

            // Mock fetch to return the existing expenses
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => existing,
              text: async () => JSON.stringify(existing),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Set the view to the matching year/month
            act(() => {
              result.current.filter.handleMonthChange(year, month);
            });

            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Verify we're in monthly view
            expect(result.current.filter.isGlobalView).toBe(false);

            // Call handleExpenseAdded with the new expense
            act(() => {
              result.current.expense.handleExpenseAdded(newExpense);
            });

            // Verify the new expense is in the array
            const expenseIds = result.current.expense.expenses.map(e => e.id);
            expect(expenseIds).toContain(newExpense.id);

            // Verify the array is sorted by date ascending
            expect(isSortedByDate(result.current.expense.expenses)).toBe(true);

            // Verify the array length increased by 1
            expect(result.current.expense.expenses.length).toBe(existing.length + 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3b: In global view, adding any expense results in a date-sorted
     * array containing the new expense.
     */
    it('3b: global view - new expense is inserted in sorted order', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 10 }),
          fc.integer({ min: 2020, max: 2025 }),
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 1, max: 28 }),
          async (existingCount, newYear, newMonth, newDay) => {
            cleanup();

            // Build existing expenses across various dates
            const existing = [];
            for (let i = 0; i < existingCount; i++) {
              const y = 2020 + (i % 6);
              const m = (i % 12) + 1;
              const d = (i % 28) + 1;
              existing.push({
                id: i + 1,
                date: makeDate(y, m, d),
                place: `Place${i}`,
                notes: null,
                amount: 10 + i,
                type: 'Groceries',
                method: 'Cash',
                week: 1,
              });
            }
            existing.sort((a, b) => new Date(a.date) - new Date(b.date));

            const newExpense = {
              id: existingCount + 200,
              date: makeDate(newYear, newMonth, newDay),
              place: 'GlobalNewPlace',
              notes: null,
              amount: 75,
              type: 'Entertainment',
              method: 'Credit Card',
              week: 1,
            };

            // Mock fetch to return the existing expenses
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => existing,
              text: async () => JSON.stringify(existing),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Switch to global view by setting a filter year
            act(() => {
              result.current.filter.handleFilterYearChange('2023');
            });

            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Verify we're in global view
            expect(result.current.filter.isGlobalView).toBe(true);

            // Call handleExpenseAdded with the new expense
            act(() => {
              result.current.expense.handleExpenseAdded(newExpense);
            });

            // Verify the new expense is in the array
            const expenseIds = result.current.expense.expenses.map(e => e.id);
            expect(expenseIds).toContain(newExpense.id);

            // Verify the array is sorted by date ascending
            expect(isSortedByDate(result.current.expense.expenses)).toBe(true);

            // Verify the array length increased by 1
            expect(result.current.expense.expenses.length).toBe(existing.length + 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3c: Adding an expense to an already-sorted array preserves sort order
     * regardless of where the new expense's date falls (beginning, middle, or end).
     */
    it('3c: new expense date at any position maintains sorted order', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2000, max: 2100 }),
          fc.integer({ min: 1, max: 12 }),
          fc.constantFrom('beginning', 'middle', 'end'),
          fc.integer({ min: 1, max: 8 }),
          async (year, month, position, existingCount) => {
            cleanup();

            // Create existing expenses spread across the month
            const existing = [];
            for (let i = 0; i < existingCount; i++) {
              const day = Math.min(28, Math.max(1, Math.floor((i + 1) * 28 / (existingCount + 1))));
              existing.push({
                id: i + 1,
                date: makeDate(year, month, day),
                place: `Place${i}`,
                notes: null,
                amount: 10 + i,
                type: 'Groceries',
                method: 'Cash',
                week: 1,
              });
            }
            existing.sort((a, b) => new Date(a.date) - new Date(b.date));

            // Create new expense at the specified position
            let newDay;
            if (position === 'beginning') {
              newDay = 1;
            } else if (position === 'end') {
              newDay = 28;
            } else {
              newDay = 14;
            }

            const newExpense = {
              id: 999,
              date: makeDate(year, month, newDay),
              place: 'InsertedPlace',
              notes: null,
              amount: 50,
              type: 'Dining Out',
              method: 'Debit',
              week: 1,
            };

            // Mock fetch to return the existing expenses
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => existing,
              text: async () => JSON.stringify(existing),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Set the view to the matching year/month
            act(() => {
              result.current.filter.handleMonthChange(year, month);
            });

            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Call handleExpenseAdded
            act(() => {
              result.current.expense.handleExpenseAdded(newExpense);
            });

            // Verify the new expense is in the array
            expect(result.current.expense.expenses.map(e => e.id)).toContain(999);

            // Verify sorted order
            expect(isSortedByDate(result.current.expense.expenses)).toBe(true);

            // Verify length
            expect(result.current.expense.expenses.length).toBe(existing.length + 1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: expense-context, Property 4: handleExpenseAdded skips out-of-view expenses**
   *
   * For any new expense whose year/month does not match the selected year/month
   * while in monthly view, calling handleExpenseAdded SHALL not change the
   * expenses array length.
   *
   * **Validates: Requirements 4.2**
   */
  describe('Property 4: handleExpenseAdded skips out-of-view expenses', () => {
    // Helper: generate a YYYY-MM-DD date string
    function makeDate(year, month, day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    /**
     * Property 4a: In monthly view, adding an expense with a different year/month
     * does NOT add it to the expenses array (length unchanged).
     * Uses a smart generator that ensures the expense year/month differs from the selected view.
     */
    it('4a: monthly view - expense with mismatched year/month is not added', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2000, max: 2100 }),
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 2000, max: 2100 }),
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 1, max: 28 }),
          fc.integer({ min: 0, max: 10 }),
          async (selectedYear, selectedMonth, expYear, expMonth, expDay, existingCount) => {
            // Pre-condition: expense year/month must NOT match selected year/month
            fc.pre(expYear !== selectedYear || expMonth !== selectedMonth);

            cleanup();

            // Build existing expenses for the selected year/month
            const existing = [];
            for (let i = 0; i < existingCount; i++) {
              const day = (i % 28) + 1;
              existing.push({
                id: i + 1,
                date: makeDate(selectedYear, selectedMonth, day),
                place: `Place${i}`,
                notes: null,
                amount: 10 + i,
                type: 'Groceries',
                method: 'Cash',
                week: 1,
              });
            }
            existing.sort((a, b) => new Date(a.date) - new Date(b.date));

            // Mock fetch to return the existing expenses
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => existing,
              text: async () => JSON.stringify(existing),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Set the view to the selected year/month (monthly view)
            act(() => {
              result.current.filter.handleMonthChange(selectedYear, selectedMonth);
            });

            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Verify we're in monthly view
            expect(result.current.filter.isGlobalView).toBe(false);

            // Record the current expenses length
            const lengthBefore = result.current.expense.expenses.length;

            const newExpense = {
              id: existingCount + 500,
              date: makeDate(expYear, expMonth, expDay),
              place: 'OutOfViewPlace',
              notes: null,
              amount: 99,
              type: 'Entertainment',
              method: 'Debit',
              week: 2,
            };

            // Call handleExpenseAdded with the out-of-view expense
            act(() => {
              result.current.expense.handleExpenseAdded(newExpense);
            });

            // Verify the expenses array length is unchanged
            expect(result.current.expense.expenses.length).toBe(lengthBefore);

            // Verify the new expense is NOT in the array
            const expenseIds = result.current.expense.expenses.map(e => e.id);
            expect(expenseIds).not.toContain(newExpense.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 4b: In monthly view, expense with different year (same month) is skipped.
     */
    it('4b: monthly view - expense with different year but same month is not added', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2001, max: 2099 }),
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 1, max: 28 }),
          fc.integer({ min: 0, max: 5 }),
          async (selectedYear, selectedMonth, newDay, existingCount) => {
            cleanup();

            // Build existing expenses for the selected year/month
            const existing = [];
            for (let i = 0; i < existingCount; i++) {
              const day = (i % 28) + 1;
              existing.push({
                id: i + 1,
                date: makeDate(selectedYear, selectedMonth, day),
                place: `Place${i}`,
                notes: null,
                amount: 10 + i,
                type: 'Groceries',
                method: 'Cash',
                week: 1,
              });
            }
            existing.sort((a, b) => new Date(a.date) - new Date(b.date));

            // Mock fetch to return the existing expenses
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => existing,
              text: async () => JSON.stringify(existing),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Set the view to the selected year/month (monthly view)
            act(() => {
              result.current.filter.handleMonthChange(selectedYear, selectedMonth);
            });

            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Verify we're in monthly view
            expect(result.current.filter.isGlobalView).toBe(false);

            const lengthBefore = result.current.expense.expenses.length;

            // Use a different year (offset by 1) but same month
            const differentYear = selectedYear + 1;

            const newExpense = {
              id: existingCount + 600,
              date: makeDate(differentYear, selectedMonth, newDay),
              place: 'DiffYearPlace',
              notes: null,
              amount: 42,
              type: 'Dining Out',
              method: 'Cash',
              week: 1,
            };

            // Call handleExpenseAdded with the out-of-view expense
            act(() => {
              result.current.expense.handleExpenseAdded(newExpense);
            });

            // Verify the expenses array length is unchanged
            expect(result.current.expense.expenses.length).toBe(lengthBefore);

            // Verify the new expense is NOT in the array
            expect(result.current.expense.expenses.map(e => e.id)).not.toContain(newExpense.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 4c: In monthly view, expense with different month (same year) is skipped.
     */
    it('4c: monthly view - expense with same year but different month is not added', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2000, max: 2100 }),
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 1, max: 28 }),
          fc.integer({ min: 0, max: 5 }),
          async (selectedYear, selectedMonth, newDay, existingCount) => {
            cleanup();

            // Build existing expenses for the selected year/month
            const existing = [];
            for (let i = 0; i < existingCount; i++) {
              const day = (i % 28) + 1;
              existing.push({
                id: i + 1,
                date: makeDate(selectedYear, selectedMonth, day),
                place: `Place${i}`,
                notes: null,
                amount: 10 + i,
                type: 'Groceries',
                method: 'Cash',
                week: 1,
              });
            }
            existing.sort((a, b) => new Date(a.date) - new Date(b.date));

            // Mock fetch to return the existing expenses
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => existing,
              text: async () => JSON.stringify(existing),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Set the view to the selected year/month (monthly view)
            act(() => {
              result.current.filter.handleMonthChange(selectedYear, selectedMonth);
            });

            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Verify we're in monthly view
            expect(result.current.filter.isGlobalView).toBe(false);

            const lengthBefore = result.current.expense.expenses.length;

            // Use a different month (wrap around) but same year
            const differentMonth = (selectedMonth % 12) + 1;

            const newExpense = {
              id: existingCount + 700,
              date: makeDate(selectedYear, differentMonth, newDay),
              place: 'DiffMonthPlace',
              notes: null,
              amount: 33,
              type: 'Utilities',
              method: 'Debit',
              week: 1,
            };

            // Call handleExpenseAdded with the out-of-view expense
            act(() => {
              result.current.expense.handleExpenseAdded(newExpense);
            });

            // Verify the expenses array length is unchanged
            expect(result.current.expense.expenses.length).toBe(lengthBefore);

            // Verify the new expense is NOT in the array
            expect(result.current.expense.expenses.map(e => e.id)).not.toContain(newExpense.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 4d: refreshTrigger still increments even when expense is skipped.
     * (Req 4.3) - handleExpenseAdded always increments refreshTrigger regardless of view match.
     */
    it('4d: refreshTrigger increments even when expense is out of view', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2001, max: 2099 }),
          fc.integer({ min: 1, max: 12 }),
          async (selectedYear, selectedMonth) => {
            cleanup();

            // Mock fetch to return empty array
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [],
              text: async () => '[]',
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Set the view to the selected year/month (monthly view)
            act(() => {
              result.current.filter.handleMonthChange(selectedYear, selectedMonth);
            });

            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Record refreshTrigger before
            const refreshBefore = result.current.expense.refreshTrigger;

            // Create an out-of-view expense (different year)
            const newExpense = {
              id: 999,
              date: makeDate(selectedYear + 1, selectedMonth, 15),
              place: 'OutOfView',
              notes: null,
              amount: 50,
              type: 'Groceries',
              method: 'Cash',
              week: 2,
            };

            // Call handleExpenseAdded
            act(() => {
              result.current.expense.handleExpenseAdded(newExpense);
            });

            // Verify refreshTrigger incremented by 1
            expect(result.current.expense.refreshTrigger).toBe(refreshBefore + 1);

            // But expenses array should still be empty
            expect(result.current.expense.expenses.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: expense-context, Property 5: handleExpenseDeleted removes exactly the target expense**
   *
   * For any expenses array with unique IDs and any valid expense ID in that array,
   * calling handleExpenseDeleted SHALL result in an array with length reduced by 1,
   * containing all original expenses except the one with the deleted ID.
   *
   * **Validates: Requirements 4.4**
   */
  describe('Property 5: handleExpenseDeleted removes exactly the target expense', () => {
    // Helper: generate a YYYY-MM-DD date string
    function makeDate(year, month, day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // Arbitrary: generate an array of expenses with unique IDs
    const expenseArrayArb = (minLen, maxLen) =>
      fc.integer({ min: minLen, max: maxLen }).chain(count =>
        fc.tuple(
          fc.uniqueArray(fc.integer({ min: 1, max: 100000 }), { minLength: count, maxLength: count }),
          fc.array(fc.integer({ min: 1, max: 28 }), { minLength: count, maxLength: count }),
          fc.array(
            fc.constantFrom('Groceries', 'Dining Out', 'Entertainment', 'Gas', 'Utilities'),
            { minLength: count, maxLength: count }
          ),
          fc.array(
            fc.constantFrom('Cash', 'Debit', 'Credit Card'),
            { minLength: count, maxLength: count }
          ),
        ).map(([ids, days, types, methods]) =>
          ids.map((id, i) => ({
            id,
            date: makeDate(2024, 6, days[i]),
            place: `Place${id}`,
            notes: i % 2 === 0 ? `Note${id}` : null,
            amount: 10 + i,
            type: types[i],
            method: methods[i],
            week: 1,
          }))
        )
      );

    /**
     * Property 5a: Deleting a random expense from the array reduces length by exactly 1
     * and the deleted ID is absent from the result.
     */
    it('5a: deleting an expense reduces length by 1 and removes the target ID', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArrayArb(1, 20),
          async (expenses) => {
            cleanup();

            // Pick a random expense ID to delete from the generated array
            const targetIndex = Math.floor(Math.random() * expenses.length);
            const targetId = expenses[targetIndex].id;

            // Mock fetch to return the expenses
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [...expenses],
              text: async () => JSON.stringify(expenses),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Verify expenses loaded
            expect(result.current.expense.expenses.length).toBe(expenses.length);

            // Call handleExpenseDeleted with the target ID
            act(() => {
              result.current.expense.handleExpenseDeleted(targetId);
            });

            // Verify length reduced by exactly 1
            expect(result.current.expense.expenses.length).toBe(expenses.length - 1);

            // Verify the deleted ID is absent
            const remainingIds = result.current.expense.expenses.map(e => e.id);
            expect(remainingIds).not.toContain(targetId);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 5b: All non-deleted expenses remain unchanged after deletion.
     * Every expense that was NOT deleted should still be present with identical data.
     */
    it('5b: all non-deleted expenses remain unchanged after deletion', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArrayArb(1, 20),
          async (expenses) => {
            cleanup();

            // Pick a random expense ID to delete
            const targetIndex = Math.floor(Math.random() * expenses.length);
            const targetId = expenses[targetIndex].id;

            // Build the expected remaining expenses (all except the deleted one)
            const expectedRemaining = expenses.filter(e => e.id !== targetId);

            // Mock fetch to return the expenses
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [...expenses],
              text: async () => JSON.stringify(expenses),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Call handleExpenseDeleted
            act(() => {
              result.current.expense.handleExpenseDeleted(targetId);
            });

            // Verify each remaining expense matches the expected data
            const remaining = result.current.expense.expenses;
            expect(remaining.length).toBe(expectedRemaining.length);

            for (const expected of expectedRemaining) {
              const found = remaining.find(e => e.id === expected.id);
              expect(found).toBeDefined();
              expect(found.date).toBe(expected.date);
              expect(found.place).toBe(expected.place);
              expect(found.amount).toBe(expected.amount);
              expect(found.type).toBe(expected.type);
              expect(found.method).toBe(expected.method);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 5c: Deleting from a single-element array results in an empty array.
     * Edge case: when there's only one expense and it's deleted.
     */
    it('5c: deleting the only expense results in an empty array', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100000 }),
          fc.integer({ min: 1, max: 28 }),
          async (expenseId, day) => {
            cleanup();

            const singleExpense = [{
              id: expenseId,
              date: makeDate(2024, 6, day),
              place: `Place${expenseId}`,
              notes: null,
              amount: 25,
              type: 'Groceries',
              method: 'Cash',
              week: 1,
            }];

            // Mock fetch to return the single expense
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [...singleExpense],
              text: async () => JSON.stringify(singleExpense),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Verify single expense loaded
            expect(result.current.expense.expenses.length).toBe(1);

            // Delete the only expense
            act(() => {
              result.current.expense.handleExpenseDeleted(expenseId);
            });

            // Verify array is now empty
            expect(result.current.expense.expenses.length).toBe(0);
            expect(result.current.expense.expenses).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: expense-context, Property 6: handleExpenseUpdated replaces the matching expense**
   *
   * For any expenses array and any updated expense object whose ID matches an expense
   * in the array, calling handleExpenseUpdated SHALL result in the array containing
   * the updated expense at the same position, with all other expenses unchanged.
   *
   * **Validates: Requirements 4.6**
   */
  describe('Property 6: handleExpenseUpdated replaces the matching expense', () => {
    // Helper: generate a YYYY-MM-DD date string
    function makeDate(year, month, day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // Arbitrary: generate an array of expenses with unique IDs
    const expenseArrayArb = (minLen, maxLen) =>
      fc.integer({ min: minLen, max: maxLen }).chain(count =>
        fc.tuple(
          fc.uniqueArray(fc.integer({ min: 1, max: 100000 }), { minLength: count, maxLength: count }),
          fc.array(fc.integer({ min: 1, max: 28 }), { minLength: count, maxLength: count }),
          fc.array(
            fc.constantFrom('Groceries', 'Dining Out', 'Entertainment', 'Gas', 'Utilities'),
            { minLength: count, maxLength: count }
          ),
          fc.array(
            fc.constantFrom('Cash', 'Debit', 'Credit Card'),
            { minLength: count, maxLength: count }
          ),
          fc.array(
            fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
            { minLength: count, maxLength: count }
          ),
        ).map(([ids, days, types, methods, amounts]) =>
          ids.map((id, i) => ({
            id,
            date: makeDate(2024, 6, days[i]),
            place: `Place${id}`,
            notes: i % 2 === 0 ? `Note${id}` : null,
            amount: amounts[i],
            type: types[i],
            method: methods[i],
            week: 1,
          }))
        )
      );

    /**
     * Property 6a: Updating a random expense replaces it in the array with the
     * updated data, array length stays the same, and all other expenses are unchanged.
     */
    it('6a: updating an expense replaces it at the same position with all others unchanged', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArrayArb(1, 20),
          fc.constantFrom('Groceries', 'Dining Out', 'Entertainment', 'Gas', 'Utilities'),
          fc.constantFrom('Cash', 'Debit', 'Credit Card'),
          fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
          fc.integer({ min: 1, max: 28 }),
          async (expenses, newType, newMethod, newAmount, newDay) => {
            cleanup();

            // Pick a random expense to update
            const targetIndex = Math.floor(Math.random() * expenses.length);
            const targetId = expenses[targetIndex].id;

            // Create the updated expense with the same ID but different fields
            const updatedExpense = {
              ...expenses[targetIndex],
              place: 'UpdatedPlace',
              notes: 'Updated notes',
              amount: newAmount,
              type: newType,
              method: newMethod,
              date: makeDate(2024, 6, newDay),
            };

            // Mock fetch to return the expenses
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [...expenses],
              text: async () => JSON.stringify(expenses),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Verify expenses loaded
            expect(result.current.expense.expenses.length).toBe(expenses.length);

            // Call handleExpenseUpdated
            act(() => {
              result.current.expense.handleExpenseUpdated(updatedExpense);
            });

            const resultExpenses = result.current.expense.expenses;

            // Verify array length is unchanged
            expect(resultExpenses.length).toBe(expenses.length);

            // Verify the updated expense is in the array with the new data
            const found = resultExpenses.find(e => e.id === targetId);
            expect(found).toBeDefined();
            expect(found.place).toBe('UpdatedPlace');
            expect(found.notes).toBe('Updated notes');
            expect(found.amount).toBe(newAmount);
            expect(found.type).toBe(newType);
            expect(found.method).toBe(newMethod);
            expect(found.date).toBe(makeDate(2024, 6, newDay));

            // Verify all other expenses are unchanged
            for (let i = 0; i < expenses.length; i++) {
              if (expenses[i].id !== targetId) {
                const original = expenses[i];
                const current = resultExpenses.find(e => e.id === original.id);
                expect(current).toBeDefined();
                expect(current.date).toBe(original.date);
                expect(current.place).toBe(original.place);
                expect(current.notes).toBe(original.notes);
                expect(current.amount).toBe(original.amount);
                expect(current.type).toBe(original.type);
                expect(current.method).toBe(original.method);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 6b: The updated expense appears at the same index position as the original.
     * handleExpenseUpdated uses .map(), so position is preserved.
     */
    it('6b: updated expense maintains the same index position in the array', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArrayArb(1, 20),
          async (expenses) => {
            cleanup();

            // Pick a random expense to update
            const targetIndex = Math.floor(Math.random() * expenses.length);
            const targetId = expenses[targetIndex].id;

            // Create the updated expense
            const updatedExpense = {
              ...expenses[targetIndex],
              place: 'PositionTestPlace',
              amount: 999.99,
            };

            // Mock fetch to return the expenses
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [...expenses],
              text: async () => JSON.stringify(expenses),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Record the original order of IDs
            const originalIds = result.current.expense.expenses.map(e => e.id);

            // Call handleExpenseUpdated
            act(() => {
              result.current.expense.handleExpenseUpdated(updatedExpense);
            });

            // Verify the order of IDs is preserved (same positions)
            const updatedIds = result.current.expense.expenses.map(e => e.id);
            expect(updatedIds).toEqual(originalIds);

            // Verify the updated expense is at the same index
            const updatedAtIndex = result.current.expense.expenses[targetIndex];
            expect(updatedAtIndex.id).toBe(targetId);
            expect(updatedAtIndex.place).toBe('PositionTestPlace');
            expect(updatedAtIndex.amount).toBe(999.99);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 6c: Updating the only expense in a single-element array replaces it correctly.
     * Edge case: array has exactly one expense.
     */
    it('6c: updating the only expense in a single-element array replaces it correctly', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100000 }),
          fc.integer({ min: 1, max: 28 }),
          fc.constantFrom('Groceries', 'Dining Out', 'Entertainment', 'Gas', 'Utilities'),
          fc.constantFrom('Cash', 'Debit', 'Credit Card'),
          fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
          async (expenseId, day, newType, newMethod, newAmount) => {
            cleanup();

            const singleExpense = [{
              id: expenseId,
              date: makeDate(2024, 6, day),
              place: `OriginalPlace`,
              notes: 'Original notes',
              amount: 50,
              type: 'Groceries',
              method: 'Cash',
              week: 1,
            }];

            const updatedExpense = {
              id: expenseId,
              date: makeDate(2024, 6, day),
              place: 'SingleUpdatedPlace',
              notes: 'Updated single notes',
              amount: newAmount,
              type: newType,
              method: newMethod,
              week: 1,
            };

            // Mock fetch to return the single expense
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [...singleExpense],
              text: async () => JSON.stringify(singleExpense),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Verify single expense loaded
            expect(result.current.expense.expenses.length).toBe(1);

            // Update the only expense
            act(() => {
              result.current.expense.handleExpenseUpdated(updatedExpense);
            });

            // Verify array still has exactly 1 element
            expect(result.current.expense.expenses.length).toBe(1);

            // Verify it's the updated expense
            const resultExpense = result.current.expense.expenses[0];
            expect(resultExpense.id).toBe(expenseId);
            expect(resultExpense.place).toBe('SingleUpdatedPlace');
            expect(resultExpense.notes).toBe('Updated single notes');
            expect(resultExpense.amount).toBe(newAmount);
            expect(resultExpense.type).toBe(newType);
            expect(resultExpense.method).toBe(newMethod);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: expense-context, Property 7: CRUD operations increment refreshTrigger**
   *
   * For any CRUD operation (add, delete, update), the refreshTrigger SHALL increase
   * by exactly 1 after the operation completes.
   *
   * **Validates: Requirements 4.3, 4.5, 4.7**
   */
  describe('Property 7: CRUD operations increment refreshTrigger', () => {
    // Helper: generate a YYYY-MM-DD date string
    function makeDate(year, month, day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // Arbitrary: generate an array of expenses with unique IDs for a fixed year/month
    const expenseArrayArb = (minLen, maxLen) =>
      fc.integer({ min: minLen, max: maxLen }).chain(count =>
        fc.tuple(
          fc.uniqueArray(fc.integer({ min: 1, max: 100000 }), { minLength: count, maxLength: count }),
          fc.array(fc.integer({ min: 1, max: 28 }), { minLength: count, maxLength: count }),
          fc.array(
            fc.constantFrom('Groceries', 'Dining Out', 'Entertainment', 'Gas', 'Utilities'),
            { minLength: count, maxLength: count }
          ),
          fc.array(
            fc.constantFrom('Cash', 'Debit', 'Credit Card'),
            { minLength: count, maxLength: count }
          ),
        ).map(([ids, days, types, methods]) =>
          ids.map((id, i) => ({
            id,
            date: makeDate(2024, 6, days[i]),
            place: `Place${id}`,
            notes: i % 2 === 0 ? `Note${id}` : null,
            amount: 10 + i,
            type: types[i],
            method: methods[i],
            week: 1,
          }))
        )
      );

    /**
     * Property 7a: handleExpenseAdded increments refreshTrigger by exactly 1
     * (Req 4.3) - Each add operation increases refreshTrigger by 1
     */
    it('7a: handleExpenseAdded increments refreshTrigger by exactly 1', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 28 }),
          fc.integer({ min: 100000, max: 200000 }),
          async (day, newId) => {
            cleanup();

            // Mock fetch to return empty array
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [],
              text: async () => '[]',
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Record refreshTrigger before the operation
            const refreshBefore = result.current.expense.refreshTrigger;

            // Create a new expense matching the current view (default is current year/month)
            const now = new Date();
            const newExpense = {
              id: newId,
              date: makeDate(now.getFullYear(), now.getMonth() + 1, day),
              place: 'AddedPlace',
              notes: null,
              amount: 50,
              type: 'Groceries',
              method: 'Cash',
              week: 1,
            };

            // Call handleExpenseAdded
            act(() => {
              result.current.expense.handleExpenseAdded(newExpense);
            });

            // Verify refreshTrigger incremented by exactly 1
            expect(result.current.expense.refreshTrigger).toBe(refreshBefore + 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 7b: handleExpenseDeleted increments refreshTrigger by exactly 1
     * (Req 4.5) - Each delete operation increases refreshTrigger by 1
     */
    it('7b: handleExpenseDeleted increments refreshTrigger by exactly 1', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArrayArb(1, 15),
          async (expenses) => {
            cleanup();

            // Mock fetch to return the expenses
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [...expenses],
              text: async () => JSON.stringify(expenses),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Pick a random expense ID to delete
            const targetIndex = Math.floor(Math.random() * expenses.length);
            const targetId = expenses[targetIndex].id;

            // Record refreshTrigger before the operation
            const refreshBefore = result.current.expense.refreshTrigger;

            // Call handleExpenseDeleted
            act(() => {
              result.current.expense.handleExpenseDeleted(targetId);
            });

            // Verify refreshTrigger incremented by exactly 1
            expect(result.current.expense.refreshTrigger).toBe(refreshBefore + 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 7c: handleExpenseUpdated increments refreshTrigger by exactly 1
     * (Req 4.7) - Each update operation increases refreshTrigger by 1
     */
    it('7c: handleExpenseUpdated increments refreshTrigger by exactly 1', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArrayArb(1, 15),
          fc.constantFrom('Groceries', 'Dining Out', 'Entertainment', 'Gas', 'Utilities'),
          fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
          async (expenses, newType, newAmount) => {
            cleanup();

            // Mock fetch to return the expenses
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [...expenses],
              text: async () => JSON.stringify(expenses),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Pick a random expense to update
            const targetIndex = Math.floor(Math.random() * expenses.length);
            const updatedExpense = {
              ...expenses[targetIndex],
              type: newType,
              amount: newAmount,
              place: 'UpdatedForRefreshTest',
            };

            // Record refreshTrigger before the operation
            const refreshBefore = result.current.expense.refreshTrigger;

            // Call handleExpenseUpdated
            act(() => {
              result.current.expense.handleExpenseUpdated(updatedExpense);
            });

            // Verify refreshTrigger incremented by exactly 1
            expect(result.current.expense.refreshTrigger).toBe(refreshBefore + 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 7d: Sequential CRUD operations each increment refreshTrigger by 1
     * Tests that multiple consecutive operations each independently increment the counter.
     */
    it('7d: sequential CRUD operations each increment refreshTrigger by 1', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 28 }),
          fc.integer({ min: 1, max: 28 }),
          async (addDay, updateDay) => {
            cleanup();

            // Start with one existing expense
            const existing = [{
              id: 1,
              date: makeDate(2024, 6, 15),
              place: 'ExistingPlace',
              notes: null,
              amount: 25,
              type: 'Groceries',
              method: 'Cash',
              week: 1,
            }];

            // Mock fetch to return the existing expense
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [...existing],
              text: async () => JSON.stringify(existing),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            const initialRefresh = result.current.expense.refreshTrigger;

            // Operation 1: Add an expense (use current view's year/month)
            const now = new Date();
            const newExpense = {
              id: 999,
              date: makeDate(now.getFullYear(), now.getMonth() + 1, addDay),
              place: 'SequentialAdd',
              notes: null,
              amount: 50,
              type: 'Dining Out',
              method: 'Debit',
              week: 1,
            };

            act(() => {
              result.current.expense.handleExpenseAdded(newExpense);
            });

            expect(result.current.expense.refreshTrigger).toBe(initialRefresh + 1);

            // Operation 2: Update the existing expense
            const updatedExpense = {
              ...existing[0],
              place: 'SequentialUpdate',
              amount: 100,
              date: makeDate(2024, 6, updateDay),
            };

            act(() => {
              result.current.expense.handleExpenseUpdated(updatedExpense);
            });

            expect(result.current.expense.refreshTrigger).toBe(initialRefresh + 2);

            // Operation 3: Delete the existing expense
            act(() => {
              result.current.expense.handleExpenseDeleted(1);
            });

            expect(result.current.expense.refreshTrigger).toBe(initialRefresh + 3);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: expense-context, Property 8: Client-side filtering with AND logic**
   *
   * For any expenses array and any combination of filter values (searchText, filterType,
   * filterMethod), filteredExpenses SHALL contain exactly the expenses where:
   * - If searchText is non-empty: expense.place or expense.notes contains searchText (case-insensitive)
   * - If filterType is non-empty: expense.type equals filterType
   * - If filterMethod is non-empty: expense.method equals filterMethod
   * - All active conditions are combined with AND logic
   * - If no filters are active: filteredExpenses equals the full expenses array
   *
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**
   */
  describe('Property 8: Client-side filtering with AND logic', () => {
    // Helper: generate a YYYY-MM-DD date string
    function makeDate(year, month, day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // Valid categories and methods for generators
    const VALID_TYPES = ['Groceries', 'Dining Out', 'Entertainment', 'Gas', 'Utilities', 'Clothing', 'Housing'];
    const VALID_METHODS = ['Cash', 'Debit', 'CIBC MC', 'PCF MC'];
    const filterWrapper = wrapperBuilder().withFilter({ paymentMethods: VALID_METHODS }).withExpense().build();

    // Arbitrary: generate an expense with controlled place, notes, type, method
    const expenseArb = (id) =>
      fc.record({
        id: fc.constant(id),
        date: fc.constant(makeDate(2024, 6, Math.min(28, Math.max(1, (id % 28) + 1)))),
        place: fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789'), { minLength: 1, maxLength: 20 }).map(a => a.join('')),
        notes: fc.oneof(
          fc.constant(null),
          fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789'), { minLength: 1, maxLength: 30 }).map(a => a.join(''))
        ),
        amount: fc.constant(10 + id),
        type: fc.constantFrom(...VALID_TYPES),
        method: fc.constantFrom(...VALID_METHODS),
        week: fc.constant(1),
      });

    // Arbitrary: generate an array of expenses with unique sequential IDs
    const expenseArrayArb = (minLen, maxLen) =>
      fc.integer({ min: minLen, max: maxLen }).chain(count =>
        count === 0
          ? fc.constant([])
          : fc.tuple(...Array.from({ length: count }, (_, i) => expenseArb(i + 1)))
      );

    // Reference implementation of the filtering logic (mirrors ExpenseContext)
    function referenceFilter(expenses, searchText, filterType, filterMethod) {
      return expenses.filter(expense => {
        if (searchText) {
          const searchLower = searchText.toLowerCase();
          const placeMatch = expense.place && expense.place.toLowerCase().includes(searchLower);
          const notesMatch = expense.notes && expense.notes.toLowerCase().includes(searchLower);
          if (!placeMatch && !notesMatch) return false;
        }
        if (filterType && expense.type !== filterType) return false;
        if (filterMethod && expense.method !== filterMethod) return false;
        return true;
      });
    }

    /**
     * Property 8a: No filters returns the full expenses array
     * (Req 5.6) - When no filters are active, filteredExpenses equals the full expenses array
     */
    it('8a: no filters returns the full expenses array', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArrayArb(0, 15),
          async (expenses) => {
            cleanup();

            // Mock fetch to return the expenses for any URL
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [...expenses],
              text: async () => JSON.stringify(expenses),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper: filterWrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // With no filters active, filteredExpenses should equal the full expenses array
            expect(result.current.filter.searchText).toBe('');
            expect(result.current.filter.filterType).toBe('');
            expect(result.current.filter.filterMethod).toBe('');

            expect(result.current.expense.filteredExpenses.length).toBe(expenses.length);
            expect(result.current.expense.filteredExpenses.map(e => e.id)).toEqual(
              result.current.expense.expenses.map(e => e.id)
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8b: searchText filters case-insensitively on place and notes
     * (Req 5.2) - searchText matches against place and notes fields case-insensitively
     */
    it('8b: searchText filters case-insensitively on place and notes', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArrayArb(1, 15),
          fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789'), { minLength: 1, maxLength: 10 }).map(a => a.join('')),
          async (expenses, searchText) => {
            cleanup();

            // Mock fetch to return the expenses for any URL (including global view)
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [...expenses],
              text: async () => JSON.stringify(expenses),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper: filterWrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Apply searchText filter (this triggers global view + re-fetch)
            act(() => {
              result.current.filter.handleSearchChange(searchText);
            });

            // Wait for re-fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Compute expected result using reference implementation
            const expected = referenceFilter(expenses, searchText, '', '');

            // Verify filteredExpenses matches reference
            expect(result.current.expense.filteredExpenses.length).toBe(expected.length);
            expect(result.current.expense.filteredExpenses.map(e => e.id)).toEqual(
              expected.map(e => e.id)
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8c: filterType filters by exact type match
     * (Req 5.3) - filterType includes only expenses matching the selected category
     */
    it('8c: filterType filters by exact type match', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArrayArb(1, 15),
          fc.constantFrom(...VALID_TYPES),
          async (expenses, filterType) => {
            cleanup();

            // Mock fetch to return the expenses for any URL
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [...expenses],
              text: async () => JSON.stringify(expenses),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper: filterWrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Apply filterType (does NOT trigger global view by itself)
            act(() => {
              result.current.filter.handleFilterTypeChange(filterType);
            });

            // Compute expected result using reference implementation
            const expected = referenceFilter(expenses, '', filterType, '');

            // Verify filteredExpenses matches reference
            expect(result.current.expense.filteredExpenses.length).toBe(expected.length);
            expect(result.current.expense.filteredExpenses.map(e => e.id)).toEqual(
              expected.map(e => e.id)
            );

            // Verify all returned expenses have the correct type
            for (const exp of result.current.expense.filteredExpenses) {
              expect(exp.type).toBe(filterType);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8d: filterMethod filters by exact method match
     * (Req 5.4) - filterMethod includes only expenses matching the selected payment method
     */
    it('8d: filterMethod filters by exact method match', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArrayArb(1, 15),
          fc.constantFrom(...VALID_METHODS),
          async (expenses, filterMethod) => {
            cleanup();

            // Mock fetch to return the expenses for any URL (including global view)
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [...expenses],
              text: async () => JSON.stringify(expenses),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper: filterWrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Apply filterMethod (triggers global view + re-fetch)
            act(() => {
              result.current.filter.handleFilterMethodChange(filterMethod);
            });

            // Wait for re-fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Compute expected result using reference implementation
            const expected = referenceFilter(expenses, '', '', filterMethod);

            // Verify filteredExpenses matches reference
            expect(result.current.expense.filteredExpenses.length).toBe(expected.length);
            expect(result.current.expense.filteredExpenses.map(e => e.id)).toEqual(
              expected.map(e => e.id)
            );

            // Verify all returned expenses have the correct method
            for (const exp of result.current.expense.filteredExpenses) {
              expect(exp.method).toBe(filterMethod);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8e: All filters combined with AND logic
     * (Req 5.1, 5.5) - searchText + filterType + filterMethod all applied simultaneously
     * An expense must match ALL active filters to be included.
     */
    it('8e: all filters combined with AND logic', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArrayArb(1, 15),
          fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), { minLength: 1, maxLength: 5 }).map(a => a.join('')),
          fc.constantFrom(...VALID_TYPES),
          fc.constantFrom(...VALID_METHODS),
          async (expenses, searchText, filterType, filterMethod) => {
            cleanup();

            // Mock fetch to return the expenses for any URL (including global view)
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [...expenses],
              text: async () => JSON.stringify(expenses),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper: filterWrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Apply all three filters
            // searchText triggers global view, so apply it first to trigger re-fetch
            act(() => {
              result.current.filter.handleSearchChange(searchText);
            });

            // Wait for re-fetch from global view transition
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Apply type and method filters
            act(() => {
              result.current.filter.handleFilterTypeChange(filterType);
              result.current.filter.handleFilterMethodChange(filterMethod);
            });

            // Wait for any re-fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Compute expected result using reference implementation with all filters
            const expected = referenceFilter(expenses, searchText, filterType, filterMethod);

            // Verify filteredExpenses matches reference (AND logic)
            expect(result.current.expense.filteredExpenses.length).toBe(expected.length);
            expect(result.current.expense.filteredExpenses.map(e => e.id)).toEqual(
              expected.map(e => e.id)
            );

            // Verify each filtered expense satisfies ALL conditions
            for (const exp of result.current.expense.filteredExpenses) {
              // searchText: place or notes must contain it (case-insensitive)
              const searchLower = searchText.toLowerCase();
              const placeMatch = exp.place && exp.place.toLowerCase().includes(searchLower);
              const notesMatch = exp.notes && exp.notes.toLowerCase().includes(searchLower);
              expect(placeMatch || notesMatch).toBe(true);

              // filterType: exact match
              expect(exp.type).toBe(filterType);

              // filterMethod: exact match
              expect(exp.method).toBe(filterMethod);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8f: Filtering is a subset - filteredExpenses is always a subset of expenses
     * (Req 5.1) - No matter what filters are applied, every filtered expense exists in the original array
     */
    it('8f: filteredExpenses is always a subset of the expenses array', { timeout: 60000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArrayArb(1, 15),
          fc.option(fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), { minLength: 1, maxLength: 8 }).map(a => a.join('')), { nil: '' }),
          fc.option(fc.constantFrom(...VALID_TYPES), { nil: '' }),
          fc.option(fc.constantFrom(...VALID_METHODS), { nil: '' }),
          async (expenses, searchText, filterType, filterMethod) => {
            cleanup();

            // Mock fetch to return the expenses for any URL
            globalThis.fetch = vi.fn().mockImplementation(async () => ({
              ok: true,
              json: async () => [...expenses],
              text: async () => JSON.stringify(expenses),
            }));

            const { result } = renderHook(() => useBothContexts(), {
              wrapper: filterWrapper,
            });

            // Wait for initial fetch to complete
            await waitFor(() => {
              expect(result.current.expense.loading).toBe(false);
            });

            // Apply whichever filters are non-empty
            if (searchText) {
              act(() => {
                result.current.filter.handleSearchChange(searchText);
              });
              await waitFor(() => {
                expect(result.current.expense.loading).toBe(false);
              });
            }

            if (filterType) {
              act(() => {
                result.current.filter.handleFilterTypeChange(filterType);
              });
            }

            if (filterMethod) {
              act(() => {
                result.current.filter.handleFilterMethodChange(filterMethod);
              });
              // filterMethod triggers global view, wait for re-fetch
              await waitFor(() => {
                expect(result.current.expense.loading).toBe(false);
              });
            }

            // Every filtered expense ID must exist in the full expenses array
            const allIds = new Set(result.current.expense.expenses.map(e => e.id));
            for (const exp of result.current.expense.filteredExpenses) {
              expect(allIds.has(exp.id)).toBe(true);
            }

            // filteredExpenses length must be <= expenses length
            expect(result.current.expense.filteredExpenses.length).toBeLessThanOrEqual(
              result.current.expense.expenses.length
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
