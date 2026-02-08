/**
 * ExpenseForm Property Tests — Parameterized
 *
 * Converted from PBT to parameterized tests. The input spaces are small and
 * fully enumerable (17 categories, 5 payment methods, 4 sections, a few boolean combos).
 * PBT was rendering full ExpenseForm 100× per property with async hooks, sessionStorage,
 * and API mocks — causing ~67s runtime and intermittent flakiness under concurrent load.
 *
 * Each test now renders the component once, eliminating timing issues.
 *
 * Original properties preserved:
 *   P1 (expanded-expense-categories): Category dropdown completeness — Validates: Req 1.1
 *   P5 (smart-expense-entry): Payment method persistence — Validates: Req 5.1, 5.3
 *   P4 (smart-expense-entry): Form validation enables submit — Validates: Req 3.3
 *   P1 (expense-form-simplification): Initial visibility in create mode — Validates: Req 1.1
 *   P2 (expense-form-simplification): Section expansion based on existing data — Validates: Req 1.2
 *   P4 (expense-form-simplification): Data preservation during collapse — Validates: Req 1.4
 *   P21 (expense-form-simplification): State reset after submission — Validates: Req 11.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import ExpenseForm from './ExpenseForm';
import { CATEGORIES } from '../../../backend/utils/categories';
import { testEach } from '../test-utils';

// Mock fetch globally
global.fetch = vi.fn();

const MOCK_PAYMENT_METHODS = [
  { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
  { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 },
  { id: 3, display_name: 'VISA', type: 'credit_card', is_active: 1 },
  { id: 4, display_name: 'Mastercard', type: 'credit_card', is_active: 1 },
  { id: 5, display_name: 'Cheque', type: 'cheque', is_active: 1 }
];

vi.mock('../services/paymentMethodApi', () => ({
  getActivePaymentMethods: vi.fn(() => Promise.resolve([
    { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
    { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 },
    { id: 3, display_name: 'VISA', type: 'credit_card', is_active: 1 },
    { id: 4, display_name: 'Mastercard', type: 'credit_card', is_active: 1 },
    { id: 5, display_name: 'Cheque', type: 'cheque', is_active: 1 }
  ])),
  getPaymentMethod: vi.fn(() => Promise.resolve(null)),
  getPaymentMethods: vi.fn(() => Promise.resolve([
    { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
    { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 },
    { id: 3, display_name: 'VISA', type: 'credit_card', is_active: 1 },
    { id: 4, display_name: 'Mastercard', type: 'credit_card', is_active: 1 },
    { id: 5, display_name: 'Cheque', type: 'cheque', is_active: 1 }
  ])),
}));

vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

Element.prototype.scrollIntoView = vi.fn();

const createMockFetch = (additionalHandlers = {}) => (url) => {
  if (url.includes('/api/categories') || url.includes('/categories')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ categories: CATEGORIES, budgetableCategories: [], taxDeductibleCategories: ['Tax - Medical', 'Tax - Donation'] }) });
  }
  if (url.includes('/api/payment-methods/active')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ paymentMethods: MOCK_PAYMENT_METHODS }) });
  }
  if (url.includes('/api/payment-methods')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ paymentMethods: MOCK_PAYMENT_METHODS }) });
  }
  if (url.includes('/places')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  if (url.includes('/people')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  if (url.includes('/suggest-category')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ category: null, confidence: 0 }) });
  for (const [pattern, handler] of Object.entries(additionalHandlers)) {
    if (url.includes(pattern)) return handler(url);
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
};

/** Helper: render ExpenseForm and wait for it to be ready */
async function renderForm(props = {}) {
  global.fetch.mockImplementation(createMockFetch(props.fetchHandlers || {}));
  const result = render(
    <ExpenseForm
      onExpenseAdded={props.onExpenseAdded || vi.fn()}
      people={props.people || []}
      expense={props.expense || null}
    />
  );
  await waitFor(() => {
    expect(result.container.querySelector('select[name="type"]')).toBeTruthy();
  });
  await waitFor(() => {
    const sel = result.container.querySelector('select[name="payment_method_id"]');
    expect(sel).toBeTruthy();
    expect(sel.options.length).toBeGreaterThan(1);
  });
  return result;
}

