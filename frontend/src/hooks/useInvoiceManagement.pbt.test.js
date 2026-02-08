/**
 * Property-Based Tests for useInvoiceManagement
 *
 * Tests three correctness properties:
 * - Property 3: Invoice cache deduplication
 * - Property 4: Invoice cache consistency after person link update
 * - Property 5: Invoice modal state round-trip
 *
 * Feature: frontend-custom-hooks
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';
import useInvoiceManagement from './useInvoiceManagement';

// Mock the invoiceApi module
vi.mock('../services/invoiceApi', () => ({
  getInvoicesForExpense: vi.fn(),
  updateInvoicePersonLink: vi.fn(),
}));

import { getInvoicesForExpense, updateInvoicePersonLink } from '../services/invoiceApi';

// --- Smart Generators ---

const invoiceArb = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  expenseId: fc.integer({ min: 1, max: 100000 }),
  personId: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: null }),
  personName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  filename: fc.string({ minLength: 5, maxLength: 50 }),
});

const expenseArb = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  amount: fc.float({ min: Math.fround(0.01), max: Math.fround(99999), noNaN: true }),
  type: fc.constantFrom('Tax - Medical', 'Tax - Donation'),
  place: fc.string({ minLength: 1, maxLength: 50 }),
});

const invoiceListArb = fc.array(invoiceArb, { minLength: 0, maxLength: 5 });

// --- Property Tests ---

describe('useInvoiceManagement Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Feature: frontend-custom-hooks, Property 3: Invoice cache deduplication
   * **Validates: Requirements 3.2**
   *
   * For any expense ID, after the first call to fetchInvoices(expenseId) resolves,
   * a second call to fetchInvoices(expenseId) SHALL return the cached result
   * without triggering an additional API call.
   */
  describe('Property 3: Invoice cache deduplication', () => {
    test('second fetchInvoices call returns cached result without additional API call', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100000 }),
          invoiceListArb,
          async (expenseId, invoices) => {
            vi.clearAllMocks();
            getInvoicesForExpense.mockResolvedValue(invoices);

            const { result, unmount } = renderHook(() => useInvoiceManagement());

            // First fetch
            let firstResult;
            await act(async () => {
              firstResult = await result.current.fetchInvoices(expenseId);
            });

            expect(getInvoicesForExpense).toHaveBeenCalledTimes(1);
            expect(firstResult).toEqual(invoices);

            // Second fetch — should use cache
            let secondResult;
            await act(async () => {
              secondResult = await result.current.fetchInvoices(expenseId);
            });

            // Still only 1 API call
            expect(getInvoicesForExpense).toHaveBeenCalledTimes(1);
            expect(secondResult).toEqual(invoices);

            unmount();
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });
  });

  /**
   * Feature: frontend-custom-hooks, Property 4: Invoice cache consistency after person link update
   * **Validates: Requirements 3.3**
   *
   * For any cached invoice with a given expense ID and invoice ID, after calling
   * handlePersonLinkUpdated(expenseId, invoiceId, newPersonId), the cached invoice
   * entry for that invoice ID SHALL have its personId updated to newPersonId.
   */
  describe('Property 4: Invoice cache consistency after person link update', () => {
    test('handlePersonLinkUpdated updates cached invoice personId correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100000 }),
          invoiceArb,
          fc.option(fc.integer({ min: 1, max: 1000 }), { nil: null }),
          fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
          async (expenseId, invoice, newPersonId, newPersonName) => {
            vi.clearAllMocks();

            // Set up the invoice with the given expenseId
            const testInvoice = { ...invoice, expenseId };
            getInvoicesForExpense.mockResolvedValue([testInvoice]);
            updateInvoicePersonLink.mockResolvedValue({
              success: true,
              invoice: { ...testInvoice, personId: newPersonId, personName: newPersonName },
            });

            const { result, unmount } = renderHook(() => useInvoiceManagement());

            // Populate cache
            await act(async () => {
              await result.current.fetchInvoices(expenseId);
            });

            // Update person link
            await act(async () => {
              await result.current.handlePersonLinkUpdated(expenseId, testInvoice.id, newPersonId);
            });

            // Verify cache is updated
            const cached = result.current.invoiceCache.get(expenseId);
            const updatedInvoice = cached.find(inv => inv.id === testInvoice.id);
            expect(updatedInvoice.personId).toBe(newPersonId);

            unmount();
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });
  });

  /**
   * Feature: frontend-custom-hooks, Property 5: Invoice modal state round-trip
   * **Validates: Requirements 3.4**
   *
   * For any expense object and invoices array, calling openInvoiceModal(expense, invoices)
   * sets showInvoiceModal to true, invoiceModalExpense to the expense, and
   * invoiceModalInvoices to the invoices. Then calling closeInvoiceModal() sets
   * showInvoiceModal to false and clears the other values.
   */
  describe('Property 5: Invoice modal state round-trip', () => {
    test('openInvoiceModal then closeInvoiceModal round-trips correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          expenseArb,
          invoiceListArb,
          async (expense, invoices) => {
            vi.clearAllMocks();

            const { result, unmount } = renderHook(() => useInvoiceManagement());

            // Initially closed
            expect(result.current.showInvoiceModal).toBe(false);
            expect(result.current.invoiceModalExpense).toBeNull();
            expect(result.current.invoiceModalInvoices).toEqual([]);

            // Open with expense and invoices
            await act(async () => {
              await result.current.openInvoiceModal(expense, invoices);
            });

            expect(result.current.showInvoiceModal).toBe(true);
            expect(result.current.invoiceModalExpense).toEqual(expense);
            expect(result.current.invoiceModalInvoices).toEqual(invoices);

            // Close
            act(() => {
              result.current.closeInvoiceModal();
            });

            expect(result.current.showInvoiceModal).toBe(false);
            expect(result.current.invoiceModalExpense).toBeNull();
            expect(result.current.invoiceModalInvoices).toEqual([]);

            unmount();
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });
  });
});
