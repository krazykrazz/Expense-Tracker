import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import {
  createExpenseApiMock,
  createPaymentMethodApiMock,
  createPeopleApiMock,
  createCategorySuggestionApiMock,
  createCategoriesApiMock,
  createInvoiceApiMock
} from '../test-utils';

// Mock ALL dependencies
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    CATEGORIES: '/api/categories',
    EXPENSES: '/api/expenses',
    PEOPLE: '/api/people',
    SUGGEST_CATEGORY: '/api/expenses/suggest-category',
    INVOICE_UPLOAD: '/api/invoices/upload',
    INVOICE_FILE: (expenseId, invoiceId) => `/api/invoices/${expenseId}/${invoiceId}/file`
  },
  default: 'http://localhost:2424'
}));

import * as peopleApi from '../services/peopleApi';
import * as expenseApi from '../services/expenseApi';
import * as categorySuggestionApi from '../services/categorySuggestionApi';
import * as categoriesApi from '../services/categoriesApi';
import * as paymentMethodApi from '../services/paymentMethodApi';
import * as invoiceApi from '../services/invoiceApi';

vi.mock('../services/peopleApi', () => ({ getPeople: vi.fn() }));
vi.mock('../services/expenseApi', () => ({
  createExpense: vi.fn(),
  getExpenses: vi.fn(),
  getPlaces: vi.fn(),
  updateExpense: vi.fn(),
  getExpenseWithPeople: vi.fn()
}));
vi.mock('../services/categorySuggestionApi', () => ({ fetchCategorySuggestion: vi.fn() }));
vi.mock('../services/categoriesApi', () => ({ getCategories: vi.fn() }));
vi.mock('../services/paymentMethodApi', () => ({
  getActivePaymentMethods: vi.fn(),
  getPaymentMethod: vi.fn()
}));
vi.mock('../services/invoiceApi', () => ({
  getInvoicesForExpense: vi.fn(),
  updateInvoicePersonLink: vi.fn()
}));
vi.mock('../utils/formatters', () => ({ getTodayLocalDate: () => '2025-01-15' }));
vi.mock('../utils/constants', () => ({ PAYMENT_METHODS: ['Cash', 'Credit Card', 'Debit Card'] }));

vi.mock('./PersonAllocationModal', () => ({
  default: ({ isOpen, onSave, onCancel, selectedPeople }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="person-allocation-modal">
        <button onClick={() => onSave(selectedPeople.map(p => ({ ...p, amount: 100 })))}>Save</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  }
}));

vi.mock('./InvoiceUpload', () => ({
  default: ({ expenseId }) => (
    <div data-testid="invoice-upload">
      <span data-testid="expense-id">{expenseId}</span>
    </div>
  )
}));

vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

Element.prototype.scrollIntoView = vi.fn();

vi.mock('../contexts/ModalContext', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useModalContext: () => ({ openFinancialOverview: vi.fn() }),
  };
});

import ExpenseForm from './ExpenseForm';

global.fetch = vi.fn();

const mockCategories = ['Other', 'Groceries', 'Gas', 'Dining Out', 'Tax - Medical', 'Tax - Donation'];
const mockPaymentMethods = [
  { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
  { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 },
  { id: 3, display_name: 'VISA', type: 'credit_card', is_active: 1 },
];
const mockPeople = [
  { id: 1, name: 'John Doe', dateOfBirth: '1990-01-01' },
  { id: 2, name: 'Jane Smith', dateOfBirth: '1985-05-15' },
];

function setupMocks() {
  categoriesApi.getCategories.mockResolvedValue(mockCategories);
  expenseApi.getPlaces.mockResolvedValue([]);
  peopleApi.getPeople.mockResolvedValue(mockPeople);
  paymentMethodApi.getActivePaymentMethods.mockResolvedValue(mockPaymentMethods);
  paymentMethodApi.getPaymentMethod.mockResolvedValue(null);
  categorySuggestionApi.fetchCategorySuggestion.mockResolvedValue({ category: null });
  invoiceApi.getInvoicesForExpense.mockResolvedValue([]);
  expenseApi.createExpense.mockResolvedValue({ id: 1, type: 'Other' });
  expenseApi.updateExpense.mockResolvedValue({ id: 1, type: 'Other' });

  global.fetch.mockImplementation((url) => {
    if (url.includes('/api/categories')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ categories: mockCategories, budgetableCategories: [], taxDeductibleCategories: [] }) });
    }
    if (url.includes('/places')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    if (url.includes('/people')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPeople) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
}

