import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { FilterProvider, useFilterContext } from './FilterContext';
import { CATEGORIES } from '../utils/constants';

describe('FilterContext Property-Based Tests', () => {
  afterEach(() => {
    cleanup();
  });

  /**
   * **Feature: frontend-state-management, Property 1: Context provides complete interface**
   *
   * For any FilterProvider instance, the context value SHALL contain all required fields:
   * filter state (searchText, filterType, filterMethod, filterYear, filterInsurance),
   * view state (selectedYear, selectedMonth), derived state (isGlobalView, globalViewTriggers),
   * and all handler functions.
   *
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
   */
  it('Property 1: Context provides complete interface', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 0, maxLength: 5 }),
        (paymentMethods) => {
          const { result } = renderHook(() => useFilterContext(), {
            wrapper: ({ children }) => (
              <FilterProvider paymentMethods={paymentMethods}>{children}</FilterProvider>
            ),
          });

          const ctx = result.current;

          // Filter state (Req 1.1)
          expect(ctx).toHaveProperty('searchText');
          expect(ctx).toHaveProperty('filterType');
          expect(ctx).toHaveProperty('filterMethod');
          expect(ctx).toHaveProperty('filterYear');
          expect(ctx).toHaveProperty('filterInsurance');
          expect(typeof ctx.searchText).toBe('string');
          expect(typeof ctx.filterType).toBe('string');
          expect(typeof ctx.filterMethod).toBe('string');
          expect(typeof ctx.filterYear).toBe('string');
          expect(typeof ctx.filterInsurance).toBe('string');

          // View state (Req 1.2)
          expect(ctx).toHaveProperty('selectedYear');
          expect(ctx).toHaveProperty('selectedMonth');
          expect(typeof ctx.selectedYear).toBe('number');
          expect(typeof ctx.selectedMonth).toBe('number');

          // Derived state (Req 1.3)
          expect(ctx).toHaveProperty('isGlobalView');
          expect(ctx).toHaveProperty('globalViewTriggers');
          expect(typeof ctx.isGlobalView).toBe('boolean');
          expect(Array.isArray(ctx.globalViewTriggers)).toBe(true);

          // Setter functions (Req 1.4)
          expect(typeof ctx.setFilterInsurance).toBe('function');

          // Handler functions (Req 1.4, 1.5)
          expect(typeof ctx.handleSearchChange).toBe('function');
          expect(typeof ctx.handleFilterTypeChange).toBe('function');
          expect(typeof ctx.handleFilterMethodChange).toBe('function');
          expect(typeof ctx.handleFilterYearChange).toBe('function');
          expect(typeof ctx.handleMonthChange).toBe('function');
          expect(typeof ctx.handleClearFilters).toBe('function');
          expect(typeof ctx.handleReturnToMonthlyView).toBe('function');

          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Arbitrary for non-empty strings (at least one non-whitespace char)
  const nonEmptyStringArb = fc.string({ minLength: 1 }).filter(s => s.trim().length > 0);

  // Arbitrary for whitespace-only or empty strings
  const emptyOrWhitespaceArb = fc.constantFrom('', ' ', '  ', '\t', '\n');

  /**
   * **Feature: frontend-state-management, Property 2: Default values initialization**
   *
   * For any initial render of FilterProvider, filter state values SHALL be empty strings ('')
   * and view state SHALL be initialized to the current year and month.
   *
   * **Validates: Requirements 2.1**
   */
  it('Property 2: Default values initialization', () => {
    const now = new Date();
    const expectedYear = now.getFullYear();
    const expectedMonth = now.getMonth() + 1;

    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 0, maxLength: 5 }),
        (paymentMethods) => {
          const { result } = renderHook(() => useFilterContext(), {
            wrapper: ({ children }) => (
              <FilterProvider paymentMethods={paymentMethods}>{children}</FilterProvider>
            ),
          });

          const ctx = result.current;

          // All filter state defaults to empty string
          expect(ctx.searchText).toBe('');
          expect(ctx.filterType).toBe('');
          expect(ctx.filterMethod).toBe('');
          expect(ctx.filterYear).toBe('');
          expect(ctx.filterInsurance).toBe('');

          // View state defaults to current date
          expect(ctx.selectedYear).toBe(expectedYear);
          expect(ctx.selectedMonth).toBe(expectedMonth);

          // Derived state defaults
          expect(ctx.isGlobalView).toBe(false);
          expect(ctx.globalViewTriggers).toEqual([]);

          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: frontend-state-management, Property 3: isGlobalView computation**
   *
   * For any combination of filter values, isGlobalView SHALL be true if and only if
   * at least one of searchText (non-empty after trim), filterMethod, filterYear,
   * or filterInsurance is non-empty. filterType alone SHALL NOT trigger global view.
   *
   * **Validates: Requirements 2.2, 2.3**
   */
  it('Property 3: isGlobalView computation', () => {
    fc.assert(
      fc.property(
        fc.record({
          searchText: fc.oneof(nonEmptyStringArb, emptyOrWhitespaceArb),
          filterMethod: fc.oneof(fc.constant(''), nonEmptyStringArb),
          filterYear: fc.oneof(fc.constant(''), nonEmptyStringArb),
          filterInsurance: fc.oneof(fc.constant(''), nonEmptyStringArb),
          filterType: fc.oneof(fc.constant(''), nonEmptyStringArb),
        }),
        (filters) => {
          const { result } = renderHook(() => useFilterContext(), {
            wrapper: ({ children }) => (
              <FilterProvider>{children}</FilterProvider>
            ),
          });

          // Apply all filter values
          act(() => {
            result.current.handleSearchChange(filters.searchText);
            result.current.handleFilterMethodChange(filters.filterMethod);
            result.current.handleFilterYearChange(filters.filterYear);
            result.current.setFilterInsurance(filters.filterInsurance);
          });

          const hasGlobalTrigger =
            filters.searchText.trim().length > 0 ||
            filters.filterMethod !== '' ||
            filters.filterYear !== '' ||
            filters.filterInsurance !== '';

          // Req 2.2: isGlobalView true when any global-triggering filter is active
          expect(result.current.isGlobalView).toBe(hasGlobalTrigger);

          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3b: filterType alone does NOT trigger global view (Req 2.3)
   */
  it('Property 3b: filterType alone does not trigger global view', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        (filterType) => {
          const { result } = renderHook(() => useFilterContext(), {
            wrapper: ({ children }) => (
              <FilterProvider>{children}</FilterProvider>
            ),
          });

          // Set only filterType, leave all global-triggering filters empty
          act(() => {
            result.current.handleSearchChange('');
            result.current.handleFilterMethodChange('');
            result.current.handleFilterYearChange('');
            result.current.setFilterInsurance('');
          });

          // Req 2.3: filterType alone SHALL NOT trigger global view
          expect(result.current.isGlobalView).toBe(false);
          expect(result.current.globalViewTriggers).toEqual([]);

          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: frontend-state-management, Property 4: globalViewTriggers computation**
   *
   * For any combination of active filters, globalViewTriggers SHALL contain exactly
   * the names of the active global-triggering filters.
   *
   * **Validates: Requirements 2.4**
   */
  it('Property 4: globalViewTriggers computation', () => {
    fc.assert(
      fc.property(
        fc.record({
          searchText: fc.oneof(nonEmptyStringArb, emptyOrWhitespaceArb),
          filterMethod: fc.oneof(fc.constant(''), nonEmptyStringArb),
          filterYear: fc.oneof(fc.constant(''), nonEmptyStringArb),
          filterInsurance: fc.oneof(fc.constant(''), nonEmptyStringArb),
        }),
        (filters) => {
          const { result } = renderHook(() => useFilterContext(), {
            wrapper: ({ children }) => (
              <FilterProvider>{children}</FilterProvider>
            ),
          });

          act(() => {
            result.current.handleSearchChange(filters.searchText);
            result.current.handleFilterMethodChange(filters.filterMethod);
            result.current.handleFilterYearChange(filters.filterYear);
            result.current.setFilterInsurance(filters.filterInsurance);
          });

          // Build expected triggers array
          const expected = [];
          if (filters.searchText.trim().length > 0) expected.push('Search');
          if (filters.filterMethod) expected.push('Payment Method');
          if (filters.filterYear) expected.push('Year');
          if (filters.filterInsurance) expected.push('Insurance Status');

          expect(result.current.globalViewTriggers).toEqual(expected);

          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Arbitrary for strings guaranteed NOT in CATEGORIES
  const invalidCategoryArb = fc.string({ minLength: 1 })
    .filter(s => s.trim().length > 0 && !CATEGORIES.includes(s));

  /**
   * **Feature: frontend-state-management, Property 5: Filter validation**
   *
   * For any value passed to handleFilterTypeChange, if the value is non-empty and not in CATEGORIES,
   * filterType SHALL be reset to empty string. For any value passed to handleFilterMethodChange,
   * if the value is non-empty and paymentMethods is non-empty and the value is not in paymentMethods,
   * filterMethod SHALL be reset to empty string. If paymentMethods is empty, validation SHALL be skipped.
   *
   * **Validates: Requirements 2.5, 2.6, 7.2, 7.3**
   */
  describe('Property 5: Filter validation', () => {
    it('5a: valid categories are accepted', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...CATEGORIES),
          (validCategory) => {
            const { result } = renderHook(() => useFilterContext(), {
              wrapper: ({ children }) => (
                <FilterProvider>{children}</FilterProvider>
              ),
            });

            act(() => {
              result.current.handleFilterTypeChange(validCategory);
            });

            expect(result.current.filterType).toBe(validCategory);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('5b: invalid categories are reset to empty string', () => {
      fc.assert(
        fc.property(
          invalidCategoryArb,
          (invalidCategory) => {
            const { result } = renderHook(() => useFilterContext(), {
              wrapper: ({ children }) => (
                <FilterProvider>{children}</FilterProvider>
              ),
            });

            act(() => {
              result.current.handleFilterTypeChange(invalidCategory);
            });

            // Req 2.5: invalid category resets to empty
            expect(result.current.filterType).toBe('');

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('5c: empty string category is accepted (clears filter)', () => {
      const { result } = renderHook(() => useFilterContext(), {
        wrapper: ({ children }) => (
          <FilterProvider>{children}</FilterProvider>
        ),
      });

      act(() => {
        result.current.handleFilterTypeChange('Groceries');
      });
      expect(result.current.filterType).toBe('Groceries');

      act(() => {
        result.current.handleFilterTypeChange('');
      });
      expect(result.current.filterType).toBe('');

      cleanup();
    });

    it('5d: valid payment methods are accepted when paymentMethods is non-empty', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 5 }),
          (paymentMethods) => {
            // Pick a random valid method from the list
            const validMethod = paymentMethods[0];

            const { result } = renderHook(() => useFilterContext(), {
              wrapper: ({ children }) => (
                <FilterProvider paymentMethods={paymentMethods}>{children}</FilterProvider>
              ),
            });

            act(() => {
              result.current.handleFilterMethodChange(validMethod);
            });

            expect(result.current.filterMethod).toBe(validMethod);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('5e: invalid payment methods are reset when paymentMethods is non-empty', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 5 }),
          fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          (paymentMethods, candidate) => {
            // Skip if candidate happens to be in the list
            fc.pre(!paymentMethods.includes(candidate));

            const { result } = renderHook(() => useFilterContext(), {
              wrapper: ({ children }) => (
                <FilterProvider paymentMethods={paymentMethods}>{children}</FilterProvider>
              ),
            });

            act(() => {
              result.current.handleFilterMethodChange(candidate);
            });

            // Req 7.2: invalid method resets to empty
            expect(result.current.filterMethod).toBe('');

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('5f: validation is skipped when paymentMethods is empty', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          (anyMethod) => {
            const { result } = renderHook(() => useFilterContext(), {
              wrapper: ({ children }) => (
                <FilterProvider paymentMethods={[]}>{children}</FilterProvider>
              ),
            });

            act(() => {
              result.current.handleFilterMethodChange(anyMethod);
            });

            // Req 7.3: skip validation when paymentMethods is empty
            expect(result.current.filterMethod).toBe(anyMethod);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


describe('FilterContext Utility Handler Property Tests', () => {
  afterEach(() => {
    cleanup();
  });

  // Arbitrary for non-empty strings (at least one non-whitespace char)
  const nonEmptyStringArb = fc.string({ minLength: 1 }).filter(s => s.trim().length > 0);

  /**
   * **Feature: frontend-state-management, Property 6: handleClearFilters resets all filters**
   *
   * For any state where filters have values, calling handleClearFilters SHALL result in
   * all filter values (searchText, filterType, filterMethod, filterYear, filterInsurance)
   * being empty strings.
   *
   * **Validates: Requirements 2.7**
   */
  it('Property 6: handleClearFilters resets all filters', () => {
    fc.assert(
      fc.property(
        fc.record({
          searchText: nonEmptyStringArb,
          filterType: fc.constantFrom(...CATEGORIES),
          filterMethod: nonEmptyStringArb,
          filterYear: nonEmptyStringArb,
          filterInsurance: nonEmptyStringArb,
        }),
        (filters) => {
          const { result } = renderHook(() => useFilterContext(), {
            wrapper: ({ children }) => (
              <FilterProvider paymentMethods={[]}>{children}</FilterProvider>
            ),
          });

          // Set all filters to non-empty values
          act(() => {
            result.current.handleSearchChange(filters.searchText);
            result.current.handleFilterTypeChange(filters.filterType);
            result.current.handleFilterMethodChange(filters.filterMethod);
            result.current.handleFilterYearChange(filters.filterYear);
            result.current.setFilterInsurance(filters.filterInsurance);
          });

          // Call handleClearFilters
          act(() => {
            result.current.handleClearFilters();
          });

          // All filter values must be empty strings
          expect(result.current.searchText).toBe('');
          expect(result.current.filterType).toBe('');
          expect(result.current.filterMethod).toBe('');
          expect(result.current.filterYear).toBe('');
          expect(result.current.filterInsurance).toBe('');

          // Derived state should also reflect cleared filters
          expect(result.current.isGlobalView).toBe(false);
          expect(result.current.globalViewTriggers).toEqual([]);

          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: frontend-state-management, Property 7: handleReturnToMonthlyView preserves filterType**
   *
   * For any state where filterType has a value, calling handleReturnToMonthlyView SHALL clear
   * searchText, filterMethod, filterYear, and filterInsurance while preserving the filterType value.
   *
   * **Validates: Requirements 2.8**
   */
  it('Property 7: handleReturnToMonthlyView preserves filterType', () => {
    fc.assert(
      fc.property(
        fc.record({
          searchText: nonEmptyStringArb,
          filterType: fc.constantFrom(...CATEGORIES),
          filterMethod: nonEmptyStringArb,
          filterYear: nonEmptyStringArb,
          filterInsurance: nonEmptyStringArb,
        }),
        (filters) => {
          const { result } = renderHook(() => useFilterContext(), {
            wrapper: ({ children }) => (
              <FilterProvider paymentMethods={[]}>{children}</FilterProvider>
            ),
          });

          // Set all filters to non-empty values
          act(() => {
            result.current.handleSearchChange(filters.searchText);
            result.current.handleFilterTypeChange(filters.filterType);
            result.current.handleFilterMethodChange(filters.filterMethod);
            result.current.handleFilterYearChange(filters.filterYear);
            result.current.setFilterInsurance(filters.filterInsurance);
          });

          // Call handleReturnToMonthlyView
          act(() => {
            result.current.handleReturnToMonthlyView();
          });

          // Global-triggering filters must be cleared
          expect(result.current.searchText).toBe('');
          expect(result.current.filterMethod).toBe('');
          expect(result.current.filterYear).toBe('');
          expect(result.current.filterInsurance).toBe('');

          // filterType must be preserved
          expect(result.current.filterType).toBe(filters.filterType);

          // isGlobalView should be false (all global triggers cleared)
          expect(result.current.isGlobalView).toBe(false);
          expect(result.current.globalViewTriggers).toEqual([]);

          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('FilterContext Handler State Update Property Tests', () => {
  afterEach(() => {
    cleanup();
  });

  /**
   * **Feature: frontend-state-management, Property 8: Handlers update state correctly**
   *
   * For any value passed to a handler function:
   * - handleSearchChange(text) SHALL set searchText to text
   * - handleFilterYearChange(year) SHALL set filterYear to year
   * - handleMonthChange(year, month) SHALL set selectedYear to year and selectedMonth to month
   * - setFilterInsurance(value) SHALL set filterInsurance to value
   *
   * **Validates: Requirements 6.1, 6.4, 6.5, 6.6**
   */
  it('Property 8a: handleSearchChange sets searchText to the given value', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (text) => {
          const { result } = renderHook(() => useFilterContext(), {
            wrapper: ({ children }) => (
              <FilterProvider>{children}</FilterProvider>
            ),
          });

          act(() => {
            result.current.handleSearchChange(text);
          });

          expect(result.current.searchText).toBe(text);

          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8b: handleFilterYearChange sets filterYear to the given value', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(''), fc.integer({ min: 2000, max: 2100 }).map(String)),
        (year) => {
          const { result } = renderHook(() => useFilterContext(), {
            wrapper: ({ children }) => (
              <FilterProvider>{children}</FilterProvider>
            ),
          });

          act(() => {
            result.current.handleFilterYearChange(year);
          });

          expect(result.current.filterYear).toBe(year);

          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8c: handleMonthChange sets selectedYear and selectedMonth', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        (year, month) => {
          const { result } = renderHook(() => useFilterContext(), {
            wrapper: ({ children }) => (
              <FilterProvider>{children}</FilterProvider>
            ),
          });

          act(() => {
            result.current.handleMonthChange(year, month);
          });

          expect(result.current.selectedYear).toBe(year);
          expect(result.current.selectedMonth).toBe(month);

          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8d: setFilterInsurance sets filterInsurance to the given value', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(''), fc.constantFrom('Not Claimed', 'In Progress', 'Paid', 'Denied')),
        (value) => {
          const { result } = renderHook(() => useFilterContext(), {
            wrapper: ({ children }) => (
              <FilterProvider>{children}</FilterProvider>
            ),
          });

          act(() => {
            result.current.setFilterInsurance(value);
          });

          expect(result.current.filterInsurance).toBe(value);

          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });
});
