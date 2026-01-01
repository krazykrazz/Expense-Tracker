import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvoiceUpload from './InvoiceUpload';

// Mock the API endpoints
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    INVOICE_UPLOAD: '/api/invoices/upload',
    INVOICE_BY_EXPENSE: (id) => `/api/invoices/${id}`,
    INVOICE_METADATA: (id) => `/api/invoices/${id}/metadata`
  }
}));

describe('Invoice Management Operations Integration', () => {
  let mockOnInvoiceUploaded;
  let mockOnInvoiceDeleted;

  beforeEach(() => {
    mockOnInvoiceUploaded = vi.fn();
    mockOnInvoiceDeleted = vi.fn();
    
    // Mock fetch for API calls
    global.fetch = vi.fn();
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
      expect(screen.getByText(/Uploaded 2025-01-01/)).toBeInTheDocument();
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

      const viewButton = screen.getByRole('button', { name: /view invoice/i });
      await user.click(viewButton);

      // Check that PDF viewer modal opens
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText('Close PDF viewer')).toBeInTheDocument();
    });

    it('should handle replace operation with enhanced error handling', async () => {
      const user = userEvent.setup();

      render(
        <InvoiceUpload
          expenseId={123}
          existingInvoice={mockInvoice}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      const replaceButton = screen.getByRole('button', { name: /replace invoice/i });
      
      // Check that replace button is available and clickable
      expect(replaceButton).toBeInTheDocument();
      expect(replaceButton).not.toBeDisabled();
    });

    it('should handle delete operation with confirmation and loading states', async () => {
      const user = userEvent.setup();

      // Mock successful delete response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      render(
        <InvoiceUpload
          expenseId={123}
          existingInvoice={mockInvoice}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      // Click delete button
      const deleteButton = screen.getByRole('button', { name: /delete invoice/i });
      await user.click(deleteButton);

      // Check confirmation appears
      expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel delete/i })).toBeInTheDocument();

      // Confirm delete
      const confirmButton = screen.getByRole('button', { name: /confirm delete/i });
      await user.click(confirmButton);

      // Wait for delete operation to complete
      await waitFor(() => {
        expect(mockOnInvoiceDeleted).toHaveBeenCalled();
      });
    });

    it('should show loading states during operations', async () => {
      const user = userEvent.setup();

      // Mock slow delete response
      global.fetch.mockImplementationOnce(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            ok: true,
            json: () => Promise.resolve({ success: true })
          }), 100)
        )
      );

      render(
        <InvoiceUpload
          expenseId={123}
          existingInvoice={mockInvoice}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      // Start delete operation
      const deleteButton = screen.getByRole('button', { name: /delete invoice/i });
      await user.click(deleteButton);

      const confirmButton = screen.getByRole('button', { name: /confirm delete/i });
      await user.click(confirmButton);

      // Check that loading state is shown
      await waitFor(() => {
        expect(screen.getByText(/deleting/i)).toBeInTheDocument();
      });
    });

    it('should handle operation errors gracefully', async () => {
      const user = userEvent.setup();

      // Mock failed delete response
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      render(
        <InvoiceUpload
          expenseId={123}
          existingInvoice={mockInvoice}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      // Start delete operation
      const deleteButton = screen.getByRole('button', { name: /delete invoice/i });
      await user.click(deleteButton);

      const confirmButton = screen.getByRole('button', { name: /confirm delete/i });
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

      // Check that all action buttons have proper accessibility attributes
      const viewButton = screen.getByRole('button', { name: /view invoice/i });
      const replaceButton = screen.getByRole('button', { name: /replace invoice/i });
      const deleteButton = screen.getByRole('button', { name: /delete invoice/i });

      expect(viewButton).toHaveAttribute('aria-label', 'View invoice');
      expect(replaceButton).toHaveAttribute('aria-label', 'Replace invoice');
      expect(deleteButton).toHaveAttribute('aria-label', 'Delete invoice');

      // Check for screen reader announcements
      expect(screen.getByText('Ready for operations')).toBeInTheDocument();
    });
  });
});