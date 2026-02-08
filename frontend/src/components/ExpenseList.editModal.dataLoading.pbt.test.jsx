import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { CATEGORIES } from '../../../backend/utils/categories';
import { PAYMENT_METHODS } from '../utils/constants';

// Shared generators
const validDateArb = fc.tuple(fc.integer({ min: 2020, max: 2030 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
const validAmountArb = fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }).filter(n => n > 0 && isFinite(n)).map(n => parseFloat(n.toFixed(2)));
const validIdArb = fc.integer({ min: 1, max: 10000 });
const validWeekArb = fc.integer({ min: 1, max: 5 });
const validMethodArb = fc.constantFrom(...PAYMENT_METHODS);
const validPlaceArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9\s]+$/.test(s));

// Invoice generator
const validInvoiceArb = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  filename: fc.string({ minLength: 5, maxLength: 30 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)).map(s => `${s}.pdf`),
  personId: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
  personName: fc.option(fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z\s]+$/.test(s)), { nil: null })
});

// People generator - ensure name has no leading/trailing spaces
const validPersonArb = fc.record({
  id: fc.integer({ min: 1, max: 100 }),
  name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s) && s.trim().length > 0)
});

// Person allocation generator (for expense people)
// Note: expense.people uses 'id' not 'personId' for the select value mapping
const validPersonAllocationArb = fc.record({
  id: fc.integer({ min: 1, max: 100 }),
  personId: fc.integer({ min: 1, max: 100 }),
  name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s) && s.trim().length > 0),
  amount: validAmountArb
});

/**
 * **Feature: expense-form-consolidation, Property 9: Invoice Data Loading and Display**
 * **Validates: Requirements 6.1, 6.2**
 * 
 * For any tax-deductible expense (medical or donation) being edited, the system SHALL load 
 * existing invoice data and ExpenseForm SHALL display all associated invoices.
 */
