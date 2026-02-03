import { useState } from 'react';
import './BillingCycleHistoryList.css';

/**
 * BillingCycleHistoryList Component
 * 
 * Displays billing cycle history with discrepancy indicators.
 * Features:
 * - Display cycle dates, actual balance, calculated balance, discrepancy
 * - Discrepancy indicator (orange for higher, blue for lower, green for match)
 * - Edit and delete actions with confirmation
 * - Empty state handling
 * 
 * Requirements: 5.2, 5.3, 5.4
 */
const BillingCycleHistoryList = ({
  cycles = [],
  onEdit = () => {},
  onDelete = () => {},
  formatCurrency = (value) => new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD'
  }).format(value || 0),
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

  // Get discrepancy type class
  const getDiscrepancyClass = (discrepancy) => {
    if (!discrepancy) return '';
    if (discrepancy.type === 'higher') return 'discrepancy-higher';
    if (discrepancy.type === 'lower') return 'discrepancy-lower';
    return 'discrepancy-match';
  };

  // Get discrepancy indicator icon
  const getDiscrepancyIcon = (discrepancy) => {
    if (!discrepancy) return '';
    if (discrepancy.type === 'higher') return '↑';
    if (discrepancy.type === 'lower') return '↓';
    return '✓';
  };

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
      <div className="billing-cycle-list-container">
        <div className="billing-cycle-list-loading">
          Loading billing cycle history...
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="billing-cycle-list-container">
        <div className="billing-cycle-list-error">
          {error}
        </div>
      </div>
    );
  }

  // Empty state
  if (!cycles || cycles.length === 0) {
    return (
      <div className="billing-cycle-list-container">
        <div className="billing-cycle-list-empty">
          <span className="empty-icon">📋</span>
          <p className="empty-title">No billing cycle history</p>
          <p className="empty-description">
            Enter your first statement balance to start tracking billing cycles.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="billing-cycle-list-container">
      <div className="billing-cycle-list">
        {cycles.map((cycle) => (
          <div key={cycle.id} className="billing-cycle-item">
            {/* Cycle Period */}
            <div className="cycle-period">
              <span className="cycle-dates">
                {formatDate(cycle.cycle_start_date)} - {formatDate(cycle.cycle_end_date)}
              </span>
            </div>

            {/* Balance Info */}
            <div className="cycle-balances">
              <div className="balance-row actual">
                <span className="balance-label">Actual:</span>
                <span className="balance-value">{formatCurrency(cycle.actual_statement_balance)}</span>
              </div>
              <div className="balance-row calculated">
                <span className="balance-label">Calculated:</span>
                <span className="balance-value">{formatCurrency(cycle.calculated_statement_balance)}</span>
              </div>
            </div>

            {/* Discrepancy Indicator */}
            {cycle.discrepancy && (
              <div className={`cycle-discrepancy ${getDiscrepancyClass(cycle.discrepancy)}`}>
                <span className="discrepancy-icon">{getDiscrepancyIcon(cycle.discrepancy)}</span>
                <span className="discrepancy-amount">
                  {cycle.discrepancy.amount > 0 ? '+' : ''}{formatCurrency(cycle.discrepancy.amount)}
                </span>
              </div>
            )}

            {/* Optional Fields */}
            {(cycle.minimum_payment || cycle.due_date) && (
              <div className="cycle-details">
                {cycle.minimum_payment && (
                  <span className="detail-item">
                    Min: {formatCurrency(cycle.minimum_payment)}
                  </span>
                )}
                {cycle.due_date && (
                  <span className="detail-item">
                    Due: {formatDate(cycle.due_date)}
                  </span>
                )}
              </div>
            )}

            {/* Notes */}
            {cycle.notes && (
              <div className="cycle-notes">
                {cycle.notes}
              </div>
            )}

            {/* Actions */}
            <div className="cycle-actions">
              <button
                className="cycle-action-btn edit"
                onClick={() => onEdit(cycle)}
                title="Edit billing cycle"
                aria-label={`Edit billing cycle for ${formatDate(cycle.cycle_end_date)}`}
              >
                ✏️
              </button>
              <button
                className="cycle-action-btn delete"
                onClick={() => handleDeleteClick(cycle)}
                title="Delete billing cycle"
                aria-label={`Delete billing cycle for ${formatDate(cycle.cycle_end_date)}`}
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="billing-cycle-confirm-overlay">
          <div className="billing-cycle-confirm-dialog">
            <h3>Delete Billing Cycle</h3>
            <p>
              Are you sure you want to delete the billing cycle record for{' '}
              <strong>{formatDate(deleteConfirm.cycle_end_date)}</strong>?
            </p>
            <p className="confirm-detail">
              Actual Balance: {formatCurrency(deleteConfirm.actual_statement_balance)}
            </p>
            <p className="confirm-warning">This action cannot be undone.</p>
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

export default BillingCycleHistoryList;
