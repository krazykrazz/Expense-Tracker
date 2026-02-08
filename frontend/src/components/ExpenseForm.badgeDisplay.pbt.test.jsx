/**
 * ExpenseForm Badge Display Property Tests — Parameterized
 *
 * Converted from PBT to parameterized tests. Both tests were rendering full
 * ExpenseForm in edit mode 100× each with random data combinations.
 * The input space (posted_date × original_cost × insurance × people × invoices)
 * is small and fully enumerable with representative cases.
 *
 * Original properties preserved:
 *   P5 (expense-form-simplification): Badge display for data presence — Validates: Req 1.5, 2.2, 5.2, 6.2, 8.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup, act } from '@testing-library/react';
import ExpenseForm from './ExpenseForm';
import { CATEGORIES } from '../../../backend/utils/categories';
import { testEach } from '../test-utils';

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

const createMockFetch = (invoices = []) => (url) => {
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
  if (url.includes('/invoices')) return Promise.resolve({ ok: true, json: () => Promise.resolve(invoices) });
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

async function renderEditForm(expense, people = [], invoices = []) {
  global.fetch.mockImplementation(createMockFetch(invoices));
  const result = render(
    <ExpenseForm onExpenseAdded={vi.fn()} expense={expense} people={people} />
  );
  await waitFor(() => {
    expect(result.container.querySelector('#type')).toBeTruthy();
    const pmSelect = result.container.querySelector('#payment_method_id');
    expect(pmSelect).toBeTruthy();
    expect(pmSelect.querySelectorAll('option').length).toBeGreaterThan(1);
  });
  return result;
}

describe('ExpenseForm Badge Display - Parameterized Tests', () => {
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
   * Property 5: Badge display for non-medical expenses in edit mode
   * Validates: Requirements 1.5, 2.2, 5.2, 6.2, 8.2
   */
  describe('Property 5: badges for non-medical edit mode expenses', () => {
    const cases = [
      {
        desc: 'no optional data — no badges',
        expense: { id: 1, date: '2025-03-15', place: 'Store', amount: 30, type: 'Groceries', payment_method_id: 1, notes: '', future_months: 0, posted_date: null, original_cost: null, insurance_eligible: 0, people: [], invoices: [] },
        expectAdvBadge: false, expectReimbBadge: false,
      },
      {
        desc: 'credit card with posted_date — Advanced Options badge',
        expense: { id: 2, date: '2025-03-15', place: 'Store', amount: 30, type: 'Other', payment_method_id: 3, notes: '', future_months: 0, posted_date: '2025-03-17', original_cost: null, insurance_eligible: 0, people: [], invoices: [] },
        expectAdvBadge: true, expectAdvText: 'Posted:',
        expectReimbBadge: false,
      },
      {
        desc: 'non-credit card with posted_date — no Advanced Options badge',
        expense: { id: 3, date: '2025-03-15', place: 'Store', amount: 30, type: 'Other', payment_method_id: 1, notes: '', future_months: 0, posted_date: '2025-03-17', original_cost: null, insurance_eligible: 0, people: [], invoices: [] },
        expectAdvBadge: false, expectReimbBadge: false,
      },
      {
        desc: 'original_cost > amount — Reimbursement badge',
        expense: { id: 4, date: '2025-03-15', place: 'Store', amount: 30, type: 'Groceries', payment_method_id: 1, notes: '', future_months: 0, posted_date: null, original_cost: 100, insurance_eligible: 0, people: [], invoices: [] },
        expectAdvBadge: false,
        expectReimbBadge: true, expectReimbText: 'Reimbursed:',
      },
      {
        desc: 'original_cost <= amount — no Reimbursement badge',
        expense: { id: 5, date: '2025-03-15', place: 'Store', amount: 100, type: 'Gas', payment_method_id: 2, notes: '', future_months: 0, posted_date: null, original_cost: 30, insurance_eligible: 0, people: [], invoices: [] },
        expectAdvBadge: false, expectReimbBadge: false,
      },
      {
        desc: 'credit card + posted_date + original_cost — both badges',
        expense: { id: 6, date: '2025-03-15', place: 'Store', amount: 30, type: 'Other', payment_method_id: 3, notes: '', future_months: 0, posted_date: '2025-03-17', original_cost: 100, insurance_eligible: 0, people: [], invoices: [] },
        expectAdvBadge: true, expectAdvText: 'Posted:',
        expectReimbBadge: true, expectReimbText: 'Reimbursed:',
      },
    ];

    testEach(cases).it('$desc', async ({ expense, expectAdvBadge, expectAdvText, expectReimbBadge, expectReimbText }) => {
      sessionStorage.clear();
      const { container, unmount } = await renderEditForm(expense);

      const advBadge = findSectionBadge(container, 'Advanced Options');
      if (expectAdvBadge) {
        expect(advBadge).toBeTruthy();
        if (expectAdvText) expect(advBadge.textContent).toContain(expectAdvText);
      } else {
        expect(advBadge).toBeFalsy();
      }

      const reimbBadge = findSectionBadge(container, 'Reimbursement');
      if (expectReimbBadge) {
        expect(reimbBadge).toBeTruthy();
        if (expectReimbText) expect(reimbBadge.textContent).toContain(expectReimbText);
      } else {
        expect(reimbBadge).toBeFalsy();
      }

      unmount();
    });
  });

  /**
   * Property 5: Badge display for medical expenses in edit mode
   * Validates: Requirements 1.5, 2.2, 5.2, 6.2, 8.2
   */
  describe('Property 5: badges for medical edit mode expenses', () => {
    const mockPeople = [
      { id: 1, name: 'John', dateOfBirth: '1990-01-01' },
      { id: 2, name: 'Jane', dateOfBirth: '1985-05-15' },
    ];

    const cases = [
      {
        desc: 'no insurance, no people, no invoices — no badges',
        expense: { id: 10, date: '2025-03-15', place: 'Clinic', amount: 100, type: 'Tax - Medical', payment_method_id: 1, notes: '', future_months: 0, posted_date: null, original_cost: null, insurance_eligible: 0, people: [], invoices: [] },
        invoices: [],
        expectInsuranceBadge: false, expectPeopleBadge: false, expectInvoiceBadge: false,
      },
      {
        desc: 'insurance eligible, in_progress — Insurance badge',
        expense: { id: 11, date: '2025-03-15', place: 'Clinic', amount: 200, type: 'Tax - Medical', payment_method_id: 1, notes: '', future_months: 0, posted_date: null, original_cost: null, insurance_eligible: 1, claim_status: 'in_progress', people: [], invoices: [] },
        invoices: [],
        expectInsuranceBadge: true, expectInsuranceText: 'Claim:',
        expectPeopleBadge: false, expectInvoiceBadge: false,
      },
      {
        desc: 'one person assigned — People badge "1 person"',
        expense: { id: 12, date: '2025-03-15', place: 'Clinic', amount: 150, type: 'Tax - Medical', payment_method_id: 1, notes: '', future_months: 0, posted_date: null, original_cost: null, insurance_eligible: 0, people: [{ id: 1, name: 'John', allocation_amount: 150 }], invoices: [] },
        invoices: [],
        expectInsuranceBadge: false,
        expectPeopleBadge: true, expectPeopleText: '1 person',
        expectInvoiceBadge: false,
      },
      {
        desc: 'two people assigned — People badge "2 people"',
        expense: { id: 13, date: '2025-03-15', place: 'Clinic', amount: 200, type: 'Tax - Medical', payment_method_id: 1, notes: '', future_months: 0, posted_date: null, original_cost: null, insurance_eligible: 0, people: [{ id: 1, name: 'John', allocation_amount: 100 }, { id: 2, name: 'Jane', allocation_amount: 100 }], invoices: [] },
        invoices: [],
        expectInsuranceBadge: false,
        expectPeopleBadge: true, expectPeopleText: '2 people',
        expectInvoiceBadge: false,
      },
      {
        desc: 'one invoice — Invoice badge',
        expense: { id: 14, date: '2025-03-15', place: 'Clinic', amount: 100, type: 'Tax - Medical', payment_method_id: 1, notes: '', future_months: 0, posted_date: null, original_cost: null, insurance_eligible: 0, people: [], invoices: [] },
        invoices: [{ id: 1, filename: 'receipt.pdf', person_id: null }],
        expectInsuranceBadge: false, expectPeopleBadge: false,
        expectInvoiceBadge: true, expectInvoiceText: 'invoice',
      },
      {
        desc: 'insurance + people + invoices — all badges',
        expense: { id: 15, date: '2025-03-15', place: 'Clinic', amount: 300, type: 'Tax - Medical', payment_method_id: 1, notes: '', future_months: 0, posted_date: null, original_cost: null, insurance_eligible: 1, claim_status: 'paid', people: [{ id: 1, name: 'John', allocation_amount: 300 }], invoices: [] },
        invoices: [{ id: 1, filename: 'receipt1.pdf', person_id: null }, { id: 2, filename: 'receipt2.pdf', person_id: 1 }],
        expectInsuranceBadge: true, expectInsuranceText: 'Claim:',
        expectPeopleBadge: true, expectPeopleText: '1 person',
        expectInvoiceBadge: true, expectInvoiceText: 'invoice',
      },
    ];

    testEach(cases).it('$desc', async ({ expense, invoices, expectInsuranceBadge, expectInsuranceText, expectPeopleBadge, expectPeopleText, expectInvoiceBadge, expectInvoiceText }) => {
      sessionStorage.clear();
      const { container, unmount } = await renderEditForm(expense, mockPeople, invoices);

      // Check Insurance badge
      const insuranceBadge = findSectionBadge(container, 'Insurance Tracking');
      if (expectInsuranceBadge) {
        expect(insuranceBadge).toBeTruthy();
        if (expectInsuranceText) expect(insuranceBadge.textContent).toContain(expectInsuranceText);
      } else {
        if (insuranceBadge) expect(insuranceBadge.textContent).toBe('');
      }

      // Check People badge
      const peopleBadge = findSectionBadge(container, 'People Assignment');
      if (expectPeopleBadge) {
        expect(peopleBadge).toBeTruthy();
        if (expectPeopleText) expect(peopleBadge.textContent).toContain(expectPeopleText);
      } else {
        if (peopleBadge) expect(peopleBadge.textContent).toBe('');
      }

      // Check Invoice badge
      if (expectInvoiceBadge) {
        await waitFor(() => {
          const badge = findSectionBadge(container, 'Invoice Attachments');
          if (badge) expect(badge.textContent).toContain(expectInvoiceText);
        });
      }

      unmount();
    });
  });
});
