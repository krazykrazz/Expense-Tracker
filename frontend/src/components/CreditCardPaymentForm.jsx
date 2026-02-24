import { useState, useCallback } from 'react';
import { recordPayment } from '../services/creditCardApi';
import { formatCAD as formatCurrency } from '../utils/formatters';
import { createLogger } from '../utils/logger';
import './CreditCardPaymentForm.css';

const logger = createLogger('CreditCardPaymentForm');

/**
 * CreditCardPaymentForm Component
 * 
 * A form for recording credit card payments.
 * Features:
 * - Amount input with validation (positive numbers only)
 * - Date picker defaulting to today
 * - Optional notes field
 * - Loading state during submission
 * - Error display
 * 
 * Requirements: 8.7, 8.8, 9.4
 */
const CreditCardPaymentForm = ({
  paymentMethodId,
  paymentMethodName = 'Credit Card',
  currentBalance = 0,
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

    return { isValid: true, error: null };
  }, [amount, paymentDate]);

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

      const result = await recordPayment(paymentMethodId, paymentData);
      
      logger.info('Payment recorded successfully:', result);
      
      // Notify parent component
      onPaymentRecorded(result);
      
      // Reset form
      setAmount('');
      setPaymentDate(getTodayDate());
      setNotes('');
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
    // This allows users to paste values like "$1,234.56" or "1,234.56"
    const sanitized = value.replace(/[$,\s]/g, '');
    
    // Allow empty, numbers, and decimal point (up to 2 decimal places)
    if (sanitized === '' || /^\d*\.?\d{0,2}$/.test(sanitized)) {
      setAmount(sanitized);
      setError(null);
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

  // Calculate new balance after payment
  const newBalance = currentBalance - (parseFloat(amount) || 0);

  return (
    <div className="cc-payment-form-container">
      <div className="cc-payment-form-header">
        <h3>Log Payment</h3>
        <span className="cc-payment-card-name">{paymentMethodName}</span>
      </div>

      <div className="cc-payment-balance-info">
        <div className="balance-row">
          <span className="balance-label">Current Balance:</span>
          <span className="balance-value">{formatCurrency(currentBalance)}</span>
        </div>
        {amount && parseFloat(amount) > 0 && (
          <div className="balance-row new-balance">
            <span className="balance-label">After Payment:</span>
            <span className={`balance-value ${newBalance < 0 ? 'negative' : ''}`}>
              {formatCurrency(newBalance)}
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="cc-payment-form">
        {/* Amount Field */}
        <div className="cc-payment-field">
          <label htmlFor="payment-amount" className="cc-payment-label">
            Payment Amount <span className="required">*</span>
          </label>
          <div className="cc-payment-amount-input">
            <span className="currency-symbol">$</span>
            <input
              type="text"
              id="payment-amount"
              className="cc-payment-input form-input"
              value={amount}
              onChange={handleAmountChange}
              placeholder="0.00"
              disabled={disabled || submitting}
              autoFocus
              aria-required="true"
              aria-describedby="amount-hint"
            />
          </div>
          <span id="amount-hint" className="cc-payment-hint">
            Enter a positive amount
          </span>
        </div>

        {/* Date Field */}
        <div className="cc-payment-field">
          <label htmlFor="payment-date" className="cc-payment-label">
            Payment Date <span className="required">*</span>
          </label>
          <input
            type="date"
            id="payment-date"
            className="cc-payment-input cc-payment-date form-input"
            value={paymentDate}
            onChange={handleDateChange}
            disabled={disabled || submitting}
            aria-required="true"
          />
        </div>

        {/* Notes Field */}
        <div className="cc-payment-field">
          <label htmlFor="payment-notes" className="cc-payment-label">
            Notes <span className="optional">(optional)</span>
          </label>
          <textarea
            id="payment-notes"
            className="cc-payment-input cc-payment-notes form-input"
            value={notes}
            onChange={handleNotesChange}
            placeholder="e.g., Online payment, Bank transfer..."
            disabled={disabled || submitting}
            rows={2}
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="cc-payment-error" role="alert">
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
        <div className="cc-payment-actions">
          <button
            type="submit"
            className="cc-payment-submit-btn btn-primary"
            disabled={disabled || submitting || !amount}
          >
            {submitting ? 'Recording...' : 'Record Payment'}
          </button>
          <button
            type="button"
            className="cc-payment-cancel-btn btn-cancel"
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

export default CreditCardPaymentForm;
