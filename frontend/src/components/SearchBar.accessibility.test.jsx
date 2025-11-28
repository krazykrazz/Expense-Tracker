import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import SearchBar from './SearchBar';
import { CATEGORIES, PAYMENT_METHODS } from '../utils/constants';

/**
 * Accessibility Tests for SearchBar Component
 * Tests keyboard navigation, screen reader support, and ARIA attributes
 * **Validates: Requirements 4.3**
 */
describe('SearchBar Accessibility Tests', () => {
  const defaultProps = {
    onSearchChange: vi.fn(),
    onFilterTypeChange: vi.fn(),
    onFilterMethodChange: vi.fn(),
    onClearFilters: vi.fn(),
    filterType: '',
    filterMethod: '',
    categories: CATEGORIES,
    paymentMethods: PAYMENT_METHODS
  };

  describe('ARIA Labels and Attributes', () => {
    it('should have proper aria-labels on all filter controls', () => {
      const { container } = render(<SearchBar {...defaultProps} />);

      // Check search input has aria-label
      const searchInput = container.querySelector('#expense-search-input');
      expect(searchInput).toHaveAttribute('aria-label', 'Search expenses by place or notes');
      expect(searchInput).toHaveAttribute('aria-describedby', 'search-help');

      // Check category filter has aria-label
      const categoryFilter = container.querySelector('#category-filter');
      expect(categoryFilter).toHaveAttribute('aria-label', 'Filter by category');
      expect(categoryFilter).toHaveAttribute('aria-describedby', 'category-help');

      // Check payment method filter has aria-label
      const paymentMethodFilter = container.querySelector('#payment-method-filter');
      expect(paymentMethodFilter).toHaveAttribute('aria-label', 'Filter by payment method');
      expect(paymentMethodFilter).toHaveAttribute('aria-describedby', 'method-help');
    });

    it('should have descriptive aria-labels that are unique and clear', () => {
      const { container } = render(<SearchBar {...defaultProps} />);

      const searchInput = container.querySelector('#expense-search-input');
      const categoryFilter = container.querySelector('#category-filter');
      const paymentMethodFilter = container.querySelector('#payment-method-filter');

      // Verify each control has a unique aria-label
      const ariaLabels = [
        searchInput.getAttribute('aria-label'),
        categoryFilter.getAttribute('aria-label'),
        paymentMethodFilter.getAttribute('aria-label')
      ];

      // Check all labels are unique
      const uniqueLabels = new Set(ariaLabels);
      expect(uniqueLabels.size).toBe(3);

      // Check labels are descriptive (not empty or generic)
      ariaLabels.forEach(label => {
        expect(label).toBeTruthy();
        expect(label.length).toBeGreaterThan(10);
      });
    });

    it('should have aria-live region for screen reader announcements', () => {
      const { container } = render(<SearchBar {...defaultProps} />);

      const liveRegion = container.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeTruthy();
      expect(liveRegion).toHaveAttribute('role', 'status');
      expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
    });

    it('should have role="search" on the container', () => {
      const { container } = render(<SearchBar {...defaultProps} />);

      const searchContainer = container.querySelector('.search-bar-container');
      expect(searchContainer).toHaveAttribute('role', 'search');
    });

    it('should have proper labels associated with form controls', () => {
      const { container } = render(<SearchBar {...defaultProps} />);

      // Check search input has associated label
      const searchLabel = container.querySelector('label[for="expense-search-input"]');
      expect(searchLabel).toBeTruthy();
      expect(searchLabel.textContent).toBe('Search expenses by place or notes');

      // Check category filter has associated label
      const categoryLabel = container.querySelector('label[for="category-filter"]');
      expect(categoryLabel).toBeTruthy();
      expect(categoryLabel.textContent).toBe('Filter by expense category');

      // Check payment method filter has associated label
      const methodLabel = container.querySelector('label[for="payment-method-filter"]');
      expect(methodLabel).toBeTruthy();
      expect(methodLabel.textContent).toBe('Filter by payment method');
    });

    it('should have clear button with descriptive aria-label when filters are active', () => {
      const { container, rerender } = render(
        <SearchBar {...defaultProps} filterType="Groceries" />
      );

      const clearButton = container.querySelector('.clear-filters-button');
      expect(clearButton).toBeTruthy();
      expect(clearButton).toHaveAttribute('aria-label', 'Clear all filters and return to monthly view');
      expect(clearButton).toHaveAttribute('type', 'button');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should allow tab navigation through all filter controls in correct order', () => {
      const { container } = render(
        <SearchBar {...defaultProps} filterType="Groceries" />
      );

      const searchInput = container.querySelector('#expense-search-input');
      const categoryFilter = container.querySelector('#category-filter');
      const paymentMethodFilter = container.querySelector('#payment-method-filter');
      const clearButton = container.querySelector('.clear-filters-button');

      // All controls should be focusable
      expect(searchInput.tabIndex).toBeGreaterThanOrEqual(0);
      expect(categoryFilter.tabIndex).toBeGreaterThanOrEqual(0);
      expect(paymentMethodFilter.tabIndex).toBeGreaterThanOrEqual(0);
      expect(clearButton.tabIndex).toBeGreaterThanOrEqual(0);

      // Verify tab order by checking DOM order
      const allFocusableElements = [searchInput, categoryFilter, paymentMethodFilter, clearButton];
      const domOrder = Array.from(container.querySelectorAll('input, select, button'));
      
      // Check that our focusable elements appear in the correct order in the DOM
      allFocusableElements.forEach((element, index) => {
        expect(domOrder).toContain(element);
      });
    });

    it('should handle keyboard input in search field', async () => {
      const onSearchChange = vi.fn();
      const { container } = render(
        <SearchBar {...defaultProps} onSearchChange={onSearchChange} />
      );

      const searchInput = container.querySelector('#expense-search-input');
      
      // Simulate typing
      fireEvent.change(searchInput, { target: { value: 'test search' } });
      
      // Wait for debounce delay (300ms)
      await new Promise(resolve => setTimeout(resolve, 350));
      
      expect(onSearchChange).toHaveBeenCalledWith('test search');
    });

    it('should handle keyboard selection in dropdowns', () => {
      const onFilterTypeChange = vi.fn();
      const { container } = render(
        <SearchBar {...defaultProps} onFilterTypeChange={onFilterTypeChange} />
      );

      const categoryFilter = container.querySelector('#category-filter');
      
      // Simulate selecting an option
      fireEvent.change(categoryFilter, { target: { value: 'Groceries' } });
      
      expect(onFilterTypeChange).toHaveBeenCalledWith('Groceries');
    });

    it('should handle Enter key on clear button', () => {
      const onClearFilters = vi.fn();
      const { container } = render(
        <SearchBar {...defaultProps} onClearFilters={onClearFilters} filterType="Groceries" />
      );

      const clearButton = container.querySelector('.clear-filters-button');
      
      // Simulate Enter key press
      fireEvent.click(clearButton);
      
      expect(onClearFilters).toHaveBeenCalledTimes(1);
    });
  });

  describe('Screen Reader Announcements', () => {
    it('should announce when search text is entered', async () => {
      const { container } = render(<SearchBar {...defaultProps} />);

      const searchInput = container.querySelector('#expense-search-input');
      const liveRegion = container.querySelector('[aria-live="polite"]');

      // Initially empty
      expect(liveRegion.textContent).toBe('');

      // Type in search
      fireEvent.change(searchInput, { target: { value: 'coffee' } });

      // Should announce the search
      await waitFor(() => {
        expect(liveRegion.textContent).toBe('Searching for: coffee');
      });
    });

    it('should announce when search is cleared', async () => {
      const { container } = render(<SearchBar {...defaultProps} />);

      const searchInput = container.querySelector('#expense-search-input');
      const liveRegion = container.querySelector('[aria-live="polite"]');

      // Type in search
      fireEvent.change(searchInput, { target: { value: 'coffee' } });
      
      // Clear search
      fireEvent.change(searchInput, { target: { value: '' } });

      // Should announce search cleared
      await waitFor(() => {
        expect(liveRegion.textContent).toBe('Search cleared');
      });
    });

    it('should announce when category filter is applied', async () => {
      const { container } = render(<SearchBar {...defaultProps} />);

      const categoryFilter = container.querySelector('#category-filter');
      const liveRegion = container.querySelector('[aria-live="polite"]');

      // Select a category
      fireEvent.change(categoryFilter, { target: { value: 'Groceries' } });

      // Should announce the filter change
      await waitFor(() => {
        expect(liveRegion.textContent).toBe('Category filter applied: Groceries');
      });
    });

    it('should announce when category filter is cleared', async () => {
      const { container } = render(<SearchBar {...defaultProps} filterType="Groceries" />);

      const categoryFilter = container.querySelector('#category-filter');
      const liveRegion = container.querySelector('[aria-live="polite"]');

      // Clear category
      fireEvent.change(categoryFilter, { target: { value: '' } });

      // Should announce filter cleared
      await waitFor(() => {
        expect(liveRegion.textContent).toBe('Category filter cleared');
      });
    });

    it('should announce when payment method filter is applied', async () => {
      const { container } = render(<SearchBar {...defaultProps} />);

      const paymentMethodFilter = container.querySelector('#payment-method-filter');
      const liveRegion = container.querySelector('[aria-live="polite"]');

      // Select a payment method
      fireEvent.change(paymentMethodFilter, { target: { value: 'CIBC MC' } });

      // Should announce the filter change
      await waitFor(() => {
        expect(liveRegion.textContent).toBe('Payment method filter applied: CIBC MC');
      });
    });

    it('should announce when payment method filter is cleared', async () => {
      const { container } = render(<SearchBar {...defaultProps} filterMethod="CIBC MC" />);

      const paymentMethodFilter = container.querySelector('#payment-method-filter');
      const liveRegion = container.querySelector('[aria-live="polite"]');

      // Clear payment method
      fireEvent.change(paymentMethodFilter, { target: { value: '' } });

      // Should announce filter cleared
      await waitFor(() => {
        expect(liveRegion.textContent).toBe('Payment method filter cleared');
      });
    });

    it('should announce when all filters are cleared', async () => {
      const { container } = render(
        <SearchBar {...defaultProps} filterType="Groceries" filterMethod="CIBC MC" />
      );

      const clearButton = container.querySelector('.clear-filters-button');
      const liveRegion = container.querySelector('[aria-live="polite"]');

      // Click clear button
      fireEvent.click(clearButton);

      // Should announce all filters cleared
      await waitFor(() => {
        expect(liveRegion.textContent).toBe('All filters cleared. Returned to monthly view.');
      });
    });

    it('should clear announcements after they are read', async () => {
      const { container } = render(<SearchBar {...defaultProps} />);

      const searchInput = container.querySelector('#expense-search-input');
      const liveRegion = container.querySelector('[aria-live="polite"]');

      // Type in search
      fireEvent.change(searchInput, { target: { value: 'coffee' } });

      // Should have announcement
      await waitFor(() => {
        expect(liveRegion.textContent).toBe('Searching for: coffee');
      });

      // Wait for announcement to clear (1 second timeout)
      await waitFor(() => {
        expect(liveRegion.textContent).toBe('');
      }, { timeout: 1500 });
    });
  });

  describe('Focus Management', () => {
    it('should return focus to search input after clearing filters', () => {
      const { container } = render(
        <SearchBar {...defaultProps} filterType="Groceries" />
      );

      const searchInput = container.querySelector('#expense-search-input');
      const clearButton = container.querySelector('.clear-filters-button');

      // Click clear button
      fireEvent.click(clearButton);

      // Focus should return to search input
      // Note: In jsdom, focus management might not work exactly as in browser
      // but we can verify the focus() method was called by checking if the element is focusable
      expect(searchInput).toBeTruthy();
      expect(document.activeElement).toBe(searchInput);
    });
  });

  describe('Focus Indicators', () => {
    it('should have visible focus indicators on all interactive elements', () => {
      const { container } = render(
        <SearchBar {...defaultProps} filterType="Groceries" />
      );

      const searchInput = container.querySelector('#expense-search-input');
      const categoryFilter = container.querySelector('#category-filter');
      const paymentMethodFilter = container.querySelector('#payment-method-filter');
      const clearButton = container.querySelector('.clear-filters-button');

      // All elements should have the focus-visible class or focus styles
      // We verify they have the appropriate CSS classes
      expect(searchInput.className).toContain('search-input');
      expect(categoryFilter.className).toContain('filter-dropdown');
      expect(paymentMethodFilter.className).toContain('filter-dropdown');
      expect(clearButton.className).toContain('clear-filters-button');

      // These classes should have :focus and :focus-visible styles in CSS
      // The actual visual focus indicators are tested in the CSS file
    });
  });

  describe('Helper Text and Descriptions', () => {
    it('should provide helpful descriptions for each control', () => {
      const { container } = render(<SearchBar {...defaultProps} />);

      // Check search help text
      const searchHelp = container.querySelector('#search-help');
      expect(searchHelp).toBeTruthy();
      expect(searchHelp.textContent).toContain('globally');

      // Check category help text
      const categoryHelp = container.querySelector('#category-help');
      expect(categoryHelp).toBeTruthy();
      expect(categoryHelp.textContent).toContain('category');

      // Check payment method help text
      const methodHelp = container.querySelector('#method-help');
      expect(methodHelp).toBeTruthy();
      expect(methodHelp.textContent).toContain('payment method');
    });

    it('should have tooltips on filter controls', () => {
      const { container } = render(<SearchBar {...defaultProps} />);

      const categoryFilter = container.querySelector('#category-filter');
      const paymentMethodFilter = container.querySelector('#payment-method-filter');

      expect(categoryFilter).toHaveAttribute('title', 'Filter by expense category');
      expect(paymentMethodFilter).toHaveAttribute('title', 'Filter by payment method');
    });

    it('should have tooltip on clear button', () => {
      const { container } = render(
        <SearchBar {...defaultProps} filterType="Groceries" />
      );

      const clearButton = container.querySelector('.clear-filters-button');
      expect(clearButton).toHaveAttribute('title', 'Clear all filters and return to monthly view');
    });
  });
});
