import { useState } from 'react';
import { formatCAD } from '../utils/formatters';
import { calculateDiscrepancy } from '../utils/discrepancyUtils';
import './UnifiedBillingCycleList.css';

/**
 * UnifiedBillingCycleList Component
 * 
 * Displays unified billing cycles with:
 * - Cycle dates
 * - Effective balance with balance type indicator (Actual/Calculated)
 * - Transaction count
 * - Discrepancy between actual and calculated balance (always shown for actual cycles)
 * - Conditional action buttons based on actual_statement_balance
 * 
 * Requirements: 4.3, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5
 */
const UnifiedBillingCycleList = ({
  cycles = [],
  onEnterStatement = () => {},
  onEdit = () => {},
  onDelete = () => {},
  onViewPdf = () => {},
  formatCurrency = (value) => formatCAD(value || 0),
  formatDate = (dateString) => {
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
  },
  loading = false,
  error = null
}) => {
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Handle delete click
  const handleDeleteClick = (cycle) => {
    setDeleteConfirm(cycle);
  };

  // Confirm delete
  const confirmDelete = () => {
    if (deleteConfirm) {
      onDelete(deleteConfirm);
      setDeleteConfirm(null);
    }
  };

  // Cancel delete
  const cancelDelete = () => {
    setDeleteConfirm(null);
  };

  // Loading state
  if (loading) {
    return (
      <div className="unified-billing-cycle-list-container">
        <div className="unified-billing-cycle-list-loading">
          Loading billing cycles...
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="unified-billing-cycle-list-container">
        <div className="unified-billing-cycle-list-error">
          {error}
        </div>
      </div>
    );
  }

  // Empty state
  if (!cycles || cycles.length === 0) {
    return (
      <div className="unified-billing-cycle-list-container">
        <div className="unified-billing-cycle-list-empty">
          <span className="empty-icon">📋</span>
          <p className="empty-title">No billing cycles</p>
          <p className="empty-description">
            Billing cycles will appear here once you have expenses tracked for this credit card.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="unified-billing-cycle-list-container">
      <div className="unified-billing-cycle-list">
        {cycles.map((cycle) => (
          <div key={cycle.id} className="unified-billing-cycle-item">
            {/* Main row with data and actions inline */}
            <div className="unified-cycle-main-row">
              {/* Data section */}
              <div className="unified-cycle-data">
                {/* Cycle Period */}
                <div className="unified-cycle-period">
                  <span className="unified-cycle-dates">
                    {formatDate(cycle.cycle_start_date)} - {formatDate(cycle.cycle_end_date)}
                  </span>
                  {cycle.statement_pdf_path && (
                    <button
                      className="unified-cycle-pdf-btn"
                      onClick={() => onViewPdf(cycle)}
                      title="View statement PDF"
                      aria-label={`View PDF for ${formatDate(cycle.cycle_end_date)}`}
                    >
                      📄
                    </button>
                  )}
                </div>

                {/* Effective Balance with Type Indicator */}
                <div className="unified-cycle-balance">
                  <div className="unified-balance-row">
                    <span className="unified-balance-value">
                      {formatCurrency(cycle.effective_balance)}
                    </span>
                    <span className={`unified-balance-type ${cycle.balance_type}`}>
                      {cycle.balance_type === 'actual' ? 'Actual' : 'Calculated'}
                    </span>
                  </div>
                </div>

                {/* Transaction Count */}
                <div className="unified-cycle-transactions">
                  <span className="unified-transaction-count">
                    {cycle.transaction_count} {cycle.transaction_count === 1 ? 'transaction' : 'transactions'}
                  </span>
                </div>

                {/* Discrepancy - always shown for actual balance cycles */}
                {cycle.actual_statement_balance > 0 && (() => {
                  const discrepancy = calculateDiscrepancy(cycle.actual_statement_balance, cycle.calculated_statement_balance);
                  return (
                    <div className={`unified-cycle-discrepancy discrepancy-${discrepancy.type}`}>
                      <span className="discrepancy-icon">
                        {discrepancy.type === 'higher' ? '↑' : discrepancy.type === 'lower' ? '↓' : '✓'}
                      </span>
                      <span className="discrepancy-amount">
                        {discrepancy.type === 'match'
                          ? 'Match'
                          : `${discrepancy.amount > 0 ? '+' : ''}${formatCurrency(discrepancy.amount)}`}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Actions - Inline with data */}
              <div className="unified-cycle-actions">
                <button
                  className="financial-action-btn-secondary"
                  onClick={() => cycle.balance_type === 'actual' ? onEdit(cycle) : onEnterStatement(cycle)}
                  title={cycle.balance_type === 'actual' ? "Edit billing cycle" : "Enter statement balance"}
                  aria-label={cycle.balance_type === 'actual'
                    ? `Edit billing cycle for ${formatDate(cycle.cycle_end_date)}`
                    : `Enter statement for ${formatDate(cycle.cycle_end_date)}`}
                >
                  {cycle.balance_type === 'actual' ? 'Edit' : 'Enter Statement'}
                </button>
                <button
                  className="financial-action-btn-danger"
                  onClick={() => handleDeleteClick(cycle)}
                  title={cycle.balance_type === 'actual' ? "Delete billing cycle" : "Delete auto-generated cycle (will regenerate)"}
                  aria-label={cycle.balance_type === 'actual'
                    ? `Delete billing cycle for ${formatDate(cycle.cycle_end_date)}`
                    : `Delete auto-generated cycle for ${formatDate(cycle.cycle_end_date)}`}
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Optional Fields - Second row */}
            {(cycle.minimum_payment || cycle.due_date) && (
              <div className="unified-cycle-details">
                {cycle.minimum_payment && (
                  <span className="unified-detail-item">
                    Min: {formatCurrency(cycle.minimum_payment)}
                  </span>
                )}
                {cycle.due_date && (
                  <span className="unified-detail-item">
                    Due: {formatDate(cycle.due_date)}
                  </span>
                )}
              </div>
            )}

            {/* Notes - Second row */}
            {cycle.notes && (
              <div className="unified-cycle-notes">
                {cycle.notes}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="unified-billing-cycle-confirm-overlay">
          <div className="unified-billing-cycle-confirm-dialog">
            <h3>Delete Billing Cycle</h3>
            <p>
              Are you sure you want to delete the billing cycle for{' '}
              <strong>{formatDate(deleteConfirm.cycle_end_date)}</strong>?
            </p>
            <p className="confirm-detail">
              {deleteConfirm.balance_type === 'actual' ? (
                <>Actual Balance: {formatCurrency(deleteConfirm.actual_statement_balance)}</>
              ) : (
                <>Calculated Balance: {formatCurrency(deleteConfirm.calculated_statement_balance)}</>
              )}
            </p>
            <p className="confirm-warning">
              {deleteConfirm.balance_type === 'actual' 
                ? 'This action cannot be undone.'
                : 'Auto-generated cycles will be regenerated automatically.'}
            </p>
            <div className="confirm-actions">
              <button className="confirm-delete-btn" onClick={confirmDelete}>
                Delete
              </button>
              <button className="confirm-cancel-btn" onClick={cancelDelete}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedBillingCycleList;
