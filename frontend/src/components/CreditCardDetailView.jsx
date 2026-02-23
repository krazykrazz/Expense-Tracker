import { useState, useEffect, useCallback, useRef } from 'react';
import { getCreditCardDetail, deletePayment, deleteBillingCycle, getBillingCyclePdfUrl } from '../services/creditCardApi';
import { setPaymentMethodActive } from '../services/paymentMethodApi';
import { formatCAD as formatCurrency } from '../utils/formatters';
import { createLogger } from '../utils/logger';
import CreditCardPaymentForm from './CreditCardPaymentForm';
import BillingCycleHistoryForm from './BillingCycleHistoryForm';
import UnifiedBillingCycleList from './UnifiedBillingCycleList';
import './CreditCardDetailView.css';
import './FinancialOverviewModal.css';

const logger = createLogger('CreditCardDetailView');

// Utilization thresholds
const UTILIZATION_WARNING_THRESHOLD = 30;
const UTILIZATION_DANGER_THRESHOLD = 70;

/**
 * CreditCardDetailView Component
 * 
 * Displays detailed information about a credit card including:
 * - Balance, limit, and utilization
 * - Days until payment due
 * - Payment history list
 * - Billing cycle history with statement balances
 * 
 * Requirements: 3.1, 3.5, 3.8, 3.9, 3.10, 3A.5, 3B.5
 */
