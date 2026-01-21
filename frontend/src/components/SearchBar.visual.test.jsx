import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SearchBar from './SearchBar';

/**
 * Visual Regression Tests for SearchBar Component
 * 
 * These tests validate the visual appearance and styling of the SearchBar component,
 * including filter controls, active filter indicators, and responsive design.
 * 
 * Requirements: 4.2, 4.4
 */

describe('SearchBar Visual Regression Tests', () => {
  const mockCategories = ['Groceries', 'Dining Out', 'Gas'];
  const mockPaymentMethods = ['Credit Card', 'Debit Card', 'Cash'];
  const mockCallbacks = {
    onSearchChange: vi.fn(),
    onFilterTypeChange: vi.fn(),
    onFilterMethodChange: vi.fn(),
    onClearFilters: vi.fn()
  };

  describe('Filter Controls Appearance', () => {
    it('should render all filter controls with correct structure', () => {
      const { container } = render(
        <SearchBar
          {...mockCallbacks}
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      // Verify search input exists
      const searchInput = screen.getByLabelText(/search expenses/i);
      expect(searchInput).toBeTruthy();
      expect(searchInput.className).toContain('search-input');

      // Verify category dropdown exists
      const categoryDropdown = screen.getByLabelText(/filter by category/i);
      expect(categoryDropdown).toBeTruthy();
      expect(categoryDropdown.className).toContain('filter-dropdown');

      // Verify payment method dropdown exists
      const methodDropdown = screen.getByLabelText(/filter by payment method/i);
      expect(methodDropdown).toBeTruthy();
      expect(methodDropdown.className).toContain('filter-dropdown');

      // Verify wrapper structure
      const wrapper = container.querySelector('.search-filters-wrapper');
      expect(wrapper).toBeTruthy();
    });

    it('should apply correct CSS classes to filter dropdowns', () => {
      render(
        <SearchBar
          {...mockCallbacks}
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      const categoryDropdown = screen.getByLabelText(/filter by category/i);
      const methodDropdown = screen.getByLabelText(/filter by payment method/i);

      // Both should have base filter-dropdown class
      expect(categoryDropdown.className).toContain('filter-dropdown');
      expect(methodDropdown.className).toContain('filter-dropdown');

      // Neither should have active-filter class initially
      expect(categoryDropdown.className).not.toContain('active-filter');
      expect(methodDropdown.className).not.toContain('active-filter');
    });

    it('should render dropdown options correctly', () => {
      render(
        <SearchBar
          {...mockCallbacks}
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      // Check category options
      const categoryDropdown = screen.getByLabelText(/filter by category/i);
      expect(categoryDropdown.children.length).toBe(mockCategories.length + 1); // +1 for "All Categories"
      expect(categoryDropdown.children[0].textContent).toBe('All Categories');

      // Check payment method options
      const methodDropdown = screen.getByLabelText(/filter by payment method/i);
      expect(methodDropdown.children.length).toBe(mockPaymentMethods.length + 1); // +1 for "All Payment Methods"
      expect(methodDropdown.children[0].textContent).toBe('All Payment Methods');
    });
  });

  describe('Active Filter Indicators', () => {
    it('should apply active-filter class when category filter is active', () => {
      render(
        <SearchBar
          {...mockCallbacks}
          filterType="Groceries"
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      const categoryDropdown = screen.getByLabelText(/filter by category/i);
      expect(categoryDropdown.className).toContain('active-filter');
      expect(categoryDropdown.value).toBe('Groceries');
    });

    it('should apply active-filter class when payment method filter is active', () => {
      render(
        <SearchBar
          {...mockCallbacks}
          filterMethod="Credit Card"
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      const methodDropdown = screen.getByLabelText(/filter by payment method/i);
      expect(methodDropdown.className).toContain('active-filter');
      expect(methodDropdown.value).toBe('Credit Card');
    });

    it('should apply active-filter class to both dropdowns when both filters are active', () => {
      render(
        <SearchBar
          {...mockCallbacks}
          filterType="Groceries"
          filterMethod="Credit Card"
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      const categoryDropdown = screen.getByLabelText(/filter by category/i);
      const methodDropdown = screen.getByLabelText(/filter by payment method/i);

      expect(categoryDropdown.className).toContain('active-filter');
      expect(methodDropdown.className).toContain('active-filter');
    });

    it('should show clear filters button when any filter is active', () => {
      const { rerender } = render(
        <SearchBar
          {...mockCallbacks}
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      // Initially no clear button
      expect(screen.queryByRole('button', { name: /clear all filters/i })).toBeNull();

      // With category filter
      rerender(
        <SearchBar
          {...mockCallbacks}
          filterType="Groceries"
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );
      expect(screen.getByRole('button', { name: /clear all filters/i })).toBeTruthy();

      // With payment method filter
      rerender(
        <SearchBar
          {...mockCallbacks}
          filterMethod="Credit Card"
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );
      expect(screen.getByRole('button', { name: /clear all filters/i })).toBeTruthy();
    });
  });

  describe('Clear Filters Button Styling', () => {
    it('should render clear button with correct CSS class', () => {
      render(
        <SearchBar
          {...mockCallbacks}
          filterType="Groceries"
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      const clearButton = screen.getByRole('button', { name: /clear all filters/i });
      expect(clearButton.className).toContain('clear-filters-button');
    });

    it('should not render clear button when no filters are active', () => {
      render(
        <SearchBar
          {...mockCallbacks}
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      expect(screen.queryByRole('button', { name: /clear all filters/i })).toBeNull();
    });
  });

  describe('Loading State Display', () => {
    it('should apply loading class when loading prop is true', () => {
      const { container } = render(
        <SearchBar
          {...mockCallbacks}
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
          loading={true}
        />
      );

      const searchBarContainer = container.querySelector('.search-bar-container');
      expect(searchBarContainer.className).toContain('loading');
    });

    it('should not apply loading class when loading prop is false', () => {
      const { container } = render(
        <SearchBar
          {...mockCallbacks}
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
          loading={false}
        />
      );

      const searchBarContainer = container.querySelector('.search-bar-container');
      expect(searchBarContainer.className).not.toContain('loading');
    });

    it('should not apply loading class when loading prop is not provided', () => {
      const { container } = render(
        <SearchBar
          {...mockCallbacks}
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      const searchBarContainer = container.querySelector('.search-bar-container');
      expect(searchBarContainer.className).not.toContain('loading');
    });
  });

  describe('Responsive Design Elements', () => {
    it('should render with responsive wrapper classes', () => {
      const { container } = render(
        <SearchBar
          {...mockCallbacks}
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      // Check for responsive wrapper classes
      const wrapper = container.querySelector('.search-filters-wrapper');
      expect(wrapper).toBeTruthy();

      const inputWrapper = container.querySelector('.search-input-wrapper');
      expect(inputWrapper).toBeTruthy();

      const dropdownWrappers = container.querySelectorAll('.filter-dropdown-wrapper');
      expect(dropdownWrappers.length).toBe(3); // category, payment method, and year filters
    });

    it('should maintain structure with all filters active', () => {
      const { container } = render(
        <SearchBar
          {...mockCallbacks}
          filterType="Groceries"
          filterMethod="Credit Card"
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      // Verify all elements are present
      expect(container.querySelector('.search-input-wrapper')).toBeTruthy();
      expect(container.querySelectorAll('.filter-dropdown-wrapper').length).toBe(3); // category, payment method, and year filters
      expect(screen.getByRole('button', { name: /clear all filters/i })).toBeTruthy();
    });
  });

  describe('Accessibility and ARIA Attributes', () => {
    it('should have proper ARIA labels on all controls', () => {
      render(
        <SearchBar
          {...mockCallbacks}
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      // Check search input
      const searchInput = screen.getByLabelText(/search expenses by place or notes/i);
      expect(searchInput).toBeTruthy();

      // Check category dropdown
      const categoryDropdown = screen.getByLabelText(/filter by category/i);
      expect(categoryDropdown).toBeTruthy();

      // Check payment method dropdown
      const methodDropdown = screen.getByLabelText(/filter by payment method/i);
      expect(methodDropdown).toBeTruthy();
    });

    it('should have tooltips on filter controls', () => {
      render(
        <SearchBar
          {...mockCallbacks}
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      const categoryDropdown = screen.getByLabelText(/filter by category/i);
      expect(categoryDropdown.title).toBe('Filter by expense category');

      const methodDropdown = screen.getByLabelText(/filter by payment method/i);
      expect(methodDropdown.title).toBe('Filter by payment method');
    });

    it('should have clear button with proper ARIA label', () => {
      render(
        <SearchBar
          {...mockCallbacks}
          filterType="Groceries"
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      const clearButton = screen.getByRole('button', { name: /clear all filters and return to monthly view/i });
      expect(clearButton).toBeTruthy();
      expect(clearButton.title).toBe('Clear all filters and return to monthly view');
    });
  });

  describe('Visual Consistency', () => {
    it('should maintain consistent styling across different filter states', () => {
      const { rerender } = render(
        <SearchBar
          {...mockCallbacks}
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      const categoryDropdown = screen.getByLabelText(/filter by category/i);
      const methodDropdown = screen.getByLabelText(/filter by payment method/i);

      // Initial state - both should have same base class
      expect(categoryDropdown.className).toBe(methodDropdown.className);

      // With one filter active
      rerender(
        <SearchBar
          {...mockCallbacks}
          filterType="Groceries"
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      // Category should have active class, method should not
      expect(categoryDropdown.className).toContain('active-filter');
      expect(methodDropdown.className).not.toContain('active-filter');

      // With both filters active
      rerender(
        <SearchBar
          {...mockCallbacks}
          filterType="Groceries"
          filterMethod="Credit Card"
          categories={mockCategories}
          paymentMethods={mockPaymentMethods}
        />
      );

      // Both should have active class
      expect(categoryDropdown.className).toContain('active-filter');
      expect(methodDropdown.className).toContain('active-filter');
    });
  });
});
