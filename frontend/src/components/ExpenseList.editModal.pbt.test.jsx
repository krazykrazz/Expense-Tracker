import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, screen, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { CATEGORIES } from '../../../backend/utils/categories';
import { PAYMENT_METHODS } from '../utils/constants';

global.fetch = vi.fn();
import ExpenseList from './ExpenseList';

// Shared generators
const validTypeArb = fc.constantFrom(...CATEGORIES);
const validMethodArb = fc.constantFrom(...PAYMENT_METHODS);
const validDateArb = fc.tuple(fc.integer({ min: 2020, max: 2030 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
const validAmountArb = fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }).filter(n => n > 0 && isFinite(n)).map(n => parseFloat(n.toFixed(2)));
const validIdArb = fc.integer({ min: 1, max: 10000 });
const validWeekArb = fc.integer({ min: 1, max: 5 });
const validPlaceArb = fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9\s]+$/.test(s)));
const validNotesArb = fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9\s]+$/.test(s)));
const validPeopleArb = fc.array(fc.record({ id: fc.integer({ min: 1, max: 100 }), name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z\s]+$/.test(s)) }), { minLength: 0, maxLength: 5 });

describe('ExpenseList Edit Modal Property-Based Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/categories') || url.includes('/categories')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ categories: CATEGORIES, budgetableCategories: [], taxDeductibleCategories: [] }) });
      }
      if (url.includes('/places')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      if (url.includes('/people')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      if (url.includes('/invoices')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
  });

  afterEach(() => { cleanup(); });

  /** **Feature: expense-form-consolidation, Property 1** **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5** */
  it('Property 1: Modal Renders ExpenseForm with Correct Props', async () => {
    await fc.assert(
      fc.asyncProperty(validIdArb, validDateArb, validPlaceArb, validNotesArb, validAmountArb, validTypeArb, validMethodArb, validWeekArb, validPeopleArb,
        async (id, date, place, notes, amount, type, method, week, people) => {
          const expense = { id, date, place: place || null, notes: notes || null, amount, type, method, week };
          const { container, unmount } = render(<ExpenseList expenses={[expense]} onExpenseDeleted={vi.fn()} onExpenseUpdated={vi.fn()} onAddExpense={vi.fn()} people={people} />);
          await waitFor(() => expect(global.fetch).toHaveBeenCalled());
          fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
          await waitFor(() => expect(container.querySelector('.modal-overlay')).toBeTruthy());
          const editModal = container.querySelector('.edit-modal');
          expect(editModal).toBeTruthy();
          expect(editModal.querySelector('.modal-close-button')).toBeTruthy();
          expect(editModal.querySelector('form')).toBeTruthy();
          expect(editModal.querySelector('input[name="date"]').value).toBe(date);
          expect(parseFloat(editModal.querySelector('input[name="amount"]').value)).toBeCloseTo(amount, 2);
          await waitFor(() => expect(editModal.querySelector('select[name="type"]').value).toBe(type));
          expect(editModal.querySelector('select[name="method"]').value).toBe(method);
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
      fc.asyncProperty(validIdArb, validDateArb, validPlaceArb, validNotesArb, validAmountArb, validTypeArb, validMethodArb, validWeekArb,
        async (id, date, place, notes, amount, type, method, week) => {
          const expense = { id, date, place: place || null, notes: notes || null, amount, type, method, week };
          const { container, unmount } = render(<ExpenseList expenses={[expense]} onExpenseDeleted={vi.fn()} onExpenseUpdated={vi.fn()} onAddExpense={vi.fn()} people={[]} />);
          fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
          await waitFor(() => expect(container.querySelector('.modal-overlay')).toBeTruthy());
          const editModal = container.querySelector('.edit-modal');
          expect(editModal.querySelector('input[name="date"]').value).toBe(date);
          expect(parseFloat(editModal.querySelector('input[name="amount"]').value)).toBeCloseTo(amount, 2);
          await waitFor(() => expect(editModal.querySelector('select[name="type"]').value).toBe(type));
          expect(editModal.querySelector('select[name="method"]').value).toBe(method);
          expect(editModal.querySelector('input[name="place"]').value).toBe(place || '');
          expect(editModal.querySelector('textarea[name="notes"]').value).toBe(notes || '');
          unmount();
        }
      ), { numRuns: 100 }
    );
  });

  /** **Feature: expense-form-consolidation, Property 4** **Validates: Requirements 4.1, 4.2** */
  it('Property 4: Medical Expense Sections Visibility', async () => {
    const medicalPlaceArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9\s]+$/.test(s));
    const medicalPeopleArb = fc.array(fc.record({ id: fc.integer({ min: 1, max: 100 }), name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z\s]+$/.test(s)) }), { minLength: 1, maxLength: 5 });
    await fc.assert(
      fc.asyncProperty(validIdArb, validDateArb, medicalPlaceArb, validAmountArb, validMethodArb, validWeekArb, medicalPeopleArb,
        async (id, date, place, amount, method, week, people) => {
          const expense = { id, date, place, notes: null, amount, type: 'Tax - Medical', method, week };
          const { container, unmount } = render(<ExpenseList expenses={[expense]} onExpenseDeleted={vi.fn()} onExpenseUpdated={vi.fn()} onAddExpense={vi.fn()} people={people} />);
          await waitFor(() => expect(global.fetch).toHaveBeenCalled());
          fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
          await waitFor(() => expect(container.querySelector('.modal-overlay')).toBeTruthy());
          const editModal = container.querySelector('.edit-modal');
          expect(editModal.querySelector('.insurance-section')).toBeTruthy();
          expect(editModal.querySelector('.insurance-section input[type="checkbox"]')).toBeTruthy();
          expect(editModal.querySelector('select[name="people"]')).toBeTruthy();
          unmount();
        }
      ), { numRuns: 100 }
    );
  });

  /** **Feature: expense-form-consolidation, Property 5** **Validates: Requirements 4.3** */
  it('Property 5: Tax-Deductible Invoice Section Visibility', async () => {
    const taxDeductibleTypeArb = fc.constantFrom('Tax - Medical', 'Tax - Donation');
    const taxPlaceArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9\s]+$/.test(s));
    await fc.assert(
      fc.asyncProperty(validIdArb, validDateArb, taxPlaceArb, validAmountArb, taxDeductibleTypeArb, validMethodArb, validWeekArb,
        async (id, date, place, amount, type, method, week) => {
          const expense = { id, date, place, notes: null, amount, type, method, week };
          const { container, unmount } = render(<ExpenseList expenses={[expense]} onExpenseDeleted={vi.fn()} onExpenseUpdated={vi.fn()} onAddExpense={vi.fn()} people={[]} />);
          await waitFor(() => expect(global.fetch).toHaveBeenCalled());
          fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
          await waitFor(() => expect(container.querySelector('.modal-overlay')).toBeTruthy());
          const editModal = container.querySelector('.edit-modal');
          expect(editModal.querySelector('.invoice-section')).toBeTruthy();
          expect(editModal.querySelector('.invoice-section .invoice-upload-wrapper')).toBeTruthy();
          unmount();
        }
      ), { numRuns: 100 }
    );
  });

  /** **Feature: expense-form-consolidation, Property 6** **Validates: Requirements 4.4, 4.5, 4.6** */
  it('Property 6: General Form Features Availability', async () => {
    await fc.assert(
      fc.asyncProperty(validIdArb, validDateArb, validAmountArb, validTypeArb, validMethodArb, validWeekArb,
        async (id, date, amount, type, method, week) => {
          const expense = { id, date, place: 'Test Place', notes: null, amount, type, method, week };
          const { container, unmount } = render(<ExpenseList expenses={[expense]} onExpenseDeleted={vi.fn()} onExpenseUpdated={vi.fn()} onAddExpense={vi.fn()} people={[]} />);
          fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
          await waitFor(() => expect(container.querySelector('.modal-overlay')).toBeTruthy());
          const editModal = container.querySelector('.edit-modal');
          expect(editModal.querySelector('.future-months-section')).toBeTruthy();
          expect(editModal.querySelector('.future-months-section input[type="checkbox"]')).toBeTruthy();
          const typeSelect = editModal.querySelector('select[name="type"]');
          await waitFor(() => expect(typeSelect.querySelectorAll('option').length).toBe(CATEGORIES.length));
          const typeOptions = Array.from(typeSelect.querySelectorAll('option')).map(opt => opt.value);
          for (const category of CATEGORIES) expect(typeOptions).toContain(category);
          const methodSelect = editModal.querySelector('select[name="method"]');
          const methodOptions = Array.from(methodSelect.querySelectorAll('option')).map(opt => opt.value);
          for (const pm of PAYMENT_METHODS) expect(methodOptions).toContain(pm);
          unmount();
        }
      ), { numRuns: 100 }
    );
  });
});
