import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvoiceUpload from './InvoiceUpload';

// Mock the API endpoints
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    INVOICE_UPLOAD: '/api/invoices/upload',
    INVOICE_BY_EXPENSE: (id) => `/api/invoices/${id}`,
    INVOICE_METADATA: (id) => `/api/invoices/${id}/metadata`,
    INVOICES_FOR_EXPENSE: (id) => `/api/invoices/${id}`,
    INVOICE_BY_ID: (id) => `/api/invoices/invoice/${id}`,
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

// Mock InvoiceList component
vi.mock('./InvoiceList', () => ({
  default: ({ invoices, expenseId, people, onInvoiceDeleted, disabled }) => (
    <div data-testid="invoice-list">
      <span data-testid="invoice-count">{invoices?.length || 0} invoices</span>
      {invoices?.map(inv => (
        <div key={inv.id} data-testid={`invoice-item-${inv.id}`}>
          {inv.originalFilename}
        </div>
      ))}
    </div>
  )
}));

// Mock XMLHttpRequest for upload progress testing
class MockXMLHttpRequest {
  constructor() {
    this.upload = { addEventListener: vi.fn() };
    this.onload = null;
    this.status = 200;
    this.responseText = JSON.stringify({ success: true, invoice: { id: 1, filename: 'test.pdf' } });
    this.timeout = 0;
  }
  open() {}
  send() {
    setTimeout(() => { if (this.onload) this.onload(); }, 10);
  }
}

