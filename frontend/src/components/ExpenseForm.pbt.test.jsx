import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';
import ExpenseForm from './ExpenseForm';
import { CATEGORIES } from '../../../backend/utils/categories';

// Mock fetch globally
global.fetch = vi.fn();

describe('ExpenseForm Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * **Feature: expanded-expense-categories, Property 1: Category dropdown completeness**
   * 
   * Property 1: Category dropdown completeness
   * For any valid category from the approved list, the expense form dropdown 
   * should include that category as an option
   * **Validates: Requirements 1.1**
   */
  it('Property 1: should include all valid categories in the dropdown', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random subset of categories to verify
        fc.subarray(CATEGORIES, { minLength: 1, maxLength: CATEGORIES.length }),
        async (categoriesToCheck) => {
          // Mock the API responses
          global.fetch.mockImplementation((url) => {
            if (url === '/api/categories') {
              return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                  categories: CATEGORIES,
                  budgetableCategories: [],
                  taxDeductibleCategories: []
                })
              });
            }
            if (url.includes('/places')) {
              return Promise.resolve({
                ok: true,
                json: () => Promise.resolve([])
              });
            }
            return Promise.reject(new Error('Unknown URL'));
          });

          // Render the component
          const { container } = render(<ExpenseForm onExpenseAdded={() => {}} />);

          // Wait for categories to be fetched and rendered
          await waitFor(() => {
            const typeSelect = container.querySelector('select[name="type"]');
            expect(typeSelect).toBeTruthy();
            // Check that we have more than just the default "Other" option
            expect(typeSelect.options.length).toBeGreaterThan(1);
          });

          // Get the type dropdown
          const typeSelect = container.querySelector('select[name="type"]');
          const optionValues = Array.from(typeSelect.options).map(opt => opt.value);

          // Verify that each category in our random subset is present in the dropdown
          for (const category of categoriesToCheck) {
            expect(optionValues).toContain(category);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
