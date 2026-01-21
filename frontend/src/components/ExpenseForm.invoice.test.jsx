import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ExpenseForm from './ExpenseForm';

// Mock the API endpoints
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    CATEGORIES: '/api/categories',
    EXPENSES: '/api/expenses',
    INVOICE_UPLOAD: '/api/invoices/upload',
    INVOICE_BY_EXPENSE: (id) => `/api/invoices/${id}`,
    INVOICE_METADATA: (id) => `/api/invoices/${id}/metadata`
  }
}));

// Mock the API services
vi.mock('../services/expenseApi', () => ({
  createExpense: vi.fn(() => Promise.resolve({ id: 1 })),
  updateExpense: vi.fn(() => Promise.resolve({ id: 123 })),
  getPlaces: vi.fn(() => Promise.resolve(['Clinic', 'Hospital'])),
  getExpenseWithPeople: vi.fn(() => Promise.resolve(null))
}));

vi.mock('../services/peopleApi', () => ({
  getPeople: vi.fn(() => Promise.resolve([
    { id: 1, name: 'John Doe' },
    { id: 2, name: 'Jane Smith' }
  ]))
}));

vi.mock('../services/categorySuggestionApi', () => ({
  fetchCategorySuggestion: vi.fn(() => Promise.resolve(null))
}));

vi.mock('../services/categoriesApi', () => ({
  getCategories: vi.fn(() => Promise.resolve(['Other', 'Tax - Medical', 'Groceries']))
}));

vi.mock('../services/invoiceApi', () => ({
  getInvoicesForExpense: vi.fn((expenseId) => {
    // Return invoice for expense 123 (used in the editing test)
    if (expenseId === 123) {
      return Promise.resolve([{ id: 1, filename: 'existing.pdf' }]);
    }
    return Promise.resolve([]);
  }),
  updateInvoicePersonLink: vi.fn(() => Promise.resolve({}))
}));

// Mock InvoiceUpload component
vi.mock('./InvoiceUpload', () => ({
  default: ({ expenseId, existingInvoices, onInvoiceUploaded, onInvoiceDeleted, disabled }) => (
    <div data-testid="invoice-upload">
      <div>ExpenseId: {expenseId || 'null'}</div>
      <div>HasInvoice: {existingInvoices && existingInvoices.length > 0 ? 'true' : 'false'}</div>
      <div>Disabled: {disabled ? 'true' : 'false'}</div>
      <button onClick={() => onInvoiceUploaded({ id: 1, filename: 'test.pdf' })}>
        Mock Upload
      </button>
      <button onClick={() => onInvoiceDeleted()}>
        Mock Delete
      </button>
    </div>
  )
}));

// Mock fetch for categories
global.fetch = vi.fn((url) => {
  if (url.includes('/api/categories')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        categories: ['Other', 'Tax - Medical', 'Groceries']
      })
    });
  }
  if (url.includes('/places')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(['Clinic', 'Hospital'])
    });
  }
  if (url.includes('/metadata')) {
    return Promise.resolve({
      ok: false,
      status: 404
    });
  }
  return Promise.reject(new Error('Unknown URL'));
});

