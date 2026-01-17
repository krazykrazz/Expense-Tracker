import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import InvoiceIndicator from './InvoiceIndicator';

// Mock the InvoicePDFViewer component
vi.mock('./InvoicePDFViewer', () => ({
  default: ({ isOpen, onClose, invoiceName }) => (
    isOpen ? (
      <div data-testid="pdf-viewer-modal">
        <span>PDF Viewer: {invoiceName}</span>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
  )
}));

describe('InvoiceIndicator', () => {
  const mockInvoiceInfo = {
    id: 1,
    expenseId: 123,
    filename: '123_1704067200_receipt.pdf',
    originalFilename: 'receipt.pdf',
    fileSize: 245760,
    uploadDate: '2025-01-01T12:00:00Z'
  };

  const mockMultipleInvoices = [
    {
      id: 1,
      expenseId: 123,
      filename: '123_1704067200_receipt1.pdf',
      originalFilename: 'receipt1.pdf',
      fileSize: 245760,
      uploadDate: '2025-01-01T12:00:00Z'
    },
    {
      id: 2,
      expenseId: 123,
      filename: '123_1704067201_receipt2.pdf',
      originalFilename: 'receipt2.pdf',
      fileSize: 512000,
      uploadDate: '2025-01-02T12:00:00Z'
    },
    {
      id: 3,
      expenseId: 123,
      filename: '123_1704067202_receipt3.pdf',
      originalFilename: 'receipt3.pdf',
      fileSize: 102400,
      uploadDate: '2025-01-03T12:00:00Z'
    }
  ];

  it('renders nothing when no invoice and no text', () => {
    const { container } = render(
      <InvoiceIndicator hasInvoice={false} showText={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders with invoice indicator when hasInvoice is true', () => {
    render(
      <InvoiceIndicator 
        hasInvoice={true} 
        invoiceInfo={mockInvoiceInfo}
        expenseId={123}
      />
    );
    
    const indicator = screen.getByRole('button');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveClass('invoice-indicator', 'has-invoice', 'clickable');
  });

  it('renders with different sizes', () => {
    const { rerender } = render(
      <InvoiceIndicator hasInvoice={true} size="small" />
    );
    expect(screen.getByRole('img')).toHaveClass('small');

    rerender(<InvoiceIndicator hasInvoice={true} size="large" />);
    expect(screen.getByRole('img')).toHaveClass('large');
  });

  it('shows text when showText is true', () => {
    render(
      <InvoiceIndicator 
        hasInvoice={true} 
        showText={true}
        invoiceInfo={mockInvoiceInfo}
      />
    );
    
    expect(screen.getByText('Invoice')).toBeInTheDocument();
  });

  it('shows no invoice text when hasInvoice is false and showText is true', () => {
    render(
      <InvoiceIndicator 
        hasInvoice={false} 
        showText={true}
      />
    );
    
    expect(screen.getByText('No Invoice')).toBeInTheDocument();
  });

  it('displays invoice details in large size', () => {
    render(
      <InvoiceIndicator 
        hasInvoice={true}
        size="large"
        invoiceInfo={mockInvoiceInfo}
      />
    );
    
    expect(screen.getByText('receipt.pdf')).toBeInTheDocument();
    expect(screen.getByText(/240 KB/)).toBeInTheDocument();
  });

  it('opens PDF viewer when clicked', () => {
    render(
      <InvoiceIndicator 
        hasInvoice={true}
        expenseId={123}
        invoiceInfo={mockInvoiceInfo}
      />
    );
    
    const indicator = screen.getByRole('button');
    fireEvent.click(indicator);
    
    expect(screen.getByTestId('pdf-viewer-modal')).toBeInTheDocument();
    expect(screen.getByText('PDF Viewer: receipt.pdf')).toBeInTheDocument();
  });

  it('calls custom onClick handler when provided', () => {
    const mockOnClick = vi.fn();
    render(
      <InvoiceIndicator 
        hasInvoice={true}
        onClick={mockOnClick}
      />
    );
    
    const indicator = screen.getByRole('button');
    fireEvent.click(indicator);
    
    expect(mockOnClick).toHaveBeenCalled();
  });

  it('handles keyboard navigation', () => {
    render(
      <InvoiceIndicator 
        hasInvoice={true}
        expenseId={123}
        invoiceInfo={mockInvoiceInfo}
      />
    );
    
    const indicator = screen.getByRole('button');
    fireEvent.keyDown(indicator, { key: 'Enter' });
    
    expect(screen.getByTestId('pdf-viewer-modal')).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(
      <InvoiceIndicator 
        hasInvoice={true}
        expenseId={123}
        invoiceInfo={mockInvoiceInfo}
      />
    );
    
    const indicator = screen.getByRole('button');
    expect(indicator).toHaveAttribute('aria-label', 'View invoice attachment');
    expect(indicator).toHaveAttribute('tabIndex', '0');
  });

  it('shows proper tooltip text', () => {
    render(
      <InvoiceIndicator 
        hasInvoice={true}
        invoiceInfo={mockInvoiceInfo}
      />
    );
    
    const indicator = screen.getByRole('img');
    expect(indicator).toHaveAttribute('title');
    const title = indicator.getAttribute('title');
    expect(title).toContain('receipt.pdf');
    expect(title).toContain('240 KB');
  });

  it('formats file size correctly', () => {
    const largeFileInfo = {
      ...mockInvoiceInfo,
      fileSize: 2048576 // 2MB
    };

    render(
      <InvoiceIndicator 
        hasInvoice={true}
        size="large"
        invoiceInfo={largeFileInfo}
      />
    );
    
    expect(screen.getByText(/2 MB/)).toBeInTheDocument();
  });

  // Multi-invoice tests
  describe('Multi-Invoice Support', () => {
    it('shows count badge when invoiceCount > 1', () => {
      render(
        <InvoiceIndicator 
          hasInvoice={true}
          invoiceCount={3}
          expenseId={123}
        />
      );
      
      const badge = screen.getByText('3');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('invoice-count-badge');
    });

    it('shows count badge when invoices array has multiple items', () => {
      render(
        <InvoiceIndicator 
          hasInvoice={true}
          invoices={mockMultipleInvoices}
          expenseId={123}
        />
      );
      
      const badge = screen.getByText('3');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('invoice-count-badge');
    });

    it('does not show count badge for single invoice', () => {
      render(
        <InvoiceIndicator 
          hasInvoice={true}
          invoiceCount={1}
          invoiceInfo={mockInvoiceInfo}
          expenseId={123}
        />
      );
      
      expect(screen.queryByText('1')).not.toBeInTheDocument();
    });

    it('shows multi-invoice class when count > 1', () => {
      render(
        <InvoiceIndicator 
          hasInvoice={true}
          invoiceCount={3}
          expenseId={123}
        />
      );
      
      const indicator = screen.getByRole('button');
      expect(indicator).toHaveClass('multi-invoice');
    });

    it('shows tooltip with all filenames for multiple invoices', () => {
      render(
        <InvoiceIndicator 
          hasInvoice={true}
          invoices={mockMultipleInvoices}
          expenseId={123}
        />
      );
      
      const indicator = screen.getByRole('button');
      const title = indicator.getAttribute('title');
      expect(title).toContain('3 invoices attached');
      expect(title).toContain('receipt1.pdf');
      expect(title).toContain('receipt2.pdf');
      expect(title).toContain('receipt3.pdf');
    });

    it('shows correct text for multiple invoices with showText', () => {
      render(
        <InvoiceIndicator 
          hasInvoice={true}
          invoiceCount={3}
          showText={true}
          expenseId={123}
        />
      );
      
      expect(screen.getByText('3 Invoices')).toBeInTheDocument();
    });

    it('shows multi-invoice details in large size', () => {
      render(
        <InvoiceIndicator 
          hasInvoice={true}
          invoiceCount={3}
          size="large"
          expenseId={123}
        />
      );
      
      expect(screen.getByText('3 invoices attached')).toBeInTheDocument();
      expect(screen.getByText('Click to view all')).toBeInTheDocument();
    });

    it('has correct aria-label for multiple invoices', () => {
      render(
        <InvoiceIndicator 
          hasInvoice={true}
          invoiceCount={3}
          expenseId={123}
        />
      );
      
      const indicator = screen.getByRole('button');
      expect(indicator).toHaveAttribute('aria-label', 'View 3 invoice attachments');
    });

    it('calls onClick for multiple invoices instead of opening PDF viewer', () => {
      const mockOnClick = vi.fn();
      render(
        <InvoiceIndicator 
          hasInvoice={true}
          invoiceCount={3}
          onClick={mockOnClick}
          expenseId={123}
        />
      );
      
      const indicator = screen.getByRole('button');
      fireEvent.click(indicator);
      
      expect(mockOnClick).toHaveBeenCalled();
      expect(screen.queryByTestId('pdf-viewer-modal')).not.toBeInTheDocument();
    });

    it('does not open PDF viewer for multiple invoices without onClick', () => {
      render(
        <InvoiceIndicator 
          hasInvoice={true}
          invoiceCount={3}
          expenseId={123}
        />
      );
      
      const indicator = screen.getByRole('button');
      fireEvent.click(indicator);
      
      // PDF viewer should not open for multiple invoices
      expect(screen.queryByTestId('pdf-viewer-modal')).not.toBeInTheDocument();
    });

    it('prioritizes invoiceCount over invoices array length', () => {
      render(
        <InvoiceIndicator 
          hasInvoice={true}
          invoiceCount={5}
          invoices={mockMultipleInvoices} // 3 items
          expenseId={123}
        />
      );
      
      const badge = screen.getByText('5');
      expect(badge).toBeInTheDocument();
    });
  });

  // Property-Based Tests
  describe('Property-Based Tests', () => {
    /**
     * Property 11: Invoice Count Display Accuracy
     * For any expense with N invoices (where N > 1), the invoice indicator SHALL display the count N.
     * 
     * **Validates: Requirements 6.1**
     */
    it('Property 11: Invoice Count Display Accuracy - count badge shows exact invoice count', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 100 }), // N > 1 for count badge to show
          (invoiceCount) => {
            const { container, unmount } = render(
              <InvoiceIndicator 
                hasInvoice={true}
                invoiceCount={invoiceCount}
                expenseId={123}
              />
            );
            
            // Find the count badge
            const badge = container.querySelector('.invoice-count-badge');
            expect(badge).not.toBeNull();
            expect(badge.textContent).toBe(String(invoiceCount));
            
            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Property 11: Invoice Count Display Accuracy - no badge for single invoice', () => {
      fc.assert(
        fc.property(
          fc.constant(1), // Single invoice
          (invoiceCount) => {
            const { container, unmount } = render(
              <InvoiceIndicator 
                hasInvoice={true}
                invoiceCount={invoiceCount}
                expenseId={123}
              />
            );
            
            // Count badge should not exist for single invoice
            const badge = container.querySelector('.invoice-count-badge');
            expect(badge).toBeNull();
            
            unmount();
          }
        ),
        { numRuns: 10 }
      );
    });

    it('Property 11: Invoice Count Display Accuracy - count derived from invoices array', () => {
      // Generate arbitrary invoice arrays
      const invoiceArb = fc.record({
        id: fc.integer({ min: 1, max: 1000 }),
        expenseId: fc.constant(123),
        filename: fc.stringMatching(/^[a-z0-9_]+\.pdf$/),
        originalFilename: fc.stringMatching(/^[a-z0-9_]+\.pdf$/),
        fileSize: fc.integer({ min: 1000, max: 10000000 }),
        uploadDate: fc.constant('2025-01-01T12:00:00Z')
      });

      fc.assert(
        fc.property(
          fc.array(invoiceArb, { minLength: 2, maxLength: 10 }),
          (invoices) => {
            const { container, unmount } = render(
              <InvoiceIndicator 
                hasInvoice={true}
                invoices={invoices}
                expenseId={123}
              />
            );
            
            // Count badge should show the array length
            const badge = container.querySelector('.invoice-count-badge');
            expect(badge).not.toBeNull();
            expect(badge.textContent).toBe(String(invoices.length));
            
            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});