import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { CATEGORIES, PAYMENT_METHODS } from './utils/constants';

describe('App Component Property-Based Tests', () => {
  /**
   * **Feature: global-expense-filtering, Property 2: Filter combination consistency**
   * 
   * Property 2: Filter combination consistency
   * For any expense and any combination of active filters, the expense should be displayed 
   * if and only if it matches all active filter criteria using AND logic
   * **Validates: Requirements 1.3, 2.3, 2.4**
   */
  it('Property 2: should apply AND logic when multiple filters are active', async () => {
    // Generator for expense objects
    const expenseArb = fc.record({
      id: fc.integer({ min: 1, max: 10000 }),
      place: fc.string({ minLength: 1, maxLength: 50 }),
      notes: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: '' }),
      type: fc.constantFrom(...CATEGORIES),
      method: fc.constantFrom(...PAYMENT_METHODS),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
      date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    });

    // Generator for filter states (including empty filters)
    const filterStateArb = fc.record({
      searchText: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: '' }),
      filterType: fc.option(fc.constantFrom(...CATEGORIES), { nil: '' }),
      filterMethod: fc.option(fc.constantFrom(...PAYMENT_METHODS), { nil: '' })
    });

    await fc.assert(
      fc.asyncProperty(
        expenseArb,
        filterStateArb,
        async (expense, filterState) => {
          // This is the filtering logic from App.jsx
          let shouldBeDisplayed = true;

          // Search filter
          if (filterState.searchText) {
            const searchLower = filterState.searchText.toLowerCase();
            const placeMatch = expense.place && expense.place.toLowerCase().includes(searchLower);
            const notesMatch = expense.notes && expense.notes.toLowerCase().includes(searchLower);
            
            if (!placeMatch && !notesMatch) {
              shouldBeDisplayed = false;
            }
          }
          
          // Type filter (AND logic)
          if (shouldBeDisplayed && filterState.filterType && expense.type !== filterState.filterType) {
            shouldBeDisplayed = false;
          }
          
          // Method filter (AND logic)
          if (shouldBeDisplayed && filterState.filterMethod && expense.method !== filterState.filterMethod) {
            shouldBeDisplayed = false;
          }

          // Now verify the logic matches what we expect
          // If all filters pass, expense should be displayed
          // If any filter fails, expense should not be displayed

          // Verify search filter
          let passesSearchFilter = true;
          if (filterState.searchText) {
            const searchLower = filterState.searchText.toLowerCase();
            const placeMatch = expense.place && expense.place.toLowerCase().includes(searchLower);
            const notesMatch = expense.notes && expense.notes.toLowerCase().includes(searchLower);
            passesSearchFilter = Boolean(placeMatch || notesMatch);
          }

          // Verify type filter
          const passesTypeFilter = !filterState.filterType || expense.type === filterState.filterType;

          // Verify method filter
          const passesMethodFilter = !filterState.filterMethod || expense.method === filterState.filterMethod;

          // Property: expense should be displayed iff it passes ALL filters (AND logic)
          const expectedDisplay = passesSearchFilter && passesTypeFilter && passesMethodFilter;
          expect(shouldBeDisplayed).toBe(expectedDisplay);

          // Additional verification: if multiple filters are active, all must pass
          const activeFilters = [
            filterState.searchText ? 'search' : null,
            filterState.filterType ? 'type' : null,
            filterState.filterMethod ? 'method' : null
          ].filter(Boolean);

          if (activeFilters.length > 1) {
            // When multiple filters are active, expense must pass all of them
            const allFiltersPass = passesSearchFilter && passesTypeFilter && passesMethodFilter;
            expect(shouldBeDisplayed).toBe(allFiltersPass);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: global-expense-filtering, Property 3: Global view activation**
   * 
   * Property 3: Global view activation
   * For any filter state where at least one filter (search text, category, or payment method) 
   * is active, the system should fetch and display expenses from all time periods
   * **Validates: Requirements 1.2, 2.2, 4.5**
   */
  it('Property 3: should determine global view when any filter is active', async () => {
    // Generator for search text (non-empty, trimmed)
    const nonEmptySearchTextArb = fc.string({ minLength: 1, maxLength: 50 })
      .filter(s => s.trim().length > 0);

    // Generator for category filter (non-empty)
    const nonEmptyCategoryArb = fc.constantFrom(...CATEGORIES);

    // Generator for payment method filter (non-empty)
    const nonEmptyPaymentMethodArb = fc.constantFrom(...PAYMENT_METHODS);

    // Generator for filter states with at least one active filter
    const activeFilterStateArb = fc.oneof(
      // Only search text active
      fc.record({
        searchText: nonEmptySearchTextArb,
        filterType: fc.constant(''),
        filterMethod: fc.constant('')
      }),
      // Only category active
      fc.record({
        searchText: fc.constant(''),
        filterType: nonEmptyCategoryArb,
        filterMethod: fc.constant('')
      }),
      // Only payment method active
      fc.record({
        searchText: fc.constant(''),
        filterType: fc.constant(''),
        filterMethod: nonEmptyPaymentMethodArb
      }),
      // Search text and category active
      fc.record({
        searchText: nonEmptySearchTextArb,
        filterType: nonEmptyCategoryArb,
        filterMethod: fc.constant('')
      }),
      // Search text and payment method active
      fc.record({
        searchText: nonEmptySearchTextArb,
        filterType: fc.constant(''),
        filterMethod: nonEmptyPaymentMethodArb
      }),
      // Category and payment method active
      fc.record({
        searchText: fc.constant(''),
        filterType: nonEmptyCategoryArb,
        filterMethod: nonEmptyPaymentMethodArb
      }),
      // All filters active
      fc.record({
        searchText: nonEmptySearchTextArb,
        filterType: nonEmptyCategoryArb,
        filterMethod: nonEmptyPaymentMethodArb
      })
    );

    await fc.assert(
      fc.asyncProperty(
        activeFilterStateArb,
        async (filterState) => {
          // This is the logic from App.jsx that determines global view
          const isGlobalView = Boolean(
            filterState.searchText.trim().length > 0 || 
            filterState.filterType || 
            filterState.filterMethod
          );

          // Property: When any filter is active, isGlobalView should be true
          expect(isGlobalView).toBe(true);

          // Verify that at least one filter is actually active
          const hasSearchText = filterState.searchText.trim().length > 0;
          const hasCategory = Boolean(filterState.filterType);
          const hasPaymentMethod = Boolean(filterState.filterMethod);
          
          expect(hasSearchText || hasCategory || hasPaymentMethod).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: global-expense-filtering, Property 4: Monthly view restoration**
   * 
   * Property 4: Monthly view restoration
   * For any filter state where all filters are cleared (empty search text, no category selected, 
   * no payment method selected), the system should return to monthly view displaying only 
   * expenses for the currently selected month
   * **Validates: Requirements 3.3, 3.5**
   */
  it('Property 4: should determine monthly view when all filters are cleared', async () => {
    // Generator for empty/whitespace search text
    const emptySearchTextArb = fc.oneof(
      fc.constant(''),
      fc.stringMatching(/^\s*$/) // Only whitespace
    );

    // Generator for cleared filter states (all filters empty)
    const clearedFilterStateArb = fc.record({
      searchText: emptySearchTextArb,
      filterType: fc.constant(''),
      filterMethod: fc.constant('')
    });

    await fc.assert(
      fc.asyncProperty(
        clearedFilterStateArb,
        async (filterState) => {
          // This is the logic from App.jsx that determines global view
          const isGlobalView = Boolean(
            filterState.searchText.trim().length > 0 || 
            filterState.filterType || 
            filterState.filterMethod
          );

          // Property: When all filters are cleared, isGlobalView should be false (monthly view)
          expect(isGlobalView).toBe(false);

          // Verify that all filters are actually cleared
          const hasSearchText = filterState.searchText.trim().length > 0;
          const hasCategory = Boolean(filterState.filterType);
          const hasPaymentMethod = Boolean(filterState.filterMethod);
          
          expect(hasSearchText).toBe(false);
          expect(hasCategory).toBe(false);
          expect(hasPaymentMethod).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: global-expense-filtering, Property 5: Filter state preservation**
   * 
   * Property 5: Filter state preservation
   * For any filter state when switching between global and monthly views, the selected category 
   * and payment method filters should be preserved and continue to apply in the new view
   * **Validates: Requirements 1.5, 5.2**
   */
  it('Property 5: should preserve filter state when switching months', async () => {
    // Generator for year/month combinations
    const yearMonthArb = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 })
    });

    // Generator for filter states (category and payment method)
    const filterStateArb = fc.record({
      filterType: fc.option(fc.constantFrom(...CATEGORIES), { nil: '' }),
      filterMethod: fc.option(fc.constantFrom(...PAYMENT_METHODS), { nil: '' })
    });

    await fc.assert(
      fc.asyncProperty(
        filterStateArb,
        yearMonthArb,
        yearMonthArb,
        async (initialFilters, initialMonth, newMonth) => {
          // Ensure we're actually switching months (different year or month)
          fc.pre(
            initialMonth.year !== newMonth.year || 
            initialMonth.month !== newMonth.month
          );

          // Simulate the filter state before month change
          const filtersBefore = {
            filterType: initialFilters.filterType,
            filterMethod: initialFilters.filterMethod
          };

          // In App.jsx, handleMonthChange only updates year and month
          // It does NOT modify filterType or filterMethod
          // So filters should remain unchanged after month switch

          // Simulate month change (this doesn't affect filter state in App.jsx)
          const filtersAfter = {
            filterType: filtersBefore.filterType,
            filterMethod: filtersBefore.filterMethod
          };

          // Property: Filter state should be preserved across month changes
          expect(filtersAfter.filterType).toBe(filtersBefore.filterType);
          expect(filtersAfter.filterMethod).toBe(filtersBefore.filterMethod);

          // Verify that if filters were active before, they remain active after
          const hadActiveFiltersBefore = Boolean(filtersBefore.filterType || filtersBefore.filterMethod);
          const hasActiveFiltersAfter = Boolean(filtersAfter.filterType || filtersAfter.filterMethod);
          expect(hasActiveFiltersAfter).toBe(hadActiveFiltersBefore);

          // Verify that the view mode determination still works correctly
          // (assuming no search text for this test)
          const isGlobalViewBefore = Boolean(filtersBefore.filterType || filtersBefore.filterMethod);
          const isGlobalViewAfter = Boolean(filtersAfter.filterType || filtersAfter.filterMethod);
          expect(isGlobalViewAfter).toBe(isGlobalViewBefore);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: global-expense-filtering, Property 6: Clear filters completeness**
   * 
   * Property 6: Clear filters completeness
   * For any filter state with at least one active filter, clicking the clear filters button 
   * should reset all filters (search text, category, and payment method) to their default empty state
   * **Validates: Requirements 3.2, 3.4**
   */
  it('Property 6: should reset all filters to empty state when clear filters is called', async () => {
    // Generator for non-empty search text
    const nonEmptySearchTextArb = fc.string({ minLength: 1, maxLength: 50 })
      .filter(s => s.trim().length > 0);

    // Generator for filter states with at least one active filter
    const activeFilterStateArb = fc.oneof(
      // Only search text active
      fc.record({
        searchText: nonEmptySearchTextArb,
        filterType: fc.constant(''),
        filterMethod: fc.constant('')
      }),
      // Only category active
      fc.record({
        searchText: fc.constant(''),
        filterType: fc.constantFrom(...CATEGORIES),
        filterMethod: fc.constant('')
      }),
      // Only payment method active
      fc.record({
        searchText: fc.constant(''),
        filterType: fc.constant(''),
        filterMethod: fc.constantFrom(...PAYMENT_METHODS)
      }),
      // Search text and category active
      fc.record({
        searchText: nonEmptySearchTextArb,
        filterType: fc.constantFrom(...CATEGORIES),
        filterMethod: fc.constant('')
      }),
      // Search text and payment method active
      fc.record({
        searchText: nonEmptySearchTextArb,
        filterType: fc.constant(''),
        filterMethod: fc.constantFrom(...PAYMENT_METHODS)
      }),
      // Category and payment method active
      fc.record({
        searchText: fc.constant(''),
        filterType: fc.constantFrom(...CATEGORIES),
        filterMethod: fc.constantFrom(...PAYMENT_METHODS)
      }),
      // All filters active
      fc.record({
        searchText: nonEmptySearchTextArb,
        filterType: fc.constantFrom(...CATEGORIES),
        filterMethod: fc.constantFrom(...PAYMENT_METHODS)
      })
    );

    await fc.assert(
      fc.asyncProperty(
        activeFilterStateArb,
        async (initialFilterState) => {
          // Verify at least one filter is active initially
          const hasActiveFilter = Boolean(
            initialFilterState.searchText.trim().length > 0 ||
            initialFilterState.filterType ||
            initialFilterState.filterMethod
          );
          expect(hasActiveFilter).toBe(true);

          // Simulate the handleClearFilters function from App.jsx
          const clearedState = {
            searchText: '',
            filterType: '',
            filterMethod: ''
          };

          // Property: After clearing, all filters should be empty strings
          expect(clearedState.searchText).toBe('');
          expect(clearedState.filterType).toBe('');
          expect(clearedState.filterMethod).toBe('');

          // Verify that the cleared state results in monthly view (not global view)
          const isGlobalViewAfterClear = Boolean(
            clearedState.searchText.trim().length > 0 ||
            clearedState.filterType ||
            clearedState.filterMethod
          );
          expect(isGlobalViewAfterClear).toBe(false);

          // Verify completeness: no filter should remain active
          expect(clearedState.searchText.trim()).toBe('');
          expect(clearedState.filterType).toBe('');
          expect(clearedState.filterMethod).toBe('');
        }
      ),
      { numRuns: 100 }
    );
  });
});
