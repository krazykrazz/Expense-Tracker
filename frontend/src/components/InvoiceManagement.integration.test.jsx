import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvoiceUpload from './InvoiceUpload';

// Mock the API endpoints
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    INVOICE_UPLOAD: '/api/invoices/upload',
    INVOICE_BY_EXPENSE: (id) => `/api/invoices/${id}`,
    INVOICE_METADATA: (id) => `/api/invoices/${id}/metadata`,
    INVOICES_FOR_EXPENSE: (id) => `/api/invoices/${id}`,
    INVOICE_FILE: (expenseId, invoiceId) => `/api/invoices/${expenseId}/${invoiceId}`
  }
}));

// Mock InvoicePDFViewer component
vi.mock('./InvoicePDFViewer', () => ({
  default: ({ isOpen, onClose, invoiceName }) => 
    isOpen ? (
      <div role="dialog" data-testid="pdf-viewer">
        <span>{invoiceName}</span>
        <button aria-label="Close PDF viewer" onClick={onClose}>Close</button>
      </div>
    ) : null
}));

// Mock invoiceApi
vi.mock('../services/invoiceApi', () => ({
  deleteInvoiceById: vi.fn(),
  updateInvoicePersonLink: vi.fn(),
  getInvoiceFileUrl: vi.fn((expenseId, invoiceId) => `/api/invoices/${expenseId}/${invoiceId}`)
}));

import { deleteInvoiceById } from '../services/invoiceApi';

describe('Invoice Management Operations Integration', () => {
  let mockOnInvoiceUploaded;
  let mockOnInvoiceDeleted;

  beforeEach(() => {
    mockOnInvoiceUploaded = vi.fn();
    mockOnInvoiceDeleted = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockInvoice = {
    id: 1,
    expenseId: 123,
    filename: 'invoice_123_1234567890_receipt.pdf',
    originalFilename: 'receipt.pdf',
    fileSize: 1024000,
    uploadDate: '2025-01-01T12:00:00Z'
  };

  describe('Enhanced Invoice Management Operations', () => {
    it('should show enhanced metadata display', () => {
      render(
        <InvoiceUpload
          expenseId={123}
          existingInvoice={mockInvoice}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      // Check that invoice metadata is displayed
      expect(screen.getByText('receipt.pdf')).toBeInTheDocument();
      expect(screen.getByText(/1000 KB/)).toBeInTheDocument();
      // Date is displayed (format may vary by locale)
      expect(screen.getByText(/2025-01-01|1\/1\/2025/)).toBeInTheDocument();
    });

    it('should handle view operation with modal', async () => {
      const user = userEvent.setup();

      render(
        <InvoiceUpload
          expenseId={123}
          existingInvoice={mockInvoice}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      // Click view button (aria-label includes filename)
      const viewButton = screen.getByRole('button', { name: /view receipt\.pdf/i });
      await user.click(viewButton);

      // Check that PDF viewer modal opens
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText('Close PDF viewer')).toBeInTheDocument();
    });

    it('should show Add Invoice button when invoice exists', () => {
      render(
        <InvoiceUpload
          expenseId={123}
          existingInvoice={mockInvoice}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      // Check that Add Invoice button is available
      const addButton = screen.getByRole('button', { name: /add another invoice/i });
      expect(addButton).toBeInTheDocument();
      expect(addButton).not.toBeDisabled();
    });

    it('should handle delete operation with confirmation', async () => {
      const user = userEvent.setup();

      // Mock successful delete response
      deleteInvoiceById.mockResolvedValueOnce({ success: true });

      render(
        <InvoiceUpload
          expenseId={123}
          existingInvoice={mockInvoice}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      // Click delete button (aria-label includes filename)
      const deleteButton = screen.getByRole('button', { name: /delete receipt\.pdf/i });
      await user.click(deleteButton);

      // Check confirmation appears
      expect(screen.getByTitle('Confirm delete')).toBeInTheDocument();
      expect(screen.getByTitle('Cancel delete')).toBeInTheDocument();

      // Confirm delete
      const confirmButton = screen.getByTitle('Confirm delete');
      await user.click(confirmButton);

      // Wait for delete operation to complete
      await waitFor(() => {
        expect(deleteInvoiceById).toHaveBeenCalledWith(1);
        expect(mockOnInvoiceDeleted).toHaveBeenCalledWith(1);
      });
    });

    it('should cancel delete when cancel button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <InvoiceUpload
          expenseId={123}
          existingInvoice={mockInvoice}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      // Click delete button
      const deleteButton = screen.getByRole('button', { name: /delete receipt\.pdf/i });
      await user.click(deleteButton);

      // Click cancel
      const cancelButton = screen.getByTitle('Cancel delete');
      await user.click(cancelButton);

      // Confirmation should be gone
      expect(screen.queryByTitle('Confirm delete')).not.toBeInTheDocument();
      // Delete button should be back
      expect(screen.getByRole('button', { name: /delete receipt\.pdf/i })).toBeInTheDocument();
    });

    it('should handle operation errors gracefully', async () => {
      const user = userEvent.setup();

      // Mock failed delete response
      deleteInvoiceById.mockRejectedValueOnce(new Error('Network error'));

      render(
        <InvoiceUpload
          expenseId={123}
          existingInvoice={mockInvoice}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      // Start delete operation
      const deleteButton = screen.getByRole('button', { name: /delete receipt\.pdf/i });
      await user.click(deleteButton);

      const confirmButton = screen.getByTitle('Confirm delete');
      await user.click(confirmButton);

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });

    it('should provide accessibility features for operations', () => {
      render(
        <InvoiceUpload
          expenseId={123}
          existingInvoice={mockInvoice}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      // Check that action buttons have proper accessibility attributes
      const viewButton = screen.getByRole('button', { name: /view receipt\.pdf/i });
      const deleteButton = screen.getByRole('button', { name: /delete receipt\.pdf/i });
      const addButton = screen.getByRole('button', { name: /add another invoice/i });

      expect(viewButton).toHaveAttribute('aria-label', 'View receipt.pdf');
      expect(deleteButton).toHaveAttribute('aria-label', 'Delete receipt.pdf');
      expect(addButton).toHaveAttribute('aria-label', 'Add another invoice');
    });
  });
});
