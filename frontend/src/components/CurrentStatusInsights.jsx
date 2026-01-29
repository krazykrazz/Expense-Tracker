/**
 * CurrentStatusInsights Component
 * 
 * Displays current mortgage status including:
 * - Current interest rate with visual indicator for variable rate
 * - Daily, weekly, monthly interest amounts formatted as currency
 * - Current payment amount with edit capability
 * - Rate last updated date (especially useful for variable rates)
 * 
 * Requirements: 2.1, 2.2, 2.4, 3.1, 3.2, 3.4, 3.5
 */

import { useState } from 'react';
import './CurrentStatusInsights.css';
import { formatCurrency, getTodayLocalDate, formatMonthString } from '../utils/formatters';

const CurrentStatusInsights = ({ 
  insights, 
  onEditPayment,
  onEditRate,
  loading = false 
}) => {
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(getTodayLocalDate());
  const [validationError, setValidationError] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Rate editing state
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [rateValue, setRateValue] = useState('');
  const [rateValidationError, setRateValidationError] = useState(null);
  const [savingRate, setSavingRate] = useState(false);

  // Handle missing data - Requirement 2.4
  if (!insights || !insights.currentStatus) {
    return (
      <div className="current-status-insights">
        <h4>Current Status</h4>
        <div className="insights-no-data">
          <span className="no-data-icon">📊</span>
          <p>Rate not set</p>
          <p className="no-data-hint">Add a balance entry to see interest calculations</p>
        </div>
      </div>
    );
  }

  const { currentStatus, dataStatus } = insights;
  const { balance, rate, rateType, currentPayment, minimumPayment, interestBreakdown } = currentStatus;

  const handleStartEdit = () => {
    setIsEditingPayment(true);
    setPaymentAmount(currentPayment?.toString() || '');
    setEffectiveDate(getTodayLocalDate());
    setValidationError(null);
  };

  const handleCancelEdit = () => {
    setIsEditingPayment(false);
    setPaymentAmount('');
    setValidationError(null);
  };

  const handleSavePayment = async () => {
    // Validate payment amount
    const amount = parseFloat(paymentAmount);
    if (!paymentAmount || isNaN(amount) || amount <= 0) {
      setValidationError('Payment amount must be a positive number');
      return;
    }

    // Validate effective date
    if (!effectiveDate) {
      setValidationError('Effective date is required');
      return;
    }

    // Check if date is in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(effectiveDate);
    if (selectedDate > today) {
      setValidationError('Effective date cannot be in the future');
      return;
    }

    setSaving(true);
    setValidationError(null);

    try {
      await onEditPayment({
        payment_amount: amount,
        effective_date: effectiveDate
      });
      setIsEditingPayment(false);
      setPaymentAmount('');
    } catch (error) {
      setValidationError(error.message || 'Failed to save payment');
    } finally {
      setSaving(false);
    }
  };

  // Rate editing handlers
  const handleStartRateEdit = () => {
    setIsEditingRate(true);
    setRateValue(rate?.toString() || '');
    setRateValidationError(null);
  };

  const handleCancelRateEdit = () => {
    setIsEditingRate(false);
    setRateValue('');
    setRateValidationError(null);
  };

  const handleSaveRate = async () => {
    // Validate rate
    const newRate = parseFloat(rateValue);
    if (!rateValue || isNaN(newRate) || newRate < 0 || newRate > 100) {
      setRateValidationError('Rate must be between 0 and 100');
      return;
    }

    setSavingRate(true);
    setRateValidationError(null);

    try {
      await onEditRate(newRate);
      setIsEditingRate(false);
      setRateValue('');
    } catch (error) {
      setRateValidationError(error.message || 'Failed to update rate');
    } finally {
      setSavingRate(false);
    }
  };

  // Check if we have valid rate data - Requirement 3.5
  const hasRateData = rate > 0 && dataStatus?.hasBalanceData;

  return (
    <div className="current-status-insights">
      <h4>Current Status</h4>
      
      {/* Interest Rate Display - Requirements 2.1, 2.2 */}
      <div className="insights-section">
        <div className="insights-rate-display">
          <div className="rate-header">
            <span className="rate-label">Current Interest Rate</span>
            {!isEditingRate && rateType === 'variable' && onEditRate && (
              <button 
                className="rate-edit-button"
                onClick={handleStartRateEdit}
                disabled={loading || savingRate}
                title="Update interest rate"
              >
                ✏️ Update Rate
              </button>
            )}
          </div>
          
          {isEditingRate ? (
            <div className="rate-edit-form">
              <div className="rate-input-group">
                <label>New Interest Rate (%)</label>
                <input
                  type="number"
                  value={rateValue}
                  onChange={(e) => setRateValue(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  max="100"
                  disabled={savingRate}
                  className={rateValidationError ? 'input-error' : ''}
                />
              </div>
              {rateValidationError && (
                <div className="rate-validation-error">{rateValidationError}</div>
              )}
              <div className="rate-edit-actions">
                <button
                  className="rate-save-button"
                  onClick={handleSaveRate}
                  disabled={savingRate}
                >
                  {savingRate ? 'Saving...' : 'Save'}
                </button>
                <button
                  className="rate-cancel-button"
                  onClick={handleCancelRateEdit}
                  disabled={savingRate}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="rate-main">
              <span className={`rate-value ${rateType === 'variable' ? 'variable-rate' : 'fixed-rate'}`}>
                {hasRateData ? `${rate}%` : 'N/A'}
                {rateType === 'variable' && hasRateData && (
                  <span className="rate-type-badge variable">Variable</span>
                )}
                {rateType === 'fixed' && hasRateData && (
                  <span className="rate-type-badge fixed">Fixed</span>
                )}
              </span>
            </div>
          )}
          {hasRateData && dataStatus?.lastUpdated && !isEditingRate && (
            <p className="rate-last-updated">
              Rate as of {formatMonthString(dataStatus.lastUpdated)}
              {rateType === 'variable' && (
                <span className="rate-update-hint"> • Click "Update Rate" when rate changes</span>
              )}
            </p>
          )}
          {!hasRateData && !isEditingRate && (
            <p className="rate-hint">Add a balance entry to set the current rate</p>
          )}
        </div>
      </div>

      {/* Interest Breakdown - Requirements 3.1, 3.2, 3.4, 3.5 */}
      <div className="insights-section">
        <div className="insights-interest-breakdown">
          <span className="breakdown-title">Interest Costs</span>
          {hasRateData ? (
            <div className="breakdown-grid">
              <div className="breakdown-item">
                <span className="breakdown-label">Daily</span>
                <span className="breakdown-value">{formatCurrency(interestBreakdown?.daily || 0)}</span>
              </div>
              <div className="breakdown-item">
                <span className="breakdown-label">Weekly</span>
                <span className="breakdown-value">{formatCurrency(interestBreakdown?.weekly || 0)}</span>
              </div>
              <div className="breakdown-item">
                <span className="breakdown-label">Monthly</span>
                <span className="breakdown-value">{formatCurrency(interestBreakdown?.monthly || 0)}</span>
              </div>
              <div className="breakdown-item">
                <span className="breakdown-label">Annual</span>
                <span className="breakdown-value annual">{formatCurrency(interestBreakdown?.annual || 0)}</span>
              </div>
            </div>
          ) : (
            <div className="breakdown-no-data">
              <span>$0.00</span>
              <p className="breakdown-hint">Interest calculations require balance and rate data</p>
            </div>
          )}
        </div>
      </div>

      {/* Current Payment Display - Requirements 1.1, 1.2 */}
      <div className="insights-section">
        <div className="insights-payment-display">
          <div className="payment-header">
            <span className="payment-title">Current Payment</span>
            {!isEditingPayment && (
              <button 
                className="payment-edit-button"
                onClick={handleStartEdit}
                disabled={loading}
                title="Edit payment amount"
              >
                ✏️ Edit
              </button>
            )}
          </div>
          
          {isEditingPayment ? (
            <div className="payment-edit-form">
              <div className="payment-input-group">
                <label>Payment Amount *</label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  disabled={saving}
                  className={validationError ? 'input-error' : ''}
                />
              </div>
              <div className="payment-input-group">
                <label>Effective Date *</label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  max={getTodayLocalDate()}
                  disabled={saving}
                />
              </div>
              {validationError && (
                <div className="payment-validation-error">{validationError}</div>
              )}
              <div className="payment-edit-actions">
                <button
                  className="payment-save-button"
                  onClick={handleSavePayment}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  className="payment-cancel-button"
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="payment-values">
              <div className="payment-current">
                <span className="payment-label">Your Payment</span>
                <span className="payment-amount">
                  {formatCurrency(currentPayment || 0)}
                  {!dataStatus?.hasPaymentData && (
                    <span className="payment-default-badge">Default</span>
                  )}
                </span>
              </div>
              <div className="payment-minimum">
                <span className="payment-label">Minimum Payment</span>
                <span className="payment-amount minimum">{formatCurrency(minimumPayment || 0)}</span>
              </div>
              {currentPayment && minimumPayment && currentPayment > minimumPayment && (
                <div className="payment-extra-indicator positive">
                  <span>+{formatCurrency(currentPayment - minimumPayment)}</span>
                  <span className="extra-label">above minimum</span>
                </div>
              )}
              {currentPayment && minimumPayment && currentPayment < minimumPayment && (
                <div className="payment-extra-indicator negative">
                  <span>-{formatCurrency(minimumPayment - currentPayment)}</span>
                  <span className="extra-label">below minimum</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Current Balance Display */}
      <div className="insights-section">
        <div className="insights-balance-display">
          <span className="balance-label">Current Balance</span>
          <span className="balance-value">{formatCurrency(balance || 0)}</span>
        </div>
      </div>
    </div>
  );
};

export default CurrentStatusInsights;