const CreditCardDetailView = ({
  paymentMethodId,
  isOpen,
  onClose,
  onUpdate = () => {},
  onEdit = null,
  // Deep-link props
  initialTab = null,
  initialAction = null,
  reminderData = null
}) => {
  // State
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [payments, setPayments] = useState([]);
  const [unifiedBillingCycles, setUnifiedBillingCycles] = useState([]);
  const [statementBalanceInfo, setStatementBalanceInfo] = useState(null);
  const [currentCycleStatus, setCurrentCycleStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab || 'overview');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showBillingCycleForm, setShowBillingCycleForm] = useState(false);
  const [editingBillingCycle, setEditingBillingCycle] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState(false);
  const [pdfViewerCycle, setPdfViewerCycle] = useState(null);
  const [partialErrors, setPartialErrors] = useState([]);

  // Track whether deep-link params have been consumed
  const deepLinkConsumedRef = useRef(false);

  // Format date - handles YYYY-MM-DD strings without timezone shift
  const formatDate = (dateString) => {
    if (!dateString) return '';
    // Parse YYYY-MM-DD format directly to avoid timezone issues
    const parts = dateString.split('-');
    if (parts.length === 3) {
      const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return date.toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
    // Fallback for other date formats
    const date = new Date(dateString);
    return date.toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Get utilization class
  const getUtilizationClass = (utilization) => {
    if (utilization >= UTILIZATION_DANGER_THRESHOLD) return 'danger';
    if (utilization >= UTILIZATION_WARNING_THRESHOLD) return 'warning';
    return 'good';
  };

  // Fetch all data via unified endpoint
  const fetchData = useCallback(async () => {
    if (!paymentMethodId) return;

    setLoading(true);
    setError(null);
    setPartialErrors([]);

    try {
      const data = await getCreditCardDetail(paymentMethodId);

      setPaymentMethod(data.cardDetails);
      setPayments(data.payments || []);
      setStatementBalanceInfo(data.statementBalanceInfo || null);
      setCurrentCycleStatus(data.currentCycleStatus || null);
      setUnifiedBillingCycles(data.billingCycles || []);

      // Show non-blocking warnings for partial failures
      if (data.errors && data.errors.length > 0) {
        setPartialErrors(data.errors);
      }
    } catch (err) {
      logger.error('Failed to fetch credit card data:', err);
      setError(err.message || 'Failed to load credit card details');
    } finally {
      setLoading(false);
    }
  }, [paymentMethodId]);

  // Fetch data when modal opens
  useEffect(() => {
    if (isOpen && paymentMethodId) {
      // Reset deep-link consumed flag when opening fresh
      deepLinkConsumedRef.current = false;
      // Apply initialTab on open
      if (initialTab) {
        setActiveTab(initialTab);
      } else {
        setActiveTab('overview');
      }
      fetchData();
    }
  }, [isOpen, paymentMethodId, fetchData, initialTab]);

  // Apply deep-link actions after data loads (once per open)
  useEffect(() => {
    if (!isOpen || loading || !paymentMethod || deepLinkConsumedRef.current) return;
    deepLinkConsumedRef.current = true;

    if (initialAction === 'enter-statement') {
      // Open BillingCycleHistoryForm pre-populated with reminderData or currentCycleStatus
      setEditingBillingCycle({
        cycle_start_date: reminderData?.cycleStartDate || currentCycleStatus?.cycleStartDate || null,
        cycle_end_date: reminderData?.cycleEndDate || currentCycleStatus?.cycleEndDate || null,
        calculated_statement_balance: reminderData?.calculatedBalance ?? currentCycleStatus?.calculatedBalance ?? null,
        actual_statement_balance: null
      });
      setShowBillingCycleForm(true);
    } else if (initialAction === 'log-payment') {
      setShowPaymentForm(true);
    }
  }, [isOpen, loading, paymentMethod, initialAction, reminderData, currentCycleStatus]);

  // Handle payment recorded
  const handlePaymentRecorded = async (result) => {
    setShowPaymentForm(false);
    await fetchData();
    onUpdate();
  };

  // Handle billing cycle form submitted
  const handleBillingCycleSubmitted = async (result) => {
    setShowBillingCycleForm(false);
    setEditingBillingCycle(null);
    await fetchData();
    onUpdate();
  };

  // Handle edit billing cycle
  const handleEditBillingCycle = (cycle) => {
    setEditingBillingCycle(cycle);
    setShowBillingCycleForm(true);
  };

  // Handle enter statement for auto-generated cycle
  const handleEnterStatement = (cycle) => {
    // Pass the full cycle object including id so the form can update the existing record
    // The form will detect this is an auto-generated cycle (no actual_statement_balance)
    // and will update it with the user-provided actual balance
    setEditingBillingCycle({
      id: cycle.id,
      cycle_start_date: cycle.cycle_start_date,
      cycle_end_date: cycle.cycle_end_date,
      calculated_statement_balance: cycle.calculated_statement_balance,
      statement_pdf_path: cycle.statement_pdf_path || null,
      // Don't pass actual_statement_balance so the form knows this is a new entry
      actual_statement_balance: null
    });
    setShowBillingCycleForm(true);
  };

  // Handle delete billing cycle
  const handleDeleteBillingCycle = async (cycle) => {
    setDeleteConfirm({ type: 'billingCycle', item: cycle });
  };

  // Handle delete payment
  const handleDeletePayment = async (payment) => {
    setDeleteConfirm({ type: 'payment', item: payment });
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (!deleteConfirm) return;

    try {
      if (deleteConfirm.type === 'payment') {
        await deletePayment(paymentMethodId, deleteConfirm.item.id);
      } else if (deleteConfirm.type === 'billingCycle') {
        await deleteBillingCycle(paymentMethodId, deleteConfirm.item.id);
      }
      setDeleteConfirm(null);
      await fetchData();
      onUpdate();
    } catch (err) {
      logger.error('Failed to delete:', err);
      setError(err.message || 'Failed to delete item');
    }
  };

  // Handle deactivate button click
  const handleDeactivateClick = () => {
    setDeactivateConfirm(true);
  };

  // Confirm deactivation
  const confirmDeactivate = async () => {
    try {
      await setPaymentMethodActive(paymentMethodId, false);
      setDeactivateConfirm(false);
      // Close detail view and refresh parent
      handleClose();
      onUpdate();
    } catch (err) {
      logger.error('Failed to deactivate payment method:', err);
      setError(err.message || 'Failed to deactivate payment method');
      setDeactivateConfirm(false);
    }
  };

  // Handle view billing cycle PDF
  const handleViewBillingCyclePdf = (cycle) => {
    setPdfViewerCycle(cycle);
  };

  // Handle close PDF viewer
  const handleClosePdfViewer = () => {
    setPdfViewerCycle(null);
  };

  // Handle close
  const handleClose = () => {
    setShowPaymentForm(false);
    setShowBillingCycleForm(false);
    setEditingBillingCycle(null);
    setDeleteConfirm(null);
    setDeactivateConfirm(false);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  // Show payment form
  if (showPaymentForm && paymentMethod) {
    return (
      <div className="cc-detail-modal-overlay" onClick={handleClose}>
        <div className="cc-detail-modal-container cc-detail-form-view" onClick={(e) => e.stopPropagation()}>
          <CreditCardPaymentForm
            paymentMethodId={paymentMethodId}
            paymentMethodName={paymentMethod.display_name}
            currentBalance={paymentMethod.current_balance}
            onPaymentRecorded={handlePaymentRecorded}
            onCancel={() => setShowPaymentForm(false)}
          />
        </div>
      </div>
    );
  }

  // Show billing cycle form
  if (showBillingCycleForm && paymentMethod) {
    return (
      <div className="cc-detail-modal-overlay" onClick={handleClose}>
        <div className="cc-detail-modal-container cc-detail-form-view" onClick={(e) => e.stopPropagation()}>
          <BillingCycleHistoryForm
            paymentMethodId={paymentMethodId}
            paymentMethodName={paymentMethod.display_name}
            cycleStartDate={editingBillingCycle?.cycle_start_date || currentCycleStatus?.cycleStartDate}
            cycleEndDate={editingBillingCycle?.cycle_end_date || currentCycleStatus?.cycleEndDate}
            calculatedBalance={editingBillingCycle?.calculated_statement_balance ?? currentCycleStatus?.calculatedBalance}
            editingCycle={editingBillingCycle}
            onSubmit={handleBillingCycleSubmitted}
            onCancel={() => {
              setShowBillingCycleForm(false);
              setEditingBillingCycle(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="cc-detail-modal-overlay" onClick={handleClose}>
      <div className="cc-detail-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="cc-detail-header">
          <div className="cc-detail-title">
            <h2>{paymentMethod?.display_name || 'Credit Card'}</h2>
            {paymentMethod?.full_name && paymentMethod.full_name !== paymentMethod.display_name && (
              <span className="cc-detail-full-name">{paymentMethod.full_name}</span>
            )}
          </div>
          <div className="cc-detail-header-actions">
            <button 
              className="financial-action-btn-secondary cc-header-btn"
              onClick={() => onEdit && onEdit(paymentMethod)}
              disabled={!onEdit}
            >
              Edit
            </button>
            <button 
              className="financial-action-btn-danger cc-header-btn"
              onClick={handleDeactivateClick}
            >
              Deactivate
            </button>
            <button className="cc-detail-close" onClick={handleClose}>✕</button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="cc-detail-error">
            {error}
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* Partial Failure Warning */}
        {partialErrors.length > 0 && (
          <div className="cc-detail-warning" role="alert">
            Some data could not be loaded: {partialErrors.map(e => e.section).join(', ')}
            <button onClick={() => setPartialErrors([])}>✕</button>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="cc-detail-loading">Loading credit card details...</div>
        ) : paymentMethod ? (
          <>
            {/* Overview Section - Balance Types */}
            <div className="cc-detail-overview">
              {/* Current Balance Card - Primary */}
              <div className="cc-overview-card balance-card current-balance-card">
                <div className="overview-label">Current Balance</div>
                <div className="overview-value balance-value">
                  {formatCurrency(paymentMethod.current_balance)}
                </div>
                <div className="balance-description">What you owe today</div>
              </div>

              {/* Statement Balance Card - Only show if billing cycle configured */}
              {paymentMethod.statement_balance !== null && paymentMethod.statement_balance !== undefined && (
                <div className={`cc-overview-card balance-card statement-balance-card ${
                  statementBalanceInfo?.isPaid ? 'statement-paid' : ''
                } ${currentCycleStatus?.hasActualBalance ? 'has-actual-balance' : ''}`}>
                  <div className="overview-label">
                    Statement Balance
                    {statementBalanceInfo?.isPaid && (
                      <span className="paid-badge">✓ Paid</span>
                    )}
                    {currentCycleStatus?.hasActualBalance && !statementBalanceInfo?.isPaid && (
                      <span className="actual-badge" title="User-provided actual balance">Actual</span>
                    )}
                    {!currentCycleStatus?.hasActualBalance && !statementBalanceInfo?.isPaid && (
                      <span className="calculated-badge" title="Calculated from tracked expenses">Calculated</span>
                    )}
                  </div>
                  <div className="overview-value balance-value">
                    {statementBalanceInfo?.isPaid 
                      ? formatCurrency(0) 
                      : currentCycleStatus?.hasActualBalance
                        ? formatCurrency(currentCycleStatus.actualBalance)
                        : formatCurrency(currentCycleStatus?.calculatedBalance ?? statementBalanceInfo?.statementBalance ?? paymentMethod.statement_balance)
                    }
                  </div>
                  <div className="balance-description">
                    {statementBalanceInfo?.isPaid 
                      ? 'Statement paid in full'
                      : currentCycleStatus?.hasActualBalance
                        ? 'From your statement'
                        : paymentMethod.payment_due_day 
                          ? `Due by day ${paymentMethod.payment_due_day}`
                          : 'From previous cycles'
                    }
                  </div>
                  {statementBalanceInfo?.cycleStartDate && statementBalanceInfo?.cycleEndDate && (
                    <div className="statement-cycle-dates">
                      Statement period: {formatDate(statementBalanceInfo.cycleStartDate)} - {formatDate(statementBalanceInfo.cycleEndDate)}
                    </div>
                  )}
                </div>
              )}

              {/* Projected Balance Card - Only show if different from current */}
              {paymentMethod.has_pending_expenses && (
                <div className="cc-overview-card balance-card projected-balance-card">
                  <div className="overview-label">
                    Projected Balance
                    <span className="pending-indicator" title="Includes future expenses">⏳</span>
                  </div>
                  <div className="overview-value balance-value">
                    {formatCurrency(paymentMethod.projected_balance)}
                  </div>
                  <div className="balance-description">Including pending expenses</div>
                </div>
              )}
            </div>

            {/* Utilization & Due Date Section */}
            <div className="cc-detail-secondary">
              {/* Limit & Utilization Card - Uses current balance */}
              {paymentMethod.credit_limit > 0 && (
                <div className="cc-overview-card utilization-card">
                  <div className="overview-label">Credit Limit</div>
                  <div className="overview-value">{formatCurrency(paymentMethod.credit_limit)}</div>
                  <div className={`utilization-indicator ${getUtilizationClass(paymentMethod.utilization_percentage || 0)}`}>
                    <div className="utilization-bar">
                      <div 
                        className="utilization-fill"
                        style={{ width: `${Math.min(paymentMethod.utilization_percentage || 0, 100)}%` }}
                      />
                    </div>
                    <span className="utilization-text">
                      {(paymentMethod.utilization_percentage || 0).toFixed(1)}% utilized
                    </span>
                  </div>
                </div>
              )}

              {/* Due Date Card - Only show urgency if statement is NOT paid */}
              {paymentMethod.days_until_due !== null && paymentMethod.days_until_due !== undefined && (
                <div className={`cc-overview-card due-date-card ${
                  !statementBalanceInfo?.isPaid && paymentMethod.days_until_due <= 7 ? 'due-soon' : ''
                }`}>
                  <div className="overview-label">Payment Due</div>
                  <div className="overview-value due-value">
                    {statementBalanceInfo?.isPaid ? (
                      <span className="paid-status">✓ Paid</span>
                    ) : paymentMethod.days_until_due <= 0 ? (
                      <span className="overdue">Overdue!</span>
                    ) : paymentMethod.days_until_due === 1 ? (
                      'Tomorrow'
                    ) : (
                      `${paymentMethod.days_until_due} days`
                    )}
                  </div>
                  {paymentMethod.payment_due_day && (
                    <div className="due-day-info">Day {paymentMethod.payment_due_day} of each month</div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="cc-detail-actions">
              <button 
                className="cc-action-btn primary"
                onClick={() => setShowPaymentForm(true)}
              >
                💳 Log Payment
              </button>
            </div>

            {/* Historical Balance Adjustment Banner */}
            {/* Tabs */}
            <div className="cc-detail-tabs">
              <button 
                className={`cc-tab ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                Overview
              </button>
              <button 
                className={`cc-tab ${activeTab === 'payments' ? 'active' : ''}`}
                onClick={() => setActiveTab('payments')}
              >
                Payments ({payments.length})
              </button>
              <button 
                className={`cc-tab ${activeTab === 'billing-cycles' ? 'active' : ''}`}
                onClick={() => setActiveTab('billing-cycles')}
              >
                Billing Cycles ({paymentMethod.billing_cycle_day ? unifiedBillingCycles.length : 0})
              </button>
            </div>

            {/* Tab Content */}
            <div className="cc-detail-content">
              {activeTab === 'overview' && (
                <div className="cc-tab-content overview-content">
                  {/* Current Billing Cycle Card */}
                  {paymentMethod.current_cycle && (
                    <div className="cc-info-section billing-cycle-section">
                      <h4>Current Billing Cycle</h4>
                      <div className="billing-cycle-card">
                        <div className="billing-cycle-dates">
                          <span className="cycle-date-label">Period:</span>
                          <span className="cycle-date-value">
                            {formatDate(paymentMethod.current_cycle.start_date)} - {formatDate(paymentMethod.current_cycle.end_date)}
                          </span>
                        </div>
                        <div className="billing-cycle-stats">
                          <div className="cycle-stat">
                            <span className="cycle-stat-value">{paymentMethod.current_cycle.transaction_count}</span>
                            <span className="cycle-stat-label">Transactions</span>
                          </div>
                          <div className="cycle-stat">
                            <span className="cycle-stat-value">{formatCurrency(paymentMethod.current_cycle.total_amount)}</span>
                            <span className="cycle-stat-label">Total Spent</span>
                          </div>
                          {paymentMethod.current_cycle.payment_count > 0 && (
                            <div className="cycle-stat payment-stat">
                              <span className="cycle-stat-value">{formatCurrency(paymentMethod.current_cycle.payment_total)}</span>
                              <span className="cycle-stat-label">Payments ({paymentMethod.current_cycle.payment_count})</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="cc-info-section">
                    <h4>Card Details</h4>
                    <div className="cc-info-grid">
                      <div className="cc-info-item">
                        <span className="info-label">Type</span>
                        <span className="info-value">Credit Card</span>
                      </div>
                      {paymentMethod.billing_cycle_start && paymentMethod.billing_cycle_end && (
                        <div className="cc-info-item">
                          <span className="info-label">Billing Cycle</span>
                          <span className="info-value">
                            Day {paymentMethod.billing_cycle_start} - Day {paymentMethod.billing_cycle_end}
                          </span>
                        </div>
                      )}
                      <div className="cc-info-item">
                        <span className="info-label">Status</span>
                        <span className={`info-value status ${paymentMethod.is_active ? 'active' : 'inactive'}`}>
                          {paymentMethod.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="cc-info-item">
                        <span className="info-label">Expenses</span>
                        <span className="info-value">{paymentMethod.expense_count || 0}</span>
                      </div>
                    </div>
                  </div>

                  {/* Recent Payments Preview */}
                  {payments.length > 0 && (
                    <div className="cc-info-section">
                      <h4>Recent Payments</h4>
                      <div className="cc-recent-list">
                        {payments.slice(0, 3).map(payment => (
                          <div key={payment.id} className="cc-recent-item">
                            <span className="recent-date">{formatDate(payment.payment_date)}</span>
                            <span className="recent-amount">{formatCurrency(payment.amount)}</span>
                          </div>
                        ))}
                        {payments.length > 3 && (
                          <button 
                            className="view-all-link"
                            onClick={() => setActiveTab('payments')}
                          >
                            View all {payments.length} payments →
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'payments' && (
                <div className="cc-tab-content payments-content">
                  {payments.length === 0 ? (
                    <div className="cc-empty-state">
                      <span className="empty-icon">💳</span>
                      <p>No payments recorded yet</p>
                      <button 
                        className="cc-action-btn primary"
                        onClick={() => setShowPaymentForm(true)}
                      >
                        Log First Payment
                      </button>
                    </div>
                  ) : (
                    <div className="cc-payments-list">
                      {payments.map(payment => (
                        <div key={payment.id} className="cc-payment-item">
                          <div className="payment-info">
                            <div className="payment-date">{formatDate(payment.payment_date)}</div>
                            {payment.notes && (
                              <div className="payment-notes">{payment.notes}</div>
                            )}
                          </div>
                          <div className="payment-amount">{formatCurrency(payment.amount)}</div>
                          <button 
                            className="payment-delete-btn"
                            onClick={() => handleDeletePayment(payment)}
                            title="Delete payment"
                          >
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'billing-cycles' && (
                <div className="cc-tab-content billing-cycles-content">
                  {/* Unified Billing Cycles Section */}
                  {paymentMethod.billing_cycle_day ? (
                    <div className="billing-cycles-section">
                      <div className="billing-cycles-section-header">
                        <h4>Billing Cycles</h4>
                      </div>
                      <UnifiedBillingCycleList
                        cycles={unifiedBillingCycles}
                        paymentMethodId={paymentMethodId}
                        onEnterStatement={handleEnterStatement}
                        onEdit={handleEditBillingCycle}
                        onDelete={handleDeleteBillingCycle}
                        onViewPdf={handleViewBillingCyclePdf}
                        formatCurrency={formatCurrency}
                        formatDate={formatDate}
                        loading={loading}
                      />
                    </div>
                  ) : (
                    <div className="cc-empty-state">
                      <span className="empty-icon">📊</span>
                      <p>Configure a billing cycle day to track billing cycles</p>
                      <p className="empty-hint">Edit this card's settings to set the billing cycle day</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="cc-detail-error">Credit card not found</div>
        )}

        {/* Delete Confirmation Dialog */}
        {deleteConfirm && (
          <div className="cc-confirm-overlay">
            <div className="cc-confirm-dialog">
              <h3>Delete {deleteConfirm.type === 'payment' ? 'Payment' : 'Billing Cycle'}</h3>
              <p>
                Are you sure you want to delete this {deleteConfirm.type === 'billingCycle' ? 'billing cycle record' : 'payment'}?
                {deleteConfirm.type === 'payment' && (
                  <span className="confirm-detail">
                    {formatCurrency(deleteConfirm.item.amount)} on {formatDate(deleteConfirm.item.payment_date)}
                  </span>
                )}
                {deleteConfirm.type === 'billingCycle' && (
                  <span className="confirm-detail">
                    {formatDate(deleteConfirm.item.cycle_start_date)} - {formatDate(deleteConfirm.item.cycle_end_date)}
                    <br />
                    Actual Balance: {formatCurrency(deleteConfirm.item.actual_statement_balance)}
                  </span>
                )}
              </p>
              <p className="confirm-warning">This action cannot be undone.</p>
              <div className="confirm-actions">
                <button className="confirm-delete-btn" onClick={confirmDelete}>
                  Delete
                </button>
                <button className="confirm-cancel-btn" onClick={() => setDeleteConfirm(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Deactivate Confirmation Dialog */}
        {deactivateConfirm && (
          <div className="cc-confirm-overlay">
            <div className="cc-confirm-dialog">
              <h3>Deactivate Credit Card</h3>
              <p>
                Are you sure you want to deactivate <strong>{paymentMethod?.display_name}</strong>?
              </p>
              <p className="confirm-warning">
                This card will be moved to the Inactive tab. You can reactivate it later if needed.
              </p>
              <div className="confirm-actions">
                <button className="confirm-delete-btn" onClick={confirmDeactivate}>
                  Deactivate
                </button>
                <button className="confirm-cancel-btn" onClick={() => setDeactivateConfirm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PDF Viewer Modal */}
        {pdfViewerCycle && (
          <div className="cc-pdf-viewer-overlay" onClick={handleClosePdfViewer}>
            <div className="cc-pdf-viewer-modal" onClick={(e) => e.stopPropagation()}>
              <div className="cc-pdf-viewer-header">
                <h3>Statement PDF</h3>
                <span className="cc-pdf-viewer-period">
                  {formatDate(pdfViewerCycle.cycle_start_date)} - {formatDate(pdfViewerCycle.cycle_end_date)}
                </span>
                <button className="cc-pdf-viewer-close" onClick={handleClosePdfViewer}>✕</button>
              </div>
              <div className="cc-pdf-viewer-content">
                <iframe
                  src={getBillingCyclePdfUrl(paymentMethodId, pdfViewerCycle.id)}
                  title="Statement PDF"
                  className="cc-pdf-iframe"
                />
              </div>
              <div className="cc-pdf-viewer-actions">
                <a
                  href={getBillingCyclePdfUrl(paymentMethodId, pdfViewerCycle.id)}
                  download
                  className="cc-pdf-download-btn"
                >
                  📥 Download
                </a>
                <button className="cc-pdf-close-btn" onClick={handleClosePdfViewer}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreditCardDetailView;
