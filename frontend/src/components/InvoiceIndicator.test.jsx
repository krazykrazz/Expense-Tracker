import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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
});