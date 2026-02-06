import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { API_ENDPOINTS } from '../config';
import { createLogger } from '../utils/logger';
import './InvoicePDFViewer.css';

const logger = createLogger('InvoicePDFViewer');

// Note: Using native browser PDF rendering via iframe/object instead of react-pdf
// This is more reliable across browsers and doesn't require PDF.js worker configuration

/**
 * InvoicePDFViewer Modal Component
 * 
 * A modal component for viewing PDF invoices within the application.
 * Features:
 * - PDF rendering with zoom controls
 * - Download and print functionality
 * - Multi-page PDF navigation
 * - Loading states and error handling
 * - Mobile responsiveness
 * - Keyboard navigation support
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 8.1, 8.2, 8.3, 8.4, 8.5
 */
const InvoicePDFViewer = ({
  isOpen = false,
  expenseId = null,
  invoiceId = null, // Optional: specific invoice ID for multi-invoice support
  invoiceName = 'Invoice',
  onClose = () => {}
}) => {
  // Component state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1.0);
  const [pdfUrl, setPdfUrl] = useState(null);
  const pdfUrlRef = useRef(null);

  // Zoom constants
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3.0;
  const ZOOM_STEP = 0.25;

  /**
   * Load PDF when modal opens
   */
  useEffect(() => {
    if (isOpen && expenseId) {
      loadPDF();
    } else {
      // Clean up when modal closes
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
        setPdfUrl(null);
      }
      setError(null);
      setZoom(1.0);
    }

    // Cleanup on unmount
    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
    };
  }, [isOpen, expenseId, invoiceId]);

  /**
   * Load PDF from server
   */
  const loadPDF = useCallback(async () => {
    if (!expenseId) return;

    setLoading(true);
    setError(null);

    try {
      // Use specific invoice endpoint if invoiceId is provided, otherwise use legacy file endpoint
      const fetchUrl = invoiceId 
        ? API_ENDPOINTS.INVOICE_FILE(expenseId, invoiceId)
        : API_ENDPOINTS.INVOICE_FILE_LEGACY(expenseId);
      
      const response = await fetch(fetchUrl);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Invoice not found');
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to load invoice (${response.status})`);
      }

      // Check if response is actually a PDF
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/pdf')) {
        // Try to get error message from JSON response
        const text = await response.text();
        try {
          const errorData = JSON.parse(text);
          throw new Error(errorData.error || 'Server returned an error instead of PDF');
        } catch (parseError) {
          throw new Error('Invalid file format - expected PDF');
        }
      }

      // Create blob URL for PDF
      const blob = await response.blob();
      
      // Verify blob is not empty
      if (blob.size === 0) {
        throw new Error('Received empty file from server');
      }
      
      // Revoke previous URL if any
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
      }
      const blobUrl = URL.createObjectURL(blob);
      pdfUrlRef.current = blobUrl;
      setPdfUrl(blobUrl);

    } catch (loadError) {
      logger.error('Failed to load PDF:', loadError);
      setError(loadError.message || 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  }, [expenseId, invoiceId]);

  /**
   * Handle zoom in
   */
  const handleZoomIn = useCallback(() => {
    setZoom(prevZoom => Math.min(prevZoom + ZOOM_STEP, MAX_ZOOM));
  }, []);

  /**
   * Handle zoom out
   */
  const handleZoomOut = useCallback(() => {
    setZoom(prevZoom => Math.max(prevZoom - ZOOM_STEP, MIN_ZOOM));
  }, []);

  /**
   * Reset zoom to 100%
   */
  const handleZoomReset = useCallback(() => {
    setZoom(1.0);
  }, []);

  /**
   * Handle download with enhanced error handling
   */
  const handleDownload = useCallback(async () => {
    if (!pdfUrl || !expenseId) return;

    try {
      // Create temporary link for download
      const link = document.createElement('a');
      link.href = pdfUrl;
      // Ensure we don't add double .pdf extension
      const downloadName = invoiceName.toLowerCase().endsWith('.pdf') 
        ? invoiceName 
        : `${invoiceName}.pdf`;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (downloadError) {
      logger.error('Download failed:', downloadError);
      setError('Failed to download invoice. Please try again.');
    }
  }, [pdfUrl, expenseId, invoiceName]);

  /**
   * Handle print with enhanced error handling
   */
  const handlePrint = useCallback(async () => {
    if (!pdfUrl) return;

    try {
      // Open PDF in new window for printing
      const printWindow = window.open(pdfUrl, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
        // Handle case where popup is blocked
        setTimeout(() => {
          if (printWindow.closed) {
            setError('Print popup was blocked. Please allow popups and try again.');
          }
        }, 1000);
      } else {
        throw new Error('Unable to open print window');
      }
    } catch (printError) {
      logger.error('Print failed:', printError);
      setError('Failed to open print dialog. Please try downloading the file instead.');
    }
  }, [pdfUrl]);

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback((event) => {
    if (!isOpen) return;

    switch (event.key) {
      case 'Escape':
        onClose();
        break;
      case '+':
      case '=':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          handleZoomIn();
        }
        break;
      case '-':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          handleZoomOut();
        }
        break;
      case '0':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          handleZoomReset();
        }
        break;
      default:
        break;
    }
  }, [isOpen, onClose, handleZoomIn, handleZoomOut, handleZoomReset]);

  /**
   * Handle modal backdrop click
   */
  const handleBackdropClick = useCallback((event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Add keyboard event listener
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, handleKeyDown]);

  // Don't render if not open
  if (!isOpen) {
    return null;
  }

  // Use portal to render modal at document body level
  // This ensures the modal appears above all other content regardless of stacking contexts
  return createPortal(
    <div 
      className="invoice-pdf-viewer-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-viewer-title"
    >
      <div className="invoice-pdf-viewer-modal">
        {/* Header */}
        <div className="pdf-viewer-header">
          <h3 id="pdf-viewer-title" className="pdf-viewer-title">
            {invoiceName}
          </h3>
          
          <div className="pdf-viewer-controls">
            {/* Zoom Controls */}
            <div className="zoom-controls">
              <button
                type="button"
                className="control-btn zoom-btn"
                onClick={handleZoomOut}
                disabled={zoom <= MIN_ZOOM}
                title="Zoom out (Ctrl + -)"
                aria-label="Zoom out"
              >
                🔍−
              </button>
              
              <span className="zoom-display" title="Current zoom level">
                {Math.round(zoom * 100)}%
              </span>
              
              <button
                type="button"
                className="control-btn zoom-btn"
                onClick={handleZoomIn}
                disabled={zoom >= MAX_ZOOM}
                title="Zoom in (Ctrl + +)"
                aria-label="Zoom in"
              >
                🔍+
              </button>
              
              <button
                type="button"
                className="control-btn reset-btn"
                onClick={handleZoomReset}
                title="Reset zoom (Ctrl + 0)"
                aria-label="Reset zoom to 100%"
              >
                Reset
              </button>
            </div>

            {/* Action Controls */}
            <div className="action-controls">
              <button
                type="button"
                className="control-btn download-btn"
                onClick={handleDownload}
                disabled={!pdfUrl}
                title="Download PDF"
                aria-label="Download invoice"
              >
                📥 Download
              </button>
              
              <button
                type="button"
                className="control-btn print-btn"
                onClick={handlePrint}
                disabled={!pdfUrl}
                title="Print PDF"
                aria-label="Print invoice"
              >
                🖨️ Print
              </button>
            </div>

            {/* Close Button */}
            <button
              type="button"
              className="control-btn close-btn"
              onClick={onClose}
              title="Close viewer (Esc)"
              aria-label="Close PDF viewer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="pdf-viewer-content">
          {loading && (
            <div className="pdf-loading" role="status" aria-live="polite">
              <div className="loading-spinner"></div>
              <div className="loading-text">Loading invoice...</div>
            </div>
          )}

          {error && (
            <div className="pdf-error" role="alert">
              <div className="error-icon">⚠️</div>
              <div className="error-message">
                <h4>Failed to load invoice</h4>
                <p>{error}</p>
                <button
                  type="button"
                  className="retry-btn"
                  onClick={loadPDF}
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {pdfUrl && !loading && !error && (
            <div className="pdf-container" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
              <iframe
                src={pdfUrl}
                title="Invoice PDF"
                className="pdf-iframe"
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          )}
        </div>

        {/* Footer with keyboard shortcuts */}
        <div className="pdf-viewer-footer">
          <div className="keyboard-shortcuts">
            <span className="shortcut-hint">
              Keyboard shortcuts: Esc (close), Ctrl+/- (zoom), Ctrl+0 (reset)
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default InvoicePDFViewer;