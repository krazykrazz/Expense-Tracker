import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import InvoicePDFViewer from './InvoicePDFViewer';

// Mock fetch for PDF loading
global.fetch = vi.fn();

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-blob-url');
global.URL.revokeObjectURL = vi.fn();

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
      blob: vi.fn().mockResolvedValue(new Blob(['mock pdf'], { type: 'application/pdf' }))
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
        expect(fetch).toHaveBeenCalledWith('/api/invoices/123');
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
        }
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
      
      // Mock document.createElement and appendChild/removeChild
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn()
      };
      const createElement = vi.spyOn(document, 'createElement').mockReturnValue(mockLink);
      const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
      const removeChild = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
      
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Download invoice')).toBeInTheDocument();
      });
      
      await user.click(screen.getByLabelText('Download invoice'));
      
      expect(createElement).toHaveBeenCalledWith('a');
      expect(mockLink.click).toHaveBeenCalled();
      expect(appendChild).toHaveBeenCalledWith(mockLink);
      expect(removeChild).toHaveBeenCalledWith(mockLink);
      
      createElement.mockRestore();
      appendChild.mockRestore();
      removeChild.mockRestore();
    });

    it('handles print action', async () => {
      const user = userEvent.setup();
      
      // Mock window.open
      const mockPrintWindow = {
        onload: null,
        print: vi.fn()
      };
      const windowOpen = vi.spyOn(window, 'open').mockReturnValue(mockPrintWindow);
      
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Print invoice')).toBeInTheDocument();
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
    it('shows page controls for multi-page PDFs', async () => {
      render(<InvoicePDFViewer {...defaultProps} />);
      
      // Wait for PDF to load and trigger onLoadSuccess with multiple pages
      await waitFor(() => {
        expect(screen.getByTestId('pdf-page')).toBeInTheDocument();
      });
      
      // The mock in vitest.setup.js simulates 2 pages
      expect(screen.getByLabelText('Previous page')).toBeInTheDocument();
      expect(screen.getByLabelText('Next page')).toBeInTheDocument();
      expect(screen.getByLabelText('Page number')).toBeInTheDocument();
      expect(screen.getByText('of 2')).toBeInTheDocument();
    });

    it('handles page navigation with arrow keys', async () => {
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('pdf-page')).toBeInTheDocument();
      });
      
      // Should start on page 1
      const pageInput = screen.getByLabelText('Page number');
      expect(pageInput.value).toBe('1');
      
      // Navigate to next page
      fireEvent.keyDown(document, { key: 'ArrowRight' });
      
      await waitFor(() => {
        expect(pageInput.value).toBe('2');
      });
      
      // Navigate back to previous page
      fireEvent.keyDown(document, { key: 'ArrowLeft' });
      
      await waitFor(() => {
        expect(pageInput.value).toBe('1');
      });
    });

    it('handles Home and End keys for page navigation', async () => {
      render(<InvoicePDFViewer {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('pdf-page')).toBeInTheDocument();
      });
      
      const pageInput = screen.getByLabelText('Page number');
      
      // Go to last page with End key
      fireEvent.keyDown(document, { key: 'End' });
      
      await waitFor(() => {
        expect(pageInput.value).toBe('2');
      });
      
      // Go to first page with Home key
      fireEvent.keyDown(document, { key: 'Home' });
      
      await waitFor(() => {
        expect(pageInput.value).toBe('1');
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
        blob: vi.fn().mockResolvedValue(new Blob(['mock pdf'], { type: 'application/pdf' }))
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
    it('cleans up blob URL when modal closes', () => {
      const { rerender } = render(<InvoicePDFViewer {...defaultProps} />);
      
      // Close modal
      rerender(<InvoicePDFViewer {...defaultProps} isOpen={false} />);
      
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('mock-blob-url');
    });

    it('cleans up blob URL on unmount', () => {
      const { unmount } = render(<InvoicePDFViewer {...defaultProps} />);
      
      unmount();
      
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('mock-blob-url');
    });
  });
});