async function waitForFormReady(container) {
  await waitFor(() => {
    expect(container.querySelector('#type')).toBeInTheDocument();
    expect(container.querySelector('#payment_method_id')).toBeInTheDocument();
    const opts = container.querySelector('#payment_method_id').querySelectorAll('option');
    expect(opts.length).toBeGreaterThan(1);
  });
}

function findSectionHeader(container, title) {
  return Array.from(container.querySelectorAll('.collapsible-header'))
    .find(h => h.textContent.includes(title));
}

describe('ExpenseForm Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    setupMocks();
  });

  afterEach(async () => {
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * Integration: Create expense with various section combinations
   * Requirements: 1.1, 1.4
   */
  describe('Create mode with section combinations', () => {
    it('should create expense with Advanced Options expanded and data entered', async () => {
      const onExpenseAdded = vi.fn();
      expenseApi.createExpense.mockResolvedValue({ id: 1, type: 'Other' });

      const { container } = render(<ExpenseForm onExpenseAdded={onExpenseAdded} />);
      await waitForFormReady(container);

      // Fill core fields
      await act(async () => {
        fireEvent.change(container.querySelector('#date'), { target: { value: '2025-03-10' } });
        fireEvent.change(container.querySelector('#amount'), { target: { value: '50.00' } });
        fireEvent.change(container.querySelector('#type'), { target: { value: 'Other' } });
        fireEvent.change(container.querySelector('#payment_method_id'), { target: { value: '3' } }); // VISA (credit card)
      });

      // Expand Advanced Options and enter posted date
      const advHeader = findSectionHeader(container, 'Advanced Options');
      expect(advHeader).toBeTruthy();
      await act(async () => { fireEvent.click(advHeader); });

      await waitFor(() => {
        expect(container.querySelector('#posted_date')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.change(container.querySelector('#posted_date'), { target: { value: '2025-03-12' } });
      });

      // Submit
      await act(async () => {
        fireEvent.submit(container.querySelector('form'));
      });

      await waitFor(() => {
        expect(expenseApi.createExpense).toHaveBeenCalledWith(
          expect.objectContaining({ posted_date: '2025-03-12' }),
          null,
          0
        );
      });
    });

    it('should create non-medical expense with Reimbursement section data', async () => {
      const onExpenseAdded = vi.fn();
      expenseApi.createExpense.mockResolvedValue({ id: 2, type: 'Groceries' });

      const { container } = render(<ExpenseForm onExpenseAdded={onExpenseAdded} />);
      await waitForFormReady(container);

      // Fill core fields
      await act(async () => {
        fireEvent.change(container.querySelector('#date'), { target: { value: '2025-03-10' } });
        fireEvent.change(container.querySelector('#amount'), { target: { value: '30.00' } });
        fireEvent.change(container.querySelector('#type'), { target: { value: 'Groceries' } });
        fireEvent.change(container.querySelector('#payment_method_id'), { target: { value: '1' } });
      });

      // Expand Reimbursement section
      const reimbHeader = findSectionHeader(container, 'Reimbursement');
      expect(reimbHeader).toBeTruthy();
      await act(async () => { fireEvent.click(reimbHeader); });

      await waitFor(() => {
        expect(container.querySelector('#genericOriginalCost')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.change(container.querySelector('#genericOriginalCost'), { target: { value: '50.00' } });
      });

      // Submit
      await act(async () => {
        fireEvent.submit(container.querySelector('form'));
      });

      await waitFor(() => {
        expect(expenseApi.createExpense).toHaveBeenCalledWith(
          expect.objectContaining({ original_cost: 50 }),
          null,
          0
        );
      });
    });

    it('should create medical expense with Insurance and People sections', async () => {
      const onExpenseAdded = vi.fn();
      expenseApi.createExpense.mockResolvedValue({ id: 3, type: 'Tax - Medical' });

      const { container } = render(<ExpenseForm onExpenseAdded={onExpenseAdded} people={mockPeople} />);
      await waitForFormReady(container);

      // Fill core fields for medical expense
      await act(async () => {
        fireEvent.change(container.querySelector('#date'), { target: { value: '2025-03-10' } });
        fireEvent.change(container.querySelector('#amount'), { target: { value: '200.00' } });
        fireEvent.change(container.querySelector('#type'), { target: { value: 'Tax - Medical' } });
        fireEvent.change(container.querySelector('#payment_method_id'), { target: { value: '1' } });
      });

      // Verify medical-specific sections appear
      await waitFor(() => {
        expect(findSectionHeader(container, 'Insurance Tracking')).toBeTruthy();
        expect(findSectionHeader(container, 'People Assignment')).toBeTruthy();
        expect(findSectionHeader(container, 'Invoice Attachments')).toBeTruthy();
      });

      // Insurance section auto-expands for medical in create mode — find and click the checkbox
      const insuranceHeader = findSectionHeader(container, 'Insurance Tracking');
      // If collapsed, expand it
      if (insuranceHeader.getAttribute('aria-expanded') === 'false') {
        await act(async () => { fireEvent.click(insuranceHeader); });
      }

      await waitFor(() => {
        expect(container.querySelector('.insurance-checkbox input[type="checkbox"]')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(container.querySelector('.insurance-checkbox input[type="checkbox"]'));
      });

      await waitFor(() => {
        expect(container.querySelector('#originalCost')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.change(container.querySelector('#originalCost'), { target: { value: '300.00' } });
        fireEvent.change(container.querySelector('#claimStatus'), { target: { value: 'in_progress' } });
      });

      // Expand People section and select one person
      const peopleHeader = findSectionHeader(container, 'People Assignment');
      await act(async () => { fireEvent.click(peopleHeader); });

      await waitFor(() => {
        expect(container.querySelector('#people')).toBeInTheDocument();
      });

      const peopleSelect = container.querySelector('#people');
      const options = peopleSelect.querySelectorAll('option');
      // Select first person
      if (options.length > 1) {
        options[1].selected = true;
        await act(async () => { fireEvent.change(peopleSelect); });
      }

      // Submit
      await act(async () => {
        fireEvent.submit(container.querySelector('form'));
      });

      await waitFor(() => {
        expect(expenseApi.createExpense).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'Tax - Medical',
            insurance_eligible: true,
            claim_status: 'in_progress',
            original_cost: 300
          }),
          expect.any(Array),
          0
        );
      });
    });
  });

  /**
   * Integration: Edit expense with existing data in multiple sections
   * Requirements: 1.2
   */
  describe('Edit mode with existing data', () => {
    it('should expand sections with data when editing an expense', async () => {
      const existingExpense = {
        id: 10,
        date: '2025-02-20',
        place: 'Pharmacy',
        amount: 75,
        type: 'Tax - Medical',
        payment_method_id: 1,
        notes: 'Prescription',
        insurance_eligible: 1,
        claim_status: 'in_progress',
        original_cost: 150,
        people: [{ id: 1, name: 'John Doe', allocation_amount: 75 }],
        invoices: []
      };

      invoiceApi.getInvoicesForExpense.mockResolvedValue([]);

      const { container } = render(
        <ExpenseForm onExpenseAdded={vi.fn()} expense={existingExpense} people={mockPeople} />
      );
      await waitForFormReady(container);

      // Insurance section should be expanded (insurance_eligible = 1)
      const insuranceHeader = findSectionHeader(container, 'Insurance Tracking');
      expect(insuranceHeader).toBeTruthy();
      expect(insuranceHeader.getAttribute('aria-expanded')).toBe('true');

      // People section should be expanded (has people)
      const peopleHeader = findSectionHeader(container, 'People Assignment');
      expect(peopleHeader).toBeTruthy();
      expect(peopleHeader.getAttribute('aria-expanded')).toBe('true');

      // Advanced Options should be collapsed (no future_months or posted_date)
      const advHeader = findSectionHeader(container, 'Advanced Options');
      expect(advHeader).toBeTruthy();
      expect(advHeader.getAttribute('aria-expanded')).toBe('false');
    });

    it('should expand Advanced Options when editing expense with posted_date', async () => {
      const existingExpense = {
        id: 11,
        date: '2025-02-20',
        place: 'Store',
        amount: 50,
        type: 'Other',
        payment_method_id: 3, // credit card
        notes: '',
        posted_date: '2025-02-22',
        insurance_eligible: 0,
        people: [],
        invoices: []
      };

      const { container } = render(
        <ExpenseForm onExpenseAdded={vi.fn()} expense={existingExpense} />
      );
      await waitForFormReady(container);

      const advHeader = findSectionHeader(container, 'Advanced Options');
      expect(advHeader).toBeTruthy();
      expect(advHeader.getAttribute('aria-expanded')).toBe('true');
    });
  });

  /**
   * Integration: Form submission with collapsed sections preserves data
   * Requirements: 1.4
   */
  describe('Submission with collapsed sections', () => {
    it('should include data from collapsed sections in submission', async () => {
      const onExpenseAdded = vi.fn();
      expenseApi.createExpense.mockResolvedValue({ id: 5, type: 'Other' });

      const { container } = render(<ExpenseForm onExpenseAdded={onExpenseAdded} />);
      await waitForFormReady(container);

      // Fill core fields with credit card
      await act(async () => {
        fireEvent.change(container.querySelector('#date'), { target: { value: '2025-04-01' } });
        fireEvent.change(container.querySelector('#amount'), { target: { value: '100.00' } });
        fireEvent.change(container.querySelector('#type'), { target: { value: 'Other' } });
        fireEvent.change(container.querySelector('#payment_method_id'), { target: { value: '3' } });
      });

      // Expand Advanced Options, enter posted date
      const advHeader = findSectionHeader(container, 'Advanced Options');
      await act(async () => { fireEvent.click(advHeader); });
      await waitFor(() => { expect(container.querySelector('#posted_date')).toBeInTheDocument(); });
      await act(async () => {
        fireEvent.change(container.querySelector('#posted_date'), { target: { value: '2025-04-03' } });
      });

      // Collapse the section
      await act(async () => { fireEvent.click(advHeader); });
      await waitFor(() => { expect(container.querySelector('#posted_date')).not.toBeInTheDocument(); });

      // Expand Reimbursement, enter data
      const reimbHeader = findSectionHeader(container, 'Reimbursement');
      await act(async () => { fireEvent.click(reimbHeader); });
      await waitFor(() => { expect(container.querySelector('#genericOriginalCost')).toBeInTheDocument(); });
      await act(async () => {
        fireEvent.change(container.querySelector('#genericOriginalCost'), { target: { value: '150.00' } });
      });

      // Collapse Reimbursement
      await act(async () => { fireEvent.click(reimbHeader); });
      await waitFor(() => { expect(container.querySelector('#genericOriginalCost')).not.toBeInTheDocument(); });

      // Submit with both sections collapsed
      await act(async () => {
        fireEvent.submit(container.querySelector('form'));
      });

      await waitFor(() => {
        expect(expenseApi.createExpense).toHaveBeenCalledWith(
          expect.objectContaining({
            posted_date: '2025-04-03',
            original_cost: 150
          }),
          null,
          0
        );
      });
    });
  });

  /**
   * Integration: Validation errors across multiple sections
   * Requirements: 2.4
   */
  describe('Validation errors across sections', () => {
    it('should auto-expand section with validation error on submit', async () => {
      const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);
      await waitForFormReady(container);

      // Select credit card and enter a posted date before the expense date
      await act(async () => {
        fireEvent.change(container.querySelector('#date'), { target: { value: '2025-05-15' } });
        fireEvent.change(container.querySelector('#amount'), { target: { value: '50.00' } });
        fireEvent.change(container.querySelector('#type'), { target: { value: 'Other' } });
        fireEvent.change(container.querySelector('#payment_method_id'), { target: { value: '3' } }); // credit card
      });

      // Expand Advanced Options and enter invalid posted date (before expense date)
      const advHeader = findSectionHeader(container, 'Advanced Options');
      await act(async () => { fireEvent.click(advHeader); });
      await waitFor(() => { expect(container.querySelector('#posted_date')).toBeInTheDocument(); });
      await act(async () => {
        fireEvent.change(container.querySelector('#posted_date'), { target: { value: '2025-04-01' } });
      });

      // Collapse the section
      await act(async () => { fireEvent.click(advHeader); });
      await waitFor(() => { expect(advHeader.getAttribute('aria-expanded')).toBe('false'); });

      // Submit - should trigger validation error and auto-expand
      await act(async () => {
        fireEvent.submit(container.querySelector('form'));
      });

      // The section should auto-expand due to validation error
      await waitFor(() => {
        expect(advHeader.getAttribute('aria-expanded')).toBe('true');
      });
    });
  });

  /**
   * Integration: Expense type switching with data in sections
   * Requirements: 1.1, 1.2
   */
  describe('Expense type switching', () => {
    it('should show/hide sections when switching between medical and non-medical types', async () => {
      const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} people={mockPeople} />);
      await waitForFormReady(container);

      // Start with non-medical type - should see Reimbursement but not Insurance/People/Invoice
      await act(async () => {
        fireEvent.change(container.querySelector('#type'), { target: { value: 'Groceries' } });
      });

      expect(findSectionHeader(container, 'Reimbursement')).toBeTruthy();
      expect(findSectionHeader(container, 'Insurance Tracking')).toBeFalsy();
      expect(findSectionHeader(container, 'People Assignment')).toBeFalsy();
      expect(findSectionHeader(container, 'Invoice Attachments')).toBeFalsy();

      // Switch to medical - should see Insurance/People/Invoice but not Reimbursement
      await act(async () => {
        fireEvent.change(container.querySelector('#type'), { target: { value: 'Tax - Medical' } });
      });

      await waitFor(() => {
        expect(findSectionHeader(container, 'Insurance Tracking')).toBeTruthy();
        expect(findSectionHeader(container, 'People Assignment')).toBeTruthy();
        expect(findSectionHeader(container, 'Invoice Attachments')).toBeTruthy();
        expect(findSectionHeader(container, 'Reimbursement')).toBeFalsy();
      });

      // Switch to donation - should see Invoice but not Insurance/People/Reimbursement
      await act(async () => {
        fireEvent.change(container.querySelector('#type'), { target: { value: 'Tax - Donation' } });
      });

      await waitFor(() => {
        expect(findSectionHeader(container, 'Invoice Attachments')).toBeTruthy();
        expect(findSectionHeader(container, 'Insurance Tracking')).toBeFalsy();
        expect(findSectionHeader(container, 'People Assignment')).toBeFalsy();
        expect(findSectionHeader(container, 'Reimbursement')).toBeTruthy();
      });
    });

    it('should preserve Advanced Options section across type switches', async () => {
      const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);
      await waitForFormReady(container);

      // Expand Advanced Options
      const advHeader = findSectionHeader(container, 'Advanced Options');
      await act(async () => { fireEvent.click(advHeader); });
      await waitFor(() => { expect(advHeader.getAttribute('aria-expanded')).toBe('true'); });

      // Switch types - Advanced Options should remain expanded
      await act(async () => {
        fireEvent.change(container.querySelector('#type'), { target: { value: 'Tax - Medical' } });
      });

      const advHeaderAfter = findSectionHeader(container, 'Advanced Options');
      expect(advHeaderAfter).toBeTruthy();
      expect(advHeaderAfter.getAttribute('aria-expanded')).toBe('true');
    });
  });
});
