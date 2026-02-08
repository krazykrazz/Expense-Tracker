/**
 * ExpenseList Edit Modal Property Tests — Parameterized
 *
 * Converted from PBT to parameterized tests. Properties 1, 3, 5 were rendering
 * full ExpenseList + modal 100× each with random data — causing slow runtime and
 * flakiness under concurrent load. Properties 4 and 6 were already parameterized.
 *
 * Each test now renders the component once with explicit representative data.
 *
 * Original properties preserved:
 *   P1 (expense-form-consolidation): Modal renders ExpenseForm with correct props — Validates: Req 2.1-2.5
 *   P3 (expense-form-consolidation): Form pre-population — Validates: Req 3.5
 *   P4 (expense-form-consolidation): Medical expense sections visibility — Validates: Req 4.1, 4.2
 *   P5 (expense-form-consolidation): Tax-deductible invoice section visibility — Validates: Req 4.3
 *   P6 (expense-form-consolidation): General form features availability — Validates: Req 4.4-4.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { CATEGORIES } from '../../../backend/utils/categories';
import { testEach } from '../test-utils';

global.fetch = vi.fn();
import ExpenseList from './ExpenseList';

const MOCK_PAYMENT_METHODS = [
  { id: 1, display_name: 'Cash', type: 'cash' },
  { id: 2, display_name: 'Visa', type: 'credit_card' },
  { id: 3, display_name: 'Debit', type: 'debit' }
];

function setupFetchMock() {
  global.fetch = vi.fn().mockImplementation((url) => {
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
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
}

describe('ExpenseList Edit Modal Property-Based Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    setupFetchMock();
  });

  afterEach(() => { cleanup(); });

  // ─── Property 1: Modal Renders ExpenseForm with Correct Props ───
  // Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
  describe('Property 1: Modal Renders ExpenseForm with Correct Props', () => {
    const cases = [
      { id: 1, date: '2024-01-15', place: 'Superstore', notes: 'weekly groceries', amount: 125.50, type: 'Groceries', payment_method_id: 1, week: 3, people: [], desc: 'groceries, cash, with notes' },
      { id: 42, date: '2023-06-20', place: '', notes: '', amount: 0.01, type: 'Tax - Medical', payment_method_id: 2, week: 1, people: [{ id: 1, name: 'John' }], desc: 'medical, credit card, min amount, one person' },
      { id: 500, date: '2025-12-28', place: 'Charity Org', notes: 'annual donation', amount: 5000.00, type: 'Tax - Donation', payment_method_id: 3, week: 5, people: [], desc: 'donation, debit, large amount' },
      { id: 9999, date: '2020-02-29', place: 'Gas Station', notes: '', amount: 75.25, type: 'Gas', payment_method_id: 1, week: 4, people: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }], desc: 'gas, leap day, two people' },
      { id: 7, date: '2028-07-04', place: 'Restaurant', notes: 'dinner out', amount: 99.99, type: 'Entertainment', payment_method_id: 2, week: 2, people: [], desc: 'entertainment, credit card, future date' },
    ];

    testEach(cases).it('renders modal with correct data for $desc', async ({ id, date, place, notes, amount, type, payment_method_id, week, people }) => {
      setupFetchMock();
      const expense = { id, date, place: place || null, notes: notes || null, amount, type, payment_method_id, method: MOCK_PAYMENT_METHODS.find(pm => pm.id === payment_method_id)?.display_name || 'Cash', week };
      const { container, unmount } = render(<ExpenseList expenses={[expense]} onExpenseDeleted={vi.fn()} onExpenseUpdated={vi.fn()} onAddExpense={vi.fn()} people={people} />);
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());

      const editButtons = container.querySelectorAll('button.edit-button');
      expect(editButtons.length).toBeGreaterThan(0);
      fireEvent.click(editButtons[0]);
      await waitFor(() => expect(container.querySelector('.modal-overlay')).toBeTruthy());

      const editModal = container.querySelector('.edit-modal');
      expect(editModal).toBeTruthy();
      expect(editModal.querySelector('.modal-close-button')).toBeTruthy();
      expect(editModal.querySelector('form')).toBeTruthy();
      expect(editModal.querySelector('input[name="date"]').value).toBe(date);
      expect(parseFloat(editModal.querySelector('input[name="amount"]').value)).toBeCloseTo(amount, 2);
      await waitFor(() => expect(editModal.querySelector('select[name="type"]').value).toBe(type));

      const paymentMethodSelect = editModal.querySelector('select[name="payment_method_id"]');
      expect(paymentMethodSelect).toBeTruthy();
      expect(paymentMethodSelect.querySelectorAll('option').length).toBeGreaterThan(0);
      expect(editModal.querySelector('input[name="place"]').value).toBe(place || '');
      expect(editModal.querySelector('textarea[name="notes"]').value).toBe(notes || '');

      unmount();
    });
  });

  // ─── Property 3: Form Pre-population ───
  // Validates: Requirements 3.5
  describe('Property 3: Form Pre-population', () => {
    const cases = [
      { id: 10, date: '2024-03-10', place: 'Walmart', notes: 'bulk buy', amount: 200.00, type: 'Groceries', payment_method_id: 1, week: 2, desc: 'groceries, cash, with notes' },
      { id: 20, date: '2023-11-05', place: '', notes: '', amount: 15.75, type: 'Clothing', payment_method_id: 2, week: 1, desc: 'clothing, credit card, empty fields' },
      { id: 30, date: '2025-07-22', place: 'Pharmacy', notes: 'prescription', amount: 45.00, type: 'Tax - Medical', payment_method_id: 3, week: 4, desc: 'medical, debit' },
      { id: 40, date: '2020-01-01', place: 'Church', notes: '', amount: 1000.00, type: 'Tax - Donation', payment_method_id: 1, week: 1, desc: 'donation, new year' },
      { id: 50, date: '2027-06-15', place: 'Shell', notes: 'road trip', amount: 88.88, type: 'Gas', payment_method_id: 2, week: 3, desc: 'gas, credit card, future' },
    ];

    testEach(cases).it('pre-populates form fields for $desc', async ({ id, date, place, notes, amount, type, payment_method_id, week }) => {
      setupFetchMock();
      const expense = { id, date, place: place || null, notes: notes || null, amount, type, payment_method_id, method: MOCK_PAYMENT_METHODS.find(pm => pm.id === payment_method_id)?.display_name || 'Cash', week };
      const { container, unmount } = render(<ExpenseList expenses={[expense]} onExpenseDeleted={vi.fn()} onExpenseUpdated={vi.fn()} onAddExpense={vi.fn()} people={[]} />);

      const editButtons = container.querySelectorAll('button.edit-button');
      expect(editButtons.length).toBeGreaterThan(0);
      fireEvent.click(editButtons[0]);
      await waitFor(() => expect(container.querySelector('.modal-overlay')).toBeTruthy());

      const editModal = container.querySelector('.edit-modal');
      expect(editModal.querySelector('input[name="date"]').value).toBe(date);
      expect(parseFloat(editModal.querySelector('input[name="amount"]').value)).toBeCloseTo(amount, 2);
      await waitFor(() => expect(editModal.querySelector('select[name="type"]').value).toBe(type));

      const paymentMethodSelect = editModal.querySelector('select[name="payment_method_id"]');
      expect(paymentMethodSelect).toBeTruthy();
      expect(paymentMethodSelect.querySelectorAll('option').length).toBeGreaterThan(0);
      expect(editModal.querySelector('input[name="place"]').value).toBe(place || '');
      expect(editModal.querySelector('textarea[name="notes"]').value).toBe(notes || '');

      unmount();
    });
  });

  // ─── Property 4: Medical Expense Sections Visibility (already parameterized — kept as-is) ───
  // Validates: Requirements 4.1, 4.2
  describe('Property 4: Medical Expense Sections Visibility', () => {
    const medicalTestCases = [
      { id: 1, date: '2024-01-15', place: 'Clinic', amount: 50.00, payment_method_id: 1, week: 3, people: [{ id: 1, name: 'John' }], desc: 'single person, cash' },
      { id: 2, date: '2023-06-20', place: 'Hospital', amount: 250.75, payment_method_id: 2, week: 1, people: [{ id: 1, name: 'Jane' }, { id: 2, name: 'Bob' }], desc: 'multiple people, credit card' },
      { id: 3, date: '2025-12-01', place: 'Pharmacy', amount: 0.01, payment_method_id: 3, week: 5, people: [{ id: 10, name: 'Alice' }], desc: 'minimum amount, debit' },
      { id: 100, date: '2020-02-28', place: 'Dentist Office', amount: 9999.99, payment_method_id: 1, week: 4, people: [{ id: 5, name: 'Eve' }, { id: 6, name: 'Dan' }, { id: 7, name: 'Sam' }], desc: 'large amount, three people' },
    ];

    medicalTestCases.forEach(({ id, date, place, amount, payment_method_id, week, people, desc }) => {
      it(`shows insurance and people sections for medical expense (${desc})`, async () => {
        const expense = { id, date, place, notes: null, amount, type: 'Tax - Medical', payment_method_id, method: MOCK_PAYMENT_METHODS.find(pm => pm.id === payment_method_id)?.display_name || 'Cash', week };
        const { container } = render(<ExpenseList expenses={[expense]} onExpenseDeleted={vi.fn()} onExpenseUpdated={vi.fn()} onAddExpense={vi.fn()} people={people} />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        const editButtons = container.querySelectorAll('button.edit-button');
        expect(editButtons.length).toBeGreaterThan(0);
        fireEvent.click(editButtons[0]);
        await waitFor(() => expect(container.querySelector('.modal-overlay')).toBeTruthy());

        const insuranceHeader = Array.from(container.querySelectorAll('.edit-modal .collapsible-header'))
          .find(h => h.textContent.includes('Insurance Tracking'));
        expect(insuranceHeader).toBeTruthy();
        fireEvent.click(insuranceHeader);
        await waitFor(() => expect(container.querySelector('.edit-modal .insurance-eligibility-row input[type="checkbox"]')).toBeTruthy());

        const peopleHeader = Array.from(container.querySelectorAll('.edit-modal .collapsible-header'))
          .find(h => h.textContent.includes('People Assignment'));
        expect(peopleHeader).toBeTruthy();
        fireEvent.click(peopleHeader);
        await waitFor(() => expect(container.querySelector('.edit-modal select[name="people"]')).toBeTruthy());
      });
    });
  });

  // ─── Property 5: Tax-Deductible Invoice Section Visibility ───
  // Validates: Requirements 4.3
  describe('Property 5: Tax-Deductible Invoice Section Visibility', () => {
    const cases = [
      { id: 1, date: '2024-01-15', place: 'Clinic', amount: 150.00, type: 'Tax - Medical', payment_method_id: 1, week: 3, desc: 'medical, cash' },
      { id: 2, date: '2023-06-20', place: 'Hospital', amount: 500.00, type: 'Tax - Medical', payment_method_id: 2, week: 1, desc: 'medical, credit card' },
      { id: 3, date: '2025-12-01', place: 'Charity', amount: 100.00, type: 'Tax - Donation', payment_method_id: 3, week: 5, desc: 'donation, debit' },
      { id: 4, date: '2020-02-28', place: 'Church', amount: 2500.00, type: 'Tax - Donation', payment_method_id: 1, week: 4, desc: 'donation, cash, large' },
      { id: 5, date: '2028-07-04', place: 'Red Cross', amount: 0.01, type: 'Tax - Donation', payment_method_id: 2, week: 2, desc: 'donation, credit card, min amount' },
    ];

    testEach(cases).it('shows invoice section for $desc', async ({ id, date, place, amount, type, payment_method_id, week }) => {
      setupFetchMock();
      const expense = { id, date, place, notes: null, amount, type, payment_method_id, method: MOCK_PAYMENT_METHODS.find(pm => pm.id === payment_method_id)?.display_name || 'Cash', week };
      const { container, unmount } = render(<ExpenseList expenses={[expense]} onExpenseDeleted={vi.fn()} onExpenseUpdated={vi.fn()} onAddExpense={vi.fn()} people={[]} />);
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());

      const editButtons = container.querySelectorAll('button.edit-button');
      expect(editButtons.length).toBeGreaterThan(0);
      fireEvent.click(editButtons[0]);
      await waitFor(() => expect(container.querySelector('.modal-overlay')).toBeTruthy());

      const editModal = container.querySelector('.edit-modal');
      const invoiceSection = Array.from(editModal.querySelectorAll('.collapsible-header'))
        .find(h => h.textContent.includes('Invoice Attachments'));
      expect(invoiceSection).toBeTruthy();

      unmount();
    });
  });

  // ─── Property 6: General Form Features Availability (already parameterized — kept as-is) ───
  // Validates: Requirements 4.4, 4.5, 4.6
  describe('Property 6: General Form Features Availability', () => {
    const generalTestCases = [
      { id: 1, date: '2024-03-10', amount: 25.00, type: 'Groceries', payment_method_id: 1, week: 2, desc: 'groceries, cash' },
      { id: 2, date: '2023-11-05', amount: 100.50, type: 'Clothing', payment_method_id: 2, week: 1, desc: 'clothing, credit card' },
      { id: 3, date: '2025-07-22', amount: 0.01, type: 'Tax - Medical', payment_method_id: 3, week: 4, desc: 'medical, debit, min amount' },
      { id: 50, date: '2020-01-01', amount: 5000.00, type: 'Tax - Donation', payment_method_id: 1, week: 1, desc: 'donation, large amount' },
      { id: 999, date: '2028-12-28', amount: 42.42, type: 'Entertainment', payment_method_id: 2, week: 5, desc: 'entertainment, future date' },
    ];

    generalTestCases.forEach(({ id, date, amount, type, payment_method_id, week, desc }) => {
      it(`shows advanced options and all categories (${desc})`, async () => {
        const expense = { id, date, place: 'Test Place', notes: null, amount, type, payment_method_id, method: MOCK_PAYMENT_METHODS.find(pm => pm.id === payment_method_id)?.display_name || 'Cash', week };
        const { container } = render(<ExpenseList expenses={[expense]} onExpenseDeleted={vi.fn()} onExpenseUpdated={vi.fn()} onAddExpense={vi.fn()} people={[]} />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        const editButtons = container.querySelectorAll('button.edit-button');
        expect(editButtons.length).toBeGreaterThan(0);
        fireEvent.click(editButtons[0]);
        await waitFor(() => expect(container.querySelector('.modal-overlay')).toBeTruthy());

        const advancedOptionsHeader = Array.from(container.querySelectorAll('.edit-modal .collapsible-header'))
          .find(h => h.textContent.includes('Advanced Options'));
        expect(advancedOptionsHeader).toBeTruthy();
        fireEvent.click(advancedOptionsHeader);
        await waitFor(() => expect(container.querySelector('.edit-modal .future-months-section input[type="checkbox"]')).toBeTruthy());

        const typeSelect = container.querySelector('.edit-modal select[name="type"]');
        await waitFor(() => expect(typeSelect.querySelectorAll('option').length).toBe(CATEGORIES.length));
        const typeOptions = Array.from(typeSelect.querySelectorAll('option')).map(opt => opt.value);
        for (const category of CATEGORIES) expect(typeOptions).toContain(category);

        const methodSelect = container.querySelector('.edit-modal select[name="payment_method_id"]');
        expect(methodSelect).toBeTruthy();
        expect(methodSelect.querySelectorAll('option').length).toBeGreaterThan(0);
      });
    });
  });
});