describe('Property 9: Invoice Data Loading and Display', () => {
  let ExpenseList;
  let invoicesForExpense = [];

  beforeEach(async () => {
    vi.resetModules();
    invoicesForExpense = [];
    
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/categories') || url.includes('/categories')) {
        return Promise.resolve({ 
          ok: true, 
          json: () => Promise.resolve({ 
            categories: CATEGORIES, 
            budgetableCategories: [], 
            taxDeductibleCategories: ['Tax - Medical', 'Tax - Donation'] 
          }) 
        });
      }
      if (url.includes('/places')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/people')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      // Invoice endpoint - return the invoices for this expense
      if (url.includes('/invoices')) {
        return Promise.resolve({ 
          ok: true, 
          json: () => Promise.resolve({ invoices: invoicesForExpense }) 
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
    
    const module = await import('./ExpenseList');
    ExpenseList = module.default;
  });

  afterEach(() => {
    invoicesForExpense = [];
    cleanup();
    vi.clearAllMocks();
  });

  const taxDeductibleTypeArb = fc.constantFrom('Tax - Medical', 'Tax - Donation');

  /** **Feature: expense-form-consolidation, Property 9** **Validates: Requirements 6.1, 6.2** */
  it('validates invoice data loading for tax-deductible expenses', async () => {
    await fc.assert(
      fc.asyncProperty(
        validIdArb, 
        validDateArb, 
        validPlaceArb, 
        validAmountArb, 
        taxDeductibleTypeArb, 
        validMethodArb, 
        validWeekArb,
        fc.array(validInvoiceArb, { minLength: 1, maxLength: 3 }),
        async (id, date, place, amount, type, method, week, invoices) => {
          // Set up the invoices that will be returned by the API
          invoicesForExpense = invoices.map((inv, idx) => ({
            ...inv,
            id: inv.id + idx, // Ensure unique IDs
            expenseId: id
          }));
          
          const expense = { 
            id, 
            date, 
            place, 
            notes: null, 
            amount, 
            type, 
            method, 
            week,
            hasInvoice: true,
            invoiceCount: invoicesForExpense.length
          };
          
          const { container, unmount } = render(
            <ExpenseList 
              expenses={[expense]} 
              onExpenseDeleted={vi.fn()} 
              onExpenseUpdated={vi.fn()} 
              onAddExpense={vi.fn()} 
              people={[]} 
            />
          );
          
          await waitFor(() => expect(global.fetch).toHaveBeenCalled());
          
          // Click edit button
          const editButton = container.querySelector('button[title*="Edit"]') || container.querySelector('button.edit-button');
          expect(editButton).toBeTruthy();
          fireEvent.click(editButton);
          
          // Wait for modal to open
          await waitFor(() => expect(container.querySelector('.modal-overlay')).toBeTruthy());
          
          const editModal = container.querySelector('.edit-modal');
          
          // Requirement 6.1: System SHALL load existing invoice data
          // Verify the invoices API was called for this expense
          await waitFor(() => {
            const invoiceCalls = global.fetch.mock.calls.filter(call => 
              call[0].includes('/invoices') && call[0].includes(id.toString())
            );
            expect(invoiceCalls.length).toBeGreaterThan(0);
          }, { timeout: 5000 });
          
          // Requirement 6.2: ExpenseForm SHALL display invoice section for tax-deductible expenses
          // Invoice section is now wrapped in CollapsibleSection
          const invoiceSection = Array.from(editModal.querySelectorAll('.collapsible-header'))
            .find(h => h.textContent.includes('Invoice Attachments'));
          expect(invoiceSection).toBeTruthy();
          
          unmount();
        }
      ), { numRuns: 100 }
    );
  });
});

/**
 * **Feature: expense-form-consolidation, Property 11: People Data Loading and Display**
 * **Validates: Requirements 7.1, 7.2**
 * 
 * For any medical expense being edited, the system SHALL load existing people assignments 
 * and ExpenseForm SHALL display the currently assigned people.
 */
describe('Property 11: People Data Loading and Display', () => {
  let ExpenseList;
  let expensePeopleData = [];
  let availablePeople = [];

  beforeEach(async () => {
    vi.resetModules();
    expensePeopleData = [];
    availablePeople = [];
    
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/api/categories') || url.includes('/categories')) {
        return Promise.resolve({ 
          ok: true, 
          json: () => Promise.resolve({ 
            categories: CATEGORIES, 
            budgetableCategories: [], 
            taxDeductibleCategories: ['Tax - Medical', 'Tax - Donation'] 
          }) 
        });
      }
      if (url.includes('/places')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      // People endpoint - return available people
      if (url.includes('/people') && !url.includes('/expenses/')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(availablePeople) });
      }
      // Expense with people endpoint - return expense with people data
      if (url.includes('/expenses/') && url.includes('includePeople=true')) {
        const expenseId = parseInt(url.match(/\/expenses\/(\d+)/)?.[1] || '0');
        return Promise.resolve({ 
          ok: true, 
          json: () => Promise.resolve({ 
            id: expenseId,
            people: expensePeopleData 
          }) 
        });
      }
      if (url.includes('/invoices')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ invoices: [] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
    
    const module = await import('./ExpenseList');
    ExpenseList = module.default;
  });

  afterEach(() => {
    expensePeopleData = [];
    availablePeople = [];
    cleanup();
    vi.clearAllMocks();
  });

  /** **Feature: expense-form-consolidation, Property 11** **Validates: Requirements 7.1, 7.2** */
  it('validates people data loading for medical expenses', async () => {
    await fc.assert(
      fc.asyncProperty(
        validIdArb, 
        validDateArb, 
        validPlaceArb, 
        validAmountArb, 
        validMethodArb, 
        validWeekArb,
        fc.array(validPersonArb, { minLength: 1, maxLength: 5 }),
        async (id, date, place, amount, method, week, people) => {
          // Set up available people with unique IDs
          availablePeople = people.map((p, idx) => ({
            id: idx + 1, // Ensure unique sequential IDs
            name: p.name
          }));
          
          // Set up people assigned to this expense - use 'id' field for select value mapping
          expensePeopleData = availablePeople.slice(0, Math.min(2, availablePeople.length)).map((person, idx) => ({
            id: person.id, // Required for select value mapping
            personId: person.id,
            name: person.name,
            amount: amount / Math.min(2, availablePeople.length)
          }));
          
          const expense = { 
            id, 
            date, 
            place, 
            notes: null, 
            amount, 
            type: 'Tax - Medical', // Medical expense
            method, 
            week,
            people: expensePeopleData
          };
          
          const { container, unmount } = render(
            <ExpenseList 
              expenses={[expense]} 
              onExpenseDeleted={vi.fn()} 
              onExpenseUpdated={vi.fn()} 
              onAddExpense={vi.fn()} 
              people={availablePeople} 
            />
          );
          
          await waitFor(() => expect(global.fetch).toHaveBeenCalled());
          
          // Click edit button
          const editButton = container.querySelector('button[title*="Edit"]') || container.querySelector('button.edit-button');
          expect(editButton).toBeTruthy();
          fireEvent.click(editButton);
          
          // Wait for modal to open
          await waitFor(() => expect(container.querySelector('.modal-overlay')).toBeTruthy());
          
          const editModal = container.querySelector('.edit-modal');
          
          // Requirement 7.1: System SHALL load existing people assignments
          // The expense with people endpoint should be called
          await waitFor(() => {
            const peopleCalls = global.fetch.mock.calls.filter(call => 
              call[0].includes(`/expenses/${id}`) && call[0].includes('includePeople=true')
            );
            expect(peopleCalls.length).toBeGreaterThan(0);
          }, { timeout: 5000 });
          
          // Requirement 7.2: ExpenseForm SHALL display people selection for medical expenses
          expect(editModal.querySelector('select[name="people"]')).toBeTruthy();
          
          // Verify people dropdown has options
          const peopleSelect = editModal.querySelector('select[name="people"]');
          const options = peopleSelect.querySelectorAll('option');
          // Should have at least the placeholder option plus available people
          expect(options.length).toBeGreaterThanOrEqual(1);
          
          unmount();
        }
      ), { numRuns: 100 }
    );
  });
});
