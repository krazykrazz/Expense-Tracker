import { useState, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { API_ENDPOINTS } from '../config';
import './InvoicePDFViewer.css';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

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
  invoiceName = 'Invoice',
  onClose = () => {}
}) => {
  // Component state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1.0);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);

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
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
      setError(null);
      setZoom(1.0);
      setPageNumber(1);
      setNumPages(null);
    }

    // Cleanup on unmount
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [isOpen, expenseId]);

  /**
   * Load PDF from server
   */
  const loadPDF = useCallback(async () => {
    if (!expenseId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.INVOICE_BY_EXPENSE(expenseId));

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
        throw new Error('Invalid file format - expected PDF');
      }

      // Create blob URL for PDF
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);

    } catch (loadError) {
      console.error('Failed to load PDF:', loadError);
      setError(loadError.message || 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  }, [expenseId]);

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
   * Handle PDF document load success
   */
  const onDocumentLoadSuccess = useCallback(({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setLoading(false);
    setError(null);
  }, []);

  /**
   * Handle PDF document load error
   */
  const onDocumentLoadError = useCallback((error) => {
    console.error('PDF load error:', error);
    setError('Failed to load PDF document');
    setLoading(false);
  }, []);

  /**
   * Navigate to previous page
   */
  const goToPreviousPage = useCallback(() => {
    setPageNumber(prevPage => Math.max(prevPage - 1, 1));
  }, []);

  /**
   * Navigate to next page
   */
  const goToNextPage = useCallback(() => {
    setPageNumber(prevPage => Math.min(prevPage + 1, numPages || 1));
  }, [numPages]);

  /**
   * Navigate to specific page
   */
  const goToPage = useCallback((page) => {
    const pageNum = parseInt(page, 10);
    if (pageNum >= 1 && pageNum <= (numPages || 1)) {
      setPageNumber(pageNum);
    }
  }, [numPages]);

  /**
   * Handle download with enhanced error handling
   */
  const handleDownload = useCallback(async () => {
    if (!pdfUrl || !expenseId) return;

    try {
      // Create temporary link for download
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = `${invoiceName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (downloadError) {
      console.error('Download failed:', downloadError);
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
      console.error('Print failed:', printError);
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
      case 'ArrowLeft':
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          goToPreviousPage();
        }
        break;
      case 'ArrowRight':
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          goToNextPage();
        }
        break;
      case 'Home':
        event.preventDefault();
        setPageNumber(1);
        break;
      case 'End':
        event.preventDefault();
        setPageNumber(numPages || 1);
        break;
      default:
        break;
    }
  }, [isOpen, onClose, handleZoomIn, handleZoomOut, handleZoomReset, goToPreviousPage, goToNextPage, numPages]);

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

  return (
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
            {/* Page Navigation Controls */}
            {numPages && numPages > 1 && (
              <div className="page-controls">
                <button
                  type="button"
                  className="control-btn page-btn"
                  onClick={goToPreviousPage}
                  disabled={pageNumber <= 1}
                  title="Previous page (←)"
                  aria-label="Previous page"
                >
                  ←
                </button>
                
                <div className="page-display">
                  <input
                    type="number"
                    className="page-input"
                    value={pageNumber}
                    onChange={(e) => goToPage(e.target.value)}
                    min="1"
                    max={numPages}
                    title="Current page"
                    aria-label="Page number"
                  />
                  <span className="page-total">of {numPages}</span>
                </div>
                
                <button
                  type="button"
                  className="control-btn page-btn"
                  onClick={goToNextPage}
                  disabled={pageNumber >= numPages}
                  title="Next page (→)"
                  aria-label="Next page"
                >
                  →
                </button>
              </div>
            )}

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
            <div className="pdf-container">
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="pdf-loading">
                    <div className="loading-spinner"></div>
                    <div className="loading-text">Loading PDF...</div>
                  </div>
                }
                error={
                  <div className="pdf-error">
                    <div className="error-icon">⚠️</div>
                    <div className="error-message">
                      <h4>Failed to load PDF</h4>
                      <p>The PDF file could not be displayed.</p>
                    </div>
                  </div>
                }
                className="pdf-document"
              >
                <Page
                  pageNumber={pageNumber}
                  scale={zoom}
                  className="pdf-page"
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Document>
            </div>
          )}
        </div>

        {/* Footer with keyboard shortcuts */}
        <div className="pdf-viewer-footer">
          <div className="keyboard-shortcuts">
            <span className="shortcut-hint">
              Keyboard shortcuts: Esc (close), Ctrl+/- (zoom), Ctrl+0 (reset), ←/→ (pages), Home/End (first/last page)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicePDFViewer;