import { useState, useCallback } from 'react';
import InvoicePDFViewer from './InvoicePDFViewer';
import { deleteInvoiceById, updateInvoicePersonLink, getInvoiceFileUrl } from '../services/invoiceApi';
import { createLogger } from '../utils/logger';
import './InvoiceList.css';

const logger = createLogger('InvoiceList');

/**
 * InvoiceList Component
 * 
 * Displays a scrollable list of invoices for an expense.
 * Features:
 * - Scrollable list with max-height
 * - Shows filename, size, date, person name for each invoice
 * - Individual view and delete buttons
 * - Click to open PDF viewer
 * - Person link editing (optional)
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
const InvoiceList = ({
  invoices = [],
  expenseId = null,
  people = [],
  onInvoiceDeleted = () => {},
  onPersonLinkUpdated = () => {},
  disabled = false
}) => {
  // State for PDF viewer
  const [viewingInvoice, setViewingInvoice] = useState(null);
  // State for delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  // State for loading/deleting
  const [deletingId, setDeletingId] = useState(null);
  // State for errors
  const [error, setError] = useState(null);
  // State for person link editing
  const [editingPersonId, setEditingPersonId] = useState(null);
  const [updatingPersonId, setUpdatingPersonId] = useState(null);

  /**
   * Format file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  const formatFileSize = useCallback((bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }, []);

  /**
   * Format date for display
   * @param {string} dateString - ISO date string
   * @returns {string} Formatted date
   */
  const formatDate = useCallback((dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  }, []);

  /**
   * Handle viewing an invoice
   * @param {Object} invoice - Invoice to view
   */
  const handleViewInvoice = useCallback((invoice) => {
    setViewingInvoice(invoice);
  }, []);

  /**
   * Handle closing PDF viewer
   */
  const handleClosePDFViewer = useCallback(() => {
    setViewingInvoice(null);
  }, []);

  /**
   * Handle delete invoice
   * @param {number} invoiceId - Invoice ID to delete
   */
  const handleDeleteInvoice = useCallback(async (invoiceId) => {
    if (disabled) return;

    setDeletingId(invoiceId);
    setError(null);

    try {
      await deleteInvoiceById(invoiceId);
      onInvoiceDeleted(invoiceId);
      setDeleteConfirmId(null);
    } catch (deleteError) {
      logger.error('Failed to delete invoice:', deleteError);
      setError(deleteError.message || 'Failed to delete invoice');
    } finally {
      setDeletingId(null);
    }
  }, [disabled, onInvoiceDeleted]);

  /**
   * Clear error message
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Handle person link change for an invoice
   * @param {number} invoiceId - Invoice ID
   * @param {string} personId - New person ID (or empty string for no person)
   */
  const handlePersonLinkChange = useCallback(async (invoiceId, personId) => {
    if (disabled) return;

    setUpdatingPersonId(invoiceId);
    setError(null);

    try {
      const newPersonId = personId === '' ? null : parseInt(personId);
      await updateInvoicePersonLink(invoiceId, newPersonId);
      onPersonLinkUpdated(invoiceId, newPersonId);
      setEditingPersonId(null);
    } catch (updateError) {
      logger.error('Failed to update person link:', updateError);
      setError(updateError.message || 'Failed to update person link');
    } finally {
      setUpdatingPersonId(null);
    }
  }, [disabled, onPersonLinkUpdated]);

  // Don't render if no invoices
  if (!invoices || invoices.length === 0) {
    return null;
  }

  return (
    <div className="invoice-list-container">
      <div className="invoice-list-header">
        <span className="invoice-count">
          {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} attached
        </span>
      </div>

      <div className="invoice-list-scroll">
        {invoices.map((invoice) => (
          <div 
            key={invoice.id} 
            className={`invoice-list-item ${deletingId === invoice.id ? 'deleting' : ''}`}
          >
            <div 
              className="invoice-item-info"
              onClick={() => handleViewInvoice(invoice)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleViewInvoice(invoice);
                }
              }}
              aria-label={`View invoice: ${invoice.originalFilename}`}
            >
              <div className="invoice-item-icon">📄</div>
              <div className="invoice-item-details">
                <div className="invoice-item-filename" title={invoice.originalFilename}>
                  {invoice.originalFilename}
                </div>
                <div className="invoice-item-metadata">
                  <span className="invoice-item-size">{formatFileSize(invoice.fileSize)}</span>
                  <span className="invoice-item-separator">•</span>
                  <span className="invoice-item-date">{formatDate(invoice.uploadDate)}</span>
                </div>
              </div>
            </div>

            {/* Person link dropdown - show if people are available */}
            {people.length > 0 && (
              <div className="invoice-item-person-link">
                <select
                  className="invoice-person-select"
                  value={invoice.personId || ''}
                  onChange={(e) => handlePersonLinkChange(invoice.id, e.target.value)}
                  disabled={disabled || updatingPersonId === invoice.id}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Link invoice to person`}
                >
                  <option value="">No person</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
                {updatingPersonId === invoice.id && <span className="updating-indicator">⏳</span>}
              </div>
            )}

            <div className="invoice-item-actions">
              <button
                type="button"
                className="invoice-item-btn view-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleViewInvoice(invoice);
                }}
                disabled={disabled || deletingId === invoice.id}
                title="View invoice"
                aria-label={`View ${invoice.originalFilename}`}
              >
                👁️
              </button>

              {deleteConfirmId !== invoice.id ? (
                <button
                  type="button"
                  className="invoice-item-btn delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmId(invoice.id);
                  }}
                  disabled={disabled || deletingId === invoice.id}
                  title="Delete invoice"
                  aria-label={`Delete ${invoice.originalFilename}`}
                >
                  🗑️
                </button>
              ) : (
                <div className="invoice-item-delete-confirm">
                  <button
                    type="button"
                    className="invoice-item-btn confirm-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteInvoice(invoice.id);
                    }}
                    disabled={deletingId === invoice.id}
                    title="Confirm delete"
                    aria-label="Confirm delete"
                  >
                    {deletingId === invoice.id ? '⏳' : '✓'}
                  </button>
                  <button
                    type="button"
                    className="invoice-item-btn cancel-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(null);
                    }}
                    disabled={deletingId === invoice.id}
                    title="Cancel delete"
                    aria-label="Cancel delete"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <div className="invoice-list-error" role="alert">
          <span className="error-text">{error}</span>
          <button
            type="button"
            className="error-close"
            onClick={clearError}
            aria-label="Clear error"
          >
            ✕
          </button>
        </div>
      )}

      {/* PDF Viewer Modal */}
      {viewingInvoice && (
        <InvoicePDFViewer
          isOpen={!!viewingInvoice}
          expenseId={expenseId}
          invoiceId={viewingInvoice.id}
          invoiceName={viewingInvoice.originalFilename || 'Invoice'}
          onClose={handleClosePDFViewer}
        />
      )}
    </div>
  );
};

export default InvoiceList;
