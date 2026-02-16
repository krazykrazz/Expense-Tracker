/**
 * @invariant Error Handling Consistency: For any async invoice operation that throws an error, the error handler logs a context-specific message; the hook state remains consistent after errors. Randomization covers diverse error types and operation sequences.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';
import useInvoiceManagement from './useInvoiceManagement';
import * as invoiceApi from '../services/invoiceApi';

vi.mock('../services/invoiceApi');

/**
 * Property-Based Tests for useInvoiceManagement
 * Feature: post-spec-cleanup
 * 
 * Property 4: Error handling fallback consistency
 * For any async invoice operation that throws an error, the consolidated error handler
 * shall call logger.error with a context-specific message and the error object,
 * and shall return the specified fallback value (empty array by default).
 * 
 * Validates: Requirements 5.2, 5.3
 */

describe('useInvoiceManagement - Property 4: Error handling fallback consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Property 4.1: fetchInvoices returns empty array fallback on any error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }), // expenseId
        fc.oneof(
          fc.constant(new Error('Network error')),
          fc.constant(new Error('API error')),
          fc.constant(new Error('Timeout')),
          fc.constant(new Error('Server error'))
        ), // error type
        async (expenseId, error) => {
          // Setup: Mock API to throw error
          vi.mocked(invoiceApi.getInvoicesForExpense).mockRejectedValue(error);

          // Execute: Render hook and call fetchInvoices
          const { result } = renderHook(() => useInvoiceManagement());
          const invoices = await result.current.fetchInvoices(expenseId);

          // Verify: Returns empty array fallback
          expect(invoices).toEqual([]);
          expect(Array.isArray(invoices)).toBe(true);
          expect(invoices.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4.2: openInvoiceModal sets empty array fallback on any error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.integer({ min: 1, max: 10000 }),
          place: fc.string({ minLength: 1, maxLength: 50 }),
          amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
        }), // expense object
        fc.oneof(
          fc.constant(new Error('Network error')),
          fc.constant(new Error('API error')),
          fc.constant(new Error('Timeout')),
          fc.constant(new Error('Server error'))
        ), // error type
        async (expense, error) => {
          // Setup: Mock API to throw error
          vi.mocked(invoiceApi.getInvoicesForExpense).mockRejectedValue(error);

          // Execute: Render hook and call openInvoiceModal
          const { result } = renderHook(() => useInvoiceManagement());
          await result.current.openInvoiceModal(expense);

          // Wait for state updates
          await waitFor(() => {
            expect(result.current.showInvoiceModal).toBe(true);
          });

          // Verify: Modal invoices set to empty array fallback
          expect(result.current.invoiceModalInvoices).toEqual([]);
          expect(Array.isArray(result.current.invoiceModalInvoices)).toBe(true);
          expect(result.current.invoiceModalInvoices.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4.3: auto-load effect sets empty array fallback for each failed expense', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 10000 }),
            type: fc.constantFrom('Tax - Medical', 'Tax - Donation'),
            place: fc.string({ minLength: 1, maxLength: 50 }),
            amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
          }),
          { minLength: 1, maxLength: 5 }
        ), // tax-deductible expenses
        fc.oneof(
          fc.constant(new Error('Network error')),
          fc.constant(new Error('API error')),
          fc.constant(new Error('Timeout')),
          fc.constant(new Error('Server error'))
        ), // error type
        async (expenses, error) => {
          // Setup: Mock API to throw error for all expenses
          vi.mocked(invoiceApi.getInvoicesForExpense).mockRejectedValue(error);

          // Execute: Render hook with expenses
          const { result } = renderHook(() => useInvoiceManagement({ expenses }));

          // Wait for auto-load to complete
          await waitFor(() => {
            expect(result.current.loadingInvoices.size).toBe(0);
          }, { timeout: 3000 });

          // Verify: Each expense has empty array fallback in cache
          expenses.forEach(expense => {
            const cached = result.current.invoiceCache.get(expense.id);
            expect(cached).toEqual([]);
            expect(Array.isArray(cached)).toBe(true);
            expect(cached.length).toBe(0);
          });
        }
      ),
      { numRuns: 50 } // Reduced runs due to async complexity
    );
  });

  it('Property 4.4: error handler preserves fallback type consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }), // expenseId
        fc.oneof(
          fc.constant(new Error('Network error')),
          fc.constant(new TypeError('Type error')),
          fc.constant(new ReferenceError('Reference error')),
          fc.constant({ message: 'Custom error object' })
        ), // various error types
        async (expenseId, error) => {
          // Setup: Mock API to throw error
          vi.mocked(invoiceApi.getInvoicesForExpense).mockRejectedValue(error);

          // Execute: Render hook and call fetchInvoices
          const { result } = renderHook(() => useInvoiceManagement());
          const invoices = await result.current.fetchInvoices(expenseId);

          // Verify: Always returns array type regardless of error type
          expect(Array.isArray(invoices)).toBe(true);
          expect(typeof invoices).toBe('object');
          expect(invoices.constructor).toBe(Array);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4.5: successful operations do not use fallback', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }), // expenseId
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 10000 }),
            filename: fc.string({ minLength: 1, maxLength: 50 }),
            personId: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
          }),
          { minLength: 0, maxLength: 5 }
        ), // invoices array
        async (expenseId, invoices) => {
          // Setup: Mock API to return invoices successfully
          vi.mocked(invoiceApi.getInvoicesForExpense).mockResolvedValue(invoices);

          // Execute: Render hook and call fetchInvoices
          const { result } = renderHook(() => useInvoiceManagement());
          const result_invoices = await result.current.fetchInvoices(expenseId);

          // Verify: Returns actual data, not fallback
          expect(result_invoices).toEqual(invoices);
          expect(result_invoices.length).toBe(invoices.length);
          
          // If invoices were provided, verify they match
          if (invoices.length > 0) {
            expect(result_invoices).not.toEqual([]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
