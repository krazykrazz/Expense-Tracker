import { useState, useCallback } from 'react';
import InvoicePDFViewer from './InvoicePDFViewer';
import InvoiceList from './InvoiceList';
import './InvoiceIndicator.css';

/**
 * InvoiceIndicator Component
 * 
 * A small indicator component showing invoice attachment status.
 * Features:
 * - Clear visual indicator (icon + optional text)
 * - Different sizes (small, medium, large)
 * - Click handler to open PDF viewer or modal
 * - Tooltip with invoice information (lists all filenames for multiple invoices)
 * - Count badge when multiple invoices attached
 * - Accessibility compliance
 * - Hover and focus states
 * 
 * Requirements: 3.1, 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 6.4
 */
const InvoiceIndicator = ({
  hasInvoice = false,
  invoiceInfo = null,
  invoiceCount = 0,        // New: number of invoices attached
  invoices = [],           // New: array of invoice objects for tooltip
  expenseId = null,
  onClick = null,
  size = 'medium',
  showText = false,
  className = '',
  alwaysShow = false, // New prop to force rendering even without invoice
  onInvoiceUpdated = null,  // Callback when invoice is updated
  onInvoiceDeleted = null   // Callback when invoice is deleted
}) => {
  const [showPDFViewer, setShowPDFViewer] = useState(false);
  const [showInvoiceListModal, setShowInvoiceListModal] = useState(false);
  
  // Derive effective count from props (invoiceCount takes precedence, then invoices array, then hasInvoice)
  const effectiveCount = invoiceCount > 0 ? invoiceCount : (invoices.length > 0 ? invoices.length : (hasInvoice ? 1 : 0));
  const hasMultipleInvoices = effectiveCount > 1;

  /**
   * Handle click to view invoice
   */
  const handleClick = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();

    if (onClick) {
      onClick();
    } else if ((hasInvoice || effectiveCount > 0) && expenseId) {
      if (hasMultipleInvoices) {
        // Show invoice list modal for multiple invoices
        setShowInvoiceListModal(true);
      } else {
        // Show PDF viewer for single invoice
        setShowPDFViewer(true);
      }
    }
  }, [onClick, hasInvoice, effectiveCount, expenseId, hasMultipleInvoices]);

  /**
   * Handle closing PDF viewer
   */
  const handleClosePDFViewer = useCallback(() => {
    setShowPDFViewer(false);
  }, []);

  /**
   * Handle closing invoice list modal
   */
  const handleCloseInvoiceListModal = useCallback(() => {
    setShowInvoiceListModal(false);
  }, []);

  /**
   * Handle invoice deleted from list
   */
  const handleInvoiceDeleted = useCallback((invoiceId) => {
    if (onInvoiceDeleted) {
      onInvoiceDeleted(invoiceId);
    }
  }, [onInvoiceDeleted]);

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
   * For multiple invoices, lists all filenames
   */
  const getTooltipText = useCallback(() => {
    if (!hasInvoice && effectiveCount === 0) {
      return 'No invoice attached';
    }

    // Multiple invoices - list all filenames
    if (hasMultipleInvoices && invoices.length > 0) {
      const fileList = invoices
        .map(inv => inv.originalFilename || inv.filename || 'Invoice')
        .join('\n• ');
      return `${effectiveCount} invoices attached:\n• ${fileList}`;
    }

    // Multiple invoices but no details available
    if (hasMultipleInvoices) {
      return `${effectiveCount} invoices attached - click to view`;
    }

    // Single invoice with info
    if (invoiceInfo) {
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
    }

    // Single invoice from invoices array
    if (invoices.length === 1) {
      const inv = invoices[0];
      const parts = [];
      if (inv.originalFilename) {
        parts.push(`File: ${inv.originalFilename}`);
      }
      if (inv.fileSize) {
        parts.push(`Size: ${formatFileSize(inv.fileSize)}`);
      }
      if (inv.uploadDate) {
        const date = new Date(inv.uploadDate);
        parts.push(`Uploaded: ${date.toLocaleDateString()}`);
      }
      return parts.length > 0 ? parts.join('\n') : 'Invoice attached - click to view';
    }

    return 'Invoice attached - click to view';
  }, [hasInvoice, effectiveCount, hasMultipleInvoices, invoices, invoiceInfo, formatFileSize]);

  // Don't render anything if no invoice and not showing empty state, unless alwaysShow is true
  if (!hasInvoice && effectiveCount === 0 && !showText && !alwaysShow) {
    return null;
  }

  const tooltipText = getTooltipText();
  const isClickable = (hasInvoice || effectiveCount > 0) && (onClick || expenseId);
  const displayHasInvoice = hasInvoice || effectiveCount > 0;

  return (
    <>
      <span
        className={`invoice-indicator ${size} ${displayHasInvoice ? 'has-invoice' : 'no-invoice'} ${isClickable ? 'clickable' : ''} ${hasMultipleInvoices ? 'multi-invoice' : ''} ${className}`}
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
        aria-label={displayHasInvoice ? (hasMultipleInvoices ? `View ${effectiveCount} invoice attachments` : 'View invoice attachment') : 'No invoice attached'}
      >
        <span className="invoice-icon-wrapper">
          <span className="invoice-icon" aria-hidden="true">
            {displayHasInvoice ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm-3 4h6v2h-6v-2zm0 4h6v2h-6v-2zm0-8h2v2h-2V9z"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
              </svg>
            )}
          </span>
          
          {/* Count badge for multiple invoices */}
          {hasMultipleInvoices && (
            <span className="invoice-count-badge" aria-label={`${effectiveCount} invoices`}>
              {effectiveCount}
            </span>
          )}
        </span>
        
        {showText && (
          <span className="invoice-text">
            {displayHasInvoice ? (hasMultipleInvoices ? `${effectiveCount} Invoices` : 'Invoice') : 'No Invoice'}
          </span>
        )}

        {displayHasInvoice && invoiceInfo && size === 'large' && !hasMultipleInvoices && (
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

        {displayHasInvoice && hasMultipleInvoices && size === 'large' && (
          <span className="invoice-details">
            <span className="invoice-filename">
              {effectiveCount} invoices attached
            </span>
            <span className="invoice-metadata">
              Click to view all
            </span>
          </span>
        )}
      </span>

      {/* PDF Viewer Modal - only for single invoice without custom onClick */}
      {showPDFViewer && !hasMultipleInvoices && (
        <InvoicePDFViewer
          isOpen={showPDFViewer}
          expenseId={expenseId}
          invoiceId={invoices.length > 0 ? invoices[0].id : (invoiceInfo?.id || null)}
          invoiceName={invoiceInfo?.originalFilename || (invoices.length > 0 ? invoices[0].originalFilename : 'Invoice')}
          onClose={handleClosePDFViewer}
        />
      )}

      {/* Invoice List Modal - for multiple invoices */}
      {showInvoiceListModal && hasMultipleInvoices && (
        <div 
          className="invoice-list-modal-overlay"
          onClick={handleCloseInvoiceListModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="invoice-list-modal-title"
        >
          <div 
            className="invoice-list-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="invoice-list-modal-header">
              <h3 id="invoice-list-modal-title">Invoices ({effectiveCount})</h3>
              <button
                type="button"
                className="invoice-list-modal-close"
                onClick={handleCloseInvoiceListModal}
                aria-label="Close invoice list"
              >
                ✕
              </button>
            </div>
            <div className="invoice-list-modal-content">
              <InvoiceList
                invoices={invoices}
                expenseId={expenseId}
                people={[]}
                onInvoiceDeleted={handleInvoiceDeleted}
                onPersonLinkUpdated={() => {}}
                disabled={false}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InvoiceIndicator;