describe('ExpenseForm - Invoice Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not show invoice section for non-medical expenses', async () => {
    render(<ExpenseForm />);
    
    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByDisplayValue('Other')).toBeInTheDocument();
    });

    // Invoice section should not be visible
    expect(screen.queryByText('Invoice Attachment')).not.toBeInTheDocument();
  });

  it('should show invoice section for medical expenses', async () => {
    render(<ExpenseForm />);
    
    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByDisplayValue('Other')).toBeInTheDocument();
    });

    // Change to medical expense type
    const typeSelect = screen.getByDisplayValue('Other');
    fireEvent.change(typeSelect, { target: { value: 'Tax - Medical' } });

    // Invoice section should now be visible
    expect(screen.getByText('Invoice Attachment')).toBeInTheDocument();
    expect(screen.getByText(/Select PDF invoice/)).toBeInTheDocument();
  });

  it('should handle file selection for new medical expenses', async () => {
    render(<ExpenseForm />);
    
    // Wait for component to load and change to medical expense
    await waitFor(() => {
      expect(screen.getByDisplayValue('Other')).toBeInTheDocument();
    });

    const typeSelect = screen.getByDisplayValue('Other');
    fireEvent.change(typeSelect, { target: { value: 'Tax - Medical' } });

    // Find the file input
    const fileInput = screen.getByLabelText(/Select PDF invoice/);
    expect(fileInput).toBeInTheDocument();

    // Create a mock PDF file
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
    
    // Simulate file selection
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Should show the selected file
    await waitFor(() => {
      expect(screen.getByText(/test.pdf/)).toBeInTheDocument();
    });
  });

  it('should validate file type and size for new expenses', async () => {
    render(<ExpenseForm />);
    
    // Wait for component to load and change to medical expense
    await waitFor(() => {
      expect(screen.getByDisplayValue('Other')).toBeInTheDocument();
    });

    const typeSelect = screen.getByDisplayValue('Other');
    fireEvent.change(typeSelect, { target: { value: 'Tax - Medical' } });

    const fileInput = screen.getByLabelText(/Select PDF invoice/);

    // Test invalid file type
    const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    await waitFor(() => {
      expect(screen.getByText(/not a PDF file/)).toBeInTheDocument();
    });

    // Test file too large (create a mock file over 10MB)
    const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(largeFile, 'size', { value: 11 * 1024 * 1024 });
    
    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    await waitFor(() => {
      expect(screen.getByText(/exceeds 10MB limit/)).toBeInTheDocument();
    });
  });

  it('should use InvoiceUpload component for editing existing expenses', async () => {
    const mockExpense = {
      id: 123,
      date: '2025-01-01',
      place: 'Test Clinic',
      notes: 'Test notes',
      amount: 100,
      type: 'Tax - Medical',
      method: 'Cash',
      invoice: { id: 1, filename: 'existing.pdf' }
    };

    render(<ExpenseForm expense={mockExpense} />);
    
    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Clinic')).toBeInTheDocument();
    });

    // Should show InvoiceUpload component for editing
    expect(screen.getByTestId('invoice-upload')).toBeInTheDocument();
    expect(screen.getByText('ExpenseId: 123')).toBeInTheDocument();
    expect(screen.getByText('HasInvoice: true')).toBeInTheDocument();
  });

  it('should clear invoice when changing away from medical expenses', async () => {
    render(<ExpenseForm />);
    
    // Wait for component to load and change to medical expense
    await waitFor(() => {
      expect(screen.getByDisplayValue('Other')).toBeInTheDocument();
    });

    const typeSelect = screen.getByDisplayValue('Other');
    fireEvent.change(typeSelect, { target: { value: 'Tax - Medical' } });

    // Select a file
    const fileInput = screen.getByLabelText(/Select PDF invoice/);
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/test.pdf/)).toBeInTheDocument();
    });

    // Change back to non-medical expense
    fireEvent.change(typeSelect, { target: { value: 'Groceries' } });

    // Invoice section should be hidden
    expect(screen.queryByText('Invoice Attachment')).not.toBeInTheDocument();
    
    // Change back to medical - file should be cleared
    fireEvent.change(typeSelect, { target: { value: 'Tax - Medical' } });
    expect(screen.getByText(/Select PDF invoice/)).toBeInTheDocument();
  });

  it('should handle invoice upload callbacks', async () => {
    const mockExpense = {
      id: 123,
      type: 'Tax - Medical',
      date: '2025-01-01',
      place: 'Test Clinic',
      amount: 100,
      method: 'Cash'
    };

    render(<ExpenseForm expense={mockExpense} />);
    
    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByTestId('invoice-upload')).toBeInTheDocument();
    });

    // Test upload callback - should show success message in form
    const uploadButton = screen.getByText('Mock Upload');
    fireEvent.click(uploadButton);

    // The form should show a success message (the callback is working)
    await waitFor(() => {
      expect(screen.getByText(/successfully/)).toBeInTheDocument();
    });
  });
});