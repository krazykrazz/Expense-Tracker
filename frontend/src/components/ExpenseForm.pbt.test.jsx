import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';
import ExpenseForm from './ExpenseForm';
import { CATEGORIES } from '../../../backend/utils/categories';

// Mock fetch globally
global.fetch = vi.fn();

// Mock payment methods for testing (simulating API response)
const MOCK_PAYMENT_METHODS = [
  { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
  { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 },
  { id: 3, display_name: 'VISA', type: 'credit_card', is_active: 1 },
  { id: 4, display_name: 'Mastercard', type: 'credit_card', is_active: 1 },
  { id: 5, display_name: 'Cheque', type: 'cheque', is_active: 1 }
];

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
    // Payment methods API (active only)
    if (url.includes('/api/payment-methods/active')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          paymentMethods: MOCK_PAYMENT_METHODS
        })
      });
    }
    // Payment methods API (all)
    if (url.includes('/api/payment-methods')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          paymentMethods: MOCK_PAYMENT_METHODS
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
    // Generator for valid payment method IDs (using IDs from mock)
    const validMethodIdArb = fc.constantFrom(...MOCK_PAYMENT_METHODS.map(m => String(m.id)));

    // The localStorage key used by ExpenseForm (updated to match the new key)
    const LAST_PAYMENT_METHOD_KEY = 'expense-tracker-last-payment-method-id';

    await fc.assert(
      fc.asyncProperty(
        validMethodIdArb,
        async (methodId) => {
          // Clear localStorage before each test
          localStorage.clear();

          // Mock the API responses with expense creation handler
          global.fetch.mockImplementation(createMockFetch({
            '/expenses': () => Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ id: 1, payment_method_id: parseInt(methodId) })
            })
          }));

          // Render the first form instance
          const { container, unmount } = render(<ExpenseForm onExpenseAdded={() => {}} />);

          // Wait for categories and payment methods to be fetched
          await waitFor(() => {
            const typeSelect = container.querySelector('select[name="type"]');
            expect(typeSelect).toBeTruthy();
          });

          // Wait for payment methods to load
          await waitFor(() => {
            const methodSelect = container.querySelector('select[name="payment_method_id"]');
            expect(methodSelect).toBeTruthy();
            // Check that we have more than just the placeholder option
            const options = methodSelect.querySelectorAll('option');
            expect(options.length).toBeGreaterThan(1);
          });

          // Fill in required fields
          const dateInput = container.querySelector('input[name="date"]');
          const amountInput = container.querySelector('input[name="amount"]');
          const methodSelect = container.querySelector('select[name="payment_method_id"]');

          await act(async () => {
            fireEvent.change(dateInput, { target: { value: '2025-01-15' } });
            fireEvent.change(amountInput, { target: { value: '50.00' } });
            fireEvent.change(methodSelect, { target: { value: methodId } });
          });

          // Submit the form
          await act(async () => {
            const form = container.querySelector('form');
            fireEvent.submit(form);
          });

          // Wait for submission to complete
          await waitFor(() => {
            // Check that localStorage was updated with the payment method ID
            const savedMethod = localStorage.getItem(LAST_PAYMENT_METHOD_KEY);
            expect(savedMethod).toBe(methodId);
          });

          // Wait for any pending state updates before unmount
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
          });

          // Unmount the first form
          unmount();

          // Render a new form instance (simulating opening the form again)
          const { container: newContainer, unmount: unmount2 } = render(<ExpenseForm onExpenseAdded={() => {}} />);

          // Wait for the new form to render and payment methods to load
          await waitFor(() => {
            const newMethodSelect = newContainer.querySelector('select[name="payment_method_id"]');
            expect(newMethodSelect).toBeTruthy();
            const options = newMethodSelect.querySelectorAll('option');
            expect(options.length).toBeGreaterThan(1);
          });

          // Verify the payment method is pre-selected from localStorage
          const newMethodSelect = newContainer.querySelector('select[name="payment_method_id"]');
          expect(newMethodSelect.value).toBe(methodId);

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

    // Generator for valid payment method IDs (using IDs from mock)
    const validMethodIdArb = fc.constantFrom(...MOCK_PAYMENT_METHODS.map(m => String(m.id)));

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
        validMethodIdArb,
        validPlaceArb,
        async (date, amount, category, methodId, place) => {
          // Mock the API responses
          global.fetch.mockImplementation(createMockFetch());

          // Render the component
          const { container, unmount } = render(<ExpenseForm onExpenseAdded={() => {}} />);

          // Wait for categories and payment methods to be fetched
          await waitFor(() => {
            const typeSelect = container.querySelector('select[name="type"]');
            expect(typeSelect).toBeTruthy();
          });

          // Wait for payment methods to load
          await waitFor(() => {
            const methodSelect = container.querySelector('select[name="payment_method_id"]');
            expect(methodSelect).toBeTruthy();
            const options = methodSelect.querySelectorAll('option');
            expect(options.length).toBeGreaterThan(1);
          });

          // Fill in all required fields
          const dateInput = container.querySelector('input[name="date"]');
          const amountInput = container.querySelector('input[name="amount"]');
          const typeSelect = container.querySelector('select[name="type"]');
          const methodSelect = container.querySelector('select[name="payment_method_id"]');
          const placeInput = container.querySelector('input[name="place"]');

          // Set values using fireEvent wrapped in act
          await act(async () => {
            fireEvent.change(dateInput, { target: { value: date } });
            fireEvent.change(amountInput, { target: { value: amount } });
            fireEvent.change(typeSelect, { target: { value: category } });
            fireEvent.change(methodSelect, { target: { value: methodId } });
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