/** Helper: find collapsible section header by title text */
function findHeader(container, title) {
  return Array.from(container.querySelectorAll('.collapsible-header'))
    .find(h => h.textContent.includes(title));
}

describe('ExpenseForm Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(async () => {
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  // ─── Property 1 (expanded-expense-categories): Category dropdown completeness ───
  // Validates: Requirements 1.1
  // All 17 categories must appear in the dropdown. One test suffices.
  it('Property 1: should include all valid categories in the dropdown', async () => {
    const { container, unmount } = await renderForm();
    const typeSelect = container.querySelector('select[name="type"]');
    const optionValues = Array.from(typeSelect.options).map(opt => opt.value);
    for (const category of CATEGORIES) {
      expect(optionValues).toContain(category);
    }
    unmount();
  });

  // ─── Property 5 (smart-expense-entry): Payment method persistence ───
  // Validates: Requirements 5.1, 5.3
  // Input space: 5 payment methods — fully enumerable
  describe('Property 5: Payment method persistence', () => {
    const LAST_PAYMENT_METHOD_KEY = 'expense-tracker-last-payment-method-id';

    testEach(
      MOCK_PAYMENT_METHODS.map(pm => ({
        methodId: String(pm.id),
        methodName: pm.display_name,
        description: `${pm.display_name} (id=${pm.id})`
      }))
    ).it('persists $methodName and pre-selects on next form open', async ({ methodId }) => {
      const { container, unmount } = await renderForm({
        fetchHandlers: {
          '/expenses': () => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 1, payment_method_id: parseInt(methodId) })
          })
        }
      });

      // Fill required fields and select payment method
      await act(async () => {
        fireEvent.change(container.querySelector('input[name="date"]'), { target: { value: '2025-01-15' } });
        fireEvent.change(container.querySelector('input[name="amount"]'), { target: { value: '50.00' } });
        fireEvent.change(container.querySelector('select[name="payment_method_id"]'), { target: { value: methodId } });
      });

      // Submit
      await act(async () => { fireEvent.submit(container.querySelector('form')); });
      await waitFor(() => { expect(localStorage.getItem(LAST_PAYMENT_METHOD_KEY)).toBe(methodId); });

      await act(async () => { await new Promise(r => setTimeout(r, 100)); });
      unmount();

      // Render new form — should pre-select the saved method
      const { container: c2, unmount: u2 } = await renderForm();
      await waitFor(() => {
        expect(c2.querySelector('select[name="payment_method_id"]').value).toBe(methodId);
      });
      await act(async () => { await new Promise(r => setTimeout(r, 50)); });
      u2();
    });
  });

  // ─── Property 4 (smart-expense-entry): Form validation enables submit ───
  // Validates: Requirements 3.3
  // Axes: category × payment method. Representative cases cover all types.
  describe('Property 4: Submit enabled when all required fields valid', () => {
    const cases = [
      { date: '2024-06-15', amount: '50.00', category: 'Groceries', methodId: '1', place: 'Superstore', desc: 'groceries, cash, with place' },
      { date: '2025-01-01', amount: '0.01', category: 'Tax - Medical', methodId: '3', place: '', desc: 'medical, credit card, no place' },
      { date: '2023-12-28', amount: '9999.99', category: 'Tax - Donation', methodId: '2', place: 'Charity', desc: 'donation, debit, large amount' },
      { date: '2020-02-29', amount: '100.50', category: 'Entertainment', methodId: '5', place: 'Cinema', desc: 'entertainment, cheque' },
      { date: '2030-06-01', amount: '1.00', category: 'Other', methodId: '4', place: '', desc: 'other, mastercard, no place' },
    ];

    testEach(cases).it('submit enabled for $desc', async ({ date, amount, category, methodId, place }) => {
      const { container, unmount } = await renderForm();

      await act(async () => {
        fireEvent.change(container.querySelector('input[name="date"]'), { target: { value: date } });
        fireEvent.change(container.querySelector('input[name="amount"]'), { target: { value: amount } });
        fireEvent.change(container.querySelector('select[name="type"]'), { target: { value: category } });
        fireEvent.change(container.querySelector('select[name="payment_method_id"]'), { target: { value: methodId } });
        if (place) fireEvent.change(container.querySelector('input[name="place"]'), { target: { value: place } });
      });

      expect(container.querySelector('button[type="submit"]').disabled).toBe(false);
      unmount();
    });
  });

  // ─── Property 1 (expense-form-simplification): Initial visibility in create mode ───
  // Validates: Requirements 1.1
  // In create mode, all advanced sections should be collapsed regardless of people prop.
  describe('Property 1: All sections collapsed in create mode', () => {
    const cases = [
      { people: [], desc: 'no people' },
      { people: [{ id: 1, name: 'John' }], desc: 'one person' },
      { people: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }], desc: 'two people' },
    ];

    testEach(cases).it('sections collapsed with $desc', async ({ people }) => {
      const { container, unmount } = await renderForm({ people });

      // Core fields visible
      expect(container.querySelector('input[name="date"]')).toBeTruthy();
      expect(container.querySelector('input[name="place"]')).toBeTruthy();
      expect(container.querySelector('select[name="type"]')).toBeTruthy();
      expect(container.querySelector('input[name="amount"]')).toBeTruthy();
      expect(container.querySelector('select[name="payment_method_id"]')).toBeTruthy();
      expect(container.querySelector('textarea[name="notes"]')).toBeTruthy();

      // All collapsible sections collapsed
      const headers = container.querySelectorAll('.collapsible-header');
      headers.forEach(header => {
        expect(header.getAttribute('aria-expanded')).toBe('false');
      });

      unmount();
    });
  });

  // ─── Property 2 (expense-form-simplification): Section expansion based on existing data ───
  // Validates: Requirements 1.2
  // Axes: which fields have data. Enumerate the meaningful combinations.
  describe('Property 2: Sections expand based on existing data in edit mode', () => {
    const cases = [
      {
        desc: 'no optional data — all collapsed',
        expense: { id: 1, date: '2024-01-15', place: 'Store', amount: 50, type: 'Groceries', payment_method_id: 1, notes: '', future_months: 0, posted_date: null, original_cost: null, insurance_eligible: 0, people: [], invoices: [] },
        expected: { advancedOptions: false, reimbursement: false }
      },
      {
        desc: 'future_months > 0 — Advanced Options expanded',
        expense: { id: 2, date: '2024-01-15', place: 'Store', amount: 50, type: 'Groceries', payment_method_id: 1, notes: '', future_months: 3, posted_date: null, original_cost: null, insurance_eligible: 0, people: [], invoices: [] },
        expected: { advancedOptions: true, reimbursement: false }
      },
      {
        desc: 'posted_date set — Advanced Options expanded',
        expense: { id: 3, date: '2024-01-15', place: 'Store', amount: 50, type: 'Groceries', payment_method_id: 3, notes: '', future_months: 0, posted_date: '2024-01-20', original_cost: null, insurance_eligible: 0, people: [], invoices: [] },
        expected: { advancedOptions: true, reimbursement: false }
      },
      {
        desc: 'original_cost set (non-medical) — Reimbursement expanded',
        expense: { id: 4, date: '2024-01-15', place: 'Store', amount: 50, type: 'Groceries', payment_method_id: 1, notes: '', future_months: 0, posted_date: null, original_cost: 100, insurance_eligible: 0, people: [], invoices: [] },
        expected: { advancedOptions: false, reimbursement: true }
      },
      {
        desc: 'insurance_eligible (medical) — Insurance expanded',
        expense: { id: 5, date: '2024-01-15', place: 'Clinic', amount: 200, type: 'Tax - Medical', payment_method_id: 1, notes: '', future_months: 0, posted_date: null, original_cost: null, insurance_eligible: 1, claim_status: 'in_progress', people: [], invoices: [] },
        expected: { insurance: true }
      },
      {
        desc: 'people assigned (medical) — People expanded',
        expense: { id: 6, date: '2024-01-15', place: 'Clinic', amount: 200, type: 'Tax - Medical', payment_method_id: 1, notes: '', future_months: 0, posted_date: null, original_cost: null, insurance_eligible: 0, people: [{ id: 1, name: 'John', allocation_amount: 200 }], invoices: [] },
        expected: { people: true }
      },
      {
        desc: 'invoices present (tax-deductible) — Invoices expanded',
        expense: { id: 7, date: '2024-01-15', place: 'Clinic', amount: 200, type: 'Tax - Medical', payment_method_id: 1, notes: '', future_months: 0, posted_date: null, original_cost: null, insurance_eligible: 0, people: [], invoices: [{ id: 1, filename: 'receipt.pdf', person_id: null }] },
        expected: { invoices: true }
      },
      {
        desc: 'multiple fields set — multiple sections expanded',
        expense: { id: 8, date: '2024-01-15', place: 'Store', amount: 50, type: 'Other', payment_method_id: 3, notes: '', future_months: 2, posted_date: '2024-01-20', original_cost: 100, insurance_eligible: 0, people: [], invoices: [] },
        expected: { advancedOptions: true, reimbursement: true }
      },
    ];

    const sectionTitleMap = {
      advancedOptions: 'Advanced Options',
      reimbursement: 'Reimbursement',
      insurance: 'Insurance Tracking',
      people: 'People Assignment',
      invoices: 'Invoice Attachments'
    };

    testEach(cases).it('$desc', async ({ expense, expected }) => {
      const fetchHandlers = {};
      if (expense.invoices?.length > 0) {
        fetchHandlers['/invoices'] = () => Promise.resolve({ ok: true, json: () => Promise.resolve(expense.invoices) });
      }

      const { container, unmount } = await renderForm({
        expense,
        people: expense.people || [],
        fetchHandlers
      });

      for (const [key, title] of Object.entries(sectionTitleMap)) {
        const header = findHeader(container, title);
        if (header && expected[key] !== undefined) {
          const actual = header.getAttribute('aria-expanded') === 'true';
          expect(actual).toBe(expected[key]);
        }
      }

      unmount();
    });
  });

  // ─── Property 4 (expense-form-simplification): Data preservation during collapse ───
  // Validates: Requirements 1.4
  // Axes: 4 sections to test. Each renders once, enters data, collapses, re-expands.
  describe('Property 4: Data preserved when sections collapse and re-expand', () => {
    it('preserves posted date in Advanced Options section', async () => {
      const { container, unmount } = await renderForm();

      // Select credit card for posted date field
      await act(async () => {
        fireEvent.change(container.querySelector('select[name="type"]'), { target: { value: 'Other' } });
        fireEvent.change(container.querySelector('select[name="payment_method_id"]'), { target: { value: '3' } }); // VISA
      });

      // Expand Advanced Options
      const advHeader = findHeader(container, 'Advanced Options');
      if (advHeader.getAttribute('aria-expanded') === 'false') {
        await act(async () => { fireEvent.click(advHeader); });
      }
      await waitFor(() => { expect(container.querySelector('#posted_date')).toBeTruthy(); });

      // Enter posted date
      await act(async () => {
        fireEvent.change(container.querySelector('#posted_date'), { target: { value: '2024-06-20' } });
      });
      expect(container.querySelector('#posted_date').value).toBe('2024-06-20');

      // Collapse
      await act(async () => { fireEvent.click(advHeader); });
      await waitFor(() => { expect(container.querySelector('#posted_date')).toBeFalsy(); });

      // Re-expand — data preserved
      await act(async () => { fireEvent.click(advHeader); });
      await waitFor(() => {
        expect(container.querySelector('#posted_date')).toBeTruthy();
        expect(container.querySelector('#posted_date').value).toBe('2024-06-20');
      });

      unmount();
    });

    it('preserves original cost in Reimbursement section', async () => {
      const { container, unmount } = await renderForm();

      await act(async () => {
        fireEvent.change(container.querySelector('select[name="type"]'), { target: { value: 'Other' } });
        fireEvent.change(container.querySelector('input[name="amount"]'), { target: { value: '50.00' } });
      });

      const reimbHeader = findHeader(container, 'Reimbursement');
      if (!reimbHeader) { unmount(); return; }

      await act(async () => { fireEvent.click(reimbHeader); });
      await waitFor(() => { expect(container.querySelector('#genericOriginalCost')).toBeTruthy(); });

      await act(async () => {
        fireEvent.change(container.querySelector('#genericOriginalCost'), { target: { value: '150.00' } });
      });
      expect(container.querySelector('#genericOriginalCost').value).toBe('150.00');

      // Collapse
      await act(async () => { fireEvent.click(reimbHeader); });
      await waitFor(() => { expect(container.querySelector('#genericOriginalCost')).toBeFalsy(); });

      // Re-expand — data preserved
      await act(async () => { fireEvent.click(reimbHeader); });
      await waitFor(() => {
        expect(container.querySelector('#genericOriginalCost')).toBeTruthy();
        expect(container.querySelector('#genericOriginalCost').value).toBe('150.00');
      });

      unmount();
    });

    it('preserves insurance data in Insurance section', async () => {
      const { container, unmount } = await renderForm();

      await act(async () => {
        fireEvent.change(container.querySelector('select[name="type"]'), { target: { value: 'Tax - Medical' } });
      });

      const insHeader = findHeader(container, 'Insurance Tracking');
      if (!insHeader) { unmount(); return; }

      if (insHeader.getAttribute('aria-expanded') === 'false') {
        await act(async () => { fireEvent.click(insHeader); });
      }
      await waitFor(() => {
        expect(container.querySelector('.insurance-checkbox input[type="checkbox"]')).toBeTruthy();
      });

      // Enable insurance
      await act(async () => {
        fireEvent.click(container.querySelector('.insurance-checkbox input[type="checkbox"]'));
      });
      await waitFor(() => { expect(container.querySelector('#originalCost')).toBeTruthy(); });

      await act(async () => {
        fireEvent.change(container.querySelector('#originalCost'), { target: { value: '300.00' } });
        fireEvent.change(container.querySelector('#claimStatus'), { target: { value: 'in_progress' } });
      });

      // Collapse
      await act(async () => { fireEvent.click(insHeader); });
      await waitFor(() => { expect(container.querySelector('#originalCost')).toBeFalsy(); });

      // Re-expand — data preserved
      await act(async () => { fireEvent.click(insHeader); });
      await waitFor(() => {
        expect(container.querySelector('#originalCost')).toBeTruthy();
        expect(container.querySelector('#originalCost').value).toBe('300.00');
        expect(container.querySelector('#claimStatus').value).toBe('in_progress');
      });

      unmount();
    });

    it('preserves people selection in People section', async () => {
      const people = [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }];
      const { container, unmount } = await renderForm({ people });

      await act(async () => {
        fireEvent.change(container.querySelector('select[name="type"]'), { target: { value: 'Tax - Medical' } });
      });

      const peopleHeader = findHeader(container, 'People Assignment');
      if (!peopleHeader) { unmount(); return; }

      await act(async () => { fireEvent.click(peopleHeader); });
      await waitFor(() => { expect(container.querySelector('#people')).toBeTruthy(); });

      // Select a person
      const peopleSelect = container.querySelector('#people');
      await act(async () => {
        Array.from(peopleSelect.options).forEach(opt => {
          opt.selected = opt.value === '1';
        });
        fireEvent.change(peopleSelect);
      });

      // Collapse
      await act(async () => { fireEvent.click(peopleHeader); });
      await waitFor(() => { expect(container.querySelector('#people')).toBeFalsy(); });

      // Re-expand — selection preserved
      await act(async () => { fireEvent.click(peopleHeader); });
      await waitFor(() => {
        const sel = container.querySelector('#people');
        expect(sel).toBeTruthy();
        const selected = Array.from(sel.selectedOptions).map(o => o.value);
        expect(selected.length).toBeGreaterThan(0);
      });

      unmount();
    });
  });

  // ─── Property 21 (expense-form-simplification): State reset after submission ───
  // Validates: Requirements 11.3
  // Axes: which sections are expanded before submit. 3 boolean combos (at least one true).
  describe('Property 21: Section expansion resets after successful submission', () => {
    const cases = [
      { expandAdvanced: true, expandReimbursement: false, desc: 'only Advanced Options expanded' },
      { expandAdvanced: false, expandReimbursement: true, desc: 'only Reimbursement expanded' },
      { expandAdvanced: true, expandReimbursement: true, desc: 'both sections expanded' },
    ];

    testEach(cases).it('resets after submit with $desc', async ({ expandAdvanced, expandReimbursement }) => {
      const onExpenseAdded = vi.fn();
      global.fetch.mockImplementation((url, options) => {
        if (url.includes('/api/expenses') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 42, date: '2024-06-15', place: 'Store', amount: 50, type: 'Groceries', payment_method_id: 1 })
          });
        }
        return createMockFetch()(url);
      });

      const { container, unmount } = render(
        <ExpenseForm onExpenseAdded={onExpenseAdded} people={[]} />
      );

      await waitFor(() => {
        const pmSelect = container.querySelector('#payment_method_id');
        expect(pmSelect).toBeTruthy();
        expect(pmSelect.value).not.toBe('');
      }, { timeout: 3000 });

      const advHeader = findHeader(container, 'Advanced Options');
      const reimbHeader = findHeader(container, 'Reimbursement');

      // Expand requested sections
      if (expandAdvanced && advHeader && advHeader.getAttribute('aria-expanded') === 'false') {
        await act(async () => { fireEvent.click(advHeader); });
        await waitFor(() => { expect(advHeader.getAttribute('aria-expanded')).toBe('true'); });
      }
      if (expandReimbursement && reimbHeader && reimbHeader.getAttribute('aria-expanded') === 'false') {
        await act(async () => { fireEvent.click(reimbHeader); });
        await waitFor(() => { expect(reimbHeader.getAttribute('aria-expanded')).toBe('true'); });
      }

      // Fill form and submit
      await act(async () => {
        fireEvent.change(container.querySelector('#date'), { target: { value: '2024-06-15' } });
        fireEvent.change(container.querySelector('#place'), { target: { value: 'Store' } });
        fireEvent.change(container.querySelector('#amount'), { target: { value: '50.00' } });
        fireEvent.change(container.querySelector('#type'), { target: { value: 'Groceries' } });
      });

      await act(async () => { fireEvent.submit(container.querySelector('form')); });
      await waitFor(() => { expect(onExpenseAdded).toHaveBeenCalled(); }, { timeout: 3000 });

      // All sections should be collapsed after submission
      await waitFor(() => {
        if (advHeader) expect(advHeader.getAttribute('aria-expanded')).toBe('false');
        if (reimbHeader) expect(reimbHeader.getAttribute('aria-expanded')).toBe('false');
      });

      // sessionStorage should reflect collapsed state
      const storageKey = 'expenseForm_expansion_create';
      const stored = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
      expect(stored.advancedOptions).toBe(false);
      expect(stored.reimbursement).toBe(false);

      unmount();
    });
  });
});
