import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import * as fc from 'fast-check';
import CategoryList from './CategoryList';

// Generator for category names (alphanumeric with spaces)
const categoryNameArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter(s => /^[a-zA-Z][a-zA-Z0-9 ]*$/.test(s) && s.trim().length > 0);

// Generator for a single category
const categoryArb = fc.record({
  name: categoryNameArb,
  currentValue: fc.float({ min: 0, max: 10000, noNaN: true }),
  previousValue: fc.float({ min: 0, max: 10000, noNaN: true })
});

// Generator for unique category names
const uniqueCategoriesArb = (minLength = 0, maxLength = 20) => 
  fc.array(categoryArb, { minLength, maxLength })
    .filter(cats => {
      const names = cats.map(c => c.name.toLowerCase().trim());
      return new Set(names).size === names.length;
    });

describe('CategoryList Property-Based Tests', () => {
  /**
   * **Feature: summary-panel-redesign, Property 7: Category Filtering**
   * 
   * For any set of expense categories, only categories where either current value 
   * or previous value is greater than zero SHALL be displayed.
   * **Validates: Requirements 4.1, 4.3**
   */
  it('Property 7: only categories with non-zero current or previous values are displayed', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueCategoriesArb(1, 15),
        async (categories) => {
          const { container, unmount } = render(
            <CategoryList categories={categories} initialDisplayCount={100} />
          );

          // Get all displayed category items
          const displayedItems = container.querySelectorAll('.category-item');
          
          // Calculate expected visible categories
          const expectedVisible = categories.filter(
            cat => (cat.currentValue || 0) > 0 || (cat.previousValue || 0) > 0
          );

          // Verify the count matches
          expect(displayedItems.length).toBe(expectedVisible.length);

          // Verify each displayed category has non-zero value
          displayedItems.forEach(item => {
            const nameElement = item.querySelector('.category-name');
            const categoryName = nameElement.textContent;
            
            // Find the original category
            const originalCat = categories.find(
              c => c.name === categoryName
            );
            
            // Verify it has non-zero current or previous value
            expect(
              (originalCat?.currentValue || 0) > 0 || (originalCat?.previousValue || 0) > 0
            ).toBe(true);
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: summary-panel-redesign, Property 8: Category Sorting**
   * 
   * For any set of displayed expense categories, the categories SHALL be sorted 
   * by current expense amount in descending order.
   * **Validates: Requirements 4.4**
   */
  it('Property 8: categories are sorted by current amount in descending order', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueCategoriesArb(2, 15),
        async (categories) => {
          const { container, unmount } = render(
            <CategoryList categories={categories} initialDisplayCount={100} />
          );

          // Get all displayed category items
          const displayedItems = container.querySelectorAll('.category-item');
          
          if (displayedItems.length < 2) {
            unmount();
            return; // Skip if less than 2 items to compare
          }

          // Extract displayed values in order
          const displayedValues = Array.from(displayedItems).map(item => {
            const valueElement = item.querySelector('.category-value');
            const valueText = valueElement.textContent;
            // Extract numeric value (remove $ and commas, ignore trend indicator)
            const match = valueText.match(/\$?([\d,]+\.?\d*)/);
            return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
          });

          // Verify descending order
          for (let i = 0; i < displayedValues.length - 1; i++) {
            expect(displayedValues[i]).toBeGreaterThanOrEqual(displayedValues[i + 1]);
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: summary-panel-redesign, Property 9: Category Truncation**
   * 
   * For any set of categories with more than 5 items, only the top 5 by amount 
   * SHALL be displayed by default, with an expand option to show all.
   * **Validates: Requirements 4.5**
   */
  it('Property 9: categories are truncated to initialDisplayCount with expand option', async () => {
    // Generate categories that will have at least 6 non-zero items
    const nonZeroCategoryArb = fc.record({
      name: categoryNameArb,
      currentValue: fc.float({ min: 1, max: 10000, noNaN: true }),
      previousValue: fc.float({ min: 0, max: 10000, noNaN: true })
    });

    // Generate array with unique names
    const manyCategoriesArb = fc.array(nonZeroCategoryArb, { minLength: 7, maxLength: 15 })
      .filter(cats => {
        const names = cats.map(c => c.name.toLowerCase().trim());
        return new Set(names).size === names.length;
      });

    await fc.assert(
      fc.asyncProperty(
        manyCategoriesArb,
        async (categories) => {
          // Use displayCount that is always less than categories.length
          const displayCount = Math.min(5, categories.length - 1);
          
          const { container, unmount } = render(
            <CategoryList categories={categories} initialDisplayCount={displayCount} />
          );

          // Get displayed items (should be truncated)
          const displayedItems = container.querySelectorAll('.category-item');
          
          // Verify truncation
          expect(displayedItems.length).toBe(displayCount);

          // Verify "Show all" button exists
          const toggleBtn = container.querySelector('.category-toggle-btn');
          expect(toggleBtn).toBeTruthy();
          expect(toggleBtn.textContent).toContain('Show all');
          expect(toggleBtn.textContent).toContain(`(${categories.length})`);

          // Click to expand
          fireEvent.click(toggleBtn);

          // Verify all items are now shown
          const expandedItems = container.querySelectorAll('.category-item');
          expect(expandedItems.length).toBe(categories.length);

          // Verify button text changed
          expect(toggleBtn.textContent).toContain('Show less');

          // Click to collapse
          fireEvent.click(toggleBtn);

          // Verify truncation is restored
          const collapsedItems = container.querySelectorAll('.category-item');
          expect(collapsedItems.length).toBe(displayCount);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Empty state is shown when no categories have values
   */
  it('Property: empty state shown when all categories have zero values', async () => {
    // Generate categories with all zero values
    const zeroCategoryArb = fc.record({
      name: categoryNameArb,
      currentValue: fc.constant(0),
      previousValue: fc.constant(0)
    });

    const zeroCategoriesArb = fc.uniqueArray(zeroCategoryArb, {
      minLength: 0,
      maxLength: 10,
      selector: cat => cat.name.toLowerCase().trim()
    });

    await fc.assert(
      fc.asyncProperty(
        zeroCategoriesArb,
        async (categories) => {
          const { container, unmount } = render(
            <CategoryList categories={categories} />
          );

          // Verify empty state is shown
          const emptyMessage = container.querySelector('.category-list-empty-message');
          expect(emptyMessage).toBeTruthy();
          expect(emptyMessage.textContent).toContain('No expenses recorded');

          // Verify no category items are shown
          const displayedItems = container.querySelectorAll('.category-item');
          expect(displayedItems.length).toBe(0);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
