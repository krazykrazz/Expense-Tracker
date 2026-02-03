import { useState, useCallback, useEffect, useRef } from 'react';
import { createBillingCycle, updateBillingCycle, getCurrentCycleStatus, getBillingCyclePdfUrl } from '../services/creditCardApi';
import { createLogger } from '../utils/logger';
import './BillingCycleHistoryForm.css';

const logger = createLogger('BillingCycleHistoryForm');

/**
 * BillingCycleHistoryForm Component
 * 
 * A form for entering actual statement balance from credit card statements.
 * Features:
 * - Pre-populated cycle dates from most recent completed cycle
 * - Validation for non-negative actual_statement_balance
 * - Optional minimum_payment, due_date, notes fields
 * - Optional PDF statement upload
 * - Display calculated balance for reference
 * - Show discrepancy after successful submission
 * - Handle duplicate entry error
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
const BillingCycleHistoryForm = ({
  paymentMethodId,
  paymentMethodName = 'Credit Card',
  cycleStartDate: propCycleStartDate = null,
  cycleEndDate: propCycleEndDate = null,
  calculatedBalance: propCalculatedBalance = null,
  editingCycle = null,
  onSubmit = () => {},
  onCancel = () => {}
}) => {
  // Determine if we're in edit mode
  const isEditMode = !!editingCycle;
  
  // Form state - initialize from editingCycle if in edit mode
  const [actualBalance, setActualBalance] = useState(
    editingCycle?.actual_statement_balance?.toString() || ''
  );
  const [minimumPayment, setMinimumPayment] = useState(
    editingCycle?.minimum_payment?.toString() || ''
  );
  const [dueDate, setDueDate] = useState(editingCycle?.due_date || '');
  const [notes, setNotes] = useState(editingCycle?.notes || '');
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfFileName, setPdfFileName] = useState('');
  const [existingPdfPath, setExistingPdfPath] = useState(editingCycle?.statement_pdf_path || null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successResult, setSuccessResult] = useState(null);
  
  // File input ref
  const fileInputRef = useRef(null);
  
  // Cycle info state (fetched or from props)
  const [cycleStartDate, setCycleStartDate] = useState(propCycleStartDate || '');
  const [cycleEndDate, setCycleEndDate] = useState(propCycleEndDate || '');
  const [calculatedBalance, setCalculatedBalance] = useState(propCalculatedBalance);
  const [loadingCycleInfo, setLoadingCycleInfo] = useState(false);

  // Format currency for display
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(value || 0);
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length === 3) {
      const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return date.toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
    return dateString;
  };

  // Fetch current cycle status if not provided via props
  useEffect(() => {
    const fetchCycleStatus = async () => {
      if (propCycleStartDate && propCycleEndDate && propCalculatedBalance !== null) {
        // Use props if provided
        setCycleStartDate(propCycleStartDate);
        setCycleEndDate(propCycleEndDate);
        setCalculatedBalance(propCalculatedBalance);
        return;
      }

      if (!paymentMethodId) return;

      setLoadingCycleInfo(true);
      try {
        const status = await getCurrentCycleStatus(paymentMethodId);
        setCycleStartDate(status.cycleStartDate || '');
        setCycleEndDate(status.cycleEndDate || '');
        setCalculatedBalance(status.calculatedBalance ?? null);
      } catch (err) {
        logger.warn('Failed to fetch cycle status:', err);
        // Don't set error - form can still be used with manual entry
      } finally {
        setLoadingCycleInfo(false);
      }
    };

    fetchCycleStatus();
  }, [paymentMethodId, propCycleStartDate, propCycleEndDate, propCalculatedBalance]);

  // Validate form data
  const validateForm = useCallback(() => {
    // Actual balance validation - must be non-negative number
    const balanceNum = parseFloat(actualBalance);
    if (actualBalance === '' || isNaN(balanceNum)) {
      return { isValid: false, error: 'Actual statement balance is required' };
    }
    if (balanceNum < 0) {
      return { isValid: false, error: 'Actual statement balance must be non-negative' };
    }

    // Minimum payment validation - optional but must be non-negative if provided
    if (minimumPayment !== '') {
      const minPayNum = parseFloat(minimumPayment);
      if (isNaN(minPayNum) || minPayNum < 0) {
        return { isValid: false, error: 'Minimum payment must be a non-negative number' };
      }
    }

    // Due date validation - optional but must be valid format if provided
    if (dueDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dueDate)) {
        return { isValid: false, error: 'Invalid due date format' };
      }
    }

    return { isValid: true, error: null };
  }, [actualBalance, minimumPayment, dueDate]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (submitting) return;

    // Validate form
    const validation = validateForm();
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessResult(null);

    try {
      const data = {
        actual_statement_balance: parseFloat(actualBalance)
      };

      // Add optional fields if provided
      if (minimumPayment !== '') {
        data.minimum_payment = parseFloat(minimumPayment);
      }
      if (dueDate) {
        data.due_date = dueDate;
      }
      if (notes.trim()) {
        data.notes = notes.trim();
      }
      if (pdfFile) {
        data.statement = pdfFile;
      }

      let result;
      if (isEditMode) {
        result = await updateBillingCycle(paymentMethodId, editingCycle.id, data);
        logger.info('Billing cycle updated successfully:', result);
      } else {
        result = await createBillingCycle(paymentMethodId, data);
        logger.info('Billing cycle created successfully:', result);
      }
      
      // Show success with discrepancy info
      setSuccessResult(result.billingCycle);
      
      // Notify parent component
      onSubmit(result);
    } catch (err) {
      logger.error(`Failed to ${isEditMode ? 'update' : 'create'} billing cycle:`, err);
      
      // Check for duplicate entry error
      if (err.message && err.message.toLowerCase().includes('duplicate')) {
        setError('A billing cycle record already exists for this period. Please edit the existing record instead.');
      } else {
        setError(err.message || `Failed to ${isEditMode ? 'update' : 'save'} billing cycle. Please try again.`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Handle amount input change
  const handleAmountChange = (setter) => (e) => {
    let value = e.target.value;
    
    // Sanitize pasted values: remove currency symbols, commas, spaces
    const sanitized = value.replace(/[$,\s]/g, '');
    
    // Allow empty, numbers, and decimal point (up to 2 decimal places)
    if (sanitized === '' || /^\d*\.?\d{0,2}$/.test(sanitized)) {
      setter(sanitized);
      setError(null);
    }
  };

  // Handle date change
  const handleDateChange = (e) => {
    setDueDate(e.target.value);
    setError(null);
  };

  // Handle notes change
  const handleNotesChange = (e) => {
    setNotes(e.target.value);
  };

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (file.type !== 'application/pdf') {
        setError('Only PDF files are allowed');
        return;
      }
      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      setPdfFile(file);
      setPdfFileName(file.name);
      setError(null);
    }
  };

  // Handle file removal
  const handleRemoveFile = () => {
    setPdfFile(null);
    setPdfFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Trigger file input click
  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  // Clear error
  const clearError = () => {
    setError(null);
  };

  // Calculate preview discrepancy
  const previewDiscrepancy = actualBalance !== '' && calculatedBalance !== null
    ? parseFloat(actualBalance) - calculatedBalance
    : null;

  // Get discrepancy type
  const getDiscrepancyType = (amount) => {
    if (amount > 0) return 'higher';
    if (amount < 0) return 'lower';
    return 'match';
  };

  // Get discrepancy description
  const getDiscrepancyDescription = (amount) => {
    if (amount > 0) {
      return `Actual is ${formatCurrency(amount)} higher than tracked (potential untracked expenses)`;
    }
    if (amount < 0) {
      return `Actual is ${formatCurrency(Math.abs(amount))} lower than tracked (potential untracked returns/credits)`;
    }
    return 'Tracking is accurate!';
  };

  // If showing success result
  if (successResult) {
    const discrepancy = successResult.discrepancy;
    return (
      <div className="billing-cycle-form-container">
        <div className="billing-cycle-form-header">
          <h3>✓ Statement Balance Recorded</h3>
          <span className="billing-cycle-card-name">{paymentMethodName}</span>
        </div>

        <div className="billing-cycle-success">
          <div className="success-summary">
            <div className="success-row">
              <span className="success-label">Billing Period:</span>
              <span className="success-value">
                {formatDate(successResult.cycle_start_date)} - {formatDate(successResult.cycle_end_date)}
              </span>
            </div>
            <div className="success-row">
              <span className="success-label">Actual Balance:</span>
              <span className="success-value">{formatCurrency(successResult.actual_statement_balance)}</span>
            </div>
            <div className="success-row">
              <span className="success-label">Calculated Balance:</span>
              <span className="success-value">{formatCurrency(successResult.calculated_statement_balance)}</span>
            </div>
          </div>

          {discrepancy && (
            <div className={`discrepancy-result discrepancy-${discrepancy.type}`}>
              <div className="discrepancy-amount">
                {discrepancy.type === 'match' ? (
                  <span className="discrepancy-match">✓ Perfect Match</span>
                ) : (
                  <>
                    <span className="discrepancy-label">Discrepancy:</span>
                    <span className={`discrepancy-value ${discrepancy.type}`}>
                      {discrepancy.amount > 0 ? '+' : ''}{formatCurrency(discrepancy.amount)}
                    </span>
                  </>
                )}
              </div>
              <div className="discrepancy-description">{discrepancy.description}</div>
            </div>
          )}

          <div className="success-actions">
            <button
              type="button"
              className="billing-cycle-done-btn"
              onClick={onCancel}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="billing-cycle-form-container">
      <div className="billing-cycle-form-header">
        <h3>{isEditMode ? 'Edit Statement Balance' : 'Enter Statement Balance'}</h3>
        <span className="billing-cycle-card-name">{paymentMethodName}</span>
      </div>

      {/* Cycle Info */}
      {loadingCycleInfo ? (
        <div className="billing-cycle-info loading">
          Loading billing cycle information...
        </div>
      ) : cycleStartDate && cycleEndDate ? (
        <div className="billing-cycle-info">
          <div className="cycle-info-row">
            <span className="cycle-info-label">Billing Period:</span>
            <span className="cycle-info-value">
              {formatDate(cycleStartDate)} - {formatDate(cycleEndDate)}
            </span>
          </div>
          {calculatedBalance !== null && (
            <div className="cycle-info-row">
              <span className="cycle-info-label">Calculated Balance:</span>
              <span className="cycle-info-value calculated">{formatCurrency(calculatedBalance)}</span>
            </div>
          )}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="billing-cycle-form">
        {/* Actual Statement Balance Field */}
        <div className="billing-cycle-field">
          <label htmlFor="actual-balance" className="billing-cycle-label">
            Actual Statement Balance <span className="required">*</span>
          </label>
          <div className="billing-cycle-amount-input">
            <span className="currency-symbol">$</span>
            <input
              type="text"
              id="actual-balance"
              className="billing-cycle-input"
              value={actualBalance}
              onChange={handleAmountChange(setActualBalance)}
              placeholder="0.00"
              disabled={submitting}
              autoFocus
              aria-required="true"
              aria-describedby="actual-balance-hint"
            />
          </div>
          <span id="actual-balance-hint" className="billing-cycle-hint">
            Enter the balance from your credit card statement
          </span>
        </div>

        {/* Discrepancy Preview */}
        {previewDiscrepancy !== null && (
          <div className={`discrepancy-preview discrepancy-${getDiscrepancyType(previewDiscrepancy)}`}>
            <span className="preview-label">Discrepancy Preview:</span>
            <span className={`preview-value ${getDiscrepancyType(previewDiscrepancy)}`}>
              {previewDiscrepancy > 0 ? '+' : ''}{formatCurrency(previewDiscrepancy)}
            </span>
            <span className="preview-description">{getDiscrepancyDescription(previewDiscrepancy)}</span>
          </div>
        )}

        {/* Minimum Payment Field */}
        <div className="billing-cycle-field">
          <label htmlFor="minimum-payment" className="billing-cycle-label">
            Minimum Payment <span className="optional">(optional)</span>
          </label>
          <div className="billing-cycle-amount-input">
            <span className="currency-symbol">$</span>
            <input
              type="text"
              id="minimum-payment"
              className="billing-cycle-input"
              value={minimumPayment}
              onChange={handleAmountChange(setMinimumPayment)}
              placeholder="0.00"
              disabled={submitting}
            />
          </div>
        </div>

        {/* Due Date Field */}
        <div className="billing-cycle-field">
          <label htmlFor="due-date" className="billing-cycle-label">
            Due Date <span className="optional">(optional)</span>
          </label>
          <input
            type="date"
            id="due-date"
            className="billing-cycle-input billing-cycle-date"
            value={dueDate}
            onChange={handleDateChange}
            disabled={submitting}
          />
        </div>

        {/* Notes Field */}
        <div className="billing-cycle-field">
          <label htmlFor="billing-notes" className="billing-cycle-label">
            Notes <span className="optional">(optional)</span>
          </label>
          <textarea
            id="billing-notes"
            className="billing-cycle-input billing-cycle-notes"
            value={notes}
            onChange={handleNotesChange}
            placeholder="e.g., Statement received via email..."
            disabled={submitting}
            rows={2}
          />
        </div>

        {/* PDF Statement Upload Field */}
        <div className="billing-cycle-field">
          <label className="billing-cycle-label">
            Statement PDF <span className="optional">(optional)</span>
          </label>
          <input
            type="file"
            ref={fileInputRef}
            accept=".pdf,application/pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={submitting}
          />
          {/* Show existing PDF if in edit mode and no new file selected */}
          {existingPdfPath && !pdfFileName && (
            <div className="billing-cycle-file-existing">
              <span className="file-icon existing">📄</span>
              <span className="file-name">Statement PDF attached</span>
              <a
                href={getBillingCyclePdfUrl(paymentMethodId, editingCycle?.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="file-view-btn"
                title="View PDF"
              >
                View
              </a>
              <button
                type="button"
                className="file-replace-btn"
                onClick={handleBrowseClick}
                disabled={submitting}
                title="Replace PDF"
              >
                Replace
              </button>
            </div>
          )}
          {/* Show newly selected file */}
          {pdfFileName ? (
            <div className="billing-cycle-file-selected">
              <span className="file-icon">📄</span>
              <span className="file-name">{pdfFileName}</span>
              <button
                type="button"
                className="file-remove-btn"
                onClick={handleRemoveFile}
                disabled={submitting}
                title="Remove file"
              >
                ✕
              </button>
            </div>
          ) : !existingPdfPath && (
            <button
              type="button"
              className="billing-cycle-upload-btn"
              onClick={handleBrowseClick}
              disabled={submitting}
            >
              📎 Attach PDF Statement
            </button>
          )}
          <span className="billing-cycle-hint">
            Attach your credit card statement PDF for record keeping
          </span>
        </div>

        {/* Error Display */}
        {error && (
          <div className="billing-cycle-error" role="alert">
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
        <div className="billing-cycle-actions">
          <button
            type="submit"
            className="billing-cycle-submit-btn"
            disabled={submitting || actualBalance === ''}
          >
            {submitting ? 'Saving...' : isEditMode ? 'Update Statement Balance' : 'Save Statement Balance'}
          </button>
          <button
            type="button"
            className="billing-cycle-cancel-btn"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default BillingCycleHistoryForm;
