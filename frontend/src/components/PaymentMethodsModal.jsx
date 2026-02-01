import { useState, useEffect, useCallback } from 'react';
import './PaymentMethodsModal.css';
import { getPaymentMethods, deletePaymentMethod, setPaymentMethodActive } from '../services/paymentMethodApi';
import { createLogger } from '../utils/logger';
import PaymentMethodForm from './PaymentMethodForm';
import CreditCardDetailView from './CreditCardDetailView';

const logger = createLogger('PaymentMethodsModal');

// Payment method type labels for display
const TYPE_LABELS = {
  cash: 'Cash',
  cheque: 'Cheque',
  debit: 'Debit',
  credit_card: 'Credit Cards'
};

// Type order for grouping
const TYPE_ORDER = ['cash', 'cheque', 'debit', 'credit_card'];

// Utilization thresholds
const UTILIZATION_WARNING_THRESHOLD = 30;
const UTILIZATION_DANGER_THRESHOLD = 70;

const PaymentMethodsModal = ({ isOpen, onClose, onUpdate }) => {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'inactive'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMethod, setEditingMethod] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState(null);
  const [selectedCreditCard, setSelectedCreditCard] = useState(null);

  // Fetch payment methods when modal opens
  const fetchPaymentMethods = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getPaymentMethods();
      setPaymentMethods(data || []);
    } catch (err) {
      const errorMessage = err.message || 'Unable to load payment methods. Please try again.';
      setError(errorMessage);
      logger.error('Error fetching payment methods:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchPaymentMethods();
    }
  }, [isOpen, fetchPaymentMethods]);

  // Filter payment methods by active/inactive status
  const activePaymentMethods = paymentMethods.filter(m => m.is_active);
  const inactivePaymentMethods = paymentMethods.filter(m => !m.is_active);

  // Group payment methods by type (for the currently displayed tab)
  const displayedMethods = activeTab === 'active' ? activePaymentMethods : inactivePaymentMethods;
  const groupedMethods = TYPE_ORDER.reduce((acc, type) => {
    const methods = displayedMethods.filter(m => m.type === type);
    if (methods.length > 0) {
      acc[type] = methods;
    }
    return acc;
  }, {});

  // Handle add new payment method
  const handleAddNew = () => {
    setEditingMethod(null);
    setShowAddForm(true);
  };

  // Handle edit payment method
  const handleEdit = (method) => {
    setEditingMethod(method);
    setShowAddForm(true);
  };

  // Handle form save (create or update)
  const handleFormSave = async () => {
    setShowAddForm(false);
    setEditingMethod(null);
    await fetchPaymentMethods();
    if (onUpdate) {
      onUpdate();
    }
  };

  // Handle form cancel
  const handleFormCancel = () => {
    setShowAddForm(false);
    setEditingMethod(null);
  };

  // Handle toggle active status
  const handleToggleActive = async (method) => {
    // Check if this is the last active payment method
    const activeCount = paymentMethods.filter(m => m.is_active).length;
    if (method.is_active && activeCount <= 1) {
      setError('Cannot deactivate the last active payment method. At least one must remain active.');
      return;
    }

    // If deactivating, show confirmation dialog
    if (method.is_active) {
      setDeactivateConfirm(method);
      return;
    }

    // If activating, proceed directly (no confirmation needed)
    await performToggleActive(method);
  };

  // Perform the actual toggle active operation
  const performToggleActive = async (method) => {
    setLoading(true);
    setError(null);

    try {
      await setPaymentMethodActive(method.id, !method.is_active);
      await fetchPaymentMethods();
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      const errorMessage = err.message || 'Unable to update payment method status.';
      setError(errorMessage);
      logger.error('Error toggling payment method active status:', err);
    } finally {
      setLoading(false);
    }
  };

  // Confirm deactivation
  const confirmDeactivate = async () => {
    if (!deactivateConfirm) return;
    await performToggleActive(deactivateConfirm);
    setDeactivateConfirm(null);
  };

  // Cancel deactivation
  const cancelDeactivate = () => {
    setDeactivateConfirm(null);
  };

  // Handle delete payment method
  const handleDelete = async (method) => {
    if (method.total_expense_count > 0) {
      setError('Cannot delete payment method with associated expenses. Mark it as inactive instead.');
      return;
    }

    setDeleteConfirm(method);
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (!deleteConfirm) return;

    setLoading(true);
    setError(null);

    try {
      await deletePaymentMethod(deleteConfirm.id);
      setDeleteConfirm(null);
      await fetchPaymentMethods();
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      const errorMessage = err.message || 'Unable to delete payment method.';
      setError(errorMessage);
      logger.error('Error deleting payment method:', err);
    } finally {
      setLoading(false);
    }
  };

  // Cancel delete
  const cancelDelete = () => {
    setDeleteConfirm(null);
  };

  // Handle close modal
  const handleClose = () => {
    setShowAddForm(false);
    setEditingMethod(null);
    setDeleteConfirm(null);
    setDeactivateConfirm(null);
    setSelectedCreditCard(null);
    setError(null);
    setActiveTab('active');
    onClose();
  };

  // Handle opening credit card detail view
  const handleOpenCreditCardDetail = (method) => {
    if (method.type === 'credit_card') {
      setSelectedCreditCard(method.id);
    }
  };

  // Handle closing credit card detail view
  const handleCloseCreditCardDetail = () => {
    setSelectedCreditCard(null);
  };

  // Handle credit card detail update (refresh data)
  const handleCreditCardUpdate = async () => {
    await fetchPaymentMethods();
    if (onUpdate) {
      onUpdate();
    }
  };

  // Get utilization class for credit cards
  const getUtilizationClass = (utilization) => {
    if (utilization >= UTILIZATION_DANGER_THRESHOLD) return 'danger';
    if (utilization >= UTILIZATION_WARNING_THRESHOLD) return 'warning';
    return 'good';
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

  if (!isOpen) {
    return null;
  }

  // Show form if adding or editing
  if (showAddForm) {
    return (
      <PaymentMethodForm
        isOpen={true}
        method={editingMethod}
        onSave={handleFormSave}
        onCancel={handleFormCancel}
      />
    );
  }

  return (
    <div className="payment-methods-modal-overlay" onClick={handleClose}>
      <div className="payment-methods-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="payment-methods-modal-header">
          <h2>Payment Methods</h2>
          <button className="payment-methods-modal-close" onClick={handleClose}>✕</button>
        </div>

        {error && (
          <div className="payment-methods-modal-error">
            <div>{error}</div>
            {paymentMethods.length === 0 && !loading && (
              <button 
                className="payment-methods-error-retry-button" 
                onClick={fetchPaymentMethods}
              >
                Retry
              </button>
            )}
          </div>
        )}

        <div className="payment-methods-modal-content">
          {loading && paymentMethods.length === 0 ? (
            <div className="payment-methods-modal-loading">Loading payment methods...</div>
          ) : (
            <>
              {/* Add New Button */}
              <div className="payment-methods-add-section">
                <button
                  className="payment-methods-add-button"
                  onClick={handleAddNew}
                  disabled={loading}
                >
                  + Add Payment Method
                </button>
              </div>

              {/* Tabbed Interface */}
              <div className="payment-methods-tabs">
                <button
                  className={`payment-methods-tab ${activeTab === 'active' ? 'active' : ''}`}
                  onClick={() => setActiveTab('active')}
                >
                  Active ({activePaymentMethods.length})
                </button>
                <button
                  className={`payment-methods-tab ${activeTab === 'inactive' ? 'active' : ''}`}
                  onClick={() => setActiveTab('inactive')}
                >
                  Inactive ({inactivePaymentMethods.length})
                </button>
              </div>

              {/* Payment Methods List */}
              <div className="payment-methods-list">
                {Object.keys(groupedMethods).length === 0 ? (
                  <div className="payment-methods-empty">
                    {activeTab === 'active' 
                      ? 'No active payment methods. Add one to get started.'
                      : 'No inactive payment methods.'}
                  </div>
                ) : (
                  TYPE_ORDER.map(type => {
                    const methods = groupedMethods[type];
                    if (!methods || methods.length === 0) return null;

                    return (
                      <div key={type} className="payment-methods-group">
                        <h3 className="payment-methods-group-title">{TYPE_LABELS[type]}</h3>
                        {methods.map(method => (
                          <div 
                            key={method.id} 
                            className={`payment-method-item ${!method.is_active ? 'inactive' : ''}`}
                          >
                            <div className="payment-method-info">
                              <div className="payment-method-name">
                                {method.display_name}
                              </div>
                              {method.full_name && method.full_name !== method.display_name && (
                                <div className="payment-method-full-name">{method.full_name}</div>
                              )}
                              <div className="payment-method-expense-count">
                                {method.expense_count || 0} expense{(method.expense_count || 0) !== 1 ? 's' : ''} this period
                              </div>
                            </div>

                            {/* Credit Card specific info */}
                            {method.type === 'credit_card' && (
                              <div 
                                className="payment-method-credit-info clickable"
                                onClick={() => handleOpenCreditCardDetail(method)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleOpenCreditCardDetail(method);
                                  }
                                }}
                              >
                                <div className="credit-balance">
                                  Balance: {formatCurrency(method.current_balance)}
                                </div>
                                {method.credit_limit > 0 && (
                                  <div className={`credit-utilization ${getUtilizationClass(method.utilization_percentage || 0)}`}>
                                    <div className="utilization-bar">
                                      <div 
                                        className="utilization-fill"
                                        style={{ width: `${Math.min(method.utilization_percentage || 0, 100)}%` }}
                                      />
                                    </div>
                                    <span className="utilization-text">
                                      {(method.utilization_percentage || 0).toFixed(1)}% of {formatCurrency(method.credit_limit)}
                                    </span>
                                  </div>
                                )}
                                {method.days_until_due !== null && method.days_until_due !== undefined && (
                                  <div className={`credit-due-date ${method.days_until_due <= 7 ? 'due-soon' : ''}`}>
                                    {method.days_until_due <= 0 
                                      ? '⚠️ Payment overdue!'
                                      : method.days_until_due <= 7
                                        ? `⚠️ Due in ${method.days_until_due} day${method.days_until_due !== 1 ? 's' : ''}`
                                        : `Due in ${method.days_until_due} days`
                                    }
                                  </div>
                                )}
                                <div className="credit-view-details">View Details →</div>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="payment-method-actions">
                              <button
                                className="payment-method-edit-btn"
                                onClick={() => handleEdit(method)}
                                disabled={loading}
                                title="Edit"
                              >
                                ✏️
                              </button>
                              {method.is_active ? (
                                <button
                                  className="payment-method-deactivate-btn"
                                  onClick={() => handleToggleActive(method)}
                                  disabled={loading}
                                  title="Deactivate this payment method"
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  className="payment-method-activate-btn"
                                  onClick={() => handleToggleActive(method)}
                                  disabled={loading}
                                  title="Activate this payment method"
                                >
                                  Activate
                                </button>
                              )}
                              {(method.total_expense_count || 0) === 0 && (
                                <button
                                  className="payment-method-delete-btn"
                                  onClick={() => handleDelete(method)}
                                  disabled={loading}
                                  title="Delete"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        {deleteConfirm && (
          <div className="payment-methods-confirm-overlay">
            <div className="payment-methods-confirm-dialog">
              <h3>Delete Payment Method</h3>
              <p>Are you sure you want to delete "{deleteConfirm.display_name}"?</p>
              <p className="confirm-warning">This action cannot be undone.</p>
              <div className="confirm-actions">
                <button 
                  className="confirm-delete-btn"
                  onClick={confirmDelete}
                  disabled={loading}
                >
                  {loading ? 'Deleting...' : 'Delete'}
                </button>
                <button 
                  className="confirm-cancel-btn"
                  onClick={cancelDelete}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Deactivate Confirmation Dialog */}
        {deactivateConfirm && (
          <div className="payment-methods-confirm-overlay">
            <div className="payment-methods-confirm-dialog">
              <h3>Deactivate Payment Method</h3>
              <p>Are you sure you want to deactivate "{deactivateConfirm.display_name}"?</p>
              <p className="confirm-info">Deactivated payment methods won't appear in expense form dropdowns, but existing expenses will keep their payment method.</p>
              <div className="confirm-actions">
                <button 
                  className="confirm-deactivate-btn"
                  onClick={confirmDeactivate}
                  disabled={loading}
                >
                  {loading ? 'Deactivating...' : 'Deactivate'}
                </button>
                <button 
                  className="confirm-cancel-btn"
                  onClick={cancelDeactivate}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Credit Card Detail View */}
      <CreditCardDetailView
        paymentMethodId={selectedCreditCard}
        isOpen={selectedCreditCard !== null}
        onClose={handleCloseCreditCardDetail}
        onUpdate={handleCreditCardUpdate}
      />
    </div>
  );
};

export default PaymentMethodsModal;
