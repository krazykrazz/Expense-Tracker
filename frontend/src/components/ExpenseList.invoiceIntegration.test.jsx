import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExpenseList from './ExpenseList';

// Mock the invoice API
vi.mock('../services/invoiceApi', () => ({
  getInvoicesForExpense: vi.fn(),
  updateInvoicePersonLink: vi.fn()
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('ExpenseList - Invoice Integration', () => {
  const mockCategories = ['Groceries', 'Tax - Medical', 'Gas', 'Entertainment', 'Other'];
  
  const mockExpenses = [
    {
      id: 1,
      date: '2025-01-15',
      place: 'Medical Clinic',
      notes: 'Checkup',
      amount: 150.50,
      type: 'Tax - Medical',
      method: 'Debit',
      week: 3
    },
    {
      id: 2,
      date: '2025-01-16',
      place: 'Hospital',
      notes: 'X-ray',
      amount: 300.00,
      type: 'Tax - Medical',
      method: 'VISA',
      week: 3
    },
    {
      id: 3,
      date: '2025-01-17',
      place: 'Grocery Store',
      notes: 'Shopping',
      amount: 60.00,
      type: 'Groceries',
      method: 'Debit',
      week: 3
    }
  ];

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock the categories API call
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ categories: mockCategories })
    });
  });

  /**
   * Test: Invoice filter shows only medical expenses
   */
  it('should show invoice filter and apply it correctly', async () => {
    const { getInvoicesForExpense } = await import('../services/invoiceApi');
    
    // Mock invoice data - expense 1 has invoice, expense 2 doesn't
    getInvoicesForExpense.mockImplementation((expenseId) => {
      if (expenseId === 1) {
        return Promise.resolve([{
          id: 1,
          expenseId: 1,
          filename: 'receipt.pdf',
          originalFilename: 'medical_receipt.pdf',
          fileSize: 245760,
          uploadDate: '2025-01-15T12:00:00Z'
        }]);
      }
      return Promise.resolve([]);
    });

    const { container } = render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    // Wait for categories and invoice metadata to load
    await waitFor(() => {
      const selects = container.querySelectorAll('.filter-select');
      expect(selects.length).toBe(4); // Category, Payment Method, Invoice, Insurance
    });

    // Find the invoice filter
    const invoiceFilter = container.querySelector('.filter-select.invoice-filter');
    expect(invoiceFilter).toBeTruthy();
    expect(invoiceFilter.title).toBe('Filter medical expenses by invoice status');

    // Initially, all 3 expenses should be visible
    let rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);

    // Apply "With Invoice" filter
    fireEvent.change(invoiceFilter, { target: { value: 'with-invoice' } });

    // Wait for filter to apply - should show only medical expenses with invoices
    await waitFor(() => {
      rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1); // Only expense 1 has an invoice
    });

    // Verify the correct expense is shown
    expect(screen.getByText('Medical Clinic')).toBeInTheDocument();
    expect(screen.queryByText('Hospital')).not.toBeInTheDocument();
    expect(screen.queryByText('Grocery Store')).not.toBeInTheDocument();

    // Apply "Without Invoice" filter
    fireEvent.change(invoiceFilter, { target: { value: 'without-invoice' } });

    // Wait for filter to apply - should show only medical expenses without invoices
    await waitFor(() => {
      rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1); // Only expense 2 doesn't have an invoice
    });

    // Verify the correct expense is shown
    expect(screen.getByText('Hospital')).toBeInTheDocument();
    expect(screen.queryByText('Medical Clinic')).not.toBeInTheDocument();
    expect(screen.queryByText('Grocery Store')).not.toBeInTheDocument();
  });

  /**
   * Test: Invoice indicators appear for medical expenses
   */
  it('should display invoice indicators for medical expenses', async () => {
    const { getInvoicesForExpense } = await import('../services/invoiceApi');
    
    // Mock invoice data
    getInvoicesForExpense.mockImplementation((expenseId) => {
      if (expenseId === 1) {
        return Promise.resolve([{
          id: 1,
          expenseId: 1,
          filename: 'receipt.pdf',
          originalFilename: 'medical_receipt.pdf',
          fileSize: 245760,
          uploadDate: '2025-01-15T12:00:00Z'
        }]);
      }
      return Promise.resolve([]);
    });

    render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    // Wait for invoice data to load
    await waitFor(() => {
      expect(getInvoicesForExpense).toHaveBeenCalledWith(1);
      expect(getInvoicesForExpense).toHaveBeenCalledWith(2);
    });

    // Check that invoice indicators are present for medical expenses
    const invoiceIndicators = document.querySelectorAll('.invoice-indicator');
    expect(invoiceIndicators.length).toBe(2); // Two medical expenses

    // Check that non-medical expenses don't have invoice indicators
    const expenseRows = document.querySelectorAll('tbody tr');
    const groceryRow = Array.from(expenseRows).find(row => 
      row.textContent.includes('Grocery Store')
    );
    expect(groceryRow).toBeTruthy();
    
    const groceryIndicator = groceryRow.querySelector('.invoice-indicator');
    expect(groceryIndicator).toBeFalsy();
  });

  /**
   * Test: Clear filters includes invoice filter
   */
  it('should clear invoice filter when clear button is clicked', async () => {
    const { getInvoicesForExpense } = await import('../services/invoiceApi');
    getInvoicesForExpense.mockResolvedValue([]);

    const { container } = render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    // Wait for categories to load
    await waitFor(() => {
      const selects = container.querySelectorAll('.filter-select');
      expect(selects.length).toBe(4); // Category, Payment Method, Invoice, Insurance
    });

    // Apply filters including invoice filter
    const categorySelect = container.querySelector('.filter-select[title*="current month"]');
    const invoiceFilter = container.querySelector('.filter-select.invoice-filter');
    
    fireEvent.change(categorySelect, { target: { value: 'Tax - Medical' } });
    fireEvent.change(invoiceFilter, { target: { value: 'with-invoice' } });

    // Wait for clear button to appear
    await waitFor(() => {
      const clearButton = container.querySelector('.clear-filters-btn');
      expect(clearButton).toBeInTheDocument();
    });

    // Click clear button
    const clearButton = container.querySelector('.clear-filters-btn');
    fireEvent.click(clearButton);

    // Wait for filters to clear
    await waitFor(() => {
      expect(categorySelect.value).toBe('');
      expect(invoiceFilter.value).toBe('');
    });

    // All expenses should be visible again
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
  });
});