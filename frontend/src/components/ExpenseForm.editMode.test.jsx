import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
import * as invoiceApi from '../services/invoiceApi';

vi.mock('../services/peopleApi', () => ({
  getPeople: vi.fn()
}));

vi.mock('../services/expenseApi', () => ({
  createExpense: vi.fn(),
  getExpenses: vi.fn(),
  getPlaces: vi.fn(),
  updateExpense: vi.fn(),
  getExpenseWithPeople: vi.fn()
}));

vi.mock('../services/categorySuggestionApi', () => ({
  fetchCategorySuggestion: vi.fn()
}));

vi.mock('../services/categoriesApi', () => ({
  getCategories: vi.fn()
}));

vi.mock('../services/invoiceApi', () => ({
  getInvoicesForExpense: vi.fn(),
  updateInvoicePersonLink: vi.fn()
}));

vi.mock('../services/paymentMethodApi', () => ({
  getActivePaymentMethods: vi.fn(),
  getPaymentMethod: vi.fn()
}));

import * as paymentMethodApi from '../services/paymentMethodApi';

vi.mock('../utils/formatters', () => ({
  getTodayLocalDate: () => '2025-01-15'
}));

vi.mock('../utils/constants', () => ({
  PAYMENT_METHODS: ['Cash', 'Credit Card', 'Debit Card']
}));

vi.mock('./PersonAllocationModal', () => ({
  default: ({ isOpen }) => isOpen ? <div data-testid="person-allocation-modal">Modal</div> : null
}));

vi.mock('./InvoiceUpload', () => ({
  default: ({ people, expenseId }) => (
    <div data-testid="invoice-upload">
      <span data-testid="expense-id">{expenseId}</span>
      <span data-testid="people-count">{people?.length || 0}</span>
      {/* Test that people array can be mapped without errors */}
      {people?.map(p => (
        <span key={p.id} data-testid={`person-${p.id}`}>
          {p.name}
        </span>
      ))}
    </div>
  )
}));

import ExpenseForm from './ExpenseForm';

global.fetch = vi.fn();

