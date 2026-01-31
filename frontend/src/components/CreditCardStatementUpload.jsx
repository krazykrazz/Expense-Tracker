import { useState, useRef, useCallback } from 'react';
import { uploadStatement } from '../services/creditCardApi';
import { createLogger } from '../utils/logger';
import './CreditCardStatementUpload.css';

const logger = createLogger('CreditCardStatementUpload');

/**
 * CreditCardStatementUpload Component
 * 
 * A component for uploading credit card statement PDFs.
 * Features:
 * - Drag and drop file upload
 * - Statement date picker
 * - Statement period date pickers (start and end)
 * - Upload progress indicator
 * - File validation
 * 
 * Requirements: 3B.3
 */
const CreditCardStatementUpload = ({
  paymentMethodId,
  paymentMethodName = 'Credit Card',
  billingCycleStart = null,  // Day of month (1-31)
  billingCycleEnd = null,    // Day of month (1-31)
  paymentDueDay = null,      // Day of month (1-31)
  onStatementUploaded = () => {},
  onCancel = () => {},
  disabled = false
}) => {
  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Get first day of current month
  const getFirstDayOfMonth = () => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  };

  // Get last day of current month
  const getLastDayOfMonth = () => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
  };

  /**
   * Calculate the most recent completed billing cycle based on billing cycle days.
   * Returns { periodStart, periodEnd, statementDate } in YYYY-MM-DD format.
   * 
   * Logic:
   * - If today is past the billing cycle end day, use current month's cycle
   * - Otherwise, use previous month's cycle (the most recently completed one)
   */
  const calculateBillingCycleDates = () => {
    if (!billingCycleStart || !billingCycleEnd) {
      return {
        periodStart: getFirstDayOfMonth(),
        periodEnd: getLastDayOfMonth(),
        statementDate: getTodayDate()
      };
    }

    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Helper to create date string
    const formatDateStr = (year, month, day) => {
      // Handle day overflow (e.g., day 31 in a 30-day month)
      const date = new Date(year, month, day);
      return date.toISOString().split('T')[0];
    };

    // Helper to get the last day of a month
    const getLastDayOfMonthNum = (year, month) => {
      return new Date(year, month + 1, 0).getDate();
    };

    // Clamp day to valid range for the month
    const clampDay = (day, year, month) => {
      const maxDay = getLastDayOfMonthNum(year, month);
      return Math.min(day, maxDay);
    };

    let cycleStartYear, cycleStartMonth, cycleEndYear, cycleEndMonth;

    // Determine if we should use current month's cycle or previous month's
    // If billing cycle end day has passed this month, use current month's cycle
    // Otherwise, use the previous month's cycle (most recently completed)
    if (currentDay > billingCycleEnd) {
      // Current month's cycle is complete (or nearly complete)
      cycleEndYear = currentYear;
      cycleEndMonth = currentMonth;
      
      // Start is in the same month or previous month depending on cycle
      if (billingCycleStart <= billingCycleEnd) {
        // Normal cycle within same month (e.g., 1-25)
        cycleStartYear = currentYear;
        cycleStartMonth = currentMonth;
      } else {
        // Cycle spans months (e.g., 26-25)
        cycleStartYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        cycleStartMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      }
    } else {
      // Use previous month's cycle (most recently completed)
      cycleEndYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      cycleEndMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      
      if (billingCycleStart <= billingCycleEnd) {
        // Normal cycle within same month
        cycleStartYear = cycleEndYear;
        cycleStartMonth = cycleEndMonth;
      } else {
        // Cycle spans months
        cycleStartYear = cycleEndMonth === 0 ? cycleEndYear - 1 : cycleEndYear;
        cycleStartMonth = cycleEndMonth === 0 ? 11 : cycleEndMonth - 1;
      }
    }

    const periodStartDay = clampDay(billingCycleStart, cycleStartYear, cycleStartMonth);
    const periodEndDay = clampDay(billingCycleEnd, cycleEndYear, cycleEndMonth);

    return {
      periodStart: formatDateStr(cycleStartYear, cycleStartMonth, periodStartDay),
      periodEnd: formatDateStr(cycleEndYear, cycleEndMonth, periodEndDay),
      // Statement date is typically the billing cycle end date
      statementDate: formatDateStr(cycleEndYear, cycleEndMonth, periodEndDay)
    };
  };

  // Calculate initial dates based on billing cycle
  const initialDates = calculateBillingCycleDates();

  // State
  const [selectedFile, setSelectedFile] = useState(null);
  const [statementDate, setStatementDate] = useState(initialDates.statementDate);
  const [periodStart, setPeriodStart] = useState(initialDates.periodStart);
  const [periodEnd, setPeriodEnd] = useState(initialDates.periodEnd);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // Refs
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  // File validation constants
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = ['application/pdf'];
  const ALLOWED_EXTENSIONS = ['.pdf'];

  // Validate file
  const validateFile = useCallback((file) => {
    if (!file) {
      return { isValid: false, error: 'No file selected' };
    }

    if (file.size > MAX_FILE_SIZE) {
      return { 
        isValid: false, 
        error: `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the 10MB limit` 
      };
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return { 
        isValid: false, 
        error: `Invalid file type. Only PDF files are allowed.` 
      };
    }

    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return { 
        isValid: false, 
        error: `Invalid file extension. Only .pdf files are allowed.` 
      };
    }

    if (file.size === 0) {
      return { isValid: false, error: 'File is empty' };
    }

    return { isValid: true, error: null };
  }, []);

  // Validate form
  const validateForm = useCallback(() => {
    if (!selectedFile) {
      return { isValid: false, error: 'Please select a statement file' };
    }

    if (!statementDate) {
      return { isValid: false, error: 'Statement date is required' };
    }

    if (!periodStart) {
      return { isValid: false, error: 'Period start date is required' };
    }

    if (!periodEnd) {
      return { isValid: false, error: 'Period end date is required' };
    }

    if (new Date(periodStart) > new Date(periodEnd)) {
      return { isValid: false, error: 'Period start date must be before end date' };
    }

    return { isValid: true, error: null };
  }, [selectedFile, statementDate, periodStart, periodEnd]);

  // Handle file selection
  const handleFileSelect = useCallback((file) => {
    if (disabled) return;

    const validation = validateFile(file);
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    setSelectedFile(file);
    setError(null);
  }, [disabled, validateFile]);

  // Handle file input change
  const handleFileInputChange = useCallback((event) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  // Handle drag over
  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (!disabled && !dragOver) {
      setDragOver(true);
    }
  }, [disabled, dragOver]);

  // Handle drag leave
  const handleDragLeave = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (event.target === dropZoneRef.current) {
      setDragOver(false);
    }
  }, []);

  // Handle drop
  const handleDrop = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);

    if (disabled) return;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [disabled, handleFileSelect]);

  // Handle click to select
  const handleClickToSelect = useCallback(() => {
    if (disabled || uploading) return;
    
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled, uploading]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (disabled || uploading) return;

    const validation = validateForm();
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      const metadata = {
        statement_date: statementDate,
        statement_period_start: periodStart,
        statement_period_end: periodEnd
      };

      const result = await uploadStatement(
        paymentMethodId, 
        selectedFile, 
        metadata,
        (progress) => setUploadProgress(progress)
      );

      logger.info('Statement uploaded successfully:', result);
      
      onStatementUploaded(result);
      
      // Reset form to billing cycle defaults
      const resetDates = calculateBillingCycleDates();
      setSelectedFile(null);
      setStatementDate(resetDates.statementDate);
      setPeriodStart(resetDates.periodStart);
      setPeriodEnd(resetDates.periodEnd);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      logger.error('Failed to upload statement:', err);
      setError(err.message || 'Failed to upload statement. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Clear selected file
  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Clear error
  const clearError = () => {
    setError(null);
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="cc-statement-upload-container">
      <div className="cc-statement-upload-header">
        <h3>Upload Statement</h3>
        <span className="cc-statement-card-name">{paymentMethodName}</span>
      </div>

      <form onSubmit={handleSubmit} className="cc-statement-upload-form">
        {/* File Drop Zone */}
        <div className="cc-statement-field">
          <label className="cc-statement-label">
            Statement File <span className="required">*</span>
          </label>
          
          {selectedFile ? (
            <div className="cc-statement-selected-file">
              <div className="selected-file-info">
                <span className="file-icon">📄</span>
                <div className="file-details">
                  <span className="file-name">{selectedFile.name}</span>
                  <span className="file-size">{formatFileSize(selectedFile.size)}</span>
                </div>
              </div>
              <button 
                type="button"
                className="clear-file-btn"
                onClick={clearSelectedFile}
                disabled={uploading}
              >
                ✕
              </button>
            </div>
          ) : (
            <div
              ref={dropZoneRef}
              className={`cc-statement-dropzone ${dragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleClickToSelect}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label="Upload statement file"
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
                  e.preventDefault();
                  handleClickToSelect();
                }
              }}
            >
              <div className="dropzone-content">
                <div className="upload-icon">📄</div>
                <div className="upload-text">
                  <div className="primary-text">
                    {dragOver ? 'Drop PDF file here' : 'Drag & drop PDF file here'}
                  </div>
                  <div className="secondary-text">or click to select file</div>
                </div>
                <div className="upload-requirements">PDF files only • Max 10MB</div>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
            aria-hidden="true"
          />
        </div>

        {/* Statement Date */}
        <div className="cc-statement-field">
          <label htmlFor="statement-date" className="cc-statement-label">
            Statement Date <span className="required">*</span>
          </label>
          <input
            type="date"
            id="statement-date"
            className="cc-statement-input"
            value={statementDate}
            onChange={(e) => setStatementDate(e.target.value)}
            disabled={disabled || uploading}
            aria-required="true"
          />
          <span className="cc-statement-hint">The date shown on the statement</span>
        </div>

        {/* Statement Period */}
        <div className="cc-statement-period">
          <label className="cc-statement-label">
            Statement Period <span className="required">*</span>
          </label>
          <div className="period-inputs">
            <div className="period-field">
              <label htmlFor="period-start" className="period-label">From</label>
              <input
                type="date"
                id="period-start"
                className="cc-statement-input"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                disabled={disabled || uploading}
                aria-required="true"
              />
            </div>
            <div className="period-separator">→</div>
            <div className="period-field">
              <label htmlFor="period-end" className="period-label">To</label>
              <input
                type="date"
                id="period-end"
                className="cc-statement-input"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                disabled={disabled || uploading}
                aria-required="true"
              />
            </div>
          </div>
          <span className="cc-statement-hint">The billing period covered by this statement</span>
        </div>

        {/* Upload Progress */}
        {uploading && (
          <div className="cc-statement-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${uploadProgress}%` }}
                role="progressbar"
                aria-valuenow={uploadProgress}
                aria-valuemin="0"
                aria-valuemax="100"
              />
            </div>
            <div className="progress-text">Uploading... {uploadProgress}%</div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="cc-statement-error" role="alert">
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

        {/* Action Buttons */}
        <div className="cc-statement-actions">
          <button
            type="submit"
            className="cc-statement-submit-btn"
            disabled={disabled || uploading || !selectedFile}
          >
            {uploading ? 'Uploading...' : 'Upload Statement'}
          </button>
          <button
            type="button"
            className="cc-statement-cancel-btn"
            onClick={onCancel}
            disabled={uploading}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreditCardStatementUpload;
