import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import * as fc from 'fast-check';
import SearchBar from './SearchBar';
import { CATEGORIES, PAYMENT_METHODS } from '../utils/constants';

describe('SearchBar Property-Based Tests', () => {
  /**
   * **Feature: global-expense-filtering, Property 1: Filter independence**
   * 
   * Property 1: Filter independence
   * For any combination of search text, category filter, and payment method filter, 
   * each filter should be independently applicable without requiring the others to be set
   * **Validates: Requirements 1.2, 2.2**
   */
  it('Property 1: should allow each filter to be set independently without requiring others', async () => {
    // Generator for search text (including empty string)
    const searchTextArb = fc.oneof(
      fc.constant(''),
      fc.string({ minLength: 1, maxLength: 50 })
    );

    // Generator for category filter (including empty string for "All Categories")
    const categoryArb = fc.oneof(
      fc.constant(''),
      fc.constantFrom(...CATEGORIES)
    );

    // Generator for payment method filter (including empty string for "All Payment Methods")
    const paymentMethodArb = fc.oneof(
      fc.constant(''),
      fc.constantFrom(...PAYMENT_METHODS)
    );

    await fc.assert(
      fc.asyncProperty(
        searchTextArb,
        categoryArb,
        paymentMethodArb,
        async (searchText, category, paymentMethod) => {
          // Create mock callback functions
          const onSearchChange = vi.fn();
          const onFilterTypeChange = vi.fn();
          const onFilterMethodChange = vi.fn();
          const onClearFilters = vi.fn();

          // Render the SearchBar component
          const { container } = render(
            <SearchBar
              onSearchChange={onSearchChange}
              onFilterTypeChange={onFilterTypeChange}
              onFilterMethodChange={onFilterMethodChange}
              onClearFilters={onClearFilters}
              filterType=""
              filterMethod=""
              categories={CATEGORIES}
              paymentMethods={PAYMENT_METHODS}
            />
          );

          // Get the filter controls
          const searchInput = container.querySelector('.search-input');
          const categorySelect = container.querySelectorAll('.filter-dropdown')[0];
          const paymentMethodSelect = container.querySelectorAll('.filter-dropdown')[1];

          // Test 1: Set search text independently (without setting other filters)
          if (searchText) {
            fireEvent.change(searchInput, { target: { value: searchText } });
            
            // Wait for debounce delay (300ms)
            await new Promise(resolve => setTimeout(resolve, 350));
            
            expect(onSearchChange).toHaveBeenCalledWith(searchText);
            expect(onFilterTypeChange).not.toHaveBeenCalled();
            expect(onFilterMethodChange).not.toHaveBeenCalled();
          }

          // Reset mocks
          vi.clearAllMocks();

          // Test 2: Set category filter independently (without setting other filters)
          if (category) {
            fireEvent.change(categorySelect, { target: { value: category } });
            expect(onFilterTypeChange).toHaveBeenCalledWith(category);
            expect(onSearchChange).not.toHaveBeenCalled();
            expect(onFilterMethodChange).not.toHaveBeenCalled();
          }

          // Reset mocks
          vi.clearAllMocks();

          // Test 3: Set payment method filter independently (without setting other filters)
          if (paymentMethod) {
            fireEvent.change(paymentMethodSelect, { target: { value: paymentMethod } });
            expect(onFilterMethodChange).toHaveBeenCalledWith(paymentMethod);
            expect(onSearchChange).not.toHaveBeenCalled();
            expect(onFilterTypeChange).not.toHaveBeenCalled();
          }

          // Test 4: Verify that filters can be set in any combination
          // This is implicitly tested by the fact that each filter works independently above
          // The component should not require any specific filter to be set before allowing others
        }
      ),
      { numRuns: 100 }
    );
  }, 60000); // 60 second timeout for 100 iterations with debounce

  /**
   * Additional test: Verify clear filters button appears when any filter is active
   * and clears all filters when clicked
   */
  it('Property 1 (extended): should show clear button when any filter is active and clear all filters', async () => {
    // Generator for at least one active filter
    const activeFilterStateArb = fc.record({
      searchText: fc.oneof(
        fc.constant(''),
        fc.string({ minLength: 1, maxLength: 50 })
      ),
      category: fc.oneof(
        fc.constant(''),
        fc.constantFrom(...CATEGORIES)
      ),
      paymentMethod: fc.oneof(
        fc.constant(''),
        fc.constantFrom(...PAYMENT_METHODS)
      )
    }).filter(state => 
      // At least one filter must be active
      state.searchText.trim().length > 0 || state.category || state.paymentMethod
    );

    await fc.assert(
      fc.asyncProperty(
        activeFilterStateArb,
        async (filterState) => {
          const onClearFilters = vi.fn();

          // Render with active filters
          const { container, rerender } = render(
            <SearchBar
              onSearchChange={vi.fn()}
              onFilterTypeChange={vi.fn()}
              onFilterMethodChange={vi.fn()}
              onClearFilters={onClearFilters}
              filterType={filterState.category}
              filterMethod={filterState.paymentMethod}
              categories={CATEGORIES}
              paymentMethods={PAYMENT_METHODS}
            />
          );

          // Set search text if provided
          if (filterState.searchText.trim().length > 0) {
            const searchInput = container.querySelector('.search-input');
            fireEvent.change(searchInput, { target: { value: filterState.searchText } });
            
            // Wait for debounce delay (300ms)
            await new Promise(resolve => setTimeout(resolve, 350));
          }

          // Re-render to update internal state
          rerender(
            <SearchBar
              onSearchChange={vi.fn()}
              onFilterTypeChange={vi.fn()}
              onFilterMethodChange={vi.fn()}
              onClearFilters={onClearFilters}
              filterType={filterState.category}
              filterMethod={filterState.paymentMethod}
              categories={CATEGORIES}
              paymentMethods={PAYMENT_METHODS}
            />
          );

          // The clear filters button should be visible when any filter is active
          const clearButton = container.querySelector('.clear-filters-button');
          
          // Since at least one filter is active (guaranteed by filter above), button should exist
          expect(clearButton).toBeTruthy();

          // Click the clear button
          fireEvent.click(clearButton);

          // Verify that onClearFilters was called
          expect(onClearFilters).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 100 }
    );
  }, 60000); // 60 second timeout for 100 iterations with debounce

  /**
   * Test: Verify clear button does NOT appear when no filters are active
   */
  it('Property 1 (extended): should NOT show clear button when no filters are active', () => {
    const { container } = render(
      <SearchBar
        onSearchChange={vi.fn()}
        onFilterTypeChange={vi.fn()}
        onFilterMethodChange={vi.fn()}
        onClearFilters={vi.fn()}
        filterType=""
        filterMethod=""
        categories={CATEGORIES}
        paymentMethods={PAYMENT_METHODS}
      />
    );

    // The clear filters button should NOT be visible when no filters are active
    const clearButton = container.querySelector('.clear-filters-button');
    expect(clearButton).toBeNull();
  });
});
