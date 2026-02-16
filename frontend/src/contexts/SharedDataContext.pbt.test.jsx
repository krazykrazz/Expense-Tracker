/**
 * @invariant Shared Data Consistency: For any sequence of data loading operations, the shared data context provides consistent payment methods and people data; refresh operations update the cached data. Randomization covers diverse operation sequences and data shapes.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { SharedDataProvider, useSharedDataContext } from './SharedDataContext';
import { modalOperationSequence } from '../test-utils/arbitraries';
import { createSharedDataWrapper } from '../test-utils/wrappers.jsx';
import { assertSequenceResult } from '../test-utils/assertions';

// Mock API services
vi.mock('../services/paymentMethodApi', () => ({
  getPaymentMethods: vi.fn().mockResolvedValue([]),
}));
vi.mock('../services/peopleApi', () => ({
  getPeople: vi.fn().mockResolvedValue([]),
}));
vi.mock('../services/budgetApi', () => ({
  getBudgets: vi.fn().mockResolvedValue({ budgets: [] }),
}));

// Import mocked API functions to track call counts
import { getPaymentMethods } from '../services/paymentMethodApi';
import { getPeople } from '../services/peopleApi';
import { getBudgets } from '../services/budgetApi';

const wrapper = createSharedDataWrapper({ selectedYear: 2026, selectedMonth: 2 });

describe('SharedDataContext Property-Based Tests', () => {
  afterEach(() => {
    cleanup();
  });

  // Reuse utility arbitraries for modal operation sequences
  const operationSequenceArb = modalOperationSequence();
  const consecutiveCountArb = fc.integer({ min: 2, max: 10 });

  /**
   * **Feature: shared-data-context, Property 2: Modal State Transitions are Idempotent**
   *
   * For any sequence of openPaymentMethods and closePaymentMethods calls, the final state
   * of showPaymentMethods should equal the result of the last operation called (true for
   * open, false for close). Calling the same operation multiple times consecutively should
   * have the same effect as calling it once.
   *
   * **Validates: Requirements 2.2, 2.3**
   */
  describe('Property 2: Modal State Transitions are Idempotent', () => {
    /**
     * Property 2a: For any sequence of open/close operations, the final state equals
     * the result of the last operation (true for open, false for close).
     */
    it('2a: final state equals the result of the last operation in any sequence', () => {
      fc.assert(
        fc.property(
          operationSequenceArb,
          (operations) => {
            const { result } = renderHook(() => useSharedDataContext(), { wrapper });

            // Initial state should be false
            expect(result.current.showPaymentMethods).toBe(false);

            // Apply each operation in sequence
            for (const op of operations) {
              act(() => {
                if (op === 'open') {
                  result.current.openPaymentMethods();
                } else {
                  result.current.closePaymentMethods();
                }
              });
            }

            // Final state should match the last operation
            assertSequenceResult(operations, result.current.showPaymentMethods);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2b: Calling openPaymentMethods N times consecutively has the same
     * effect as calling it once (idempotence of open).
     */
    it('2b: calling openPaymentMethods N times has the same effect as calling it once', () => {
      fc.assert(
        fc.property(
          consecutiveCountArb,
          (n) => {
            const { result } = renderHook(() => useSharedDataContext(), { wrapper });

            // Call open N times
            for (let i = 0; i < n; i++) {
              act(() => {
                result.current.openPaymentMethods();
              });
            }

            // State should be true (same as calling once)
            expect(result.current.showPaymentMethods).toBe(true);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2c: Calling closePaymentMethods N times consecutively has the same
     * effect as calling it once (idempotence of close).
     */
    it('2c: calling closePaymentMethods N times has the same effect as calling it once', () => {
      fc.assert(
        fc.property(
          consecutiveCountArb,
          (n) => {
            const { result } = renderHook(() => useSharedDataContext(), { wrapper });

            // First open the modal so we can test closing
            act(() => {
              result.current.openPaymentMethods();
            });
            expect(result.current.showPaymentMethods).toBe(true);

            // Call close N times
            for (let i = 0; i < n; i++) {
              act(() => {
                result.current.closePaymentMethods();
              });
            }

            // State should be false (same as calling once)
            expect(result.current.showPaymentMethods).toBe(false);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2d: For any sequence with consecutive duplicate operations,
     * the result is the same as the deduplicated sequence.
     */
    it('2d: consecutive duplicate operations produce the same result as deduplicated sequence', () => {
      // Generate sequences where each operation may repeat 1-5 times
      const repeatedSequenceArb = fc.array(
        fc.tuple(fc.constantFrom('open', 'close'), fc.integer({ min: 1, max: 5 })),
        { minLength: 1, maxLength: 10 }
      );

      fc.assert(
        fc.property(
          repeatedSequenceArb,
          (repeatedOps) => {
            // Render two hooks: one with repeated ops, one with deduplicated
            const { result: resultRepeated } = renderHook(() => useSharedDataContext(), { wrapper });
            const { result: resultDeduped } = renderHook(() => useSharedDataContext(), { wrapper });

            // Apply repeated operations to first hook
            for (const [op, count] of repeatedOps) {
              for (let i = 0; i < count; i++) {
                act(() => {
                  if (op === 'open') {
                    resultRepeated.current.openPaymentMethods();
                  } else {
                    resultRepeated.current.closePaymentMethods();
                  }
                });
              }
            }

            // Apply deduplicated operations (each op once) to second hook
            for (const [op] of repeatedOps) {
              act(() => {
                if (op === 'open') {
                  resultDeduped.current.openPaymentMethods();
                } else {
                  resultDeduped.current.closePaymentMethods();
                }
              });
            }

            // Both should have the same final state
            expect(resultRepeated.current.showPaymentMethods).toBe(
              resultDeduped.current.showPaymentMethods
            );

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


/**
 * **Feature: shared-data-context, Property 1: Refresh Callback Triggers Re-fetch**
 *
 * For any data type (paymentMethods, people, budgets), calling the corresponding
 * refresh callback (refreshPaymentMethods, refreshPeople, refreshBudgets) N times
 * should result in exactly N additional API fetch calls after the initial mount fetch.
 *
 * **Validates: Requirements 1.4, 1.5, 3.4, 3.5, 4.4, 4.5**
 */
describe('Property 1: Refresh Callback Triggers Re-fetch', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // Arbitrary for number of refresh calls (keep small to avoid timeout)
  const refreshCountArb = fc.integer({ min: 1, max: 5 });

  /**
   * Property 1a: Calling refreshPaymentMethods N times results in N+1 total
   * getPaymentMethods API calls (1 mount + N refreshes).
   */
  it('1a: refreshPaymentMethods N times results in N+1 total getPaymentMethods calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        refreshCountArb,
        async (n) => {
          cleanup();
          vi.clearAllMocks();

          const { result } = renderHook(() => useSharedDataContext(), { wrapper });

          // Wait for initial mount fetch to complete
          await vi.waitFor(() => {
            expect(getPaymentMethods).toHaveBeenCalledTimes(1);
          });

          // Call refreshPaymentMethods N times, waiting for each to trigger re-fetch
          for (let i = 0; i < n; i++) {
            await act(async () => {
              result.current.refreshPaymentMethods();
            });

            // Wait for the re-fetch triggered by the refresh
            await vi.waitFor(() => {
              expect(getPaymentMethods).toHaveBeenCalledTimes(1 + i + 1);
            });
          }

          // Total calls should be 1 (mount) + N (refreshes)
          expect(getPaymentMethods).toHaveBeenCalledTimes(1 + n);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1b: Calling refreshPeople N times results in N+1 total
   * getPeople API calls (1 mount + N refreshes).
   */
  it('1b: refreshPeople N times results in N+1 total getPeople calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        refreshCountArb,
        async (n) => {
          cleanup();
          vi.clearAllMocks();

          const { result } = renderHook(() => useSharedDataContext(), { wrapper });

          // Wait for initial mount fetch to complete
          await vi.waitFor(() => {
            expect(getPeople).toHaveBeenCalledTimes(1);
          });

          // Call refreshPeople N times, waiting for each to trigger re-fetch
          for (let i = 0; i < n; i++) {
            await act(async () => {
              result.current.refreshPeople();
            });

            // Wait for the re-fetch triggered by the refresh
            await vi.waitFor(() => {
              expect(getPeople).toHaveBeenCalledTimes(1 + i + 1);
            });
          }

          // Total calls should be 1 (mount) + N (refreshes)
          expect(getPeople).toHaveBeenCalledTimes(1 + n);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1c: Calling refreshBudgets N times results in N+1 total
   * getBudgets API calls (1 mount + N refreshes).
   */
  it('1c: refreshBudgets N times results in N+1 total getBudgets calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        refreshCountArb,
        async (n) => {
          cleanup();
          vi.clearAllMocks();

          const { result } = renderHook(() => useSharedDataContext(), { wrapper });

          // Wait for initial mount fetch to complete
          await vi.waitFor(() => {
            expect(getBudgets).toHaveBeenCalledTimes(1);
          });

          // Call refreshBudgets N times, waiting for each to trigger re-fetch
          for (let i = 0; i < n; i++) {
            await act(async () => {
              result.current.refreshBudgets();
            });

            // Wait for the re-fetch triggered by the refresh
            await vi.waitFor(() => {
              expect(getBudgets).toHaveBeenCalledTimes(1 + i + 1);
            });
          }

          // Total calls should be 1 (mount) + N (refreshes)
          expect(getBudgets).toHaveBeenCalledTimes(1 + n);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1d: For any randomly chosen data type, calling its refresh callback
   * N times results in exactly N+1 total API calls for that data type.
   */
  it('1d: for any data type, N refreshes result in N+1 total API calls', async () => {
    const dataTypeArb = fc.constantFrom('paymentMethods', 'people', 'budgets');

    await fc.assert(
      fc.asyncProperty(
        dataTypeArb,
        refreshCountArb,
        async (dataType, n) => {
          cleanup();
          vi.clearAllMocks();

          const { result } = renderHook(() => useSharedDataContext(), { wrapper });

          // Map data type to its refresh callback and API mock
          const config = {
            paymentMethods: {
              refreshKey: 'refreshPaymentMethods',
              apiMock: getPaymentMethods,
            },
            people: {
              refreshKey: 'refreshPeople',
              apiMock: getPeople,
            },
            budgets: {
              refreshKey: 'refreshBudgets',
              apiMock: getBudgets,
            },
          };

          const { refreshKey, apiMock } = config[dataType];

          // Wait for initial mount fetch to complete
          await vi.waitFor(() => {
            expect(apiMock).toHaveBeenCalledTimes(1);
          });

          // Call refresh N times, waiting for each to trigger re-fetch
          for (let i = 0; i < n; i++) {
            await act(async () => {
              result.current[refreshKey]();
            });

            await vi.waitFor(() => {
              expect(apiMock).toHaveBeenCalledTimes(1 + i + 1);
            });
          }

          // Total calls should be 1 (mount) + N (refreshes)
          expect(apiMock).toHaveBeenCalledTimes(1 + n);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * **Feature: shared-data-context, Property 3: Budget Fetching Responds to Year/Month Changes**
 *
 * For any change in selectedYear or selectedMonth props, the SharedDataProvider should
 * trigger a budget re-fetch. The number of budget fetches should equal the number of
 * distinct (year, month) combinations seen plus any manual refresh calls.
 *
 * **Validates: Requirements 4.3**
 */
describe('Property 3: Budget Fetching Responds to Year/Month Changes', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // Arbitrary for a sequence of distinct (year, month) pairs
  // We generate unique pairs to ensure each re-render triggers a new fetch
  const distinctYearMonthPairsArb = fc
    .uniqueArray(
      fc.tuple(
        fc.integer({ min: 2020, max: 2030 }),
        fc.integer({ min: 1, max: 12 })
      ),
      {
        minLength: 2,
        maxLength: 5,
        comparator: (a, b) => a[0] === b[0] && a[1] === b[1],
      }
    );

  // Helper: creates a dynamic wrapper whose year/month can be changed via a ref
  function createDynamicWrapper(initialYear, initialMonth) {
    const propsRef = { year: initialYear, month: initialMonth };
    const DynamicWrapper = ({ children }) => (
      <SharedDataProvider selectedYear={propsRef.year} selectedMonth={propsRef.month}>
        {children}
      </SharedDataProvider>
    );
    return { propsRef, DynamicWrapper };
  }

  /**
   * Property 3a: Rendering with N distinct (year, month) pairs results in exactly
   * N total getBudgets calls (one per distinct combination).
   */
  it('3a: N distinct (year, month) pairs result in N total getBudgets calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        distinctYearMonthPairsArb,
        async (pairs) => {
          cleanup();
          vi.clearAllMocks();

          const [initialYear, initialMonth] = pairs[0];
          const { propsRef, DynamicWrapper } = createDynamicWrapper(initialYear, initialMonth);

          const { result, rerender } = renderHook(() => useSharedDataContext(), {
            wrapper: DynamicWrapper,
          });

          // Wait for initial mount fetch
          await vi.waitFor(() => {
            expect(getBudgets).toHaveBeenCalledTimes(1);
          });

          // Verify initial call was made with correct args
          expect(getBudgets).toHaveBeenCalledWith(initialYear, initialMonth);

          // Re-render with each subsequent (year, month) pair
          for (let i = 1; i < pairs.length; i++) {
            const [year, month] = pairs[i];
            propsRef.year = year;
            propsRef.month = month;

            rerender();

            // Wait for the re-fetch triggered by the prop change
            await vi.waitFor(() => {
              expect(getBudgets).toHaveBeenCalledTimes(i + 1);
            });

            // Verify the latest call used the correct year/month
            expect(getBudgets).toHaveBeenLastCalledWith(year, month);
          }

          // Total calls should equal the number of distinct pairs
          expect(getBudgets).toHaveBeenCalledTimes(pairs.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3b: Changing only the year (keeping month constant) triggers a re-fetch.
   */
  it('3b: changing only the year triggers a budget re-fetch', async () => {
    const distinctYearsArb = fc.uniqueArray(
      fc.integer({ min: 2020, max: 2030 }),
      { minLength: 2, maxLength: 5 }
    );
    const fixedMonthArb = fc.integer({ min: 1, max: 12 });

    await fc.assert(
      fc.asyncProperty(
        distinctYearsArb,
        fixedMonthArb,
        async (years, fixedMonth) => {
          cleanup();
          vi.clearAllMocks();

          const { propsRef, DynamicWrapper } = createDynamicWrapper(years[0], fixedMonth);

          const { result, rerender } = renderHook(() => useSharedDataContext(), {
            wrapper: DynamicWrapper,
          });

          // Wait for initial mount fetch
          await vi.waitFor(() => {
            expect(getBudgets).toHaveBeenCalledTimes(1);
          });

          // Change only the year for each subsequent value
          for (let i = 1; i < years.length; i++) {
            propsRef.year = years[i];

            rerender();

            await vi.waitFor(() => {
              expect(getBudgets).toHaveBeenCalledTimes(i + 1);
            });

            expect(getBudgets).toHaveBeenLastCalledWith(years[i], fixedMonth);
          }

          expect(getBudgets).toHaveBeenCalledTimes(years.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3c: Changing only the month (keeping year constant) triggers a re-fetch.
   */
  it('3c: changing only the month triggers a budget re-fetch', async () => {
    const distinctMonthsArb = fc.uniqueArray(
      fc.integer({ min: 1, max: 12 }),
      { minLength: 2, maxLength: 5 }
    );
    const fixedYearArb = fc.integer({ min: 2020, max: 2030 });

    await fc.assert(
      fc.asyncProperty(
        fixedYearArb,
        distinctMonthsArb,
        async (fixedYear, months) => {
          cleanup();
          vi.clearAllMocks();

          const { propsRef, DynamicWrapper } = createDynamicWrapper(fixedYear, months[0]);

          const { result, rerender } = renderHook(() => useSharedDataContext(), {
            wrapper: DynamicWrapper,
          });

          // Wait for initial mount fetch
          await vi.waitFor(() => {
            expect(getBudgets).toHaveBeenCalledTimes(1);
          });

          // Change only the month for each subsequent value
          for (let i = 1; i < months.length; i++) {
            propsRef.month = months[i];

            rerender();

            await vi.waitFor(() => {
              expect(getBudgets).toHaveBeenCalledTimes(i + 1);
            });

            expect(getBudgets).toHaveBeenLastCalledWith(fixedYear, months[i]);
          }

          expect(getBudgets).toHaveBeenCalledTimes(months.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3d: Re-rendering with the same (year, month) does NOT trigger
   * an additional fetch (React skips effect when deps are unchanged).
   */
  it('3d: re-rendering with the same year/month does not trigger additional fetch', async () => {
    const yearArb = fc.integer({ min: 2020, max: 2030 });
    const monthArb = fc.integer({ min: 1, max: 12 });
    const rerenderCountArb = fc.integer({ min: 1, max: 5 });

    await fc.assert(
      fc.asyncProperty(
        yearArb,
        monthArb,
        rerenderCountArb,
        async (year, month, rerenderCount) => {
          cleanup();
          vi.clearAllMocks();

          const staticWrapper = createSharedDataWrapper({ selectedYear: year, selectedMonth: month });

          const { result, rerender } = renderHook(() => useSharedDataContext(), {
            wrapper: staticWrapper,
          });

          // Wait for initial mount fetch
          await vi.waitFor(() => {
            expect(getBudgets).toHaveBeenCalledTimes(1);
          });

          // Re-render with the same props multiple times
          for (let i = 0; i < rerenderCount; i++) {
            rerender();
          }

          // Allow any potential async effects to settle
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
          });

          // Should still be exactly 1 call (only the initial mount)
          expect(getBudgets).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * **Feature: shared-data-context, Property 4: Error Handling Preserves State**
 *
 * For any existing state (paymentMethods, people, budgets arrays with data), if an API
 * fetch fails, the existing state should be preserved unchanged. The provider should not
 * crash or throw unhandled errors.
 *
 * **Validates: Requirements 5.3, 5.4**
 */
describe('Property 4: Error Handling Preserves State', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // Generate random payment method names
  const paymentMethodsArb = fc.array(
    fc.record({
      display_name: fc.string({ minLength: 1, maxLength: 20 })
    }),
    { minLength: 1, maxLength: 5 }
  );

  // Generate random people
  const peopleArb = fc.array(
    fc.record({
      id: fc.integer({ min: 1, max: 100 }),
      name: fc.string({ minLength: 1, maxLength: 20 }),
      date_of_birth: fc.constant('2000-01-01')
    }),
    { minLength: 1, maxLength: 5 }
  );

  // Generate random budgets
  const budgetsArb = fc.array(
    fc.record({
      id: fc.integer({ min: 1, max: 100 }),
      category: fc.constantFrom('Groceries', 'Gas', 'Dining Out'),
      limit_amount: fc.integer({ min: 100, max: 1000 }),
      spent: fc.integer({ min: 0, max: 500 })
    }),
    { minLength: 1, maxLength: 5 }
  );

  /**
   * Property 4a: Payment methods state is preserved when API fetch fails on refresh.
   * First populate state with data, then trigger a refresh that fails, and verify
   * the original state is unchanged.
   */
  it('4a: payment methods state preserved when API fetch fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await fc.assert(
      fc.asyncProperty(
        paymentMethodsArb,
        async (methods) => {
          cleanup();
          vi.clearAllMocks();
          consoleSpy.mockClear();

          // Set up mock to return data initially
          getPaymentMethods.mockResolvedValueOnce(methods);
          // Set up mock to fail on refresh
          getPaymentMethods.mockRejectedValueOnce(new Error('API Error'));

          const { result } = renderHook(() => useSharedDataContext(), { wrapper });

          // Wait for initial fetch to populate state
          await vi.waitFor(() => {
            expect(result.current.paymentMethods).toEqual(methods.map(m => m.display_name));
          });

          const originalState = [...result.current.paymentMethods];

          // Trigger refresh (which will fail)
          await act(async () => {
            result.current.refreshPaymentMethods();
          });

          // Wait for the failed fetch to complete
          await vi.waitFor(() => {
            expect(getPaymentMethods).toHaveBeenCalledTimes(2);
          });

          // State should be preserved
          expect(result.current.paymentMethods).toEqual(originalState);
        }
      ),
      { numRuns: 100 }
    );

    consoleSpy.mockRestore();
  });

  /**
   * Property 4b: People state is preserved when API fetch fails on refresh.
   * First populate state with data, then trigger a refresh that fails, and verify
   * the original state is unchanged.
   */
  it('4b: people state preserved when API fetch fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await fc.assert(
      fc.asyncProperty(
        peopleArb,
        async (peopleData) => {
          cleanup();
          vi.clearAllMocks();
          consoleSpy.mockClear();

          // Set up mock to return data initially
          getPeople.mockResolvedValueOnce(peopleData);
          // Set up mock to fail on refresh
          getPeople.mockRejectedValueOnce(new Error('API Error'));

          const { result } = renderHook(() => useSharedDataContext(), { wrapper });

          // Wait for initial fetch to populate state
          await vi.waitFor(() => {
            expect(result.current.people).toEqual(peopleData);
          });

          const originalState = [...result.current.people];

          // Trigger refresh (which will fail)
          await act(async () => {
            result.current.refreshPeople();
          });

          // Wait for the failed fetch to complete
          await vi.waitFor(() => {
            expect(getPeople).toHaveBeenCalledTimes(2);
          });

          // State should be preserved
          expect(result.current.people).toEqual(originalState);
        }
      ),
      { numRuns: 100 }
    );

    consoleSpy.mockRestore();
  });

  /**
   * Property 4c: Budgets state is preserved when API fetch fails on refresh.
   * First populate state with data, then trigger a refresh that fails, and verify
   * the original state is unchanged.
   */
  it('4c: budgets state preserved when API fetch fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await fc.assert(
      fc.asyncProperty(
        budgetsArb,
        async (budgetsData) => {
          cleanup();
          vi.clearAllMocks();
          consoleSpy.mockClear();

          // Set up mock to return data initially (API returns { budgets: [...] })
          getBudgets.mockResolvedValueOnce({ budgets: budgetsData });
          // Set up mock to fail on refresh
          getBudgets.mockRejectedValueOnce(new Error('API Error'));

          const { result } = renderHook(() => useSharedDataContext(), { wrapper });

          // Wait for initial fetch to populate state
          await vi.waitFor(() => {
            expect(result.current.budgets).toEqual(budgetsData);
          });

          const originalState = [...result.current.budgets];

          // Trigger refresh (which will fail)
          await act(async () => {
            result.current.refreshBudgets();
          });

          // Wait for the failed fetch to complete
          await vi.waitFor(() => {
            expect(getBudgets).toHaveBeenCalledTimes(2);
          });

          // State should be preserved
          expect(result.current.budgets).toEqual(originalState);
        }
      ),
      { numRuns: 100 }
    );

    consoleSpy.mockRestore();
  });

  /**
   * Property 4d: Provider does not crash when all API fetches fail simultaneously.
   * For any combination of error types, the provider should remain functional
   * and preserve whatever state it had.
   */
  it('4d: provider does not crash when all API fetches fail simultaneously', async () => {
    const errorTypeArb = fc.constantFrom(
      'Error',
      'TypeError',
      'NetworkError',
      'TimeoutError'
    );

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await fc.assert(
      fc.asyncProperty(
        paymentMethodsArb,
        peopleArb,
        budgetsArb,
        errorTypeArb,
        async (methods, peopleData, budgetsData, errorType) => {
          cleanup();
          vi.clearAllMocks();
          consoleSpy.mockClear();

          // Set up mocks to return data initially
          getPaymentMethods.mockResolvedValueOnce(methods);
          getPeople.mockResolvedValueOnce(peopleData);
          getBudgets.mockResolvedValueOnce({ budgets: budgetsData });

          // Set up all mocks to fail on refresh
          getPaymentMethods.mockRejectedValueOnce(new Error(errorType));
          getPeople.mockRejectedValueOnce(new Error(errorType));
          getBudgets.mockRejectedValueOnce(new Error(errorType));

          const { result } = renderHook(() => useSharedDataContext(), { wrapper });

          // Wait for initial fetches to populate state
          await vi.waitFor(() => {
            expect(result.current.paymentMethods).toEqual(methods.map(m => m.display_name));
          });
          await vi.waitFor(() => {
            expect(result.current.people).toEqual(peopleData);
          });
          await vi.waitFor(() => {
            expect(result.current.budgets).toEqual(budgetsData);
          });

          const originalPaymentMethods = [...result.current.paymentMethods];
          const originalPeople = [...result.current.people];
          const originalBudgets = [...result.current.budgets];

          // Trigger all refreshes (which will all fail)
          await act(async () => {
            result.current.refreshPaymentMethods();
            result.current.refreshPeople();
            result.current.refreshBudgets();
          });

          // Wait for all failed fetches to complete
          await vi.waitFor(() => {
            expect(getPaymentMethods).toHaveBeenCalledTimes(2);
          });
          await vi.waitFor(() => {
            expect(getPeople).toHaveBeenCalledTimes(2);
          });
          await vi.waitFor(() => {
            expect(getBudgets).toHaveBeenCalledTimes(2);
          });

          // All state should be preserved
          expect(result.current.paymentMethods).toEqual(originalPaymentMethods);
          expect(result.current.people).toEqual(originalPeople);
          expect(result.current.budgets).toEqual(originalBudgets);
        }
      ),
      { numRuns: 100 }
    );

    consoleSpy.mockRestore();
  });
});


/**
 * **Feature: shared-data-context, Property 5: Handler References are Stable**
 *
 * For any sequence of re-renders where the dependencies don't change, the handler
 * function references (openPaymentMethods, closePaymentMethods, refreshPaymentMethods,
 * refreshPeople, refreshBudgets) should remain referentially equal (same object reference).
 *
 * **Validates: Requirements 6.4, 6.5**
 */
describe('Property 5: Handler References are Stable', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const HANDLERS = [
    'openPaymentMethods',
    'closePaymentMethods',
    'refreshPaymentMethods',
    'refreshPeople',
    'refreshBudgets',
  ];

  // Arbitrary for number of re-renders
  const rerenderCountArb = fc.integer({ min: 1, max: 10 });

  // Arbitrary for selecting a handler
  const handlerArb = fc.constantFrom(...HANDLERS);

  /**
   * Property 5a: For any single handler and any number of re-renders,
   * the handler reference remains the same object (referentially equal).
   */
  it('5a: handler references remain stable across re-renders', () => {
    fc.assert(
      fc.property(
        handlerArb,
        rerenderCountArb,
        (handlerName, rerenderCount) => {
          const { result, rerender } = renderHook(() => useSharedDataContext(), { wrapper });

          // Capture initial reference
          const initialRef = result.current[handlerName];

          // Re-render multiple times
          for (let i = 0; i < rerenderCount; i++) {
            rerender();
          }

          // Reference should be the same
          expect(result.current[handlerName]).toBe(initialRef);

          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5b: All handler references remain stable simultaneously across
   * any number of re-renders.
   */
  it('5b: all handler references remain stable simultaneously', () => {
    fc.assert(
      fc.property(
        rerenderCountArb,
        (rerenderCount) => {
          const { result, rerender } = renderHook(() => useSharedDataContext(), { wrapper });

          // Capture all initial references
          const initialRefs = {};
          for (const handler of HANDLERS) {
            initialRefs[handler] = result.current[handler];
          }

          // Re-render multiple times
          for (let i = 0; i < rerenderCount; i++) {
            rerender();
          }

          // All references should be the same
          for (const handler of HANDLERS) {
            expect(result.current[handler]).toBe(initialRefs[handler]);
          }

          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });
});
