import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import InvoicePDFViewer from './InvoicePDFViewer';

// Mock fetch for PDF loading
global.fetch = vi.fn();

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-blob-url');
global.URL.revokeObjectURL = vi.fn();

// Mock the config to use relative URLs
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    INVOICE_FILE: (expenseId, invoiceId) => `/api/invoices/${expenseId}/${invoiceId}`,
    INVOICE_FILE_LEGACY: (expenseId) => `/api/invoices/${expenseId}/file`
  }
}));

describe('InvoicePDFViewer Component', () => {
  const defaultProps = {
    isOpen: true,
    expenseId: 123,
    invoiceName: 'Test Invoice',
    onClose: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock successful PDF fetch
    fetch.mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn().mockReturnValue('application/pdf')
      },
      blob: vi.fn().mockResolvedValue(new Blob(['mock pdf'], { type: 'application/pdf' })),
      text: vi.fn().mockResolvedValue(''),
      json: vi.fn().mockResolvedValue({})
    });
  });

  describe('Modal Rendering', () => {
    it('renders modal when isOpen is true', () => {
      render(<InvoicePDFViewer {...defaultProps} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Test Invoice')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      render(<InvoicePDFViewer {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows loading state initially', () => {
      render(<InvoicePDFViewer {...defaultProps} />);
      
      expect(screen.getByText('Loading invoice...')).toBeInTheDocument();
    });
  });

  describe('PDF Loading', () => {
    it('loads PDF when modal opens', async () => {
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/invoices/123/file'));
      });
    });

    it('handles PDF load error', async () => {
      fetch.mockRejectedValue(new Error('Network error'));
      
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load invoice')).toBeInTheDocument();
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('handles invalid content type', async () => {
      fetch.mockResolvedValue({
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('text/html')
        },
        text: vi.fn().mockResolvedValue('Not a PDF'),
        json: vi.fn().mockRejectedValue(new Error('Not JSON'))
      });
      
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Invalid file format - expected PDF')).toBeInTheDocument();
      });
    });
  });

  describe('Zoom Controls', () => {
    it('renders zoom controls', async () => {
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
        expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
        expect(screen.getByLabelText('Reset zoom to 100%')).toBeInTheDocument();
        expect(screen.getByText('100%')).toBeInTheDocument();
      });
    });

    it('handles zoom in', async () => {
      const user = userEvent.setup();
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
      });
      
      await user.click(screen.getByLabelText('Zoom in'));
      
      expect(screen.getByText('125%')).toBeInTheDocument();
    });

    it('handles zoom out', async () => {
      const user = userEvent.setup();
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
      });
      
      await user.click(screen.getByLabelText('Zoom out'));
      
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('handles zoom reset', async () => {
      const user = userEvent.setup();
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
      });
      
      // Zoom in first
      await user.click(screen.getByLabelText('Zoom in'));
      expect(screen.getByText('125%')).toBeInTheDocument();
      
      // Reset zoom
      await user.click(screen.getByLabelText('Reset zoom to 100%'));
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('respects zoom limits', async () => {
      const user = userEvent.setup();
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
      });
      
      // Test zoom out limit
      const zoomOutBtn = screen.getByLabelText('Zoom out');
      await user.click(zoomOutBtn);
      await user.click(zoomOutBtn);
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(zoomOutBtn).toBeDisabled();
      
      // Test zoom in limit
      const zoomInBtn = screen.getByLabelText('Zoom in');
      // Click multiple times to reach max zoom
      for (let i = 0; i < 10; i++) {
        await user.click(zoomInBtn);
      }
      expect(screen.getByText('300%')).toBeInTheDocument();
      expect(zoomInBtn).toBeDisabled();
    });
  });

  describe('Action Controls', () => {
    it('renders action controls', async () => {
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Download invoice')).toBeInTheDocument();
        expect(screen.getByLabelText('Print invoice')).toBeInTheDocument();
        expect(screen.getByLabelText('Close PDF viewer')).toBeInTheDocument();
      });
    });

    it('handles download action', async () => {
      const user = userEvent.setup();
      
      // Create a spy on the click method of anchor elements
      const clickSpy = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
        const element = originalCreateElement(tagName);
        if (tagName === 'a') {
          element.click = clickSpy;
        }
        return element;
      });
      
      render(<InvoicePDFViewer {...defaultProps} />);
      
      // Wait for PDF to load
      await waitFor(() => {
        expect(screen.getByLabelText('Download invoice')).not.toBeDisabled();
      });
      
      await user.click(screen.getByLabelText('Download invoice'));
      
      expect(clickSpy).toHaveBeenCalled();
      
      vi.restoreAllMocks();
    });

    it('handles print action', async () => {
      const user = userEvent.setup();
      
      // Mock window.open
      const mockPrintWindow = {
        onload: null,
        print: vi.fn(),
        closed: false
      };
      const windowOpen = vi.spyOn(window, 'open').mockReturnValue(mockPrintWindow);
      
      render(<InvoicePDFViewer {...defaultProps} />);
      
      // Wait for PDF to load
      await waitFor(() => {
        expect(screen.getByLabelText('Print invoice')).not.toBeDisabled();
      });
      
      await user.click(screen.getByLabelText('Print invoice'));
      
      expect(windowOpen).toHaveBeenCalledWith('mock-blob-url', '_blank');
      
      windowOpen.mockRestore();
    });

    it('handles close action', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      
      render(<InvoicePDFViewer {...defaultProps} onClose={onClose} />);
      
      await user.click(screen.getByLabelText('Close PDF viewer'));
      
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Keyboard Navigation', () => {
    it('handles Escape key to close', () => {
      const onClose = vi.fn();
      render(<InvoicePDFViewer {...defaultProps} onClose={onClose} />);
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(onClose).toHaveBeenCalled();
    });

    it('handles Ctrl+Plus for zoom in', async () => {
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
      });
      
      fireEvent.keyDown(document, { key: '+', ctrlKey: true });
      
      expect(screen.getByText('125%')).toBeInTheDocument();
    });

    it('handles Ctrl+Minus for zoom out', async () => {
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
      });
      
      fireEvent.keyDown(document, { key: '-', ctrlKey: true });
      
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('handles Ctrl+0 for zoom reset', async () => {
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
      });
      
      // Zoom in first
      fireEvent.keyDown(document, { key: '+', ctrlKey: true });
      expect(screen.getByText('125%')).toBeInTheDocument();
      
      // Reset zoom
      fireEvent.keyDown(document, { key: '0', ctrlKey: true });
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  describe('Page Navigation', () => {
    // Note: The component uses native browser PDF rendering via iframe
    // Page navigation is handled by the browser's built-in PDF viewer
    // These tests verify the component renders correctly with the iframe
    
    it('renders PDF in iframe when loaded', async () => {
      render(<InvoicePDFViewer {...defaultProps} />);
      
      // Wait for PDF to load
      await waitFor(() => {
        const iframe = document.querySelector('.pdf-iframe');
        expect(iframe).toBeInTheDocument();
        expect(iframe).toHaveAttribute('src', 'mock-blob-url');
      });
    });

    it('applies zoom transform to PDF container', async () => {
      render(<InvoicePDFViewer {...defaultProps} />);
      
      // Wait for PDF to load
      await waitFor(() => {
        const container = document.querySelector('.pdf-container');
        expect(container).toBeInTheDocument();
        expect(container.style.transform).toBe('scale(1)');
      });
      
      // Zoom in
      fireEvent.click(screen.getByLabelText('Zoom in'));
      
      await waitFor(() => {
        const container = document.querySelector('.pdf-container');
        expect(container.style.transform).toBe('scale(1.25)');
      });
    });
  });

  describe('Error Handling', () => {
    it('shows retry button on error', async () => {
      fetch.mockRejectedValue(new Error('Network error'));
      
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Try Again')).toBeInTheDocument();
      });
    });

    it('retries PDF load when retry button is clicked', async () => {
      const user = userEvent.setup();
      
      // First call fails
      fetch.mockRejectedValueOnce(new Error('Network error'));
      // Second call succeeds
      fetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('application/pdf')
        },
        blob: vi.fn().mockResolvedValue(new Blob(['mock pdf'], { type: 'application/pdf' })),
        text: vi.fn().mockResolvedValue(''),
        json: vi.fn().mockResolvedValue({})
      });
      
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Try Again')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Try Again'));
      
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels and roles', async () => {
      render(<InvoicePDFViewer {...defaultProps} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
      expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
      expect(screen.getByLabelText('Download invoice')).toBeInTheDocument();
      expect(screen.getByLabelText('Print invoice')).toBeInTheDocument();
      expect(screen.getByLabelText('Close PDF viewer')).toBeInTheDocument();
    });

    it('has proper modal attributes', () => {
      render(<InvoicePDFViewer {...defaultProps} />);
      
      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-labelledby', 'pdf-viewer-title');
    });
  });

  describe('Cleanup', () => {
    it('cleans up blob URL when modal closes', async () => {
      const { rerender } = render(<InvoicePDFViewer {...defaultProps} />);
      
      // Wait for PDF to load
      await waitFor(() => {
        const iframe = document.querySelector('.pdf-iframe');
        expect(iframe).toBeInTheDocument();
      });

      // Close modal
      rerender(<InvoicePDFViewer {...defaultProps} isOpen={false} />);
      
      await waitFor(() => {
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('mock-blob-url');
      });
    });

    it('does not render iframe when modal is closed', () => {
      render(<InvoicePDFViewer {...defaultProps} isOpen={false} />);
      
      // No iframe should be rendered when modal is closed
      expect(document.querySelector('.pdf-iframe')).not.toBeInTheDocument();
    });
  });
});