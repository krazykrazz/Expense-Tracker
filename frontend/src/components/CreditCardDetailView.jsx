import { useState, useEffect, useCallback } from 'react';
import { getPaymentMethod } from '../services/paymentMethodApi';
import { getPayments, getStatements, deletePayment, deleteStatement, getStatementUrl, getBillingCycles, getStatementBalance, getBillingCycleHistory, deleteBillingCycle, getCurrentCycleStatus } from '../services/creditCardApi';
import { createLogger } from '../utils/logger';
import CreditCardPaymentForm from './CreditCardPaymentForm';
import CreditCardStatementUpload from './CreditCardStatementUpload';
import BillingCycleHistoryForm from './BillingCycleHistoryForm';
import BillingCycleHistoryList from './BillingCycleHistoryList';
import './CreditCardDetailView.css';

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
 * - Statement upload and list
 * 
 * Requirements: 3.1, 3.5, 3.8, 3.9, 3.10, 3A.5, 3B.5
 */
const CreditCardDetailView = ({
  paymentMethodId,
  isOpen,
  onClose,
  onUpdate = () => {}
}) => {
  // State
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [payments, setPayments] = useState([]);
  const [statements, setStatements] = useState([]);
  const [billingCycles, setBillingCycles] = useState([]);
  const [billingCyclesExpanded, setBillingCyclesExpanded] = useState(false);
  const [statementBalanceInfo, setStatementBalanceInfo] = useState(null);
  const [billingCycleHistory, setBillingCycleHistory] = useState([]);
  const [currentCycleStatus, setCurrentCycleStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showStatementUpload, setShowStatementUpload] = useState(false);
  const [showBillingCycleForm, setShowBillingCycleForm] = useState(false);
  const [editingBillingCycle, setEditingBillingCycle] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

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

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!paymentMethodId) return;

    setLoading(true);
    setError(null);

    try {
      const [methodData, paymentsData, statementsData] = await Promise.all([
        getPaymentMethod(paymentMethodId),
        getPayments(paymentMethodId),
        getStatements(paymentMethodId)
      ]);

      setPaymentMethod(methodData);
      setPayments(paymentsData || []);
      setStatements(statementsData || []);
      
      // Fetch billing cycles if billing cycle is configured
      if (methodData && methodData.billing_cycle_start && methodData.billing_cycle_end) {
        try {
          const cyclesData = await getBillingCycles(paymentMethodId, 6);
          setBillingCycles(cyclesData || []);
        } catch (cycleErr) {
          logger.warn('Failed to fetch billing cycles:', cycleErr);
          setBillingCycles([]);
        }
      } else {
        setBillingCycles([]);
      }
      
      // Fetch statement balance info and billing cycle history if billing_cycle_day is configured
      if (methodData && methodData.billing_cycle_day) {
        try {
          const [statementData, historyData, cycleStatusData] = await Promise.all([
            getStatementBalance(paymentMethodId),
            getBillingCycleHistory(paymentMethodId, { limit: 12 }),
            getCurrentCycleStatus(paymentMethodId)
          ]);
          setStatementBalanceInfo(statementData);
          setBillingCycleHistory(historyData.billingCycles || []);
          setCurrentCycleStatus(cycleStatusData);
        } catch (statementErr) {
          logger.warn('Failed to fetch statement balance or billing cycle history:', statementErr);
          setStatementBalanceInfo(null);
          setBillingCycleHistory([]);
          setCurrentCycleStatus(null);
        }
      } else {
        setStatementBalanceInfo(null);
        setBillingCycleHistory([]);
        setCurrentCycleStatus(null);
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
      fetchData();
    }
  }, [isOpen, paymentMethodId, fetchData]);

  // Handle payment recorded
  const handlePaymentRecorded = async (result) => {
    setShowPaymentForm(false);
    await fetchData();
    onUpdate();
  };

  // Handle statement uploaded
  const handleStatementUploaded = async (result) => {
    setShowStatementUpload(false);
    await fetchData();
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

  // Handle delete billing cycle
  const handleDeleteBillingCycle = async (cycle) => {
    setDeleteConfirm({ type: 'billingCycle', item: cycle });
  };

  // Handle delete payment
  const handleDeletePayment = async (payment) => {
    setDeleteConfirm({ type: 'payment', item: payment });
  };

  // Handle delete statement
  const handleDeleteStatement = async (statement) => {
    setDeleteConfirm({ type: 'statement', item: statement });
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (!deleteConfirm) return;

    try {
      if (deleteConfirm.type === 'payment') {
        await deletePayment(paymentMethodId, deleteConfirm.item.id);
      } else if (deleteConfirm.type === 'billingCycle') {
        await deleteBillingCycle(paymentMethodId, deleteConfirm.item.id);
      } else {
        await deleteStatement(paymentMethodId, deleteConfirm.item.id);
      }
      setDeleteConfirm(null);
      await fetchData();
      onUpdate();
    } catch (err) {
      logger.error('Failed to delete:', err);
      setError(err.message || 'Failed to delete item');
    }
  };

  // Handle view statement
  const handleViewStatement = (statement) => {
    const url = getStatementUrl(paymentMethodId, statement.id);
    window.open(url, '_blank');
  };

  // Handle close
  const handleClose = () => {
    setShowPaymentForm(false);
    setShowStatementUpload(false);
    setShowBillingCycleForm(false);
    setEditingBillingCycle(null);
    setDeleteConfirm(null);
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

  // Show statement upload
  if (showStatementUpload && paymentMethod) {
    return (
      <div className="cc-detail-modal-overlay" onClick={handleClose}>
        <div className="cc-detail-modal-container cc-detail-form-view" onClick={(e) => e.stopPropagation()}>
          <CreditCardStatementUpload
            paymentMethodId={paymentMethodId}
            paymentMethodName={paymentMethod.display_name}
            billingCycleStart={paymentMethod.billing_cycle_start}
            billingCycleEnd={paymentMethod.billing_cycle_end}
            paymentDueDay={paymentMethod.payment_due_day}
            onStatementUploaded={handleStatementUploaded}
            onCancel={() => setShowStatementUpload(false)}
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
            cycleStartDate={currentCycleStatus?.cycleStartDate}
            cycleEndDate={currentCycleStatus?.cycleEndDate}
            calculatedBalance={currentCycleStatus?.calculatedBalance}
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
          <button className="cc-detail-close" onClick={handleClose}>✕</button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="cc-detail-error">
            {error}
            <button onClick={() => setError(null)}>✕</button>
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
                        : formatCurrency(statementBalanceInfo?.statementBalance ?? paymentMethod.statement_balance)
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

              {/* Due Date Card */}
              {paymentMethod.days_until_due !== null && paymentMethod.days_until_due !== undefined && (
                <div className={`cc-overview-card due-date-card ${paymentMethod.days_until_due <= 7 ? 'due-soon' : ''}`}>
                  <div className="overview-label">Payment Due</div>
                  <div className="overview-value due-value">
                    {paymentMethod.days_until_due <= 0 ? (
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
              {paymentMethod.billing_cycle_day && (
                <button 
                  className="cc-action-btn secondary"
                  onClick={() => setShowBillingCycleForm(true)}
                >
                  📊 Enter Statement
                </button>
              )}
              <button 
                className="cc-action-btn secondary"
                onClick={() => setShowStatementUpload(true)}
              >
                📄 Upload PDF
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
              {paymentMethod.billing_cycle_day && (
                <button 
                  className={`cc-tab ${activeTab === 'billingHistory' ? 'active' : ''}`}
                  onClick={() => setActiveTab('billingHistory')}
                >
                  Billing ({billingCycleHistory.length})
                </button>
              )}
              <button 
                className={`cc-tab ${activeTab === 'payments' ? 'active' : ''}`}
                onClick={() => setActiveTab('payments')}
              >
                Payments ({payments.length})
              </button>
              <button 
                className={`cc-tab ${activeTab === 'statements' ? 'active' : ''}`}
                onClick={() => setActiveTab('statements')}
              >
                Statements ({statements.length})
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

                  {/* Billing Cycle History Section */}
                  {billingCycles.length > 1 && (
                    <div className="cc-info-section billing-cycle-history-section">
                      <button 
                        className="billing-history-toggle"
                        onClick={() => setBillingCyclesExpanded(!billingCyclesExpanded)}
                      >
                        <h4>Billing Cycle History</h4>
                        <span className={`toggle-icon ${billingCyclesExpanded ? 'expanded' : ''}`}>
                          {billingCyclesExpanded ? '▼' : '▶'}
                        </span>
                      </button>
                      {billingCyclesExpanded && (
                        <div className="billing-cycle-history-list">
                          {billingCycles.filter(cycle => !cycle.is_current).map((cycle, index) => (
                            <div key={`${cycle.start_date}-${index}`} className="billing-cycle-history-item">
                              <div className="cycle-history-dates">
                                {formatDate(cycle.start_date)} - {formatDate(cycle.end_date)}
                              </div>
                              <div className="cycle-history-stats">
                                <span className="cycle-history-stat">
                                  <strong>{cycle.transaction_count}</strong> transactions
                                </span>
                                <span className="cycle-history-stat">
                                  <strong>{formatCurrency(cycle.total_amount)}</strong> spent
                                </span>
                                {cycle.payment_count > 0 && (
                                  <span className="cycle-history-stat payment">
                                    <strong>{formatCurrency(cycle.payment_total)}</strong> paid
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'billingHistory' && paymentMethod.billing_cycle_day && (
                <div className="cc-tab-content billing-history-content">
                  <div className="billing-history-header">
                    <h4>Statement Balance History</h4>
                    <button 
                      className="cc-action-btn primary small"
                      onClick={() => setShowBillingCycleForm(true)}
                    >
                      + Add Entry
                    </button>
                  </div>
                  <BillingCycleHistoryList
                    cycles={billingCycleHistory}
                    onEdit={handleEditBillingCycle}
                    onDelete={handleDeleteBillingCycle}
                    formatCurrency={formatCurrency}
                    formatDate={formatDate}
                  />
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

              {activeTab === 'statements' && (
                <div className="cc-tab-content statements-content">
                  {statements.length === 0 ? (
                    <div className="cc-empty-state">
                      <span className="empty-icon">📄</span>
                      <p>No statements uploaded yet</p>
                      <button 
                        className="cc-action-btn primary"
                        onClick={() => setShowStatementUpload(true)}
                      >
                        Upload First Statement
                      </button>
                    </div>
                  ) : (
                    <div className="cc-statements-list">
                      {statements.map(statement => (
                        <div key={statement.id} className="cc-statement-item">
                          <div className="statement-info">
                            <div className="statement-date">
                              Statement: {formatDate(statement.statementDate)}
                            </div>
                            <div className="statement-period">
                              Period: {formatDate(statement.statementPeriodStart)} - {formatDate(statement.statementPeriodEnd)}
                            </div>
                            <div className="statement-filename">{statement.originalFilename}</div>
                          </div>
                          <div className="statement-actions">
                            <button 
                              className="statement-view-btn"
                              onClick={() => handleViewStatement(statement)}
                              title="View statement"
                            >
                              👁️
                            </button>
                            <button 
                              className="statement-delete-btn"
                              onClick={() => handleDeleteStatement(statement)}
                              title="Delete statement"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
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
              <h3>Delete {deleteConfirm.type === 'payment' ? 'Payment' : deleteConfirm.type === 'billingCycle' ? 'Billing Cycle' : 'Statement'}</h3>
              <p>
                Are you sure you want to delete this {deleteConfirm.type === 'billingCycle' ? 'billing cycle record' : deleteConfirm.type}?
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
      </div>
    </div>
  );
};

export default CreditCardDetailView;