describe('ExpenseForm - Edit Mode with Backend Data Formats', () => {
  const mockCategories = [
    'Other', 'Groceries', 'Gas', 'Dining Out', 'Tax - Medical', 'Tax - Donation'
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    global.fetch.mockImplementation((url) => {
      if (url.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            categories: mockCategories,
            budgetableCategories: [],
            taxDeductibleCategories: ['Tax - Medical', 'Tax - Donation']
          })
        });
      }
      if (url.includes('/places')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/api/people')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    peopleApi.getPeople.mockResolvedValue([]);
    expenseApi.getPlaces.mockResolvedValue([]);
    categoriesApi.getCategories.mockResolvedValue(mockCategories);
    categorySuggestionApi.fetchCategorySuggestion.mockResolvedValue({ category: null });
    invoiceApi.getInvoicesForExpense.mockResolvedValue([]);
    expenseApi.getExpenseWithPeople.mockResolvedValue({ people: [] });
    paymentMethodApi.getActivePaymentMethods.mockResolvedValue([
      { id: 1, display_name: 'Cash', type: 'cash' },
      { id: 2, display_name: 'Visa', type: 'credit_card' }
    ]);
    paymentMethodApi.getPaymentMethod.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test: ExpenseForm handles backend people format (id field)
   * Backend now returns people with 'id' field for frontend compatibility
   */
  it('should handle people data with id format from backend', async () => {
    // Backend now returns people with id (standardized format)
    const backendPeopleFormat = [
      { id: 1, name: 'John Doe', amount: 50 },
      { id: 2, name: 'Jane Smith', amount: 50 }
    ];

    const existingExpense = {
      id: 123,
      date: '2025-01-15',
      place: 'Doctor Office',
      amount: 100,
      type: 'Tax - Medical',
      payment_method_id: 2,
      people: backendPeopleFormat
    };

    expenseApi.getExpenseWithPeople.mockResolvedValue({
      id: 123,
      people: backendPeopleFormat
    });

    // This should NOT throw an error
    const { container } = render(
      <ExpenseForm 
        expense={existingExpense} 
        onExpenseAdded={() => {}} 
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Verify the people select renders without error
    const peopleSelect = container.querySelector('select[name="people"]');
    expect(peopleSelect).toBeInTheDocument();
  });

  /**
   * Test: InvoiceUpload receives people with correct format
   */
  it('should pass people to InvoiceUpload with id field', async () => {
    const backendPeopleFormat = [
      { id: 1, name: 'John Doe', amount: 100 }
    ];

    const existingExpense = {
      id: 123,
      date: '2025-01-15',
      place: 'Doctor Office',
      amount: 100,
      type: 'Tax - Medical',
      payment_method_id: 2,
      people: backendPeopleFormat
    };

    expenseApi.getExpenseWithPeople.mockResolvedValue({
      id: 123,
      people: backendPeopleFormat
    });

    render(
      <ExpenseForm 
        expense={existingExpense} 
        onExpenseAdded={() => {}} 
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('invoice-upload')).toBeInTheDocument();
    });

    // Verify InvoiceUpload received the people and can render them
    expect(screen.getByTestId('person-1')).toBeInTheDocument();
    expect(screen.getByTestId('person-1')).toHaveTextContent('John Doe');
  });

  /**
   * Test: onExpenseAdded callback includes invoice state when editing
   */
  it('should include invoice count in callback when invoices exist', async () => {
    const mockOnExpenseAdded = vi.fn();
    
    const existingExpense = {
      id: 123,
      date: '2025-01-15',
      place: 'Doctor Office',
      amount: 100,
      type: 'Tax - Medical',
      payment_method_id: 2
    };

    // Mock that there are existing invoices
    invoiceApi.getInvoicesForExpense.mockResolvedValue([
      { id: 1, filename: 'receipt1.pdf' },
      { id: 2, filename: 'receipt2.pdf' }
    ]);

    expenseApi.updateExpense.mockResolvedValue({
      id: 123,
      date: '2025-01-15',
      place: 'Doctor Office',
      amount: 100,
      type: 'Tax - Medical',
      payment_method_id: 2
    });

    render(
      <ExpenseForm 
        expense={existingExpense} 
        onExpenseAdded={mockOnExpenseAdded} 
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Wait for invoices to load
    await waitFor(() => {
      expect(invoiceApi.getInvoicesForExpense).toHaveBeenCalledWith(123);
    });

    // Submit the form
    fireEvent.submit(screen.getByRole('button', { name: /update expense/i }));

    // Verify callback includes invoice info
    await waitFor(() => {
      expect(mockOnExpenseAdded).toHaveBeenCalledWith(
        expect.objectContaining({
          hasInvoice: true,
          invoiceCount: 2
        })
      );
    });
  });

  /**
   * Test: People allocations use id correctly when submitting edit
   */
  it('should use id from backend format when submitting edit', async () => {
    const mockOnExpenseAdded = vi.fn();
    
    const backendPeopleFormat = [
      { id: 5, name: 'John Doe', amount: 100 }
    ];

    const existingExpense = {
      id: 123,
      date: '2025-01-15',
      place: 'Doctor Office',
      amount: 100,
      type: 'Tax - Medical',
      payment_method_id: 2,
      people: backendPeopleFormat
    };

    expenseApi.getExpenseWithPeople.mockResolvedValue({
      id: 123,
      people: backendPeopleFormat
    });

    expenseApi.updateExpense.mockResolvedValue({
      id: 123,
      type: 'Tax - Medical'
    });

    render(
      <ExpenseForm 
        expense={existingExpense} 
        onExpenseAdded={mockOnExpenseAdded} 
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Submit the form
    fireEvent.submit(screen.getByRole('button', { name: /update expense/i }));

    // Verify updateExpense was called with correct personId (converted from id)
    await waitFor(() => {
      expect(expenseApi.updateExpense).toHaveBeenCalledWith(
        123,
        expect.any(Object),
        expect.arrayContaining([
          expect.objectContaining({ personId: 5 })
        ]),
        0
      );
    });
  });
});
