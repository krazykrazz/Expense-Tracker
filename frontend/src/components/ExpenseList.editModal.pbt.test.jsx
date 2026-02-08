import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { CATEGORIES } from '../../../backend/utils/categories';

global.fetch = vi.fn();
import ExpenseList from './ExpenseList';

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
const validPlaceArb = fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9\s]+$/.test(s)));
const validNotesArb = fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9\s]+$/.test(s)));
const validPeopleArb = fc.array(fc.record({ id: fc.integer({ min: 1, max: 100 }), name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z\s]+$/.test(s)) }), { minLength: 0, maxLength: 5 });

// Helper to set up fetch mock fresh (needed between PBT iterations)
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

  /** **Feature: expense-form-consolidation, Property 1** **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5** */
  it('Property 1: Modal Renders ExpenseForm with Correct Props', async () => {
    await fc.assert(
      fc.asyncProperty(validIdArb, validDateArb, validPlaceArb, validNotesArb, validAmountArb, validTypeArb, validPaymentMethodIdArb, validWeekArb, validPeopleArb,
        async (id, date, place, notes, amount, type, payment_method_id, week, people) => {
          cleanup();
          sessionStorage.clear();
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
        }
      ), { numRuns: 100 }
    );
  });

  /** **Feature: expense-form-consolidation, Property 3** **Validates: Requirements 3.5** */
  it('Property 3: Form Pre-population', async () => {
    await fc.assert(
      fc.asyncProperty(validIdArb, validDateArb, validPlaceArb, validNotesArb, validAmountArb, validTypeArb, validPaymentMethodIdArb, validWeekArb,
        async (id, date, place, notes, amount, type, payment_method_id, week) => {
          cleanup();
          sessionStorage.clear();
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
        }
      ), { numRuns: 100 }
    );
  });

  /** **Feature: expense-form-consolidation, Property 4** **Validates: Requirements 4.1, 4.2** */
  // Converted from PBT to parameterized tests - UI rendering with collapsible sections
  // is better validated with explicit examples than random generation (see frontend-test-simplification spec)
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

        // Insurance section is in a CollapsibleSection - verify header exists
        const insuranceHeader = Array.from(container.querySelectorAll('.edit-modal .collapsible-header'))
          .find(h => h.textContent.includes('Insurance Tracking'));
        expect(insuranceHeader).toBeTruthy();
        // Expand the Insurance Tracking section
        fireEvent.click(insuranceHeader);
        await waitFor(() => expect(container.querySelector('.edit-modal .insurance-eligibility-row input[type="checkbox"]')).toBeTruthy());
        expect(container.querySelector('.edit-modal .insurance-eligibility-row input[type="checkbox"]')).toBeTruthy();

        // People Assignment is also in a CollapsibleSection - expand it
        const peopleHeader = Array.from(container.querySelectorAll('.edit-modal .collapsible-header'))
          .find(h => h.textContent.includes('People Assignment'));
        expect(peopleHeader).toBeTruthy();
        fireEvent.click(peopleHeader);
        await waitFor(() => expect(container.querySelector('.edit-modal select[name="people"]')).toBeTruthy());
        expect(container.querySelector('.edit-modal select[name="people"]')).toBeTruthy();
      });
    });
  });

  /** **Feature: expense-form-consolidation, Property 5** **Validates: Requirements 4.3** */
  it('Property 5: Tax-Deductible Invoice Section Visibility', async () => {
    const taxDeductibleTypeArb = fc.constantFrom('Tax - Medical', 'Tax - Donation');
    const taxPlaceArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9\s]+$/.test(s));
    await fc.assert(
      fc.asyncProperty(validIdArb, validDateArb, taxPlaceArb, validAmountArb, taxDeductibleTypeArb, validPaymentMethodIdArb, validWeekArb,
        async (id, date, place, amount, type, payment_method_id, week) => {
          cleanup();
          sessionStorage.clear();
          setupFetchMock();
          const expense = { id, date, place, notes: null, amount, type, payment_method_id, method: MOCK_PAYMENT_METHODS.find(pm => pm.id === payment_method_id)?.display_name || 'Cash', week };
          const { container, unmount } = render(<ExpenseList expenses={[expense]} onExpenseDeleted={vi.fn()} onExpenseUpdated={vi.fn()} onAddExpense={vi.fn()} people={[]} />);
          await waitFor(() => expect(global.fetch).toHaveBeenCalled());
          const editButtons = container.querySelectorAll('button.edit-button');
          expect(editButtons.length).toBeGreaterThan(0);
          fireEvent.click(editButtons[0]);
          await waitFor(() => expect(container.querySelector('.modal-overlay')).toBeTruthy());
          const editModal = container.querySelector('.edit-modal');
          // Invoice section is now wrapped in CollapsibleSection
          const invoiceSection = Array.from(editModal.querySelectorAll('.collapsible-header'))
            .find(h => h.textContent.includes('Invoice Attachments'));
          expect(invoiceSection).toBeTruthy();
          unmount();
        }
      ), { numRuns: 100 }
    );
  });

  /** **Feature: expense-form-consolidation, Property 6** **Validates: Requirements 4.4, 4.5, 4.6** */
  // Converted from PBT to parameterized tests - testing collapsible section expansion
  // with explicit examples is more reliable and debuggable than random generation
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

        // Future months is in Advanced Options CollapsibleSection - verify header exists
        const advancedOptionsHeader = Array.from(container.querySelectorAll('.edit-modal .collapsible-header'))
          .find(h => h.textContent.includes('Advanced Options'));
        expect(advancedOptionsHeader).toBeTruthy();
        // Expand the Advanced Options section
        fireEvent.click(advancedOptionsHeader);
        await waitFor(() => expect(container.querySelector('.edit-modal .future-months-section input[type="checkbox"]')).toBeTruthy());
        expect(container.querySelector('.edit-modal .future-months-section input[type="checkbox"]')).toBeTruthy();

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
