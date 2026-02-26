/**
 * Property-Based Tests for Posted Date Field Visibility
 * Feature: credit-card-posted-date
 * 
 * Tests Property 1: Posted Date Field Visibility
 * For any payment method selection in the ExpenseForm, the posted_date field 
 * SHALL be visible if and only if the selected payment method has type 'credit_card'.
 * 
 * Validates: Requirements 1.1, 6.1, 6.4, 6.5
  *
 * @invariant Posted Date Visibility: For any payment method selection, the posted_date field is visible if and only if the selected payment method has type credit_card. Randomization covers diverse payment method configurations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';
import ExpenseForm from './ExpenseForm';

vi.mock('../contexts/ModalContext', () => ({
  ModalProvider: ({ children }) => children,
  useModalContext: () => ({ openFinancialOverview: vi.fn() }),
}));

import { CATEGORIES } from '../../../backend/utils/categories';

// Mock fetch globally
global.fetch = vi.fn();

// Sample payment methods for testing - aligned with expenseFormHelpers.js
const MOCK_PAYMENT_METHODS = [
  { id: 1, display_name: 'Cash', type: 'cash', is_active: true },
  { id: 2, display_name: 'Credit Card', type: 'credit_card', is_active: true },
  { id: 3, display_name: 'Debit Card', type: 'debit', is_active: true }
];

// Mock the paymentMethodApi module used by usePaymentMethods hook
vi.mock('../services/paymentMethodApi', () => ({
  getActivePaymentMethods: vi.fn(() => Promise.resolve([
    { id: 1, display_name: 'Cash', type: 'cash', is_active: true },
    { id: 2, display_name: 'Credit Card', type: 'credit_card', is_active: true },
    { id: 3, display_name: 'Debit Card', type: 'debit', is_active: true }
  ])),
  getPaymentMethod: vi.fn(() => Promise.resolve(null)),
  getPaymentMethods: vi.fn(() => Promise.resolve([
    { id: 1, display_name: 'Cash', type: 'cash', is_active: true },
    { id: 2, display_name: 'Credit Card', type: 'credit_card', is_active: true },
    { id: 3, display_name: 'Debit Card', type: 'debit', is_active: true }
  ])),
}));

// Mock the logger to suppress output in tests
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Helper to create a comprehensive mock implementation
const createMockFetch = (paymentMethods = MOCK_PAYMENT_METHODS) => {
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
    // Active payment methods API
    if (url.includes('/payment-methods/active')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ paymentMethods })
      });
    }
    // Payment methods API (general)
    if (url.includes('/payment-methods')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ paymentMethods })
      });
    }
    // Default response for any other URL
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([])
    });
  };
};


describe('ExpenseForm Posted Date Field Visibility Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(async () => {
    // Wait for any pending state updates to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  /**
   * **Feature: credit-card-posted-date, Property 1: Posted Date Field Visibility**
   * 
   * Property 1: Posted Date Field Visibility
   * For any payment method selection in the ExpenseForm, the posted_date field 
   * SHALL be visible if and only if the selected payment method has type 'credit_card'.
   * 
   * **Validates: Requirements 1.1, 6.1, 6.4, 6.5**
   */
  it('Property 1: posted_date field should be visible if and only if payment method is credit_card', async () => {
    // Generator for payment method selection
    const paymentMethodArb = fc.constantFrom(...MOCK_PAYMENT_METHODS);

    await fc.assert(
      fc.asyncProperty(
        paymentMethodArb,
        async (selectedMethod) => {
          // Mock the API responses
          global.fetch.mockImplementation(createMockFetch());

          // Render the component
          const { container, unmount } = render(<ExpenseForm onExpenseAdded={() => {}} />);

          // Wait for payment methods to be loaded
          await waitFor(() => {
            const paymentMethodSelect = container.querySelector('select[name="payment_method_id"]');
            expect(paymentMethodSelect).toBeTruthy();
            // Check that we have options loaded
            expect(paymentMethodSelect.options.length).toBeGreaterThan(1);
          }, { timeout: 3000 });

          // Select the payment method
          const paymentMethodSelect = container.querySelector('select[name="payment_method_id"]');
          
          await act(async () => {
            fireEvent.change(paymentMethodSelect, { target: { value: selectedMethod.id.toString() } });
          });

          // Wait for the payment method change to be processed and state to propagate
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 300));
          });

          // Check posted_date visibility based on payment method type
          if (selectedMethod.type === 'credit_card') {
            // For credit cards, expand Advanced Options and verify posted_date appears
            // Use waitFor with retry since the section may need re-expanding after re-render
            await waitFor(() => {
              const advancedOptionsHeader = Array.from(container.querySelectorAll('.collapsible-header'))
                .find(h => h.textContent.includes('Advanced Options'));
              expect(advancedOptionsHeader).toBeTruthy();
              if (advancedOptionsHeader.getAttribute('aria-expanded') === 'false') {
                fireEvent.click(advancedOptionsHeader);
              }
              const postedDateInput = container.querySelector('input[name="posted_date"]');
              expect(postedDateInput).toBeTruthy();
            }, { timeout: 5000, interval: 200 });
          } else {
            // For non-credit cards, ensure the field is NOT present
            // Give it a moment to ensure it doesn't appear
            await act(async () => {
              await new Promise(resolve => setTimeout(resolve, 200));
            });
            const postedDateInput = container.querySelector('input[name="posted_date"]');
            expect(postedDateInput).toBeFalsy();
          }

          // Clean up
          unmount();
        }
      ),
      { numRuns: 50 }
    );
  }, 60000);

  /**
   * **Feature: credit-card-posted-date, Property 1b: Posted Date Field Hides on Switch Away**
   * 
   * When switching payment method away from credit card, the posted_date field 
   * SHALL be hidden.
   * 
   * **Validates: Requirements 6.4**
   */
  it('Property 1b: posted_date field should hide when switching away from credit_card', async () => {
    // Generator for credit card payment methods
    const creditCardArb = fc.constantFrom(
      ...MOCK_PAYMENT_METHODS.filter(pm => pm.type === 'credit_card')
    );
    
    // Generator for non-credit card payment methods
    const nonCreditCardArb = fc.constantFrom(
      ...MOCK_PAYMENT_METHODS.filter(pm => pm.type !== 'credit_card')
    );

    await fc.assert(
      fc.asyncProperty(
        creditCardArb,
        nonCreditCardArb,
        async (creditCard, nonCreditCard) => {
          // Mock the API responses
          global.fetch.mockImplementation(createMockFetch());

          // Render the component
          const { container, unmount } = render(<ExpenseForm onExpenseAdded={() => {}} />);

          // Wait for payment methods to be loaded
          await waitFor(() => {
            const paymentMethodSelect = container.querySelector('select[name="payment_method_id"]');
            expect(paymentMethodSelect).toBeTruthy();
            expect(paymentMethodSelect.options.length).toBeGreaterThan(1);
          }, { timeout: 3000 });

          const paymentMethodSelect = container.querySelector('select[name="payment_method_id"]');

          // First, select a credit card and wait for state to settle
          await act(async () => {
            fireEvent.change(paymentMethodSelect, { target: { value: creditCard.id.toString() } });
            await new Promise(resolve => setTimeout(resolve, 500));
          });

          // Expand Advanced Options and wait for posted_date to appear
          // Use waitFor with retry logic since the section may need re-expanding after re-render
          await waitFor(async () => {
            const advancedOptionsHeader = Array.from(container.querySelectorAll('.collapsible-header'))
              .find(h => h.textContent.includes('Advanced Options'));
            expect(advancedOptionsHeader).toBeTruthy();
            if (advancedOptionsHeader.getAttribute('aria-expanded') === 'false') {
              fireEvent.click(advancedOptionsHeader);
            }
            const postedDateInput = container.querySelector('input[name="posted_date"]');
            expect(postedDateInput).toBeTruthy();
          }, { timeout: 5000, interval: 200 });

          // Now switch to a non-credit card payment method
          await act(async () => {
            fireEvent.change(paymentMethodSelect, { target: { value: nonCreditCard.id.toString() } });
            await new Promise(resolve => setTimeout(resolve, 300));
          });

          // Wait for posted_date field to disappear
          await waitFor(() => {
            const postedDateInput = container.querySelector('input[name="posted_date"]');
            expect(postedDateInput).toBeFalsy();
          }, { timeout: 5000 });

          // Clean up
          unmount();
        }
      ),
      { numRuns: 30 }
    );
  }, 60000);

  /**
   * **Feature: credit-card-posted-date, Property 1c: Posted Date Field Shows on Switch To**
   * 
   * When switching payment method to credit card, the posted_date field 
   * SHALL be shown.
   * 
   * **Validates: Requirements 6.5**
   */
  it('Property 1c: posted_date field should show when switching to credit_card', async () => {
    // Generator for non-credit card payment methods
    const nonCreditCardArb = fc.constantFrom(
      ...MOCK_PAYMENT_METHODS.filter(pm => pm.type !== 'credit_card')
    );
    
    // Generator for credit card payment methods
    const creditCardArb = fc.constantFrom(
      ...MOCK_PAYMENT_METHODS.filter(pm => pm.type === 'credit_card')
    );

    await fc.assert(
      fc.asyncProperty(
        nonCreditCardArb,
        creditCardArb,
        async (nonCreditCard, creditCard) => {
          // Mock the API responses
          global.fetch.mockImplementation(createMockFetch());

          // Render the component
          const { container, unmount } = render(<ExpenseForm onExpenseAdded={() => {}} />);

          // Wait for payment methods to be loaded
          await waitFor(() => {
            const paymentMethodSelect = container.querySelector('select[name="payment_method_id"]');
            expect(paymentMethodSelect).toBeTruthy();
            expect(paymentMethodSelect.options.length).toBeGreaterThan(1);
          }, { timeout: 3000 });

          const paymentMethodSelect = container.querySelector('select[name="payment_method_id"]');

          // First, select a non-credit card
          await act(async () => {
            fireEvent.change(paymentMethodSelect, { target: { value: nonCreditCard.id.toString() } });
            await new Promise(resolve => setTimeout(resolve, 300));
          });

          // Expand the Advanced Options section
          const advancedOptionsHeader = Array.from(container.querySelectorAll('.collapsible-header'))
            .find(h => h.textContent.includes('Advanced Options'));
          
          if (advancedOptionsHeader && advancedOptionsHeader.getAttribute('aria-expanded') === 'false') {
            await act(async () => {
              fireEvent.click(advancedOptionsHeader);
              await new Promise(resolve => setTimeout(resolve, 100));
            });
          }

          // Give it a moment to ensure field doesn't appear
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 200));
          });

          // Verify posted_date field is hidden
          let postedDateInput = container.querySelector('input[name="posted_date"]');
          expect(postedDateInput).toBeFalsy();

          // Now switch to a credit card payment method
          await act(async () => {
            fireEvent.change(paymentMethodSelect, { target: { value: creditCard.id.toString() } });
            await new Promise(resolve => setTimeout(resolve, 300));
          });

          // Wait for posted_date field to appear
          await waitFor(() => {
            const postedDateInput = container.querySelector('input[name="posted_date"]');
            expect(postedDateInput).toBeTruthy();
          }, { timeout: 2000 });

          // Clean up
          unmount();
        }
      ),
      { numRuns: 30 }
    );
  }, 60000);
});
