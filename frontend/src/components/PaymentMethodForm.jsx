import { useState, useEffect } from 'react';
import './PaymentMethodForm.css';
import { createPaymentMethod, updatePaymentMethod, getDisplayNames } from '../services/paymentMethodApi';
import { createLogger } from '../utils/logger';
import HelpTooltip from './HelpTooltip';

const logger = createLogger('PaymentMethodForm');

// Payment method types
const PAYMENT_METHOD_TYPES = [
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'debit', label: 'Debit' },
  { value: 'credit_card', label: 'Credit Card' }
];

const PaymentMethodForm = ({ isOpen, method, onSave, onCancel }) => {
  const isEditing = !!method;
  
  // Form state
  const [formData, setFormData] = useState({
    type: 'cash',
    display_name: '',
    full_name: '',
    account_details: '',
    credit_limit: '',
    current_balance: '',
    payment_due_day: '',
    billing_cycle_day: '',
    billing_cycle_start: '',
    billing_cycle_end: ''
  });
  
  const [validationErrors, setValidationErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [existingDisplayNames, setExistingDisplayNames] = useState([]);

  // Initialize form data when editing
  useEffect(() => {
    if (method) {
      setFormData({
        type: method.type || 'cash',
        display_name: method.display_name || '',
        full_name: method.full_name || '',
        account_details: method.account_details || '',
        credit_limit: method.credit_limit ? method.credit_limit.toString() : '',
        current_balance: method.current_balance ? method.current_balance.toString() : '',
        payment_due_day: method.payment_due_day ? method.payment_due_day.toString() : '',
        billing_cycle_day: method.billing_cycle_day ? method.billing_cycle_day.toString() : '',
        billing_cycle_start: method.billing_cycle_start ? method.billing_cycle_start.toString() : '',
        billing_cycle_end: method.billing_cycle_end ? method.billing_cycle_end.toString() : ''
      });
    } else {
      // Reset form for new payment method
      setFormData({
        type: 'cash',
        display_name: '',
        full_name: '',
        account_details: '',
        credit_limit: '',
        current_balance: '',
        payment_due_day: '',
        billing_cycle_day: '',
        billing_cycle_start: '',
        billing_cycle_end: ''
      });
    }
    setValidationErrors({});
    setError(null);
  }, [method]);

  // Fetch existing display names for uniqueness validation
  useEffect(() => {
    const fetchDisplayNames = async () => {
      try {
        const names = await getDisplayNames();
        setExistingDisplayNames(names || []);
      } catch (err) {
        logger.error('Error fetching display names:', err);
      }
    };
    
    if (isOpen) {
      fetchDisplayNames();
    }
  }, [isOpen]);

  // Handle input change
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Validate form
  const validateForm = () => {
    const errors = {};
    
    // Display name is required for all types
    const trimmedDisplayName = formData.display_name.trim();
    if (!trimmedDisplayName) {
      errors.display_name = 'Display name is required';
    } else {
      // Check uniqueness (exclude current method if editing)
      // existingDisplayNames is an array of objects with display_name property
      const isDuplicate = existingDisplayNames.some(item => {
        const name = item?.display_name;
        if (!name || typeof name !== 'string') return false;
        const nameMatches = name.toLowerCase() === trimmedDisplayName.toLowerCase();
        // When editing, exclude the current method from duplicate check
        if (isEditing && method?.display_name) {
          return nameMatches && name.toLowerCase() !== method.display_name.toLowerCase();
        }
        return nameMatches;
      });
      if (isDuplicate) {
        errors.display_name = 'A payment method with this display name already exists';
      }
    }
    
    // Credit card specific validation
    if (formData.type === 'credit_card') {
      // Full name is required for credit cards
      if (!formData.full_name.trim()) {
        errors.full_name = 'Full name is required for credit cards';
      }
      
      // Credit limit validation (optional but must be positive if provided)
      if (formData.credit_limit) {
        const limit = parseFloat(formData.credit_limit);
        if (isNaN(limit) || limit <= 0) {
          errors.credit_limit = 'Credit limit must be a positive number';
        }
      }
      
      // Current balance validation (optional but must be non-negative if provided)
      if (formData.current_balance) {
        const balance = parseFloat(formData.current_balance);
        if (isNaN(balance) || balance < 0) {
          errors.current_balance = 'Balance cannot be negative';
        }
      }
      
      // Payment due day is required for credit cards
      if (!formData.payment_due_day) {
        errors.payment_due_day = 'Payment due day is required for credit cards';
      } else {
        const day = parseInt(formData.payment_due_day, 10);
        if (isNaN(day) || day < 1 || day > 31) {
          errors.payment_due_day = 'Payment due day must be between 1 and 31';
        }
      }
      
      // Billing cycle day is required for credit cards
      if (!formData.billing_cycle_day) {
        errors.billing_cycle_day = 'Statement closing day is required for credit cards';
      } else {
        const day = parseInt(formData.billing_cycle_day, 10);
        if (isNaN(day) || day < 1 || day > 31) {
          errors.billing_cycle_day = 'Statement closing day must be between 1 and 31';
        }
      }
      
      // Billing cycle start validation (optional but must be 1-31 if provided)
      if (formData.billing_cycle_start) {
        const day = parseInt(formData.billing_cycle_start, 10);
        if (isNaN(day) || day < 1 || day > 31) {
          errors.billing_cycle_start = 'Billing cycle start must be between 1 and 31';
        }
      }
      
      // Billing cycle end validation (optional but must be 1-31 if provided)
      if (formData.billing_cycle_end) {
        const day = parseInt(formData.billing_cycle_end, 10);
        if (isNaN(day) || day < 1 || day > 31) {
          errors.billing_cycle_end = 'Billing cycle end must be between 1 and 31';
        }
      }
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setError('Please fix the validation errors before submitting.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Build payload based on type
      const payload = {
        type: formData.type,
        display_name: formData.display_name.trim()
      };
      
      // Add optional fields based on type
      if (formData.type === 'cheque' || formData.type === 'debit') {
        if (formData.account_details.trim()) {
          payload.account_details = formData.account_details.trim();
        }
      }
      
      if (formData.type === 'credit_card') {
        payload.full_name = formData.full_name.trim();
        
        if (formData.account_details.trim()) {
          payload.account_details = formData.account_details.trim();
        }
        if (formData.credit_limit) {
          payload.credit_limit = parseFloat(formData.credit_limit);
        }
        // Only set initial balance for new credit cards
        if (!isEditing && formData.current_balance) {
          payload.current_balance = parseFloat(formData.current_balance);
        }
        if (formData.payment_due_day) {
          payload.payment_due_day = parseInt(formData.payment_due_day, 10);
        }
        if (formData.billing_cycle_day) {
          payload.billing_cycle_day = parseInt(formData.billing_cycle_day, 10);
        }
        if (formData.billing_cycle_start) {
          payload.billing_cycle_start = parseInt(formData.billing_cycle_start, 10);
        }
        if (formData.billing_cycle_end) {
          payload.billing_cycle_end = parseInt(formData.billing_cycle_end, 10);
        }
      }
      
      if (isEditing) {
        await updatePaymentMethod(method.id, payload);
      } else {
        await createPaymentMethod(payload);
      }
      
      onSave();
    } catch (err) {
      const errorMessage = err.message || 'Unable to save payment method.';
      setError(errorMessage);
      logger.error('Error saving payment method:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="payment-method-form-overlay" onClick={onCancel}>
      <div className="payment-method-form-container" onClick={(e) => e.stopPropagation()}>
        <div className="payment-method-form-header">
          <h2>{isEditing ? 'Edit Payment Method' : 'Add Payment Method'}</h2>
          <button className="payment-method-form-close" onClick={onCancel}>✕</button>
        </div>

        {error && (
          <div className="payment-method-form-error">{error}</div>
        )}

        <form className="payment-method-form" onSubmit={handleSubmit}>
          {/* Type Selector - disabled when editing */}
          <div className="form-group">
            <label htmlFor="type">Type *</label>
            <select
              id="type"
              value={formData.type}
              onChange={(e) => handleChange('type', e.target.value)}
              disabled={isEditing || loading}
              className={validationErrors.type ? 'input-error' : ''}
            >
              {PAYMENT_METHOD_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            {isEditing && (
              <span className="form-hint">Type cannot be changed after creation</span>
            )}
          </div>

          {/* Display Name - required for all types */}
          <div className="form-group">
            <label htmlFor="display_name">
              Display Name * <HelpTooltip content="Short name shown in dropdowns" position="right" />
            </label>
            <input
              type="text"
              id="display_name"
              value={formData.display_name}
              onChange={(e) => handleChange('display_name', e.target.value)}
              placeholder="e.g., CIBC MC, Cash"
              disabled={loading}
              className={validationErrors.display_name ? 'input-error' : ''}
              maxLength={50}
            />
            {validationErrors.display_name && (
              <span className="validation-error">{validationErrors.display_name}</span>
            )}
          </div>

          {/* Full Name - required for credit cards */}
          {formData.type === 'credit_card' && (
            <div className="form-group">
              <label htmlFor="full_name">
                Full Name * <HelpTooltip content="Complete name of the credit card" position="right" />
              </label>
              <input
                type="text"
                id="full_name"
                value={formData.full_name}
                onChange={(e) => handleChange('full_name', e.target.value)}
                placeholder="e.g., CIBC Mastercard"
                disabled={loading}
                className={validationErrors.full_name ? 'input-error' : ''}
                maxLength={100}
              />
              {validationErrors.full_name && (
                <span className="validation-error">{validationErrors.full_name}</span>
              )}
            </div>
          )}

          {/* Account Details - optional for cheque, debit, credit_card */}
          {(formData.type === 'cheque' || formData.type === 'debit' || formData.type === 'credit_card') && (
            <div className="form-group">
              <label htmlFor="account_details">
                Account Details <HelpTooltip content="Optional reference information" position="right" />
              </label>
              <input
                type="text"
                id="account_details"
                value={formData.account_details}
                onChange={(e) => handleChange('account_details', e.target.value)}
                placeholder="e.g., Last 4 digits: 1234"
                disabled={loading}
                maxLength={100}
              />
            </div>
          )}

          {/* Credit Card Specific Fields */}
          {formData.type === 'credit_card' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="credit_limit">Credit Limit</label>
                  <input
                    type="number"
                    id="credit_limit"
                    value={formData.credit_limit}
                    onChange={(e) => handleChange('credit_limit', e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    disabled={loading}
                    className={validationErrors.credit_limit ? 'input-error' : ''}
                  />
                  {validationErrors.credit_limit && (
                    <span className="validation-error">{validationErrors.credit_limit}</span>
                  )}
                </div>

                {!isEditing && (
                  <div className="form-group">
                    <label htmlFor="current_balance">Initial Balance</label>
                    <input
                      type="number"
                      id="current_balance"
                      value={formData.current_balance}
                      onChange={(e) => handleChange('current_balance', e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      disabled={loading}
                      className={validationErrors.current_balance ? 'input-error' : ''}
                    />
                    {validationErrors.current_balance && (
                      <span className="validation-error">{validationErrors.current_balance}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="payment_due_day">
                  Payment Due Day * <HelpTooltip content="Day of month when payment is due" position="right" />
                </label>
                <input
                  type="number"
                  id="payment_due_day"
                  value={formData.payment_due_day}
                  onChange={(e) => handleChange('payment_due_day', e.target.value)}
                  placeholder="1-31"
                  min="1"
                  max="31"
                  required
                  disabled={loading}
                  className={validationErrors.payment_due_day ? 'input-error' : ''}
                />
                {validationErrors.payment_due_day && (
                  <span className="validation-error">{validationErrors.payment_due_day}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="billing_cycle_day">
                  Statement Closing Day * <HelpTooltip content="The day your statement closes each month (found on your statement)" position="right" maxWidth={250} />
                </label>
                <input
                  type="number"
                  id="billing_cycle_day"
                  value={formData.billing_cycle_day}
                  onChange={(e) => handleChange('billing_cycle_day', e.target.value)}
                  placeholder="1-31"
                  min="1"
                  max="31"
                  required
                  disabled={loading}
                  className={validationErrors.billing_cycle_day ? 'input-error' : ''}
                />
                {validationErrors.billing_cycle_day && (
                  <span className="validation-error">{validationErrors.billing_cycle_day}</span>
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="billing_cycle_start">Billing Cycle Start</label>
                  <input
                    type="number"
                    id="billing_cycle_start"
                    value={formData.billing_cycle_start}
                    onChange={(e) => handleChange('billing_cycle_start', e.target.value)}
                    placeholder="1-31"
                    min="1"
                    max="31"
                    disabled={loading}
                    className={validationErrors.billing_cycle_start ? 'input-error' : ''}
                  />
                  {validationErrors.billing_cycle_start && (
                    <span className="validation-error">{validationErrors.billing_cycle_start}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="billing_cycle_end">Billing Cycle End</label>
                  <input
                    type="number"
                    id="billing_cycle_end"
                    value={formData.billing_cycle_end}
                    onChange={(e) => handleChange('billing_cycle_end', e.target.value)}
                    placeholder="1-31"
                    min="1"
                    max="31"
                    disabled={loading}
                    className={validationErrors.billing_cycle_end ? 'input-error' : ''}
                  />
                  {validationErrors.billing_cycle_end && (
                    <span className="validation-error">{validationErrors.billing_cycle_end}</span>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Form Actions */}
          <div className="form-actions">
            <button
              type="submit"
              className="form-submit-btn"
              disabled={loading}
            >
              {loading ? 'Saving...' : (isEditing ? 'Update' : 'Create')}
            </button>
            <button
              type="button"
              className="form-cancel-btn"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentMethodForm;
