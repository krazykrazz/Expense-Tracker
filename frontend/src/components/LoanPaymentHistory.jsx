import { useState } from 'react';
import { formatCurrency, formatDate } from '../utils/formatters';
import { createLogger } from '../utils/logger';
import './LoanPaymentHistory.css';

const logger = createLogger('LoanPaymentHistory');

/**
 * LoanPaymentHistory Component
 * 
 * Displays payment history for loans and mortgages in reverse chronological order.
 * Shows payment date, amount, and running balance after each payment.
 * Includes edit and delete buttons for each payment entry.
 * 
 * Requirements: 1.2, 6.2
 */
const LoanPaymentHistory = ({
  payments = [],
  initialBalance = 0,
  loading = false,
  onEdit = () => {},
  onDelete = () => {},
  disabled = false
}) => {
  const [deletingId, setDeletingId] = useState(null);

  /**
   * Calculate running balance for each payment
   * Payments are expected in reverse chronological order (newest first)
   * Running balance = initial_balance - cumulative sum of payments up to that point
   * 
   * Property 14: Running Balance in Payment History
   * Validates: Requirements 6.2
   */
  const calculateRunningBalances = () => {
    if (!payments || payments.length === 0) {
      return [];
    }

    // Reverse to chronological order for calculation
    const chronological = [...payments].reverse();
    
    let cumulativePayments = 0;
    const withBalances = chronological.map(payment => {
      cumulativePayments += payment.amount;
      const runningBalance = Math.max(0, initialBalance - cumulativePayments);
      return {
        ...payment,
        runningBalance
      };
    });

    // Return in reverse chronological order (newest first) for display
    return withBalances.reverse();
  };

  const paymentsWithBalances = calculateRunningBalances();

  // Handle delete with confirmation
  const handleDelete = async (paymentId) => {
    if (disabled || deletingId) return;

    const confirmed = window.confirm(
      'Are you sure you want to delete this payment? This will recalculate the loan balance.'
    );

    if (!confirmed) return;

    setDeletingId(paymentId);
    try {
      await onDelete(paymentId);
    } catch (err) {
      logger.error('Failed to delete payment:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // Handle edit
  const handleEdit = (payment) => {
    if (disabled) return;
    onEdit(payment);
  };

  // Calculate totals
  const totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const currentBalance = Math.max(0, initialBalance - totalPayments);

  if (loading && payments.length === 0) {
    return (
      <div className="loan-payment-history-container">
        <div className="loan-payment-history-loading">
          Loading payment history...
        </div>
      </div>
    );
  }

  return (
    <div className="loan-payment-history-container">
      <div className="loan-payment-history-header">
        <h3>Payment History</h3>
        <div className="loan-payment-history-summary">
          <span className="summary-item">
            <span className="summary-label">Total Payments:</span>
            <span className="summary-value positive">{formatCurrency(totalPayments)}</span>
          </span>
          <span className="summary-item">
            <span className="summary-label">Current Balance:</span>
            <span className="summary-value">{formatCurrency(currentBalance)}</span>
          </span>
        </div>
      </div>

      {payments.length === 0 ? (
        <div className="loan-payment-history-empty">
          <p>No payments recorded yet.</p>
          <p className="empty-hint">Use the form above to log your first payment.</p>
        </div>
      ) : (
        <div className="loan-payment-history-table-container">
          <table className="loan-payment-history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="amount-col">Amount</th>
                <th className="balance-col">Balance After</th>
                <th className="notes-col">Notes</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paymentsWithBalances.map((payment) => {
                const isDeleting = deletingId === payment.id;
                
                return (
                  <tr 
                    key={payment.id} 
                    className={isDeleting ? 'deleting' : ''}
                  >
                    <td className="date-cell">
                      {formatDate(payment.payment_date)}
                    </td>
                    <td className="amount-cell">
                      <span className="payment-amount">
                        -{formatCurrency(payment.amount)}
                      </span>
                    </td>
                    <td className="balance-cell">
                      <span className="running-balance">
                        {formatCurrency(payment.runningBalance)}
                      </span>
                    </td>
                    <td className="notes-cell">
                      {payment.notes ? (
                        <span className="payment-notes" title={payment.notes}>
                          {payment.notes}
                        </span>
                      ) : (
                        <span className="no-notes">—</span>
                      )}
                    </td>
                    <td className="actions-cell">
                      <div className="payment-actions">
                        <button
                          className="payment-edit-btn"
                          onClick={() => handleEdit(payment)}
                          disabled={disabled || isDeleting}
                          title="Edit payment"
                          aria-label={`Edit payment from ${formatDate(payment.payment_date)}`}
                        >
                          ✏️
                        </button>
                        <button
                          className="payment-delete-btn"
                          onClick={() => handleDelete(payment.id)}
                          disabled={disabled || isDeleting}
                          title="Delete payment"
                          aria-label={`Delete payment from ${formatDate(payment.payment_date)}`}
                        >
                          {isDeleting ? '...' : '🗑️'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {payments.length > 0 && (
        <div className="loan-payment-history-footer">
          <span className="payment-count">
            {payments.length} payment{payments.length !== 1 ? 's' : ''} recorded
          </span>
        </div>
      )}
    </div>
  );
};

export default LoanPaymentHistory;
