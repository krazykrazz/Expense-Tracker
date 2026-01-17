import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InvoiceList from './InvoiceList';

// Mock the InvoicePDFViewer component
vi.mock('./InvoicePDFViewer', () => ({
  default: ({ isOpen, onClose, invoiceName, invoiceId }) => (
    isOpen ? (
      <div data-testid="pdf-viewer-modal">
        <span>PDF Viewer: {invoiceName}</span>
        <span data-testid="invoice-id">{invoiceId}</span>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
  )
}));

// Mock the invoiceApi
vi.mock('../services/invoiceApi', () => ({
  deleteInvoiceById: vi.fn(),
  updateInvoicePersonLink: vi.fn(),
  getInvoiceFileUrl: vi.fn((expenseId, invoiceId) => `/api/invoices/${expenseId}/${invoiceId}`)
}));

import { deleteInvoiceById } from '../services/invoiceApi';

describe('InvoiceList', () => {
  const mockInvoices = [
    {
      id: 1,
      expenseId: 123,
      filename: '123_1704067200_receipt1.pdf',
      originalFilename: 'receipt1.pdf',
      fileSize: 245760, // 240 KB
      uploadDate: '2025-01-01T12:00:00Z',
      personId: null,
      personName: null
    },
    {
      id: 2,
      expenseId: 123,
      filename: '123_1704153600_receipt2.pdf',
      originalFilename: 'receipt2.pdf',
      fileSize: 512000, // 500 KB
      uploadDate: '2025-01-02T12:00:00Z',
      personId: 1,
      personName: 'John Doe'
    },
    {
      id: 3,
      expenseId: 123,
      filename: '123_1704240000_receipt3.pdf',
      originalFilename: 'receipt3.pdf',
      fileSize: 1048576, // 1 MB
      uploadDate: '2025-01-03T12:00:00Z',
      personId: 2,
      personName: 'Jane Doe'
    }
  ];

  const mockPeople = [
    { id: 1, name: 'John Doe' },
    { id: 2, name: 'Jane Doe' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when invoices array is empty', () => {
    const { container } = render(
      <InvoiceList invoices={[]} expenseId={123} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when invoices is undefined', () => {
    const { container } = render(
      <InvoiceList expenseId={123} />
    );
    expect(container.firstChild).toBeNull();
  });

  /**
   * Property 8: Invoice Display Contains Required Fields
   * For any invoice rendered in the UI, the display SHALL include the filename, 
   * file size, upload date, and person name (if linked).
   * Validates: Requirements 4.2
   */
  describe('Property 8: Invoice Display Contains Required Fields', () => {
    it('displays filename for each invoice', () => {
      render(
        <InvoiceList invoices={mockInvoices} expenseId={123} />
      );
      
      expect(screen.getByText('receipt1.pdf')).toBeInTheDocument();
      expect(screen.getByText('receipt2.pdf')).toBeInTheDocument();
      expect(screen.getByText('receipt3.pdf')).toBeInTheDocument();
    });

    it('displays file size for each invoice', () => {
      render(
        <InvoiceList invoices={mockInvoices} expenseId={123} />
      );
      
      // Check for formatted file sizes
      expect(screen.getByText('240 KB')).toBeInTheDocument();
      expect(screen.getByText('500 KB')).toBeInTheDocument();
      expect(screen.getByText('1 MB')).toBeInTheDocument();
    });

    it('displays upload date for each invoice', () => {
      render(
        <InvoiceList invoices={mockInvoices} expenseId={123} />
      );
      
      // Dates are displayed - check for the date elements
      const dateElements = document.querySelectorAll('.invoice-item-date');
      expect(dateElements.length).toBe(3);
      
      // Each date element should have content
      dateElements.forEach(el => {
        expect(el.textContent).toBeTruthy();
      });
    });

    it('displays person name when invoice is linked to a person', () => {
      render(
        <InvoiceList invoices={mockInvoices} expenseId={123} />
      );
      
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
      expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    });

    it('does not display person name when invoice has no person link', () => {
      const invoiceWithoutPerson = [{
        id: 1,
        expenseId: 123,
        filename: 'test.pdf',
        originalFilename: 'test.pdf',
        fileSize: 1024,
        uploadDate: '2025-01-01T12:00:00Z',
        personId: null,
        personName: null
      }];

      render(
        <InvoiceList invoices={invoiceWithoutPerson} expenseId={123} />
      );
      
      // Should not have any person indicator for this invoice
      const personIndicators = screen.queryAllByText(/👤/);
      expect(personIndicators.length).toBe(0);
    });
  });

  it('displays correct invoice count in header', () => {
    render(
      <InvoiceList invoices={mockInvoices} expenseId={123} />
    );
    
    expect(screen.getByText('3 invoices attached')).toBeInTheDocument();
  });

  it('displays singular form for single invoice', () => {
    render(
      <InvoiceList invoices={[mockInvoices[0]]} expenseId={123} />
    );
    
    expect(screen.getByText('1 invoice attached')).toBeInTheDocument();
  });

  it('opens PDF viewer when clicking on invoice info', () => {
    render(
      <InvoiceList invoices={mockInvoices} expenseId={123} />
    );
    
    // Click on the first invoice's info area
    const invoiceInfo = screen.getByText('receipt1.pdf').closest('.invoice-item-info');
    fireEvent.click(invoiceInfo);
    
    expect(screen.getByTestId('pdf-viewer-modal')).toBeInTheDocument();
    expect(screen.getByText('PDF Viewer: receipt1.pdf')).toBeInTheDocument();
  });

  it('opens PDF viewer when clicking view button', () => {
    render(
      <InvoiceList invoices={mockInvoices} expenseId={123} />
    );
    
    // Click the first view button
    const viewButtons = screen.getAllByTitle('View invoice');
    fireEvent.click(viewButtons[0]);
    
    expect(screen.getByTestId('pdf-viewer-modal')).toBeInTheDocument();
  });

  it('shows delete confirmation when clicking delete button', () => {
    render(
      <InvoiceList invoices={mockInvoices} expenseId={123} />
    );
    
    // Click the first delete button
    const deleteButtons = screen.getAllByTitle('Delete invoice');
    fireEvent.click(deleteButtons[0]);
    
    // Should show confirm and cancel buttons
    expect(screen.getByTitle('Confirm delete')).toBeInTheDocument();
    expect(screen.getByTitle('Cancel delete')).toBeInTheDocument();
  });

  it('cancels delete when clicking cancel button', () => {
    render(
      <InvoiceList invoices={mockInvoices} expenseId={123} />
    );
    
    // Click delete then cancel
    const deleteButtons = screen.getAllByTitle('Delete invoice');
    fireEvent.click(deleteButtons[0]);
    
    const cancelButton = screen.getByTitle('Cancel delete');
    fireEvent.click(cancelButton);
    
    // Should be back to normal state
    expect(screen.queryByTitle('Confirm delete')).not.toBeInTheDocument();
    expect(screen.getAllByTitle('Delete invoice').length).toBe(3);
  });

  it('calls onInvoiceDeleted when confirming delete', async () => {
    const mockOnDeleted = vi.fn();
    deleteInvoiceById.mockResolvedValue({ success: true });

    render(
      <InvoiceList 
        invoices={mockInvoices} 
        expenseId={123}
        onInvoiceDeleted={mockOnDeleted}
      />
    );
    
    // Click delete then confirm
    const deleteButtons = screen.getAllByTitle('Delete invoice');
    fireEvent.click(deleteButtons[0]);
    
    const confirmButton = screen.getByTitle('Confirm delete');
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(deleteInvoiceById).toHaveBeenCalledWith(1);
      expect(mockOnDeleted).toHaveBeenCalledWith(1);
    });
  });

  it('shows error when delete fails', async () => {
    deleteInvoiceById.mockRejectedValue(new Error('Delete failed'));

    render(
      <InvoiceList invoices={mockInvoices} expenseId={123} />
    );
    
    // Click delete then confirm
    const deleteButtons = screen.getAllByTitle('Delete invoice');
    fireEvent.click(deleteButtons[0]);
    
    const confirmButton = screen.getByTitle('Confirm delete');
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument();
    });
  });

  it('clears error when clicking close button', async () => {
    deleteInvoiceById.mockRejectedValue(new Error('Delete failed'));

    render(
      <InvoiceList invoices={mockInvoices} expenseId={123} />
    );
    
    // Trigger error
    const deleteButtons = screen.getAllByTitle('Delete invoice');
    fireEvent.click(deleteButtons[0]);
    fireEvent.click(screen.getByTitle('Confirm delete'));
    
    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument();
    });
    
    // Clear error
    const closeButton = screen.getByLabelText('Clear error');
    fireEvent.click(closeButton);
    
    expect(screen.queryByText('Delete failed')).not.toBeInTheDocument();
  });

  it('disables actions when disabled prop is true', () => {
    render(
      <InvoiceList invoices={mockInvoices} expenseId={123} disabled={true} />
    );
    
    const deleteButtons = screen.getAllByTitle('Delete invoice');
    deleteButtons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });

  it('handles keyboard navigation for invoice info', () => {
    render(
      <InvoiceList invoices={mockInvoices} expenseId={123} />
    );
    
    const invoiceInfo = screen.getByText('receipt1.pdf').closest('.invoice-item-info');
    fireEvent.keyDown(invoiceInfo, { key: 'Enter' });
    
    expect(screen.getByTestId('pdf-viewer-modal')).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(
      <InvoiceList invoices={mockInvoices} expenseId={123} />
    );
    
    const invoiceInfos = screen.getAllByRole('button', { name: /View invoice:/ });
    expect(invoiceInfos.length).toBe(3);
    
    invoiceInfos.forEach(info => {
      expect(info).toHaveAttribute('tabIndex', '0');
    });
  });

  it('closes PDF viewer when close button is clicked', () => {
    render(
      <InvoiceList invoices={mockInvoices} expenseId={123} />
    );
    
    // Open viewer
    const viewButtons = screen.getAllByTitle('View invoice');
    fireEvent.click(viewButtons[0]);
    
    expect(screen.getByTestId('pdf-viewer-modal')).toBeInTheDocument();
    
    // Close viewer
    fireEvent.click(screen.getByText('Close'));
    
    expect(screen.queryByTestId('pdf-viewer-modal')).not.toBeInTheDocument();
  });
});
