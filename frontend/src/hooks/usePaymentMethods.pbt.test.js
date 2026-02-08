/**
 * Property-Based Tests for usePaymentMethods
 *
 * Tests the localStorage round-trip property: saving a valid payment method ID
 * and then reading it back must return the same ID.
 *
 * Feature: frontend-custom-hooks
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';
import usePaymentMethods from './usePaymentMethods';

// Mock the paymentMethodApi module
vi.mock('../services/paymentMethodApi', () => ({
  getActivePaymentMethods: vi.fn(),
  getPaymentMethod: vi.fn(),
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

import { getActivePaymentMethods } from '../services/paymentMethodApi';

const LAST_PAYMENT_METHOD_KEY = 'expense-tracker-last-payment-method-id';

// --- Smart Generators ---

/**
 * Generates a random list of active payment methods with unique positive integer IDs.
 * The list always has at least 1 method to ensure there's a valid ID to pick from.
 */
const paymentMethodList = fc.uniqueArray(
  fc.integer({ min: 1, max: 10000 }),
  { minLength: 1, maxLength: 20 }
).map(ids =>
  ids.map(id => ({
    id,
    display_name: `Method_${id}`,
    type: fc.sample(fc.constantFrom('cash', 'debit', 'credit_card', 'cheque'), 1)[0],
    is_active: 1,
  }))
);

/**
 * Generates a tuple of (paymentMethods[], validIdFromThatList).
 * This ensures the chosen ID is always present in the methods array.
 */
const methodsAndValidId = paymentMethodList.chain(methods => {
  const ids = methods.map(m => m.id);
  return fc.constantFrom(...ids).map(id => ({ methods, id }));
});

// --- Property Tests ---

describe('usePaymentMethods Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  /**
   * Feature: frontend-custom-hooks, Property 1: Payment method localStorage round-trip
   * **Validates: Requirements 1.4**
   *
   * For any valid payment method ID from the active methods list,
   * calling saveLastUsed(id) and then getLastUsedId(methods) SHALL return the same ID.
   */
  describe('Property 1: Payment method localStorage round-trip', () => {
    test('saveLastUsed(id) then getLastUsedId(methods) returns the same ID for any valid ID', async () => {
      await fc.assert(
        fc.asyncProperty(
          methodsAndValidId,
          async ({ methods, id }) => {
            // Clear localStorage before each iteration
            localStorage.clear();

            // Mock the API to return the generated methods
            getActivePaymentMethods.mockResolvedValue(methods);

            // Render the hook
            const { result, unmount } = renderHook(() => usePaymentMethods());

            // Wait for loading to complete
            await waitFor(() => {
              expect(result.current.loading).toBe(false);
            });

            // Save the payment method ID
            act(() => {
              result.current.saveLastUsed(id);
            });

            // Read it back, passing the same methods list
            const retrieved = result.current.getLastUsedId(methods);

            // Round-trip property: the retrieved ID must equal the saved ID
            expect(retrieved).toBe(id);

            // Cleanup
            unmount();
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('round-trip holds regardless of which method in the list is chosen', async () => {
      await fc.assert(
        fc.asyncProperty(
          paymentMethodList,
          fc.nat({ max: 100 }),
          async (methods, indexSeed) => {
            localStorage.clear();

            // Pick a method from the list using the index seed
            const chosenMethod = methods[indexSeed % methods.length];
            const id = chosenMethod.id;

            getActivePaymentMethods.mockResolvedValue(methods);

            const { result, unmount } = renderHook(() => usePaymentMethods());

            await waitFor(() => {
              expect(result.current.loading).toBe(false);
            });

            // Save and read back
            act(() => {
              result.current.saveLastUsed(id);
            });

            const retrieved = result.current.getLastUsedId(methods);
            expect(retrieved).toBe(id);

            // Also verify the raw localStorage value is the string representation
            expect(localStorage.getItem(LAST_PAYMENT_METHOD_KEY)).toBe(id.toString());

            unmount();
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('consecutive saves overwrite correctly - last save wins', async () => {
      await fc.assert(
        fc.asyncProperty(
          paymentMethodList.filter(m => m.length >= 2),
          async (methods) => {
            localStorage.clear();

            getActivePaymentMethods.mockResolvedValue(methods);

            const { result, unmount } = renderHook(() => usePaymentMethods());

            await waitFor(() => {
              expect(result.current.loading).toBe(false);
            });

            // Save the first method's ID
            act(() => {
              result.current.saveLastUsed(methods[0].id);
            });

            // Save the last method's ID (overwrite)
            const lastId = methods[methods.length - 1].id;
            act(() => {
              result.current.saveLastUsed(lastId);
            });

            // The retrieved value should be the last saved ID
            const retrieved = result.current.getLastUsedId(methods);
            expect(retrieved).toBe(lastId);

            unmount();
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });
  });
});
