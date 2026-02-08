import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';
import ExpenseForm from './ExpenseForm';

// Mock fetch globally
global.fetch = vi.fn();

const MOCK_PAYMENT_METHODS = [
  { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
  { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 },
  { id: 3, display_name: 'VISA', type: 'credit_card', is_active: 1 },
];

vi.mock('../services/paymentMethodApi', () => ({
  getActivePaymentMethods: vi.fn(() => Promise.resolve([
    { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
    { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 },
    { id: 3, display_name: 'VISA', type: 'credit_card', is_active: 1 },
  ])),
  getPaymentMethod: vi.fn(() => Promise.resolve(null)),
  getPaymentMethods: vi.fn(() => Promise.resolve([
    { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
    { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 },
    { id: 3, display_name: 'VISA', type: 'credit_card', is_active: 1 },
  ])),
}));

vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

Element.prototype.scrollIntoView = vi.fn();

import { CATEGORIES } from '../../../backend/utils/categories';

const createMockFetch = () => (url) => {
  if (url.includes('/api/categories') || url.includes('/categories')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ categories: CATEGORIES, budgetableCategories: [], taxDeductibleCategories: [] }) });
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
  if (url.includes('/invoices')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
};

function findSectionBadge(container, sectionTitle) {
  const headers = container.querySelectorAll('.collapsible-header');
  for (const header of headers) {
    const title = header.querySelector('.collapsible-title');
    if (title && title.textContent.includes(sectionTitle)) {
      return header.querySelector('.collapsible-badge');
    }
  }
  return null;
}

describe('ExpenseForm Badge Display - Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(async () => {
    await act(async () => { await new Promise(r => setTimeout(r, 100)); });
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * **Feature: expense-form-simplification, Property 5: Badge display for data presence**
   *
   * For any collapsible section, if the section contains non-empty data values,
   * a badge should be visible on the section header indicating the data presence.
   * **Validates: Requirements 1.5, 2.2, 5.2, 6.2, 8.2**
   */
  it('Property 5: badges display correctly for edit mode expenses with data', async () => {
    // Generate expenses with various data combinations for edit mode
    const expenseArb = fc.record({
      id: fc.integer({ min: 1, max: 1000 }),
      date: fc.constant('2025-03-15'),
      place: fc.constant('Test Place'),
      amount: fc.constant(30), // Fixed amount for predictable badge calculation
      type: fc.constantFrom('Other', 'Groceries', 'Gas'),
      payment_method_id: fc.constantFrom(1, 2, 3),
      notes: fc.constant(''),
      // Advanced Options data - futureMonths is always 0 in edit mode (creation-time only)
      future_months: fc.constant(0),
      posted_date: fc.constantFrom(null, '2025-03-17'),
      // Reimbursement data (for non-medical) - always > amount when present
      original_cost: fc.oneof(fc.constant(null), fc.constant(100)),
      insurance_eligible: fc.constant(0),
      people: fc.constant([]),
      invoices: fc.constant([]),
    });

    await fc.assert(
      fc.asyncProperty(expenseArb, async (expense) => {
        sessionStorage.clear();
        cleanup(); // Ensure clean DOM between iterations
        global.fetch.mockImplementation(createMockFetch());

        const { container, unmount } = render(
          <ExpenseForm onExpenseAdded={vi.fn()} expense={expense} people={[]} />
        );

        await waitFor(() => {
          expect(container.querySelector('#type')).toBeTruthy();
          const pmSelect = container.querySelector('#payment_method_id');
          expect(pmSelect).toBeTruthy();
          expect(pmSelect.querySelectorAll('option').length).toBeGreaterThan(1);
        });

        // Check Advanced Options badge
        // Note: futureMonths state is always 0 in edit mode (it's a creation-time parameter)
        // So only posted_date contributes to the badge in edit mode
        const advBadge = findSectionBadge(container, 'Advanced Options');
        const isCreditCard = MOCK_PAYMENT_METHODS.find(m => m.id === expense.payment_method_id)?.type === 'credit_card';
        const hasPostedDate = isCreditCard && !!expense.posted_date;

        if (hasPostedDate) {
          expect(advBadge).toBeTruthy();
          expect(advBadge.textContent).toContain('Posted:');
        } else {
          // Badge element should not exist when no data
          expect(advBadge).toBeFalsy();
        }

        // Check Reimbursement badge (non-medical only)
        // Badge shows when original_cost > amount
        const reimbBadge = findSectionBadge(container, 'Reimbursement');
        if (expense.original_cost !== null && expense.original_cost > expense.amount) {
          expect(reimbBadge).toBeTruthy();
          expect(reimbBadge.textContent).toContain('Reimbursed:');
        } else {
          expect(reimbBadge).toBeFalsy();
        }

        await act(async () => { await new Promise(r => setTimeout(r, 50)); });
        unmount();
        sessionStorage.clear();
      }),
      { numRuns: 100 }
    );
  });

  it('Property 5: insurance and people badges display for medical expenses in edit mode', async () => {
    const medicalExpenseArb = fc.record({
      id: fc.integer({ min: 1, max: 1000 }),
      date: fc.constant('2025-03-15'),
      place: fc.constant('Clinic'),
      amount: fc.integer({ min: 10, max: 500 }),
      type: fc.constant('Tax - Medical'),
      payment_method_id: fc.constant(1),
      notes: fc.constant(''),
      future_months: fc.constant(0),
      posted_date: fc.constant(null),
      original_cost: fc.constant(null),
      // Insurance data
      insurance_eligible: fc.constantFrom(0, 1),
      claim_status: fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied'),
      // People data
      people: fc.oneof(
        fc.constant([]),
        fc.constant([{ id: 1, name: 'John', allocation_amount: 100 }]),
        fc.constant([
          { id: 1, name: 'John', allocation_amount: 50 },
          { id: 2, name: 'Jane', allocation_amount: 50 },
        ])
      ),
      invoices: fc.oneof(
        fc.constant([]),
        fc.constant([{ id: 1, filename: 'receipt.pdf', person_id: null }]),
        fc.constant([
          { id: 1, filename: 'receipt1.pdf', person_id: null },
          { id: 2, filename: 'receipt2.pdf', person_id: 1 },
        ])
      ),
    });

    await fc.assert(
      fc.asyncProperty(medicalExpenseArb, async (expense) => {
        sessionStorage.clear();
        cleanup(); // Ensure clean DOM between iterations
        global.fetch.mockImplementation((url) => {
          if (url.includes('/invoices')) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve(expense.invoices) });
          }
          return createMockFetch()(url);
        });

        const mockPeople = [
          { id: 1, name: 'John', dateOfBirth: '1990-01-01' },
          { id: 2, name: 'Jane', dateOfBirth: '1985-05-15' },
        ];

        const { container, unmount } = render(
          <ExpenseForm onExpenseAdded={vi.fn()} expense={expense} people={mockPeople} />
        );

        await waitFor(() => {
          expect(container.querySelector('#type')).toBeTruthy();
          const pmSelect = container.querySelector('#payment_method_id');
          expect(pmSelect).toBeTruthy();
          expect(pmSelect.querySelectorAll('option').length).toBeGreaterThan(1);
        });

        // Check Insurance badge
        const insuranceBadge = findSectionBadge(container, 'Insurance Tracking');
        if (expense.insurance_eligible === 1) {
          expect(insuranceBadge).toBeTruthy();
          expect(insuranceBadge.textContent).toContain('Claim:');
        } else {
          if (insuranceBadge) {
            expect(insuranceBadge.textContent).toBe('');
          }
        }

        // Check People badge
        const peopleBadge = findSectionBadge(container, 'People Assignment');
        if (expense.people.length > 0) {
          expect(peopleBadge).toBeTruthy();
          if (expense.people.length === 1) {
            expect(peopleBadge.textContent).toContain('1 person');
          } else {
            expect(peopleBadge.textContent).toContain(`${expense.people.length} people`);
          }
        } else {
          if (peopleBadge) {
            expect(peopleBadge.textContent).toBe('');
          }
        }

        // Check Invoice badge
        const invoiceBadge = findSectionBadge(container, 'Invoice Attachments');
        if (expense.invoices.length > 0) {
          // Wait for invoices to load
          await waitFor(() => {
            const badge = findSectionBadge(container, 'Invoice Attachments');
            if (badge) {
              expect(badge.textContent).toContain('invoice');
            }
          });
        }

        await act(async () => { await new Promise(r => setTimeout(r, 50)); });
        unmount();
        sessionStorage.clear();
      }),
      { numRuns: 100 }
    );
  });
});
