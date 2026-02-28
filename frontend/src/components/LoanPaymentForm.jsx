import { useState, useEffect, useCallback } from 'react';
import { createPayment, updatePayment, getPaymentSuggestion } from '../services/loanPaymentApi';
import { formatCAD as formatCurrency } from '../utils/formatters';
import { createLogger } from '../utils/logger';
import HelpTooltip from './HelpTooltip';
import './LoanPaymentForm.css';

const logger = createLogger('LoanPaymentForm');

/**
 * LoanPaymentForm Component
 * 
 * A form for recording loan and mortgage payments.
 * Features:
 * - Amount input with suggestion pre-fill
 * - Date picker defaulting to today
 * - Optional notes field
 * - "Suggested" label when suggestion is available
 * - Loading state during submission
 * - Error display
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 6.3
 */
const LoanPaymentForm = ({
  loanId,
  loanName = 'Loan',
  loanType = 'loan',
  currentBalance = 0,
  calculatedBalanceData = null,
  editingPayment = null,
  onPaymentRecorded = () => {},
  onCancel = () => {},
  disabled = false
}) => {
  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Form state
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayDate());
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  
  // Suggestion state
  const [suggestion, setSuggestion] = useState(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [usingSuggestion, setUsingSuggestion] = useState(false);

  // Balance override state (mortgages only)
  const [balanceOverride, setBalanceOverride] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [overrideError, setOverrideError] = useState(null);

  // Fetch payment suggestion when component mounts
  useEffect(() => {
    if (!editingPayment && loanId) {
      fetchSuggestion();
    }
  }, [loanId, editingPayment]);

  // Populate form when editing
  useEffect(() => {
    if (editingPayment) {
      setAmount(editingPayment.amount?.toString() || '');
      setPaymentDate(editingPayment.payment_date || getTodayDate());
      setNotes(editingPayment.notes || '');
      setUsingSuggestion(false);
    }
  }, [editingPayment]);

  const fetchSuggestion = async () => {
    setLoadingSuggestion(true);
    try {
      const suggestionData = await getPaymentSuggestion(loanId);
      setSuggestion(suggestionData);
      
      // Pre-fill amount if suggestion is available
      if (suggestionData?.suggestedAmount && !editingPayment) {
        setAmount(suggestionData.suggestedAmount.toString());
        setUsingSuggestion(true);
      }
    } catch (err) {
      logger.warn('Failed to fetch payment suggestion:', err);
      // Don't show error to user - suggestion is optional
    } finally {
      setLoadingSuggestion(false);
    }
  };

  // Validate form data
  const validateForm = useCallback(() => {
    // Amount validation - must be positive number
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum)) {
      return { isValid: false, error: 'Payment amount is required' };
    }
    if (amountNum <= 0) {
      return { isValid: false, error: 'Payment amount must be greater than zero' };
    }

    // Date validation
    if (!paymentDate) {
      return { isValid: false, error: 'Payment date is required' };
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(paymentDate)) {
      return { isValid: false, error: 'Invalid date format' };
    }

    // Validate date is not in the future
    const selectedDate = new Date(paymentDate);
    selectedDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate > today) {
      return { isValid: false, error: 'Payment date cannot be in the future' };
    }

    // Balance override validation (mortgages only)
    if (showOverride && balanceOverride !== '') {
      const overrideNum = parseFloat(balanceOverride);
      if (isNaN(overrideNum) || overrideNum < 0) {
        return { isValid: false, error: 'Balance override must be a non-negative number' };
      }
    }

    return { isValid: true, error: null };
  }, [amount, paymentDate, showOverride, balanceOverride]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (disabled || submitting) return;

    // Validate form
    const validation = validateForm();
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const paymentData = {
        amount: parseFloat(amount),
        payment_date: paymentDate,
        notes: notes.trim() || null
      };

      // Include balance override for mortgages when provided
      if (showOverride && balanceOverride !== '' && isMortgage) {
        paymentData.balanceOverride = parseFloat(balanceOverride);
      }

      let result;
      if (editingPayment) {
        result = await updatePayment(loanId, editingPayment.id, paymentData);
        logger.info('Payment updated successfully:', result);
      } else {
        result = await createPayment(loanId, paymentData);
        logger.info('Payment recorded successfully:', result);
      }
      
      // Notify parent component
      onPaymentRecorded(result);
      
      // Reset form if not editing
      if (!editingPayment) {
        setAmount('');
        setPaymentDate(getTodayDate());
        setNotes('');
        setUsingSuggestion(false);
        setBalanceOverride('');
        setShowOverride(false);
        setOverrideError(null);
      }
    } catch (err) {
      logger.error('Failed to record payment:', err);
      setError(err.message || 'Failed to record payment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle amount input change
  const handleAmountChange = (e) => {
    let value = e.target.value;
    
    // Sanitize pasted values: remove currency symbols, commas, spaces
    const sanitized = value.replace(/[$,\s]/g, '');
    
    // Allow empty, numbers, and decimal point (up to 2 decimal places)
    if (sanitized === '' || /^\d*\.?\d{0,2}$/.test(sanitized)) {
      setAmount(sanitized);
      setError(null);
      
      // Check if user changed from suggested amount
      if (suggestion?.suggestedAmount && sanitized !== suggestion.suggestedAmount.toString()) {
        setUsingSuggestion(false);
      } else if (suggestion?.suggestedAmount && sanitized === suggestion.suggestedAmount.toString()) {
        setUsingSuggestion(true);
      }
    }
  };

  // Handle date change
  const handleDateChange = (e) => {
    setPaymentDate(e.target.value);
    setError(null);
  };

  // Handle notes change
  const handleNotesChange = (e) => {
    setNotes(e.target.value);
  };

  // Clear error
  const clearError = () => {
    setError(null);
  };

  // Apply suggestion
  const applySuggestion = () => {
    if (suggestion?.suggestedAmount) {
      setAmount(suggestion.suggestedAmount.toString());
      setUsingSuggestion(true);
      setError(null);
    }
  };

  // Handle balance override input change
  const handleOverrideChange = (e) => {
    let value = e.target.value;
    const sanitized = value.replace(/[$,\s]/g, '');
    
    if (sanitized === '' || /^\d*\.?\d{0,2}$/.test(sanitized)) {
      setBalanceOverride(sanitized);
      // Inline validation for negative values
      const num = parseFloat(sanitized);
      if (sanitized !== '' && (isNaN(num) || num < 0)) {
        setOverrideError('Balance override must be a non-negative number');
      } else {
        setOverrideError(null);
      }
    }
  };

  // Toggle override section visibility
  const toggleOverride = () => {
    setShowOverride(prev => !prev);
    if (showOverride) {
      // Clearing override when hiding
      setBalanceOverride('');
      setOverrideError(null);
    }
  };

  // Determine if override section should be available
  const isMortgage = loanType === 'mortgage';
  const showOverrideSection = isMortgage && calculatedBalanceData?.interestAware === true;

  // Use interest-aware balance from API for mortgages when available
  const effectiveBalance = (isMortgage && calculatedBalanceData?.interestAware)
    ? calculatedBalanceData.currentBalance
    : currentBalance;

  // Calculate new balance after payment using interest-aware balance
  const newBalance = effectiveBalance - (parseFloat(amount) || 0);

  // Get suggestion source label
  const getSuggestionLabel = () => {
    if (!suggestion) return '';
    switch (suggestion.source) {
      case 'monthly_payment':
        return 'Monthly Payment';
      case 'average_history':
        return 'Average Payment';
      default:
        return 'Suggested';
    }
  };

  return (
    <div className="loan-payment-form-container">
      <div className="loan-payment-form-header">
        <h3>{editingPayment ? 'Edit Payment' : 'Log Payment'}</h3>
        <span className="loan-payment-name">{loanName}</span>
      </div>

      <div className="loan-payment-balance-info">
        <div className="balance-row">
          <span className="balance-label">Current Balance:</span>
          <span className="balance-value">{formatCurrency(effectiveBalance)}</span>
        </div>
        {amount && parseFloat(amount) > 0 && (
          <div className="balance-row new-balance">
            <span className="balance-label">After Payment:</span>
            <span className={`balance-value ${newBalance < 0 ? 'negative' : ''}`}>
              {formatCurrency(Math.max(0, newBalance))}
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="loan-payment-form">
        {/* Amount Field */}
        <div className="loan-payment-field">
          <label htmlFor="loan-payment-amount" className="loan-payment-label">
            Payment Amount <span className="required">*</span>
            {usingSuggestion && suggestion && (
              <span className="suggested-badge" title={suggestion.message}>
                {getSuggestionLabel()}
              </span>
            )}
            <HelpTooltip content="Enter a positive amount" position="right" />
          </label>
          <div className="loan-payment-amount-input">
            <span className="currency-symbol">$</span>
            <input
              type="text"
              id="loan-payment-amount"
              className="loan-payment-input"
              value={amount}
              onChange={handleAmountChange}
              placeholder="0.00"
              disabled={disabled || submitting}
              autoFocus
              aria-required="true"
            />
          </div>
          <div className="loan-payment-hint-row">
            {suggestion?.suggestedAmount && !usingSuggestion && !editingPayment && (
              <button
                type="button"
                className="apply-suggestion-btn"
                onClick={applySuggestion}
                disabled={disabled || submitting}
              >
                Use {getSuggestionLabel()}: {formatCurrency(suggestion.suggestedAmount)}
              </button>
            )}
          </div>
        </div>

        {/* Date Field */}
        <div className="loan-payment-field">
          <label htmlFor="loan-payment-date" className="loan-payment-label">
            Payment Date <span className="required">*</span>
          </label>
          <input
            type="date"
            id="loan-payment-date"
            className="loan-payment-input loan-payment-date"
            value={paymentDate}
            onChange={handleDateChange}
            max={getTodayDate()}
            disabled={disabled || submitting}
            aria-required="true"
          />
        </div>

        {/* Notes Field */}
        <div className="loan-payment-field">
          <label htmlFor="loan-payment-notes" className="loan-payment-label">
            Notes <span className="optional">(optional)</span>
          </label>
          <textarea
            id="loan-payment-notes"
            className="loan-payment-input loan-payment-notes"
            value={notes}
            onChange={handleNotesChange}
            placeholder="e.g., Regular monthly payment, Extra payment..."
            disabled={disabled || submitting}
            rows={2}
          />
        </div>

        {/* Balance Override Section (mortgages with interest-aware calculation only) */}
        {showOverrideSection && (
          <div className="loan-payment-override-section">
            <button
              type="button"
              className="loan-payment-override-toggle"
              onClick={toggleOverride}
              disabled={disabled || submitting}
            >
              {showOverride ? 'Hide Override' : 'Override Balance'}
            </button>
            {showOverride && (
              <div className="loan-payment-override-content">
                <label htmlFor="loan-payment-override" className="loan-payment-label">
                  Actual Balance After Payment <span className="optional">(optional)</span>
                </label>
                <div className="loan-payment-amount-input">
                  <span className="currency-symbol">$</span>
                  <input
                    type="text"
                    id="loan-payment-override"
                    className={`loan-payment-input${overrideError ? ' input-error' : ''}`}
                    value={balanceOverride}
                    onChange={handleOverrideChange}
                    placeholder="0.00"
                    disabled={disabled || submitting}
                    aria-describedby={overrideError ? 'override-error' : undefined}
                  />
                </div>
                {overrideError && (
                  <span id="override-error" className="loan-payment-inline-error" role="alert">
                    {overrideError}
                  </span>
                )}
                <span className="loan-payment-override-hint">
                  Enter the actual remaining balance from your mortgage statement to correct any drift.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="loan-payment-error" role="alert">
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
        <div className="loan-payment-actions">
          <button
            type="submit"
            className="loan-payment-submit-btn"
            disabled={disabled || submitting || !amount}
          >
            {submitting ? 'Saving...' : editingPayment ? 'Update Payment' : 'Record Payment'}
          </button>
          <button
            type="button"
            className="loan-payment-cancel-btn"
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

export default LoanPaymentForm;
