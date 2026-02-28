/**
 * PaymentTrackingHistory Component
 * 
 * Displays payment history with effective dates and allows:
 * - Viewing payment history
 * - Adding new payment entries
 * - Editing existing payment entries
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { useState } from 'react';
import './PaymentTrackingHistory.css';
import { formatCurrency, formatLocalDate, getTodayLocalDate } from '../utils/formatters';

const PaymentTrackingHistory = ({ 
  payments = [], 
  onAddPayment,
  onUpdatePayment,
  onDeletePayment,
  loading = false 
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [formData, setFormData] = useState({
    payment_amount: '',
    effective_date: getTodayLocalDate(),
    notes: ''
  });
  const [validationError, setValidationError] = useState(null);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setFormData({
      payment_amount: '',
      effective_date: getTodayLocalDate(),
      notes: ''
    });
    setValidationError(null);
  };

  const handleShowAddForm = () => {
    setShowAddForm(true);
    setEditingPaymentId(null);
    resetForm();
  };

  const handleCancelAdd = () => {
    setShowAddForm(false);
    resetForm();
  };

  const handleStartEdit = (payment) => {
    setEditingPaymentId(payment.id);
    setShowAddForm(false);
    setFormData({
      payment_amount: payment.payment_amount.toString(),
      effective_date: payment.effective_date,
      notes: payment.notes || ''
    });
    setValidationError(null);
  };

  const handleCancelEdit = () => {
    setEditingPaymentId(null);
    resetForm();
  };

  const validateForm = () => {
    const amount = parseFloat(formData.payment_amount);
    
    if (!formData.payment_amount || isNaN(amount) || amount <= 0) {
      setValidationError('Payment amount must be a positive number');
      return false;
    }

    if (!formData.effective_date) {
      setValidationError('Effective date is required');
      return false;
    }

    // Check if date is in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(formData.effective_date);
    if (selectedDate > today) {
      setValidationError('Effective date cannot be in the future');
      return false;
    }

    return true;
  };

  const handleAddPayment = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setValidationError(null);

    try {
      await onAddPayment({
        payment_amount: parseFloat(formData.payment_amount),
        effective_date: formData.effective_date,
        notes: formData.notes.trim() || null
      });
      setShowAddForm(false);
      resetForm();
    } catch (error) {
      setValidationError(error.message || 'Failed to add payment');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePayment = async (paymentId) => {
    if (!validateForm()) return;

    setSaving(true);
    setValidationError(null);

    try {
      await onUpdatePayment(paymentId, {
        payment_amount: parseFloat(formData.payment_amount),
        effective_date: formData.effective_date,
        notes: formData.notes.trim() || null
      });
      setEditingPaymentId(null);
      resetForm();
    } catch (error) {
      setValidationError(error.message || 'Failed to update payment');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm('Are you sure you want to delete this payment entry?')) {
      return;
    }

    try {
      await onDeletePayment(paymentId);
    } catch (error) {
      setValidationError(error.message || 'Failed to delete payment');
    }
  };

  // Sort payments by effective_date descending (most recent first)
  const sortedPayments = [...payments].sort((a, b) => 
    new Date(b.effective_date) - new Date(a.effective_date)
  );

  return (
    <div className="payment-tracking-history">
      <div className="payment-history-header">
        <h4>Payment Amount History</h4>
        <button
          className="payment-add-button"
          onClick={handleShowAddForm}
          disabled={loading || showAddForm}
        >
          + Add Payment Amount Change
        </button>
      </div>

      {/* Add Payment Form */}
      {showAddForm && (
        <div className="payment-form-container">
          <h5>Add Payment Entry</h5>
          <div className="payment-form-grid">
            <div className="payment-form-group">
              <label>Payment Amount *</label>
              <input
                type="number"
                value={formData.payment_amount}
                onChange={(e) => setFormData({ ...formData, payment_amount: e.target.value })}
                placeholder="0.00"
                step="0.01"
                min="0"
                disabled={saving}
                className={validationError?.includes('amount') ? 'input-error' : ''}
              />
            </div>
            <div className="payment-form-group">
              <label>Effective Date *</label>
              <input
                type="date"
                value={formData.effective_date}
                onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })}
                max={getTodayLocalDate()}
                disabled={saving}
                className={validationError?.includes('date') ? 'input-error' : ''}
              />
            </div>
            <div className="payment-form-group full-width">
              <label>Notes (optional)</label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="e.g., Rate renewal, payment increase"
                disabled={saving}
              />
            </div>
          </div>
          {validationError && (
            <div className="payment-form-error">{validationError}</div>
          )}
          <div className="payment-form-actions">
            <button
              className="payment-form-submit"
              onClick={handleAddPayment}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Add Entry'}
            </button>
            <button
              className="payment-form-cancel"
              onClick={handleCancelAdd}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Payment History List - Requirement 1.4 */}
      {loading && payments.length === 0 ? (
        <div className="payment-history-loading">Loading payment history...</div>
      ) : payments.length === 0 ? (
        <div className="payment-history-empty">
          <span className="empty-icon">📝</span>
          <p>No payment amount changes recorded yet</p>
          <p className="empty-hint">Track when your recurring mortgage payment amount changes (e.g., after a rate renewal)</p>
        </div>
      ) : (
        <div className="payment-history-list">
          {sortedPayments.map((payment, index) => {
            const isEditing = editingPaymentId === payment.id;
            const previousPayment = sortedPayments[index + 1];
            const paymentChange = previousPayment 
              ? payment.payment_amount - previousPayment.payment_amount 
              : null;

            return (
              <div key={payment.id} className={`payment-history-item ${isEditing ? 'editing' : ''}`}>
                {isEditing ? (
                  <div className="payment-edit-inline">
                    <div className="payment-form-grid">
                      <div className="payment-form-group">
                        <label>Payment Amount *</label>
                        <input
                          type="number"
                          value={formData.payment_amount}
                          onChange={(e) => setFormData({ ...formData, payment_amount: e.target.value })}
                          step="0.01"
                          min="0"
                          disabled={saving}
                          className={validationError?.includes('amount') ? 'input-error' : ''}
                        />
                      </div>
                      <div className="payment-form-group">
                        <label>Effective Date *</label>
                        <input
                          type="date"
                          value={formData.effective_date}
                          onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })}
                          max={getTodayLocalDate()}
                          disabled={saving}
                        />
                      </div>
                      <div className="payment-form-group full-width">
                        <label>Notes</label>
                        <input
                          type="text"
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          disabled={saving}
                        />
                      </div>
                    </div>
                    {validationError && (
                      <div className="payment-form-error">{validationError}</div>
                    )}
                    <div className="payment-edit-actions">
                      <button
                        className="payment-save-btn"
                        onClick={() => handleUpdatePayment(payment.id)}
                        disabled={saving}
                      >
                        {saving ? 'Saving...' : '✓ Save'}
                      </button>
                      <button
                        className="payment-cancel-btn"
                        onClick={handleCancelEdit}
                        disabled={saving}
                      >
                        ✕ Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="payment-item-main">
                      <div className="payment-item-amount">
                        <span className="amount-value">${formatCurrency(payment.payment_amount)}</span>
                        {paymentChange !== null && paymentChange !== 0 && (
                          <span className={`amount-change ${paymentChange > 0 ? 'increase' : 'decrease'}`}>
                            {paymentChange > 0 ? '↑' : '↓'} ${formatCurrency(Math.abs(paymentChange))}
                          </span>
                        )}
                        {index === 0 && (
                          <span className="current-badge">Current</span>
                        )}
                      </div>
                      <div className="payment-item-date">
                        <span className="date-label">Effective:</span>
                        <span className="date-value">{formatLocalDate(payment.effective_date)}</span>
                      </div>
                    </div>
                    {payment.notes && (
                      <div className="payment-item-notes">
                        <span className="notes-icon">📝</span>
                        <span className="notes-text">{payment.notes}</span>
                      </div>
                    )}
                    <div className="payment-item-actions">
                      <button
                        className="payment-edit-btn"
                        onClick={() => handleStartEdit(payment)}
                        disabled={loading}
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button
                        className="payment-delete-btn"
                        onClick={() => handleDeletePayment(payment.id)}
                        disabled={loading}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* History Summary */}
      {payments.length > 0 && (
        <div className="payment-history-summary">
          <span className="summary-text">
            {payments.length} payment {payments.length === 1 ? 'entry' : 'entries'} recorded
          </span>
        </div>
      )}
    </div>
  );
};

export default PaymentTrackingHistory;
