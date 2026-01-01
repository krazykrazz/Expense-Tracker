import { useState, useRef, useCallback } from 'react';
import { API_ENDPOINTS } from '../config';
import InvoicePDFViewer from './InvoicePDFViewer';
import './InvoiceUpload.css';

/**
 * InvoiceUpload Component
 * 
 * A reusable component for uploading PDF invoices to medical expenses.
 * Features:
 * - Drag and drop file upload
 * - File selection via click
 * - Upload progress indicator
 * - File validation with error display
 * - Replace and delete operations
 * - Mobile-friendly touch interface
 * - Accessibility features
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 8.1, 8.2, 8.3, 8.4, 8.5
 */
const InvoiceUpload = ({
  expenseId = null,
  existingInvoice = null,
  onInvoiceUploaded = () => {},
  onInvoiceDeleted = () => {},
  disabled = false
}) => {
  // Component state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showPDFViewer, setShowPDFViewer] = useState(false);

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
        onInvoiceUploaded(response.invoice);
        
        // Clear file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        throw new Error(response.error || 'Upload failed');
      }

    } catch (uploadError) {
      console.error('Invoice upload failed:', uploadError);
      setError(uploadError.message || 'Upload failed. Please try again.');
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  }, [expenseId, onInvoiceUploaded]);

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
   * Handle delete invoice with enhanced error handling and loading state
   */
  const handleDeleteInvoice = useCallback(async () => {
    if (!existingInvoice || !expenseId) return;

    setUploading(true); // Use uploading state for delete operation loading
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.INVOICE_BY_EXPENSE(expenseId), {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete invoice');
      }

      // Success feedback
      onInvoiceDeleted();
      setDeleteConfirm(false);
      setError(null);

      // Show success message briefly with visual feedback
      setUploadProgress(100);
      setTimeout(() => {
        setUploadProgress(0);
      }, 1500);

    } catch (deleteError) {
      console.error('Invoice deletion failed:', deleteError);
      setError(deleteError.message || 'Failed to delete invoice');
      setDeleteConfirm(false); // Close confirmation on error
    } finally {
      setUploading(false);
    }
  }, [existingInvoice, expenseId, onInvoiceDeleted]);

  /**
   * Handle replace invoice operation
   */
  const handleReplaceInvoice = useCallback(() => {
    if (disabled || uploading) return;
    
    // Clear any existing errors before starting replace operation
    setError(null);
    
    // Trigger file selection
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled, uploading]);

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
   * Format file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  const formatFileSize = useCallback((bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }, []);

  /**
   * Handle viewing invoice in modal
   */
  const handleViewInvoice = useCallback(() => {
    if (existingInvoice && expenseId) {
      setShowPDFViewer(true);
    }
  }, [existingInvoice, expenseId]);

  /**
   * Handle closing PDF viewer
   */
  const handleClosePDFViewer = useCallback(() => {
    setShowPDFViewer(false);
  }, []);

  /**
   * Clear error message
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Render existing invoice display
  if (existingInvoice) {
    return (
      <div className="invoice-upload-container">
        <div className="invoice-existing">
          <div className="invoice-info">
            <div className="invoice-icon">📄</div>
            <div className="invoice-details">
              <div className="invoice-filename" title={existingInvoice.originalFilename}>
                {existingInvoice.originalFilename}
              </div>
              <div className="invoice-metadata">
                {formatFileSize(existingInvoice.fileSize)} • 
                Uploaded {new Date(existingInvoice.uploadDate).toLocaleDateString()}
              </div>
            </div>
          </div>
          
          <div className="invoice-actions">
            <button
              type="button"
              className="invoice-action-btn view-btn"
              onClick={handleViewInvoice}
              disabled={uploading}
              title="View invoice"
              aria-label="View invoice"
            >
              👁️ View
            </button>
            
            <button
              type="button"
              className="invoice-action-btn replace-btn"
              onClick={handleReplaceInvoice}
              disabled={disabled || uploading}
              title="Replace invoice"
              aria-label="Replace invoice"
            >
              🔄 Replace
            </button>
            
            {!deleteConfirm ? (
              <button
                type="button"
                className="invoice-action-btn delete-btn"
                onClick={() => setDeleteConfirm(true)}
                disabled={disabled || uploading}
                title="Delete invoice"
                aria-label="Delete invoice"
              >
                🗑️ Delete
              </button>
            ) : (
              <div className="delete-confirm">
                <button
                  type="button"
                  className="invoice-action-btn confirm-delete-btn"
                  onClick={handleDeleteInvoice}
                  disabled={uploading}
                  title="Confirm delete"
                  aria-label="Confirm delete invoice"
                >
                  {uploading ? '⏳' : '✓'} {uploading ? 'Deleting...' : 'Confirm'}
                </button>
                <button
                  type="button"
                  className="invoice-action-btn cancel-btn"
                  onClick={() => setDeleteConfirm(false)}
                  disabled={uploading}
                  title="Cancel delete"
                  aria-label="Cancel delete"
                >
                  ✕ Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Hidden file input for replace functionality */}
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

        {/* Upload progress for replace/delete operations */}
        {uploading && (
          <div className="upload-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${uploadProgress}%` }}
                role="progressbar"
                aria-valuenow={uploadProgress}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-label={`Operation progress: ${uploadProgress}%`}
              />
            </div>
            <div className="progress-text">
              {deleteConfirm ? 'Deleting...' : 'Uploading...'} {uploadProgress}%
            </div>
          </div>
        )}

        {/* Operation status for screen readers */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {getOperationStatus()}
        </div>

        {/* PDF Viewer Modal */}
        {showPDFViewer && (
          <InvoicePDFViewer
            isOpen={showPDFViewer}
            expenseId={expenseId}
            invoiceName={existingInvoice?.originalFilename || 'Invoice'}
            onClose={handleClosePDFViewer}
          />
        )}
      </div>
    );
  }

  // Render upload interface
  return (
    <div className="invoice-upload-container">
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

      {/* PDF Viewer Modal */}
      {showPDFViewer && (
        <InvoicePDFViewer
          isOpen={showPDFViewer}
          expenseId={expenseId}
          invoiceName={existingInvoice?.originalFilename || 'Invoice'}
          onClose={handleClosePDFViewer}
        />
      )}
    </div>
  );
};

export default InvoiceUpload;