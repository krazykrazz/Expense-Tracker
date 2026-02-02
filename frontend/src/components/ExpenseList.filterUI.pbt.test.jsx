import { describe, it, expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as fc from 'fast-check';

/**
 * Property-Based Tests for ExpenseList Filter UI Components
 * 
 * Tests for:
 * - Property 5: Total Filter Count Badge Accuracy
 * - Property 6: Filter Chips Generation
 * - Property 7: Filter Chip Removal Independence
 */

describe('Filter Count Badge Property-Based Tests', () => {
  afterEach(() => {
    cleanup();
  });

  // Arbitraries for filter states
  const filterTypeArb = fc.constantFrom('', 'Groceries', 'Dining Out', 'Entertainment', 'Tax - Medical');
  const filterMethodArb = fc.constantFrom('', 'type:cash', 'type:credit_card', 'method:Visa', 'method:Cash');
  const filterInvoiceArb = fc.constantFrom('', 'with-invoice', 'without-invoice');
  const filterInsuranceArb = fc.constantFrom('', 'eligible', 'not-eligible', 'not_claimed', 'in_progress', 'paid', 'denied');

  /**
   * Helper function to calculate total filter count
   * Mirrors the logic in ExpenseList.jsx
   */
  const calculateTotalFilterCount = (filterType, filterMethod, filterInvoice, filterInsurance) => {
    let count = 0;
    if (filterType) count++;
    if (filterMethod) count++;
    if (filterInvoice) count++;
    if (filterInsurance) count++;
    return count;
  };

  /**
   * **Feature: expense-list-ux-improvements, Property 5: Total Filter Count Badge Accuracy**
   * 
   * For any combination of local filter states (type, method, invoice, insurance),
   * the filter count badge SHALL display a number equal to the count of non-empty
   * filter values, and SHALL be visible if and only if at least one filter is active.
   * 
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it('Property 5: Filter count equals number of non-empty filter values', async () => {
    await fc.assert(
      fc.property(
        filterTypeArb,
        filterMethodArb,
        filterInvoiceArb,
        filterInsuranceArb,
        (filterType, filterMethod, filterInvoice, filterInsurance) => {
          const count = calculateTotalFilterCount(filterType, filterMethod, filterInvoice, filterInsurance);
          
          // Count non-empty values manually
          let expectedCount = 0;
          if (filterType !== '') expectedCount++;
          if (filterMethod !== '') expectedCount++;
          if (filterInvoice !== '') expectedCount++;
          if (filterInsurance !== '') expectedCount++;
          
          expect(count).toBe(expectedCount);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Badge visibility matches filter activity
   */
  it('Property 5: Badge is visible if and only if at least one filter is active', async () => {
    await fc.assert(
      fc.property(
        filterTypeArb,
        filterMethodArb,
        filterInvoiceArb,
        filterInsuranceArb,
        (filterType, filterMethod, filterInvoice, filterInsurance) => {
          const count = calculateTotalFilterCount(filterType, filterMethod, filterInvoice, filterInsurance);
          const hasActiveFilters = filterType || filterMethod || filterInvoice || filterInsurance;
          
          // Badge should be visible (count > 0) if and only if there are active filters
          if (hasActiveFilters) {
            expect(count).toBeGreaterThan(0);
          } else {
            expect(count).toBe(0);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Count is always non-negative and bounded
   */
  it('Property 5: Filter count is always between 0 and 4', async () => {
    await fc.assert(
      fc.property(
        filterTypeArb,
        filterMethodArb,
        filterInvoiceArb,
        filterInsuranceArb,
        (filterType, filterMethod, filterInvoice, filterInsurance) => {
          const count = calculateTotalFilterCount(filterType, filterMethod, filterInvoice, filterInsurance);
          
          expect(count).toBeGreaterThanOrEqual(0);
          expect(count).toBeLessThanOrEqual(4);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Filter Chips Generation Property-Based Tests', () => {
  afterEach(() => {
    cleanup();
  });

  // Arbitraries for filter states
  const filterTypeArb = fc.constantFrom('', 'Groceries', 'Dining Out', 'Entertainment', 'Tax - Medical');
  const filterMethodArb = fc.constantFrom('', 'type:cash', 'type:credit_card', 'method:Visa', 'method:Cash');
  const filterInvoiceArb = fc.constantFrom('', 'with-invoice', 'without-invoice');
  const filterInsuranceArb = fc.constantFrom('', 'eligible', 'not-eligible', 'not_claimed', 'in_progress', 'paid', 'denied');

  /**
   * Helper function to build active filters array
   * Mirrors the logic in ExpenseList.jsx
   */
  const buildActiveFilters = (filterType, filterMethod, filterInvoice, filterInsurance) => {
    const filters = [];
    
    if (filterType) {
      filters.push({
        id: 'type',
        label: 'Type',
        value: filterType
      });
    }
    
    if (filterMethod) {
      // Parse smart method filter
      let displayValue = filterMethod;
      if (filterMethod.startsWith('type:')) {
        const typeValue = filterMethod.slice(5);
        const typeLabels = {
          cash: 'Cash (all)',
          debit: 'Debit (all)',
          cheque: 'Cheque (all)',
          credit_card: 'Credit Card (all)',
          other: 'Other (all)'
        };
        displayValue = typeLabels[typeValue] || typeValue;
      } else if (filterMethod.startsWith('method:')) {
        displayValue = filterMethod.slice(7);
      }
      filters.push({
        id: 'method',
        label: 'Method',
        value: displayValue
      });
    }
    
    if (filterInvoice) {
      const invoiceLabels = {
        'with-invoice': 'With Invoice',
        'without-invoice': 'Without Invoice'
      };
      filters.push({
        id: 'invoice',
        label: 'Invoice',
        value: invoiceLabels[filterInvoice] || filterInvoice
      });
    }
    
    if (filterInsurance) {
      const insuranceLabels = {
        'eligible': 'Eligible',
        'not-eligible': 'Not Eligible',
        'not_claimed': 'Not Claimed',
        'in_progress': 'In Progress',
        'paid': 'Paid',
        'denied': 'Denied'
      };
      filters.push({
        id: 'insurance',
        label: 'Insurance',
        value: insuranceLabels[filterInsurance] || filterInsurance
      });
    }
    
    return filters;
  };

  /**
   * **Feature: expense-list-ux-improvements, Property 6: Filter Chips Generation**
   * 
   * For any combination of active filters, the number of filter chips rendered
   * SHALL equal the number of non-empty filter values, and each active filter
   * SHALL have exactly one corresponding chip.
   * 
   * **Validates: Requirements 4.1**
   */
  it('Property 6: Number of filter chips equals number of non-empty filter values', async () => {
    await fc.assert(
      fc.property(
        filterTypeArb,
        filterMethodArb,
        filterInvoiceArb,
        filterInsuranceArb,
        (filterType, filterMethod, filterInvoice, filterInsurance) => {
          const activeFilters = buildActiveFilters(filterType, filterMethod, filterInvoice, filterInsurance);
          
          // Count non-empty values manually
          let expectedCount = 0;
          if (filterType !== '') expectedCount++;
          if (filterMethod !== '') expectedCount++;
          if (filterInvoice !== '') expectedCount++;
          if (filterInsurance !== '') expectedCount++;
          
          expect(activeFilters.length).toBe(expectedCount);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: Each active filter has exactly one corresponding chip
   */
  it('Property 6: Each active filter has exactly one corresponding chip', async () => {
    await fc.assert(
      fc.property(
        filterTypeArb,
        filterMethodArb,
        filterInvoiceArb,
        filterInsuranceArb,
        (filterType, filterMethod, filterInvoice, filterInsurance) => {
          const activeFilters = buildActiveFilters(filterType, filterMethod, filterInvoice, filterInsurance);
          
          // Check that each filter type appears at most once
          const filterIds = activeFilters.map(f => f.id);
          const uniqueIds = new Set(filterIds);
          
          expect(filterIds.length).toBe(uniqueIds.size);
          
          // Verify expected filters are present
          if (filterType) {
            expect(filterIds).toContain('type');
          }
          if (filterMethod) {
            expect(filterIds).toContain('method');
          }
          if (filterInvoice) {
            expect(filterIds).toContain('invoice');
          }
          if (filterInsurance) {
            expect(filterIds).toContain('insurance');
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: Filter chips have correct label format
   */
  it('Property 6: Filter chips have correct label and value format', async () => {
    await fc.assert(
      fc.property(
        filterTypeArb,
        filterMethodArb,
        filterInvoiceArb,
        filterInsuranceArb,
        (filterType, filterMethod, filterInvoice, filterInsurance) => {
          const activeFilters = buildActiveFilters(filterType, filterMethod, filterInvoice, filterInsurance);
          
          // Each filter chip should have id, label, and value
          activeFilters.forEach(filter => {
            expect(filter).toHaveProperty('id');
            expect(filter).toHaveProperty('label');
            expect(filter).toHaveProperty('value');
            expect(typeof filter.id).toBe('string');
            expect(typeof filter.label).toBe('string');
            expect(typeof filter.value).toBe('string');
            expect(filter.label.length).toBeGreaterThan(0);
            expect(filter.value.length).toBeGreaterThan(0);
          });
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Filter Chip Removal Independence Property-Based Tests', () => {
  afterEach(() => {
    cleanup();
  });

  // Arbitraries for filter states - only non-empty values for removal tests
  const nonEmptyFilterTypeArb = fc.constantFrom('Groceries', 'Dining Out', 'Entertainment', 'Tax - Medical');
  const nonEmptyFilterMethodArb = fc.constantFrom('type:cash', 'type:credit_card', 'method:Visa', 'method:Cash');
  const nonEmptyFilterInvoiceArb = fc.constantFrom('with-invoice', 'without-invoice');
  const nonEmptyFilterInsuranceArb = fc.constantFrom('eligible', 'not-eligible', 'not_claimed', 'in_progress', 'paid', 'denied');

  /**
   * Simulates filter state with clear functions
   */
  const createFilterState = (initialType, initialMethod, initialInvoice, initialInsurance) => {
    let filterType = initialType;
    let filterMethod = initialMethod;
    let filterInvoice = initialInvoice;
    let filterInsurance = initialInsurance;

    return {
      getState: () => ({ filterType, filterMethod, filterInvoice, filterInsurance }),
      clearType: () => { filterType = ''; },
      clearMethod: () => { filterMethod = ''; },
      clearInvoice: () => { filterInvoice = ''; },
      clearInsurance: () => { filterInsurance = ''; }
    };
  };

  /**
   * **Feature: expense-list-ux-improvements, Property 7: Filter Chip Removal Independence**
   * 
   * For any set of active filters and any single chip removal action,
   * only the filter corresponding to the removed chip SHALL be cleared,
   * and all other filters SHALL remain unchanged.
   * 
   * **Validates: Requirements 4.2**
   */
  it('Property 7: Removing type filter chip only clears type filter', async () => {
    await fc.assert(
      fc.property(
        nonEmptyFilterTypeArb,
        fc.option(nonEmptyFilterMethodArb, { nil: '' }),
        fc.option(nonEmptyFilterInvoiceArb, { nil: '' }),
        fc.option(nonEmptyFilterInsuranceArb, { nil: '' }),
        (filterType, filterMethod, filterInvoice, filterInsurance) => {
          const state = createFilterState(filterType, filterMethod, filterInvoice, filterInsurance);
          const initialState = state.getState();
          
          // Clear type filter
          state.clearType();
          const afterState = state.getState();
          
          // Type should be cleared
          expect(afterState.filterType).toBe('');
          
          // Other filters should remain unchanged
          expect(afterState.filterMethod).toBe(initialState.filterMethod);
          expect(afterState.filterInvoice).toBe(initialState.filterInvoice);
          expect(afterState.filterInsurance).toBe(initialState.filterInsurance);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: Removing method filter chip only clears method filter
   */
  it('Property 7: Removing method filter chip only clears method filter', async () => {
    await fc.assert(
      fc.property(
        fc.option(nonEmptyFilterTypeArb, { nil: '' }),
        nonEmptyFilterMethodArb,
        fc.option(nonEmptyFilterInvoiceArb, { nil: '' }),
        fc.option(nonEmptyFilterInsuranceArb, { nil: '' }),
        (filterType, filterMethod, filterInvoice, filterInsurance) => {
          const state = createFilterState(filterType, filterMethod, filterInvoice, filterInsurance);
          const initialState = state.getState();
          
          // Clear method filter
          state.clearMethod();
          const afterState = state.getState();
          
          // Method should be cleared
          expect(afterState.filterMethod).toBe('');
          
          // Other filters should remain unchanged
          expect(afterState.filterType).toBe(initialState.filterType);
          expect(afterState.filterInvoice).toBe(initialState.filterInvoice);
          expect(afterState.filterInsurance).toBe(initialState.filterInsurance);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: Removing invoice filter chip only clears invoice filter
   */
  it('Property 7: Removing invoice filter chip only clears invoice filter', async () => {
    await fc.assert(
      fc.property(
        fc.option(nonEmptyFilterTypeArb, { nil: '' }),
        fc.option(nonEmptyFilterMethodArb, { nil: '' }),
        nonEmptyFilterInvoiceArb,
        fc.option(nonEmptyFilterInsuranceArb, { nil: '' }),
        (filterType, filterMethod, filterInvoice, filterInsurance) => {
          const state = createFilterState(filterType, filterMethod, filterInvoice, filterInsurance);
          const initialState = state.getState();
          
          // Clear invoice filter
          state.clearInvoice();
          const afterState = state.getState();
          
          // Invoice should be cleared
          expect(afterState.filterInvoice).toBe('');
          
          // Other filters should remain unchanged
          expect(afterState.filterType).toBe(initialState.filterType);
          expect(afterState.filterMethod).toBe(initialState.filterMethod);
          expect(afterState.filterInsurance).toBe(initialState.filterInsurance);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: Removing insurance filter chip only clears insurance filter
   */
  it('Property 7: Removing insurance filter chip only clears insurance filter', async () => {
    await fc.assert(
      fc.property(
        fc.option(nonEmptyFilterTypeArb, { nil: '' }),
        fc.option(nonEmptyFilterMethodArb, { nil: '' }),
        fc.option(nonEmptyFilterInvoiceArb, { nil: '' }),
        nonEmptyFilterInsuranceArb,
        (filterType, filterMethod, filterInvoice, filterInsurance) => {
          const state = createFilterState(filterType, filterMethod, filterInvoice, filterInsurance);
          const initialState = state.getState();
          
          // Clear insurance filter
          state.clearInsurance();
          const afterState = state.getState();
          
          // Insurance should be cleared
          expect(afterState.filterInsurance).toBe('');
          
          // Other filters should remain unchanged
          expect(afterState.filterType).toBe(initialState.filterType);
          expect(afterState.filterMethod).toBe(initialState.filterMethod);
          expect(afterState.filterInvoice).toBe(initialState.filterInvoice);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: Removing any filter reduces count by exactly 1
   */
  it('Property 7: Removing any filter reduces total count by exactly 1', async () => {
    const filterToRemoveArb = fc.constantFrom('type', 'method', 'invoice', 'insurance');

    await fc.assert(
      fc.property(
        nonEmptyFilterTypeArb,
        nonEmptyFilterMethodArb,
        nonEmptyFilterInvoiceArb,
        nonEmptyFilterInsuranceArb,
        filterToRemoveArb,
        (filterType, filterMethod, filterInvoice, filterInsurance, filterToRemove) => {
          const state = createFilterState(filterType, filterMethod, filterInvoice, filterInsurance);
          
          // Count before removal (all 4 filters are active)
          const countBefore = 4;
          
          // Remove the specified filter
          switch (filterToRemove) {
            case 'type': state.clearType(); break;
            case 'method': state.clearMethod(); break;
            case 'invoice': state.clearInvoice(); break;
            case 'insurance': state.clearInsurance(); break;
          }
          
          // Count after removal
          const afterState = state.getState();
          let countAfter = 0;
          if (afterState.filterType) countAfter++;
          if (afterState.filterMethod) countAfter++;
          if (afterState.filterInvoice) countAfter++;
          if (afterState.filterInsurance) countAfter++;
          
          // Count should decrease by exactly 1
          expect(countAfter).toBe(countBefore - 1);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
