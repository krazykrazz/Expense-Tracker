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

// Mock XMLHttpRequest for upload progress testing
class MockXMLHttpRequest {
  constructor() {
    this.upload = { addEventListener: vi.fn() };
    this.onload = null;
    this.onerror = null;
    this.ontimeout = null;
    this.status = 200;
    this.responseText = JSON.stringify({ success: true, invoice: { id: 1, filename: 'test.pdf' } });
    this.timeout = 0;
  }

  open() {}
  send() {
    // Simulate successful upload
    setTimeout(() => {
      if (this.onload) this.onload();
    }, 10);
  }
}

describe('InvoiceUpload Component', () => {
  let mockOnInvoiceUploaded;
  let mockOnInvoiceDeleted;
  let originalXMLHttpRequest;

  beforeEach(() => {
    mockOnInvoiceUploaded = vi.fn();
    mockOnInvoiceDeleted = vi.fn();
    
    // Mock XMLHttpRequest
    originalXMLHttpRequest = global.XMLHttpRequest;
    global.XMLHttpRequest = MockXMLHttpRequest;
    
    // Mock fetch for delete operations
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.XMLHttpRequest = originalXMLHttpRequest;
    delete global.fetch;
  });

  describe('Upload Interface', () => {
    it('renders upload dropzone when no existing invoice', () => {
      render(
        <InvoiceUpload
          expenseId={123}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      expect(screen.getByRole('button', { name: /upload invoice file/i })).toBeInTheDocument();
      expect(screen.getByText(/drag & drop pdf file here/i)).toBeInTheDocument();
      expect(screen.getByText(/or click to select file/i)).toBeInTheDocument();
      expect(screen.getByText(/pdf files only • max 10mb/i)).toBeInTheDocument();
    });

    it('shows disabled state when disabled prop is true', () => {
      render(
        <InvoiceUpload
          expenseId={123}
          disabled={true}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      const dropzone = screen.getByRole('button', { name: /upload invoice file/i });
      expect(dropzone).toHaveClass('disabled');
      expect(dropzone).toHaveAttribute('tabIndex', '-1');
    });

    it('handles keyboard navigation', async () => {
      const user = userEvent.setup();
      
      render(
        <InvoiceUpload
          expenseId={123}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      const dropzone = screen.getByRole('button', { name: /upload invoice file/i });
      
      // Focus the dropzone
      await user.tab();
      expect(dropzone).toHaveFocus();

      // Test Enter key
      await user.keyboard('{Enter}');
      // File input should be triggered (we can't easily test this without mocking)
    });
  });

  describe('Existing Invoice Display', () => {
    const mockInvoice = {
      id: 1,
      expenseId: 123,
      filename: 'invoice_123_1234567890_receipt.pdf',
      originalFilename: 'receipt.pdf',
      fileSize: 1024000,
      uploadDate: '2025-01-01T12:00:00Z'
    };

    it('renders existing invoice information', () => {
      render(
        <InvoiceUpload
          expenseId={123}
          existingInvoice={mockInvoice}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      expect(screen.getByText('receipt.pdf')).toBeInTheDocument();
      expect(screen.getByText(/1000 KB/)).toBeInTheDocument();
      expect(screen.getByText(/uploaded/i)).toBeInTheDocument();
      
      expect(screen.getByRole('button', { name: /view invoice/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /replace invoice/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /delete invoice/i })).toBeInTheDocument();
    });

    it('handles view invoice action', async () => {
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

      // Check that the PDF viewer modal is opened
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText('Close PDF viewer')).toBeInTheDocument();
    });

    it('handles delete confirmation flow', async () => {
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

      // Should show confirmation buttons
      expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel delete/i })).toBeInTheDocument();

      // Click confirm
      const confirmButton = screen.getByRole('button', { name: /confirm delete/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/invoices/123', {
          method: 'DELETE'
        });
        expect(mockOnInvoiceDeleted).toHaveBeenCalled();
      });
    });

    it('handles delete cancellation', async () => {
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
      const deleteButton = screen.getByRole('button', { name: /delete invoice/i });
      await user.click(deleteButton);

      // Click cancel
      const cancelButton = screen.getByRole('button', { name: /cancel delete/i });
      await user.click(cancelButton);

      // Should return to normal state
      expect(screen.getByRole('button', { name: /delete invoice/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /confirm delete/i })).not.toBeInTheDocument();
    });
  });

  describe('File Validation', () => {
    it('validates file type', async () => {
      const user = userEvent.setup();
      
      render(
        <InvoiceUpload
          expenseId={123}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      // Create invalid file (not PDF)
      const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      
      const fileInput = document.querySelector('input[type="file"]');
      
      // Simulate file selection by directly calling the change handler
      Object.defineProperty(fileInput, 'files', {
        value: [invalidFile],
        writable: false,
      });
      
      fireEvent.change(fileInput);

      // Error should be displayed immediately since validation is synchronous
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/invalid file type/i)).toBeInTheDocument();
    });

    it('validates file size', async () => {
      const user = userEvent.setup();
      
      render(
        <InvoiceUpload
          expenseId={123}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      // Create oversized file (larger than 10MB)
      const oversizedFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.pdf', { 
        type: 'application/pdf' 
      });
      
      const fileInput = document.querySelector('input[type="file"]');
      await user.upload(fileInput, oversizedFile);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/exceeds the 10mb limit/i)).toBeInTheDocument();
      });
    });

    it('validates empty file', async () => {
      const user = userEvent.setup();
      
      render(
        <InvoiceUpload
          expenseId={123}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      // Create empty file
      const emptyFile = new File([], 'empty.pdf', { type: 'application/pdf' });
      
      const fileInput = document.querySelector('input[type="file"]');
      await user.upload(fileInput, emptyFile);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/file is empty/i)).toBeInTheDocument();
      });
    });
  });

  describe('Drag and Drop', () => {
    it('handles drag over events', async () => {
      render(
        <InvoiceUpload
          expenseId={123}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      const dropzone = screen.getByRole('button', { name: /upload invoice file/i });
      
      // Simulate drag over
      fireEvent.dragOver(dropzone, {
        dataTransfer: {
          files: [new File(['content'], 'test.pdf', { type: 'application/pdf' })]
        }
      });

      expect(dropzone).toHaveClass('drag-over');
    });

    it('handles drag leave events', async () => {
      render(
        <InvoiceUpload
          expenseId={123}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      const dropzone = screen.getByRole('button', { name: /upload invoice file/i });
      
      // Simulate drag over then drag leave
      fireEvent.dragOver(dropzone);
      fireEvent.dragLeave(dropzone, { target: dropzone });

      expect(dropzone).not.toHaveClass('drag-over');
    });

    it('handles file drop', async () => {
      render(
        <InvoiceUpload
          expenseId={123}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      const dropzone = screen.getByRole('button', { name: /upload invoice file/i });
      const validFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      
      // Simulate file drop
      fireEvent.drop(dropzone, {
        dataTransfer: {
          files: [validFile]
        }
      });

      await waitFor(() => {
        expect(dropzone).not.toHaveClass('drag-over');
        // Upload should be initiated (we can see uploading state)
        expect(screen.getByText(/uploading/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('displays and clears error messages', async () => {
      const user = userEvent.setup();
      
      render(
        <InvoiceUpload
          expenseId={123}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      // Trigger an error (invalid file)
      const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      const fileInput = document.querySelector('input[type="file"]');
      
      // Simulate file selection
      Object.defineProperty(fileInput, 'files', {
        value: [invalidFile],
        writable: false,
      });
      
      fireEvent.change(fileInput);

      // Error should be displayed immediately
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Clear error
      const clearButton = screen.getByRole('button', { name: /clear error/i });
      await user.click(clearButton);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('handles missing expense ID', async () => {
      const user = userEvent.setup();
      
      render(
        <InvoiceUpload
          expenseId={null}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      const validFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = document.querySelector('input[type="file"]');
      await user.upload(fileInput, validFile);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/expense id is required/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels and roles', () => {
      render(
        <InvoiceUpload
          expenseId={123}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      const dropzone = screen.getByRole('button', { name: /upload invoice file/i });
      expect(dropzone).toHaveAttribute('aria-describedby', 'upload-instructions');
      
      const instructions = screen.getByText(/or click to select file/i);
      expect(instructions).toHaveAttribute('id', 'upload-instructions');
    });

    it('supports screen readers with proper announcements', () => {
      const mockInvoice = {
        id: 1,
        expenseId: 123,
        filename: 'invoice_123_1234567890_receipt.pdf',
        originalFilename: 'receipt.pdf',
        fileSize: 1024000,
        uploadDate: '2025-01-01T12:00:00Z'
      };

      render(
        <InvoiceUpload
          expenseId={123}
          existingInvoice={mockInvoice}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      // Action buttons should have proper labels
      expect(screen.getByRole('button', { name: /view invoice/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /replace invoice/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /delete invoice/i })).toBeInTheDocument();
    });
  });

  describe('Mobile Support', () => {
    it('renders appropriately for touch interfaces', () => {
      render(
        <InvoiceUpload
          expenseId={123}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );

      const dropzone = screen.getByRole('button', { name: /upload invoice file/i });
      expect(dropzone).toBeInTheDocument();
      
      // Component should be touch-friendly (CSS handles the responsive behavior)
      expect(dropzone).toHaveClass('invoice-dropzone');
    });
  });
});