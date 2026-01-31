import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { CATEGORIES } from '../../../backend/utils/categories';

// Mock payment methods that will be returned by the API
const MOCK_PAYMENT_METHODS = [
  { id: 1, display_name: 'Cash', type: 'cash' },
  { id: 2, display_name: 'Visa', type: 'credit_card' },
  { id: 3, display_name: 'Debit', type: 'debit' }
];

// Shared generators
const validTypeArb = fc.constantFrom(...CATEGORIES);
const validPaymentMethodIdArb = fc.constantFrom(...MOCK_PAYMENT_METHODS.map(pm => pm.id));
const validDateArb = fc.tuple(fc.integer({ min: 2020, max: 2030 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
const validAmountArb = fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }).filter(n => n > 0 && isFinite(n)).map(n => parseFloat(n.toFixed(2)));
const validIdArb = fc.integer({ min: 1, max: 10000 });
const validWeekArb = fc.integer({ min: 1, max: 5 });

// Property 8 runs FIRST to avoid test isolation issues
describe('Property 8: Error Handling Preserves Modal State', () => {
  let errorMessage = '';
  let ExpenseList;

  beforeEach(async () => {
    vi.resetModules();
    errorMessage = '';
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/api/categories') || url.includes('/categories')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ categories: CATEGORIES, budgetableCategories: [], taxDeductibleCategories: [] }) });
      }
      if (url.includes('/places')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      if (url.includes('/people')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      if (url.includes('/invoices')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      if (url.includes('/api/payment-methods/active')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_PAYMENT_METHODS) });
      }
      if (url.includes('/api/payment-methods/')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ paymentMethod: MOCK_PAYMENT_METHODS[0] }) });
      }
      if (options?.method === 'PUT' && /\/api\/expenses\/\d+$/.test(url)) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: errorMessage || 'Update failed' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
    // Dynamic import to get fresh module
    const module = await import('./ExpenseList');
    ExpenseList = module.default;
  });

  afterEach(() => { 
    errorMessage = ''; 
    cleanup(); 
    vi.clearAllMocks();
  });

  const errorMessageArb = fc.string({ minLength: 5, maxLength: 50 }).filter(s => /^[a-zA-Z][a-zA-Z0-9\s]*$/.test(s) && s.trim().length >= 5);

  /** **Feature: expense-form-consolidation, Property 8** **Validates: Requirements 5.4** */
  it('validates error handling preserves modal state', async () => {
    await fc.assert(
      fc.asyncProperty(validIdArb, validDateArb, validAmountArb, validTypeArb, validPaymentMethodIdArb, validWeekArb, errorMessageArb,
        async (id, date, amount, type, payment_method_id, week, errMsg) => {
          const expense = { id, date, place: 'Test Place', notes: null, amount, type, payment_method_id, method: MOCK_PAYMENT_METHODS.find(pm => pm.id === payment_method_id)?.display_name || 'Cash', week };
          errorMessage = errMsg;

          const mockOnExpenseUpdated = vi.fn();
          const { container, unmount } = render(
            <ExpenseList expenses={[expense]} onExpenseDeleted={vi.fn()} onExpenseUpdated={mockOnExpenseUpdated} onAddExpense={vi.fn()} people={[]} />
          );

          await waitFor(() => expect(global.fetch).toHaveBeenCalled());
          
          // Use container-based query
          const editButton = container.querySelector('button[title*="Edit"]') || container.querySelector('button.edit-button');
          expect(editButton).toBeTruthy();
          fireEvent.click(editButton);
          
          await waitFor(() => expect(container.querySelector('.modal-overlay')).toBeTruthy());
          
          const editModal = container.querySelector('.edit-modal');
          const originalDate = editModal.querySelector('input[name="date"]').value;
          
          const form = editModal.querySelector('form');
          await act(async () => { fireEvent.submit(form); });
          
          await waitFor(() => expect(editModal.querySelector('.message.error')).toBeTruthy(), { timeout: 10000 });
          
          expect(container.querySelector('.modal-overlay')).toBeTruthy();
          expect(mockOnExpenseUpdated).not.toHaveBeenCalled();
          expect(editModal.querySelector('input[name="date"]').value).toBe(originalDate);
          unmount();
        }
      ), { numRuns: 10 }
    );
  });
});

// Property 7 runs SECOND
describe('Property 7: Successful Update Callback Chain', () => {
  let currentExpenseData = null;
  let ExpenseList;

  beforeEach(async () => {
    vi.resetModules();
    currentExpenseData = null;
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/api/categories') || url.includes('/categories')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ categories: CATEGORIES, budgetableCategories: [], taxDeductibleCategories: [] }) });
      }
      if (url.includes('/places')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      if (url.includes('/people')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      if (url.includes('/invoices')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      if (url.includes('/api/payment-methods/active')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_PAYMENT_METHODS) });
      }
      if (url.includes('/api/payment-methods/')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ paymentMethod: MOCK_PAYMENT_METHODS[0] }) });
      }
      if (options?.method === 'PUT' && /\/api\/expenses\/\d+$/.test(url)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(currentExpenseData || { id: 1, date: '2020-01-01', place: 'Test', amount: 100, type: 'Clothing', payment_method_id: 1, method: 'Cash', week: 1 }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
    // Dynamic import to get fresh module
    const module = await import('./ExpenseList');
    ExpenseList = module.default;
  });

  afterEach(() => { 
    currentExpenseData = null; 
    cleanup(); 
    vi.clearAllMocks();
  });

  /** **Feature: expense-form-consolidation, Property 7** **Validates: Requirements 5.1, 5.2, 5.3, 3.3** */
  it('validates successful update callback chain', async () => {
    await fc.assert(
      fc.asyncProperty(validIdArb, validDateArb, validAmountArb, validTypeArb, validPaymentMethodIdArb, validWeekArb,
        async (id, date, amount, type, payment_method_id, week) => {
          const expense = { id, date, place: 'Test Place', notes: null, amount, type, payment_method_id, method: MOCK_PAYMENT_METHODS.find(pm => pm.id === payment_method_id)?.display_name || 'Cash', week };
          currentExpenseData = expense;

          const mockOnExpenseUpdated = vi.fn();
          const { container, unmount } = render(
            <ExpenseList expenses={[expense]} onExpenseDeleted={vi.fn()} onExpenseUpdated={mockOnExpenseUpdated} onAddExpense={vi.fn()} people={[]} />
          );

          await waitFor(() => expect(global.fetch).toHaveBeenCalled());
          
          const editButton = container.querySelector('button[title*="Edit"]') || container.querySelector('button.edit-button');
          expect(editButton).toBeTruthy();
          fireEvent.click(editButton);
          
          await waitFor(() => expect(container.querySelector('.modal-overlay')).toBeTruthy());
          
          const form = container.querySelector('.edit-modal form');
          await act(async () => { fireEvent.submit(form); });
          
          await waitFor(() => expect(mockOnExpenseUpdated).toHaveBeenCalled(), { timeout: 10000 });
          expect(mockOnExpenseUpdated).toHaveBeenCalledTimes(1);
          expect(mockOnExpenseUpdated.mock.calls[0][0].id).toBe(id);
          await waitFor(() => expect(container.querySelector('.modal-overlay')).toBeFalsy());
          unmount();
        }
      ), { numRuns: 10 }
    );
  });
});
