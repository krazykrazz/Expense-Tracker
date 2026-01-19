import { useState, useRef, useCallback } from 'react';
import { API_ENDPOINTS } from '../config';
import { createLogger } from '../utils/logger';
import InvoicePDFViewer from './InvoicePDFViewer';
import InvoiceList from './InvoiceList';
import './InvoiceUpload.css';

const logger = createLogger('InvoiceUpload');

/**
 * InvoiceUpload Component
 * 
 * A reusable component for uploading PDF invoices to medical expenses.
 * Supports multiple invoices per expense with optional person linking.
 * Features:
 * - Drag and drop file upload
 * - File selection via click
 * - Upload progress indicator
 * - File validation with error display
 * - Multiple invoice support with list display
 * - Person selection dropdown for linking invoices
 * - Add Invoice button when invoices exist
 * - Mobile-friendly touch interface
 * - Accessibility features
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.2, 8.1, 8.2, 8.3, 8.4, 8.5
 */
const InvoiceUpload = ({
  expenseId = null,
  existingInvoices = [],  // Changed from existingInvoice to support multiple invoices
  existingInvoice = null, // Backward compatibility - will be converted to array
  people = [],            // People assigned to the expense for person dropdown
  onInvoiceUploaded = () => {},
  onInvoiceDeleted = () => {},
  onPersonLinkUpdated = () => {},
  disabled = false
}) => {
  // Normalize invoices - support both old single invoice and new array format
  const invoices = existingInvoices.length > 0 
    ? existingInvoices 
    : (existingInvoice ? [existingInvoice] : []);

  // Component state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [showPDFViewer, setShowPDFViewer] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState(null);

  // Refs for file input and drag/drop
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  // File validation constants
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = ['application/pdf'];
  const ALLOWED_EXTENSIONS = ['.pdf'];

  /**
   * Validate selected file
   * @param {File} file - File to validate
   * @returns {Object} Validation result with isValid and error
   */
  const validateFile = useCallback((file) => {
    if (!file) {
      return { isValid: false, error: 'No file selected' };
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return { 
        isValid: false, 
        error: `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the 10MB limit` 
      };
    }

    // Check file type by MIME type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { 
        isValid: false, 
        error: `Invalid file type. Only PDF files are allowed. Selected: ${file.type || 'unknown'}` 
      };
    }

    // Check file extension as additional validation
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return { 
        isValid: false, 
        error: `Invalid file extension. Only .pdf files are allowed. Selected: ${extension}` 
      };
    }

    // Check for empty file
    if (file.size === 0) {
      return { isValid: false, error: 'File is empty' };
    }

    return { isValid: true, error: null };
  }, []);

  /**
   * Upload file to server
   * @param {File} file - File to upload
   */
  const uploadFile = useCallback(async (file) => {
    if (!expenseId) {
      setError('Cannot upload invoice: expense ID is required');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('invoice', file);
      formData.append('expenseId', expenseId.toString());
      
      // Add personId - use selected person, or auto-use single person if only one assigned
      const effectivePersonId = selectedPersonId || (people.length === 1 ? people[0].id.toString() : '');
      if (effectivePersonId) {
        formData.append('personId', effectivePersonId);
      }

      // Create XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();

      // Set up progress tracking
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      });

      // Create promise for XMLHttpRequest
      const uploadPromise = new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (parseError) {
              reject(new Error('Invalid server response'));
            }
          } else {
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              reject(new Error(errorResponse.error || `Upload failed with status ${xhr.status}`));
            } catch (parseError) {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network error during upload'));
        };

        xhr.ontimeout = () => {
          reject(new Error('Upload timed out'));
        };
      });

      // Configure and send request
      xhr.open('POST', API_ENDPOINTS.INVOICE_UPLOAD);
      xhr.timeout = 60000; // 60 second timeout
      xhr.send(formData);

      // Wait for upload to complete
      const response = await uploadPromise;

      if (response.success && response.invoice) {
        setUploadProgress(100);
        
        // Notify parent component with invoice data
        onInvoiceUploaded(response.invoice);
        
        // Clear file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        
        // Reset form state
        setError(null);
        setShowUploadForm(false);
        setSelectedPersonId('');
      } else {
        throw new Error(response.error || 'Upload failed');
      }

    } catch (uploadError) {
      logger.error('Invoice upload failed:', uploadError);
      setError(uploadError.message || 'Upload failed. Please try again.');
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  }, [expenseId, selectedPersonId, people, onInvoiceUploaded]);

  /**
   * Handle file selection (from input or drop)
   * @param {File} file - Selected file
   */
  const handleFileSelect = useCallback(async (file) => {
    if (disabled) return;

    const validation = validateFile(file);
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    await uploadFile(file);
  }, [disabled, validateFile, uploadFile]);

  /**
   * Handle file input change
   * @param {Event} event - Input change event
   */
  const handleFileInputChange = useCallback((event) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  /**
   * Handle drag over event
   * @param {DragEvent} event - Drag event
   */
  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (!disabled && !dragOver) {
      setDragOver(true);
    }
  }, [disabled, dragOver]);

  /**
   * Handle drag leave event
   * @param {DragEvent} event - Drag event
   */
  const handleDragLeave = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    
    // Only set dragOver to false if we're leaving the drop zone itself
    if (event.target === dropZoneRef.current) {
      setDragOver(false);
    }
  }, []);

  /**
   * Handle drop event
   * @param {DragEvent} event - Drop event
   */
  const handleDrop = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);

    if (disabled) return;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      handleFileSelect(file);
    }
  }, [disabled, handleFileSelect]);

  /**
   * Handle click to select file
   */
  const handleClickToSelect = useCallback(() => {
    if (disabled || uploading) return;
    
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled, uploading]);

  /**
   * Handle Add Invoice button click
   */
  const handleAddInvoiceClick = useCallback(() => {
    setShowUploadForm(true);
    setError(null);
    setSelectedPersonId('');
  }, []);

  /**
   * Handle cancel add invoice
   */
  const handleCancelAddInvoice = useCallback(() => {
    setShowUploadForm(false);
    setError(null);
    setSelectedPersonId('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  /**
   * Handle person selection change
   */
  const handlePersonChange = useCallback((event) => {
    setSelectedPersonId(event.target.value);
  }, []);

  /**
   * Handle invoice deleted from list
   */
  const handleInvoiceDeleted = useCallback((invoiceId) => {
    onInvoiceDeleted(invoiceId);
  }, [onInvoiceDeleted]);

  /**
   * Handle person link updated from list
   */
  const handlePersonLinkUpdated = useCallback((invoiceId, personId) => {
    onPersonLinkUpdated(invoiceId, personId);
  }, [onPersonLinkUpdated]);

  /**
   * Get operation status text for accessibility
   */
  const getOperationStatus = useCallback(() => {
    if (uploading) {
      if (uploadProgress === 100) {
        return 'Operation completed successfully';
      }
      return `Operation in progress: ${uploadProgress}%`;
    }
    if (error) {
      return `Error: ${error}`;
    }
    return 'Ready for operations';
  }, [uploading, uploadProgress, error]);

  /**
   * Clear error message
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Render upload form (dropzone with optional person selection)
  const renderUploadForm = (isAddingToExisting = false) => (
    <div className={`invoice-upload-form ${isAddingToExisting ? 'adding-to-existing' : ''}`}>
      {/* Person selection dropdown - only show if multiple people are assigned */}
      {people.length > 1 && (
        <div className="person-selection">
          <label htmlFor="invoice-person-select" className="person-select-label">
            Link to person (optional):
          </label>
          <select
            id="invoice-person-select"
            className="person-select-dropdown"
            value={selectedPersonId}
            onChange={handlePersonChange}
            disabled={disabled || uploading}
            aria-label="Select person to link invoice to"
          >
            <option value="">No person selected</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {/* When exactly one person is assigned, show their name as static text */}
      {people.length === 1 && (
        <div className="person-selection single-person">
          <span className="person-select-label">Invoice for:</span>
          <span className="person-name-display">{people[0].name}</span>
        </div>
      )}

      {/* Dropzone */}
      <div
        ref={dropZoneRef}
        className={`invoice-dropzone ${dragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''} ${uploading ? 'uploading' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClickToSelect}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload invoice file"
        aria-describedby="upload-instructions"
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled && !uploading) {
            e.preventDefault();
            handleClickToSelect();
          }
        }}
      >
        <div className="dropzone-content">
          {uploading ? (
            <>
              <div className="upload-icon">⏳</div>
              <div className="upload-text">Uploading...</div>
              <div className="upload-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${uploadProgress}%` }}
                    role="progressbar"
                    aria-valuenow={uploadProgress}
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-label={`Upload progress: ${uploadProgress}%`}
                  />
                </div>
                <div className="progress-text">{uploadProgress}%</div>
              </div>
            </>
          ) : (
            <>
              <div className="upload-icon">📄</div>
              <div className="upload-text">
                <div className="primary-text">
                  {dragOver ? 'Drop PDF file here' : 'Drag & drop PDF file here'}
                </div>
                <div className="secondary-text" id="upload-instructions">
                  or click to select file
                </div>
              </div>
              <div className="upload-requirements">
                PDF files only • Max 10MB
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cancel button when adding to existing invoices */}
      {isAddingToExisting && !uploading && (
        <button
          type="button"
          className="cancel-add-invoice-btn"
          onClick={handleCancelAddInvoice}
          aria-label="Cancel adding invoice"
        >
          Cancel
        </button>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      {/* Error display */}
      {error && (
        <div className="invoice-error" role="alert">
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

      {/* Operation status for screen readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {getOperationStatus()}
      </div>
    </div>
  );

  // Render when invoices exist
  if (invoices.length > 0) {
    return (
      <div className="invoice-upload-container has-invoices">
        {/* Invoice List */}
        <InvoiceList
          invoices={invoices}
          expenseId={expenseId}
          people={people}
          onInvoiceDeleted={handleInvoiceDeleted}
          onPersonLinkUpdated={handlePersonLinkUpdated}
          disabled={disabled}
        />

        {/* Add Invoice section */}
        {showUploadForm ? (
          renderUploadForm(true)
        ) : (
          <button
            type="button"
            className="add-invoice-btn"
            onClick={handleAddInvoiceClick}
            disabled={disabled}
            aria-label="Add another invoice"
          >
            <span className="add-invoice-icon">+</span>
            <span className="add-invoice-text">Add Invoice</span>
          </button>
        )}

        {/* PDF Viewer Modal */}
        {showPDFViewer && viewingInvoice && (
          <InvoicePDFViewer
            isOpen={showPDFViewer}
            expenseId={expenseId}
            invoiceId={viewingInvoice.id}
            invoiceName={viewingInvoice.originalFilename || 'Invoice'}
            onClose={() => {
              setShowPDFViewer(false);
              setViewingInvoice(null);
            }}
          />
        )}
      </div>
    );
  }

  // Render upload interface when no invoices exist
  return (
    <div className="invoice-upload-container">
      {renderUploadForm(false)}

      {/* PDF Viewer Modal */}
      {showPDFViewer && viewingInvoice && (
        <InvoicePDFViewer
          isOpen={showPDFViewer}
          expenseId={expenseId}
          invoiceId={viewingInvoice.id}
          invoiceName={viewingInvoice.originalFilename || 'Invoice'}
          onClose={() => {
            setShowPDFViewer(false);
            setViewingInvoice(null);
          }}
        />
      )}
    </div>
  );
};

export default InvoiceUpload;
