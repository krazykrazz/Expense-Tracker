import React from 'react';
import { formatCurrency } from '../utils/formatters';
import './LoanRow.css';

/**
 * LoanRow — displays a single loan in the unified Financial Overview.
 * Shows loan name, balance, rate, type badge, conditional indicators, and quick action buttons.
 */
const LoanRow = ({ loan, needsUpdate = false, fixedExpenseCount = 0, onLogPayment, onViewDetails, onEdit, onDelete }) => {
  const {
    id,
    name,
    loan_type,
    currentBalance,
    currentRate,
    payment_tracking_enabled
  } = loan;

  const getTypeBadge = () => {
    switch (loan_type) {
      case 'line_of_credit': return { label: 'LOC', className: 'loc' };
      case 'mortgage': return { label: 'Mortgage', className: 'mortgage' };
      default: return { label: 'Loan', className: 'loan' };
    }
  };

  const typeBadge = getTypeBadge();

  return (
    <div className={`loan-row ${needsUpdate ? 'needs-update' : ''}`} data-testid={`loan-row-${id}`}>
      <div className="loan-row-main">
        <div className="loan-row-info">
          <div className="loan-row-name">
            {name}
            <span className={`loan-row-type-badge ${typeBadge.className}`} data-testid="type-badge">
              {typeBadge.label}
            </span>
            {fixedExpenseCount > 0 && (
              <span className="loan-row-fixed-expense-badge" data-testid="fixed-expense-badge" title={`${fixedExpenseCount} linked fixed expense(s)`}>
                📋 {fixedExpenseCount}
              </span>
            )}
            {needsUpdate && (
              <span className="loan-row-needs-update-badge" data-testid="needs-update-badge">
                ⚠️ Update Needed
              </span>
            )}
          </div>
          <div className="loan-row-details">
            <span className="loan-row-rate">
              Rate: {currentRate != null && currentRate > 0 ? `${currentRate}%` : 'N/A'}
            </span>
            <span className="loan-row-balance">
              Balance: <span className="loan-row-balance-badge">{formatCurrency(currentBalance)}</span>
            </span>
          </div>
        </div>
        <div className="loan-row-actions">
          {payment_tracking_enabled && (
            <button
              className="loan-row-log-payment-button"
              onClick={() => onLogPayment && onLogPayment(loan)}
              title={`Log payment for ${name}`}
              data-testid="log-payment-button"
            >
              Log Payment
            </button>
          )}
          <button
            className="loan-row-view-button"
            onClick={() => onViewDetails && onViewDetails(loan)}
            title={`View details for ${name}`}
          >
            View
          </button>
          <button
            className="loan-row-edit-button"
            onClick={() => onEdit && onEdit(loan)}
            title={`Edit ${name}`}
          >
            Edit
          </button>
          <button
            className="loan-row-delete-button"
            onClick={() => onDelete && onDelete(loan)}
            title={`Delete ${name}`}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoanRow;
