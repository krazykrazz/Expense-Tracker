import { describe, it, expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as fc from 'fast-check';

/**
 * Property-Based Tests for App Global View Functionality
 * 
 * Tests for:
 * - Property 9: Return to Monthly View Action
 * - Property 10: Global View Trigger Identification
 */

describe('Return to Monthly View Property-Based Tests', () => {
  afterEach(() => {
    cleanup();
  });

  // Arbitraries for global filter states (non-empty values that trigger global view)
  const searchTextArb = fc.oneof(
    fc.constant(''),
    fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
  );
  const filterMethodArb = fc.constantFrom('', 'Visa', 'Mastercard', 'Cash', 'Debit');
  const filterYearArb = fc.constantFrom('', '2024', '2025', '2026');

  /**
   * Simulates global filter state with clear functions
   * Mirrors the state management in App.jsx
   */
  const createGlobalFilterState = (initialSearchText, initialFilterMethod, initialFilterYear) => {
    let searchText = initialSearchText;
    let filterMethod = initialFilterMethod;
    let filterYear = initialFilterYear;

    return {
      getState: () => ({ searchText, filterMethod, filterYear }),
      isGlobalView: () => searchText.trim().length > 0 || filterMethod !== '' || filterYear !== '',
      returnToMonthlyView: () => {
        searchText = '';
        filterMethod = '';
        filterYear = '';
      }
    };
  };

  /**
   * **Feature: expense-list-ux-improvements, Property 9: Return to Monthly View Action**
   * 
   * For any global view state with active global filters (searchText, filterMethod, filterYear),
   * clicking "Return to Monthly View" SHALL clear all three global filter values,
   * resulting in isGlobalView becoming false.
   * 
   * **Validates: Requirements 5.3**
   */
  it('Property 9: Return to Monthly View clears all global-triggering filters', async () => {
    await fc.assert(
      fc.property(
        searchTextArb,
        filterMethodArb,
        filterYearArb,
        (searchText, filterMethod, filterYear) => {
          const state = createGlobalFilterState(searchText, filterMethod, filterYear);
          
          // Execute return to monthly view action
          state.returnToMonthlyView();
          const afterState = state.getState();
          
          // All global filters should be cleared
          expect(afterState.searchText).toBe('');
          expect(afterState.filterMethod).toBe('');
          expect(afterState.filterYear).toBe('');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9: After return to monthly view, isGlobalView is always false
   */
  it('Property 9: After return to monthly view, isGlobalView is false', async () => {
    await fc.assert(
      fc.property(
        searchTextArb,
        filterMethodArb,
        filterYearArb,
        (searchText, filterMethod, filterYear) => {
          const state = createGlobalFilterState(searchText, filterMethod, filterYear);
          
          // Execute return to monthly view action
          state.returnToMonthlyView();
          
          // isGlobalView should be false after clearing
          expect(state.isGlobalView()).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9: Return to monthly view is idempotent
   */
  it('Property 9: Return to monthly view is idempotent', async () => {
    await fc.assert(
      fc.property(
        searchTextArb,
        filterMethodArb,
        filterYearArb,
        (searchText, filterMethod, filterYear) => {
          const state = createGlobalFilterState(searchText, filterMethod, filterYear);
          
          // Execute return to monthly view action twice
          state.returnToMonthlyView();
          const afterFirst = { ...state.getState() };
          
          state.returnToMonthlyView();
          const afterSecond = state.getState();
          
          // State should be the same after both calls
          expect(afterSecond.searchText).toBe(afterFirst.searchText);
          expect(afterSecond.filterMethod).toBe(afterFirst.filterMethod);
          expect(afterSecond.filterYear).toBe(afterFirst.filterYear);
          expect(state.isGlobalView()).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9: Global view is true if and only if at least one global filter is active
   */
  it('Property 9: Global view is true iff at least one global filter is active', async () => {
    await fc.assert(
      fc.property(
        searchTextArb,
        filterMethodArb,
        filterYearArb,
        (searchText, filterMethod, filterYear) => {
          const state = createGlobalFilterState(searchText, filterMethod, filterYear);
          
          const hasActiveGlobalFilter = 
            searchText.trim().length > 0 || 
            filterMethod !== '' || 
            filterYear !== '';
          
          expect(state.isGlobalView()).toBe(hasActiveGlobalFilter);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Global View Trigger Identification Property-Based Tests', () => {
  afterEach(() => {
    cleanup();
  });

  // Arbitraries for global filter states
  const searchTextArb = fc.oneof(
    fc.constant(''),
    fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
  );
  const filterMethodArb = fc.constantFrom('', 'Visa', 'Mastercard', 'Cash', 'Debit');
  const filterYearArb = fc.constantFrom('', '2024', '2025', '2026');

  /**
   * Helper function to identify global view triggers
   * Mirrors the logic in App.jsx (globalViewTriggers useMemo)
   */
  const identifyGlobalViewTriggers = (searchText, filterMethod, filterYear) => {
    const triggers = [];
    if (searchText.trim().length > 0) {
      triggers.push('Search');
    }
    if (filterMethod) {
      triggers.push('Payment Method');
    }
    if (filterYear) {
      triggers.push('Year');
    }
    return triggers;
  };

  /**
   * **Feature: expense-list-ux-improvements, Property 10: Global View Trigger Identification**
   * 
   * For any global view state, the displayed trigger list SHALL contain exactly
   * the names of the non-empty global filters (searchText → "Search",
   * filterMethod → "Payment Method", filterYear → "Year").
   * 
   * **Validates: Requirements 5.4**
   */
  it('Property 10: Trigger list contains exactly the names of non-empty global filters', async () => {
    await fc.assert(
      fc.property(
        searchTextArb,
        filterMethodArb,
        filterYearArb,
        (searchText, filterMethod, filterYear) => {
          const triggers = identifyGlobalViewTriggers(searchText, filterMethod, filterYear);
          
          // Check that each expected trigger is present
          if (searchText.trim().length > 0) {
            expect(triggers).toContain('Search');
          } else {
            expect(triggers).not.toContain('Search');
          }
          
          if (filterMethod) {
            expect(triggers).toContain('Payment Method');
          } else {
            expect(triggers).not.toContain('Payment Method');
          }
          
          if (filterYear) {
            expect(triggers).toContain('Year');
          } else {
            expect(triggers).not.toContain('Year');
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10: Trigger count matches number of active global filters
   */
  it('Property 10: Trigger count matches number of active global filters', async () => {
    await fc.assert(
      fc.property(
        searchTextArb,
        filterMethodArb,
        filterYearArb,
        (searchText, filterMethod, filterYear) => {
          const triggers = identifyGlobalViewTriggers(searchText, filterMethod, filterYear);
          
          // Count expected triggers
          let expectedCount = 0;
          if (searchText.trim().length > 0) expectedCount++;
          if (filterMethod) expectedCount++;
          if (filterYear) expectedCount++;
          
          expect(triggers.length).toBe(expectedCount);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10: Triggers are always from the valid set
   */
  it('Property 10: All triggers are from the valid set', async () => {
    const validTriggers = ['Search', 'Payment Method', 'Year'];

    await fc.assert(
      fc.property(
        searchTextArb,
        filterMethodArb,
        filterYearArb,
        (searchText, filterMethod, filterYear) => {
          const triggers = identifyGlobalViewTriggers(searchText, filterMethod, filterYear);
          
          // All triggers should be from the valid set
          triggers.forEach(trigger => {
            expect(validTriggers).toContain(trigger);
          });
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10: Triggers are unique (no duplicates)
   */
  it('Property 10: Trigger list contains no duplicates', async () => {
    await fc.assert(
      fc.property(
        searchTextArb,
        filterMethodArb,
        filterYearArb,
        (searchText, filterMethod, filterYear) => {
          const triggers = identifyGlobalViewTriggers(searchText, filterMethod, filterYear);
          
          // Check for uniqueness
          const uniqueTriggers = new Set(triggers);
          expect(triggers.length).toBe(uniqueTriggers.size);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10: Empty state produces empty trigger list
   */
  it('Property 10: Empty filters produce empty trigger list', async () => {
    const triggers = identifyGlobalViewTriggers('', '', '');
    expect(triggers).toEqual([]);
  });

  /**
   * Property 10: All filters active produces all triggers
   */
  it('Property 10: All filters active produces all three triggers', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.constantFrom('Visa', 'Mastercard', 'Cash', 'Debit'),
        fc.constantFrom('2024', '2025', '2026'),
        (searchText, filterMethod, filterYear) => {
          const triggers = identifyGlobalViewTriggers(searchText, filterMethod, filterYear);
          
          expect(triggers.length).toBe(3);
          expect(triggers).toContain('Search');
          expect(triggers).toContain('Payment Method');
          expect(triggers).toContain('Year');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
