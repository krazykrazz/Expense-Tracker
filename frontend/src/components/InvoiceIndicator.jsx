import { useState, useCallback } from 'react';
import InvoicePDFViewer from './InvoicePDFViewer';
import './InvoiceIndicator.css';

/**
 * InvoiceIndicator Component
 * 
 * A small indicator component showing invoice attachment status.
 * Features:
 * - Clear visual indicator (icon + optional text)
 * - Different sizes (small, medium, large)
 * - Click handler to open PDF viewer
 * - Tooltip with invoice information
 * - Accessibility compliance
 * - Hover and focus states
 * 
 * Requirements: 3.1, 4.1, 4.2, 4.3, 4.4
 */
const InvoiceIndicator = ({
  hasInvoice = false,
  invoiceInfo = null,
  expenseId = null,
  onClick = null,
  size = 'medium',
  showText = false,
  className = '',
  alwaysShow = false // New prop to force rendering even without invoice
}) => {
  const [showPDFViewer, setShowPDFViewer] = useState(false);

  /**
   * Handle click to view invoice
   */
  const handleClick = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();

    if (onClick) {
      onClick();
    } else if (hasInvoice && expenseId) {
      setShowPDFViewer(true);
    }
  }, [onClick, hasInvoice, expenseId]);

  /**
   * Handle closing PDF viewer
   */
  const handleClosePDFViewer = useCallback(() => {
    setShowPDFViewer(false);
  }, []);

  /**
   * Format file size for display
   */
  const formatFileSize = useCallback((bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }, []);

  /**
   * Generate tooltip text
   */
  const getTooltipText = useCallback(() => {
    if (!hasInvoice) {
      return 'No invoice attached';
    }

    if (!invoiceInfo) {
      return 'Invoice attached - click to view';
    }

    const parts = [];
    if (invoiceInfo.originalFilename) {
      parts.push(`File: ${invoiceInfo.originalFilename}`);
    }
    if (invoiceInfo.fileSize) {
      parts.push(`Size: ${formatFileSize(invoiceInfo.fileSize)}`);
    }
    if (invoiceInfo.uploadDate) {
      const date = new Date(invoiceInfo.uploadDate);
      parts.push(`Uploaded: ${date.toLocaleDateString()}`);
    }

    return parts.length > 0 ? parts.join('\n') : 'Invoice attached - click to view';
  }, [hasInvoice, invoiceInfo, formatFileSize]);

  // Don't render anything if no invoice and not showing empty state, unless alwaysShow is true
  if (!hasInvoice && !showText && !alwaysShow) {
    return null;
  }

  const tooltipText = getTooltipText();
  const isClickable = hasInvoice && (onClick || expenseId);

  return (
    <>
      <span
        className={`invoice-indicator ${size} ${hasInvoice ? 'has-invoice' : 'no-invoice'} ${isClickable ? 'clickable' : ''} ${className}`}
        onClick={isClickable ? handleClick : undefined}
        onKeyDown={isClickable ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick(e);
          }
        } : undefined}
        title={tooltipText}
        role={isClickable ? 'button' : 'img'}
        tabIndex={isClickable ? 0 : -1}
        aria-label={hasInvoice ? 'View invoice attachment' : 'No invoice attached'}
      >
        <span className="invoice-icon">
          {hasInvoice ? '📄' : '📋'}
        </span>
        
        {showText && (
          <span className="invoice-text">
            {hasInvoice ? 'Invoice' : 'No Invoice'}
          </span>
        )}

        {hasInvoice && invoiceInfo && size === 'large' && (
          <span className="invoice-details">
            <span className="invoice-filename">
              {invoiceInfo.originalFilename}
            </span>
            <span className="invoice-metadata">
              {formatFileSize(invoiceInfo.fileSize)} • 
              {new Date(invoiceInfo.uploadDate).toLocaleDateString()}
            </span>
          </span>
        )}
      </span>

      {/* PDF Viewer Modal */}
      {showPDFViewer && (
        <InvoicePDFViewer
          isOpen={showPDFViewer}
          expenseId={expenseId}
          invoiceName={invoiceInfo?.originalFilename || 'Invoice'}
          onClose={handleClosePDFViewer}
        />
      )}
    </>
  );
};

export default InvoiceIndicator;