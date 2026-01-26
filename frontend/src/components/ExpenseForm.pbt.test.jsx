import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';
import ExpenseForm from './ExpenseForm';
import { CATEGORIES } from '../../../backend/utils/categories';
import { PAYMENT_METHODS } from '../utils/constants';

// Mock fetch globally
global.fetch = vi.fn();

// Helper to create a comprehensive mock implementation
const createMockFetch = (additionalHandlers = {}) => {
  return (url) => {
    // Categories API
    if (url.includes('/api/categories') || url.includes('/categories')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          categories: CATEGORIES,
          budgetableCategories: [],
          taxDeductibleCategories: []
        })
      });
    }
    // Places API
    if (url.includes('/places')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    }
    // People API
    if (url.includes('/people')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    }
    // Category suggestion API
    if (url.includes('/suggest-category')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ category: null, confidence: 0 })
      });
    }
    // Check for additional handlers
    for (const [pattern, handler] of Object.entries(additionalHandlers)) {
      if (url.includes(pattern)) {
        return handler(url);
      }
    }
    // Default response for any other URL
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([])
    });
  };
};


describe('ExpenseForm Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Wait for any pending state updates to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    cleanup();
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
          global.fetch.mockImplementation(createMockFetch());

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


  /**
   * **Feature: smart-expense-entry, Property 5: Payment Method Persistence**
   * 
   * Property 5: Payment Method Persistence
   * For any expense submission, the payment method used SHALL be stored 
   * and pre-selected on the next form open.
   * **Validates: Requirements 5.1, 5.3**
   */
  it('Property 5: should persist payment method to localStorage and pre-select on next form open', async () => {
    // Generator for valid payment methods
    const validMethodArb = fc.constantFrom(...PAYMENT_METHODS);

    await fc.assert(
      fc.asyncProperty(
        validMethodArb,
        async (method) => {
          // Clear localStorage before each test
          localStorage.clear();

          // Mock the API responses with expense creation handler
          global.fetch.mockImplementation(createMockFetch({
            '/expenses': () => Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ id: 1, method })
            })
          }));

          // Render the first form instance
          const { container, unmount } = render(<ExpenseForm onExpenseAdded={() => {}} />);

          // Wait for categories to be fetched
          await waitFor(() => {
            const typeSelect = container.querySelector('select[name="type"]');
            expect(typeSelect).toBeTruthy();
          });

          // Fill in required fields
          const dateInput = container.querySelector('input[name="date"]');
          const amountInput = container.querySelector('input[name="amount"]');
          const methodSelect = container.querySelector('select[name="method"]');

          await act(async () => {
            fireEvent.change(dateInput, { target: { value: '2025-01-15' } });
            fireEvent.change(amountInput, { target: { value: '50.00' } });
            fireEvent.change(methodSelect, { target: { value: method } });
          });

          // Submit the form
          await act(async () => {
            const form = container.querySelector('form');
            fireEvent.submit(form);
          });

          // Wait for submission to complete
          await waitFor(() => {
            // Check that localStorage was updated with the payment method
            const savedMethod = localStorage.getItem('expense-tracker-last-payment-method');
            expect(savedMethod).toBe(method);
          });

          // Wait for any pending state updates before unmount
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
          });

          // Unmount the first form
          unmount();

          // Render a new form instance (simulating opening the form again)
          const { container: newContainer, unmount: unmount2 } = render(<ExpenseForm onExpenseAdded={() => {}} />);

          // Wait for the new form to render
          await waitFor(() => {
            const newMethodSelect = newContainer.querySelector('select[name="method"]');
            expect(newMethodSelect).toBeTruthy();
          });

          // Verify the payment method is pre-selected from localStorage
          const newMethodSelect = newContainer.querySelector('select[name="method"]');
          expect(newMethodSelect.value).toBe(method);

          // Wait for any pending state updates before cleanup
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
          });

          // Clean up
          unmount2();
          localStorage.clear();
        }
      ),
      // Reduced numRuns due to async operations (localStorage, form rendering, unmounting)
      // Each iteration involves multiple async waits which can be slow on CI
      { numRuns: 25 }
    );
  }, 60000);


  /**
   * **Feature: smart-expense-entry, Property 4: Form Validation Enables Submit**
   * 
   * Property 4: Form Validation Enables Submit
   * For any form state where all required fields (date, place, type, amount, method) 
   * have valid values, the submit button SHALL be enabled.
   * **Validates: Requirements 3.3**
   */
  it('Property 4: should enable submit button when all required fields have valid values', async () => {
    // Generator for valid date strings (YYYY-MM-DD format)
    // Use integer-based generation to avoid invalid dates
    const validDateArb = fc.tuple(
      fc.integer({ min: 2020, max: 2030 }), // year
      fc.integer({ min: 1, max: 12 }),      // month
      fc.integer({ min: 1, max: 28 })       // day (use 28 to avoid invalid dates)
    ).map(([year, month, day]) => {
      const monthStr = month.toString().padStart(2, '0');
      const dayStr = day.toString().padStart(2, '0');
      return `${year}-${monthStr}-${dayStr}`;
    });

    // Generator for valid amounts (positive numbers)
    // Use Math.fround to ensure 32-bit float compatibility
    const validAmountArb = fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
      .filter(n => n > 0 && isFinite(n))
      .map(n => n.toFixed(2));

    // Generator for valid categories
    const validCategoryArb = fc.constantFrom(...CATEGORIES);

    // Generator for valid payment methods
    const validMethodArb = fc.constantFrom(...PAYMENT_METHODS);

    // Generator for optional place (can be empty or have value)
    const validPlaceArb = fc.oneof(
      fc.constant(''),
      fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.length <= 200)
    );

    await fc.assert(
      fc.asyncProperty(
        validDateArb,
        validAmountArb,
        validCategoryArb,
        validMethodArb,
        validPlaceArb,
        async (date, amount, category, method, place) => {
          // Mock the API responses
          global.fetch.mockImplementation(createMockFetch());

          // Render the component
          const { container, unmount } = render(<ExpenseForm onExpenseAdded={() => {}} />);

          // Wait for categories to be fetched
          await waitFor(() => {
            const typeSelect = container.querySelector('select[name="type"]');
            expect(typeSelect).toBeTruthy();
          });

          // Fill in all required fields
          const dateInput = container.querySelector('input[name="date"]');
          const amountInput = container.querySelector('input[name="amount"]');
          const typeSelect = container.querySelector('select[name="type"]');
          const methodSelect = container.querySelector('select[name="method"]');
          const placeInput = container.querySelector('input[name="place"]');

          // Set values using fireEvent wrapped in act
          await act(async () => {
            fireEvent.change(dateInput, { target: { value: date } });
            fireEvent.change(amountInput, { target: { value: amount } });
            fireEvent.change(typeSelect, { target: { value: category } });
            fireEvent.change(methodSelect, { target: { value: method } });
            if (place) {
              fireEvent.change(placeInput, { target: { value: place } });
            }
          });

          // Get the submit button
          const submitButton = container.querySelector('button[type="submit"]');
          
          // The submit button should be enabled (not disabled) when all required fields are valid
          // Note: The button is only disabled during submission (isSubmitting state)
          expect(submitButton.disabled).toBe(false);

          // Wait for any pending state updates before cleanup
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
          });

          // Clean up
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