describe('InvoiceUpload Component', () => {
  let mockOnInvoiceUploaded;
  let mockOnInvoiceDeleted;
  let originalXMLHttpRequest;

  beforeEach(() => {
    mockOnInvoiceUploaded = vi.fn();
    mockOnInvoiceDeleted = vi.fn();
    originalXMLHttpRequest = global.XMLHttpRequest;
    global.XMLHttpRequest = MockXMLHttpRequest;
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.XMLHttpRequest = originalXMLHttpRequest;
    delete global.fetch;
  });

  describe('Upload Interface', () => {
    it('renders upload dropzone when no existing invoices', () => {
      render(
        <InvoiceUpload
          expenseId={123}
          onInvoiceUploaded={mockOnInvoiceUploaded}
          onInvoiceDeleted={mockOnInvoiceDeleted}
        />
      );
      expect(screen.getByRole('button', { name: /upload invoice file/i })).toBeInTheDocument();
      expect(screen.getByText(/drag & drop pdf file here/i)).toBeInTheDocument();
    });

    it('shows disabled state when disabled prop is true', () => {
      render(
        <InvoiceUpload expenseId={123} disabled={true} onInvoiceUploaded={mockOnInvoiceUploaded} onInvoiceDeleted={mockOnInvoiceDeleted} />
      );
      const dropzone = screen.getByRole('button', { name: /upload invoice file/i });
      expect(dropzone).toHaveClass('disabled');
    });
  });

  describe('Person Dropdown Visibility', () => {
    const mockPeople = [{ id: 1, name: 'John Doe' }, { id: 2, name: 'Jane Smith' }];

    it('shows person dropdown when people are assigned to expense', () => {
      render(
        <InvoiceUpload expenseId={123} people={mockPeople} onInvoiceUploaded={mockOnInvoiceUploaded} onInvoiceDeleted={mockOnInvoiceDeleted} />
      );
      expect(screen.getByLabelText(/link to person/i)).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    it('hides person dropdown when no people are assigned', () => {
      render(
        <InvoiceUpload expenseId={123} people={[]} onInvoiceUploaded={mockOnInvoiceUploaded} onInvoiceDeleted={mockOnInvoiceDeleted} />
      );
      expect(screen.queryByLabelText(/link to person/i)).not.toBeInTheDocument();
    });

    it('allows selecting a person from dropdown', async () => {
      const user = userEvent.setup();
      render(
        <InvoiceUpload expenseId={123} people={mockPeople} onInvoiceUploaded={mockOnInvoiceUploaded} onInvoiceDeleted={mockOnInvoiceDeleted} />
      );
      const dropdown = screen.getByRole('combobox');
      await user.selectOptions(dropdown, '1');
      expect(dropdown).toHaveValue('1');
    });
  });

  describe('Add Invoice Button Appearance', () => {
    const mockInvoices = [{ id: 1, expenseId: 123, originalFilename: 'receipt.pdf', fileSize: 1024000, uploadDate: '2025-01-01T12:00:00Z' }];

    it('shows Add Invoice button when invoices exist', () => {
      render(
        <InvoiceUpload expenseId={123} existingInvoices={mockInvoices} onInvoiceUploaded={mockOnInvoiceUploaded} onInvoiceDeleted={mockOnInvoiceDeleted} />
      );
      expect(screen.getByRole('button', { name: /add another invoice/i })).toBeInTheDocument();
    });

    it('shows upload form when Add Invoice button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <InvoiceUpload expenseId={123} existingInvoices={mockInvoices} onInvoiceUploaded={mockOnInvoiceUploaded} onInvoiceDeleted={mockOnInvoiceDeleted} />
      );
      await user.click(screen.getByRole('button', { name: /add another invoice/i }));
      expect(screen.getByRole('button', { name: /upload invoice file/i })).toBeInTheDocument();
    });

    it('shows Cancel button when adding invoice to existing list', async () => {
      const user = userEvent.setup();
      render(
        <InvoiceUpload expenseId={123} existingInvoices={mockInvoices} onInvoiceUploaded={mockOnInvoiceUploaded} onInvoiceDeleted={mockOnInvoiceDeleted} />
      );
      await user.click(screen.getByRole('button', { name: /add another invoice/i }));
      expect(screen.getByRole('button', { name: /cancel adding invoice/i })).toBeInTheDocument();
    });

    it('hides upload form when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(
        <InvoiceUpload expenseId={123} existingInvoices={mockInvoices} onInvoiceUploaded={mockOnInvoiceUploaded} onInvoiceDeleted={mockOnInvoiceDeleted} />
      );
      await user.click(screen.getByRole('button', { name: /add another invoice/i }));
      await user.click(screen.getByRole('button', { name: /cancel adding invoice/i }));
      expect(screen.getByRole('button', { name: /add another invoice/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /upload invoice file/i })).not.toBeInTheDocument();
    });
  });

  describe('Upload with Person Selection', () => {
    const mockPeople = [{ id: 1, name: 'John Doe' }, { id: 2, name: 'Jane Smith' }];
    const mockInvoices = [{ id: 1, expenseId: 123, originalFilename: 'receipt.pdf', fileSize: 1024000, uploadDate: '2025-01-01T12:00:00Z' }];

    it('shows person dropdown in upload form when adding to existing invoices', async () => {
      const user = userEvent.setup();
      render(
        <InvoiceUpload expenseId={123} existingInvoices={mockInvoices} people={mockPeople} onInvoiceUploaded={mockOnInvoiceUploaded} onInvoiceDeleted={mockOnInvoiceDeleted} />
      );
      await user.click(screen.getByRole('button', { name: /add another invoice/i }));
      expect(screen.getByLabelText(/link to person/i)).toBeInTheDocument();
    });

    it('resets person selection when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(
        <InvoiceUpload expenseId={123} existingInvoices={mockInvoices} people={mockPeople} onInvoiceUploaded={mockOnInvoiceUploaded} onInvoiceDeleted={mockOnInvoiceDeleted} />
      );
      await user.click(screen.getByRole('button', { name: /add another invoice/i }));
      const dropdown = screen.getByRole('combobox');
      await user.selectOptions(dropdown, '1');
      expect(dropdown).toHaveValue('1');
      await user.click(screen.getByRole('button', { name: /cancel adding invoice/i }));
      await user.click(screen.getByRole('button', { name: /add another invoice/i }));
      expect(screen.getByRole('combobox')).toHaveValue('');
    });
  });

  describe('File Validation', () => {
    it('validates file type and shows error', async () => {
      render(
        <InvoiceUpload expenseId={123} onInvoiceUploaded={mockOnInvoiceUploaded} onInvoiceDeleted={mockOnInvoiceDeleted} />
      );
      const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      const fileInput = document.querySelector('input[type="file"]');
      Object.defineProperty(fileInput, 'files', { value: [invalidFile], writable: false });
      fireEvent.change(fileInput);
      const errorAlert = screen.getByRole('alert');
      expect(errorAlert).toBeInTheDocument();
      expect(within(errorAlert).getByText(/invalid file type/i)).toBeInTheDocument();
    });
  });

  describe('Drag and Drop', () => {
    it('handles drag over events', () => {
      render(
        <InvoiceUpload expenseId={123} onInvoiceUploaded={mockOnInvoiceUploaded} onInvoiceDeleted={mockOnInvoiceDeleted} />
      );
      const dropzone = screen.getByRole('button', { name: /upload invoice file/i });
      fireEvent.dragOver(dropzone, { dataTransfer: { files: [new File(['content'], 'test.pdf', { type: 'application/pdf' })] } });
      expect(dropzone).toHaveClass('drag-over');
    });
  });

  describe('Error Handling', () => {
    it('displays and clears error messages', async () => {
      const user = userEvent.setup();
      render(
        <InvoiceUpload expenseId={123} onInvoiceUploaded={mockOnInvoiceUploaded} onInvoiceDeleted={mockOnInvoiceDeleted} />
      );
      const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      const fileInput = document.querySelector('input[type="file"]');
      Object.defineProperty(fileInput, 'files', { value: [invalidFile], writable: false });
      fireEvent.change(fileInput);
      expect(screen.getByRole('alert')).toBeInTheDocument();
      const clearButton = screen.getByRole('button', { name: /clear error/i });
      await user.click(clearButton);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels and roles for dropzone', () => {
      render(
        <InvoiceUpload expenseId={123} onInvoiceUploaded={mockOnInvoiceUploaded} onInvoiceDeleted={mockOnInvoiceDeleted} />
      );
      const dropzone = screen.getByRole('button', { name: /upload invoice file/i });
      expect(dropzone).toHaveAttribute('aria-describedby', 'upload-instructions');
      const instructions = screen.getByText(/or click to select file/i);
      expect(instructions).toHaveAttribute('id', 'upload-instructions');
    });

    it('person dropdown has proper accessibility attributes', () => {
      const mockPeople = [{ id: 1, name: 'John Doe' }];
      render(
        <InvoiceUpload expenseId={123} people={mockPeople} onInvoiceUploaded={mockOnInvoiceUploaded} onInvoiceDeleted={mockOnInvoiceDeleted} />
      );
      const dropdown = screen.getByRole('combobox');
      expect(dropdown).toHaveAttribute('aria-label', 'Select person to link invoice to');
    });

    it('Add Invoice button has proper accessibility label', () => {
      const mockInvoices = [{ id: 1, expenseId: 123, originalFilename: 'receipt.pdf', fileSize: 1024000, uploadDate: '2025-01-01T12:00:00Z' }];
      render(
        <InvoiceUpload expenseId={123} existingInvoices={mockInvoices} onInvoiceUploaded={mockOnInvoiceUploaded} onInvoiceDeleted={mockOnInvoiceDeleted} />
      );
      const addButton = screen.getByRole('button', { name: /add another invoice/i });
      expect(addButton).toHaveAttribute('aria-label', 'Add another invoice');
    });
  });
});
