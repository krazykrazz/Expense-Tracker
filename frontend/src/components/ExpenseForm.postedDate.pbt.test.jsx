/**
 * Tests for Posted Date Field Visibility
 * Feature: credit-card-posted-date
 * 
 * Tests Property 1: Posted Date Field Visibility
 * For any payment method selection in the ExpenseForm, the posted_date field 
 * SHALL be visible if and only if the selected payment method has type 'credit_card'.
 * 
 * Rewritten from PBT to parameterized tests — the input space is small and fully
 * enumerable (7 payment methods, 4 types), so PBT adds complexity without value.
 * Each test renders the component once, eliminating the flakiness caused by
 * rapid mount/unmount cycles under concurrent load.
 * 
 * Validates: Requirements 1.1, 6.1, 6.4, 6.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import ExpenseForm from './ExpenseForm';
import { testEach } from '../test-utils';

// Mock fetch globally
global.fetch = vi.fn();

// All payment methods — covers every type in the system
const MOCK_PAYMENT_METHODS = [
  { id: 1, display_name: 'Cash', type: 'cash', is_active: true },
  { id: 2, display_name: 'Debit Card', type: 'debit', is_active: true },
  { id: 3, display_name: 'Personal Cheque', type: 'cheque', is_active: true },
  { id: 4, display_name: 'Visa Credit Card', type: 'credit_card', is_active: true },
  { id: 5, display_name: 'Mastercard', type: 'credit_card', is_active: true },
  { id: 6, display_name: 'Amex', type: 'credit_card', is_active: true },
  { id: 7, display_name: 'Savings Debit', type: 'debit', is_active: true }
];

vi.mock('../services/paymentMethodApi', () => ({
  getActivePaymentMethods: vi.fn(() => Promise.resolve([
    { id: 1, display_name: 'Cash', type: 'cash', is_active: true },
    { id: 2, display_name: 'Debit Card', type: 'debit', is_active: true },
    { id: 3, display_name: 'Personal Cheque', type: 'cheque', is_active: true },
    { id: 4, display_name: 'Visa Credit Card', type: 'credit_card', is_active: true },
    { id: 5, display_name: 'Mastercard', type: 'credit_card', is_active: true },
    { id: 6, display_name: 'Amex', type: 'credit_card', is_active: true },
    { id: 7, display_name: 'Savings Debit', type: 'debit', is_active: true }
  ])),
  getPaymentMethod: vi.fn(() => Promise.resolve(null)),
  getPaymentMethods: vi.fn(() => Promise.resolve([
    { id: 1, display_name: 'Cash', type: 'cash', is_active: true },
    { id: 2, display_name: 'Debit Card', type: 'debit', is_active: true },
    { id: 3, display_name: 'Personal Cheque', type: 'cheque', is_active: true },
    { id: 4, display_name: 'Visa Credit Card', type: 'credit_card', is_active: true },
    { id: 5, display_name: 'Mastercard', type: 'credit_card', is_active: true },
    { id: 6, display_name: 'Amex', type: 'credit_card', is_active: true },
    { id: 7, display_name: 'Savings Debit', type: 'debit', is_active: true }
  ])),
}));

vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

// Shared fetch mock
const createMockFetch = () => (url) => {
  if (url.includes('/api/categories') || url.includes('/categories')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ categories: ['Other', 'Groceries'], budgetableCategories: [], taxDeductibleCategories: [] })
    });
  }
  if (url.includes('/places')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  if (url.includes('/people')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  if (url.includes('/suggest-category')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ category: null }) });
  if (url.includes('/payment-methods')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ paymentMethods: MOCK_PAYMENT_METHODS }) });
  return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
};

/** Helper: render ExpenseForm, wait for payment methods, select a method, expand Advanced Options */
async function renderAndSelect(methodId) {
  sessionStorage.clear();
  global.fetch.mockImplementation(createMockFetch());

  const result = render(<ExpenseForm onExpenseAdded={() => {}} />);
  const { container } = result;

  // Wait for payment method options to load
  await waitFor(() => {
    const sel = container.querySelector('select[name="payment_method_id"]');
    expect(sel).toBeTruthy();
    expect(sel.options.length).toBeGreaterThan(1);
  }, { timeout: 3000 });

  // Select the payment method
  const sel = container.querySelector('select[name="payment_method_id"]');
  await act(async () => {
    fireEvent.change(sel, { target: { value: String(methodId) } });
  });

  // Expand Advanced Options
  await act(async () => {
    const hdr = Array.from(container.querySelectorAll('.collapsible-header'))
      .find(h => h.textContent.includes('Advanced Options'));
    if (hdr && hdr.getAttribute('aria-expanded') === 'false') {
      fireEvent.click(hdr);
    }
  });

  // Let state settle
  await act(async () => { await new Promise(r => setTimeout(r, 50)); });

  return result;
}

describe('ExpenseForm Posted Date Field Visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(async () => {
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  /**
   * Property 1: Posted Date Field Visibility (parameterized over all payment methods)
   * posted_date field visible iff payment method type === 'credit_card'
   * 
   * Validates: Requirements 1.1, 6.1, 6.4, 6.5
   */
  testEach(
    MOCK_PAYMENT_METHODS.map(pm => ({
      method: pm,
      shouldShow: pm.type === 'credit_card',
      description: `${pm.display_name} (${pm.type})`
    }))
  ).it('Property 1: posted_date field $shouldShow for $description', async ({ method, shouldShow }) => {
    const { container, unmount } = await renderAndSelect(method.id);

    const postedDateInput = container.querySelector('input[name="posted_date"]');
    if (shouldShow) {
      expect(postedDateInput).toBeTruthy();
    } else {
      expect(postedDateInput).toBeFalsy();
    }

    unmount();
  });

  /**
   * Property 1b: Posted Date Field Hides on Switch Away
   * Switching from credit_card to non-credit_card hides the field.
   * 
   * Validates: Requirements 6.4
   */
  it('Property 1b: posted_date field hides when switching away from credit_card', async () => {
    const { container, unmount } = await renderAndSelect(4); // Visa Credit Card

    // Verify posted_date is visible
    expect(container.querySelector('input[name="posted_date"]')).toBeTruthy();

    // Switch to Cash (non-credit_card)
    const sel = container.querySelector('select[name="payment_method_id"]');
    await act(async () => {
      fireEvent.change(sel, { target: { value: '1' } });
    });

    await waitFor(() => {
      expect(container.querySelector('input[name="posted_date"]')).toBeFalsy();
    });

    unmount();
  });

  /**
   * Property 1c: Posted Date Field Shows on Switch To
   * Switching from non-credit_card to credit_card shows the field.
   * 
   * Validates: Requirements 6.5
   */
  it('Property 1c: posted_date field shows when switching to credit_card', async () => {
    const { container, unmount } = await renderAndSelect(1); // Cash

    // Verify posted_date is NOT visible
    expect(container.querySelector('input[name="posted_date"]')).toBeFalsy();

    // Switch to Visa Credit Card
    const sel = container.querySelector('select[name="payment_method_id"]');
    await act(async () => {
      fireEvent.change(sel, { target: { value: '4' } });
    });

    await waitFor(() => {
      expect(container.querySelector('input[name="posted_date"]')).toBeTruthy();
    });

    unmount();
  });
});
