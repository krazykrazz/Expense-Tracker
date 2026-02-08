/**
 * ExpenseList Edit Modal Callback Property Tests — Parameterized
 *
 * Converted from PBT to parameterized tests. Properties 7 and 8 were rendering
 * full ExpenseList, opening modal, and submitting form 10× each with random data.
 * The input space (expense fields) is small and fully enumerable with representative cases.
 *
 * Original properties preserved:
 *   P7 (expense-form-consolidation): Successful update callback chain — Validates: Req 5.1-5.3, 3.3
 *   P8 (expense-form-consolidation): Error handling preserves modal state — Validates: Req 5.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import { CATEGORIES } from '../../../backend/utils/categories';
import { testEach } from '../test-utils';

const MOCK_PAYMENT_METHODS = [
  { id: 1, display_name: 'Cash', type: 'cash' },
  { id: 2, display_name: 'Visa', type: 'credit_card' },
  { id: 3, display_name: 'Debit', type: 'debit' }
];

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
    const module = await import('./ExpenseList');
    ExpenseList = module.default;
  });

  afterEach(() => {
    errorMessage = '';
    cleanup();
    vi.clearAllMocks();
  });

  /** **Feature: expense-form-consolidation, Property 8** **Validates: Requirements 5.4** */
  const errorCases = [
    { id: 1, date: '2024-01-15', amount: 50.00, type: 'Groceries', payment_method_id: 1, week: 3, errMsg: 'Server error occurred', desc: 'groceries, cash, server error' },
    { id: 42, date: '2023-06-20', amount: 200.00, type: 'Tax - Medical', payment_method_id: 2, week: 1, errMsg: 'Database connection lost', desc: 'medical, credit card, db error' },
    { id: 500, date: '2025-12-28', amount: 9999.99, type: 'Entertainment', payment_method_id: 3, week: 5, errMsg: 'Validation failed', desc: 'entertainment, debit, validation error' },
  ];

  testEach(errorCases).it('preserves modal state on error for $desc', async ({ id, date, amount, type, payment_method_id, week, errMsg }) => {
    const expense = { id, date, place: 'Test Place', notes: null, amount, type, payment_method_id, method: MOCK_PAYMENT_METHODS.find(pm => pm.id === payment_method_id)?.display_name || 'Cash', week };
    errorMessage = errMsg;

    const mockOnExpenseUpdated = vi.fn();
    const { container, unmount } = render(
      <ExpenseList expenses={[expense]} onExpenseDeleted={vi.fn()} onExpenseUpdated={mockOnExpenseUpdated} onAddExpense={vi.fn()} people={[]} />
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

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
    const module = await import('./ExpenseList');
    ExpenseList = module.default;
  });

  afterEach(() => {
    currentExpenseData = null;
    cleanup();
    vi.clearAllMocks();
  });

  /** **Feature: expense-form-consolidation, Property 7** **Validates: Requirements 5.1, 5.2, 5.3, 3.3** */
  const successCases = [
    { id: 1, date: '2024-01-15', amount: 50.00, type: 'Groceries', payment_method_id: 1, week: 3, desc: 'groceries, cash' },
    { id: 42, date: '2023-06-20', amount: 200.00, type: 'Tax - Medical', payment_method_id: 2, week: 1, desc: 'medical, credit card' },
    { id: 500, date: '2025-12-28', amount: 9999.99, type: 'Entertainment', payment_method_id: 3, week: 5, desc: 'entertainment, debit, large amount' },
    { id: 7, date: '2020-02-29', amount: 0.01, type: 'Other', payment_method_id: 1, week: 4, desc: 'other, cash, min amount, leap day' },
  ];

  testEach(successCases).it('calls onExpenseUpdated and closes modal for $desc', async ({ id, date, amount, type, payment_method_id, week }) => {
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
  });
});
