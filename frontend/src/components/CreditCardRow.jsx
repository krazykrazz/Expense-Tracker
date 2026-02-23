import React from 'react';
import { formatCurrency } from '../utils/formatters';
import './CreditCardRow.css';

/**
 * CreditCardRow — displays a single credit card in the unified Financial Overview.
 * Shows card name, balances, utilization/due-date warnings, and quick action buttons.
 */
const CreditCardRow = ({ card, onPay, onViewDetails }) => {
  const {
    id,
    name,
    currentBalance,
    statementBalance,
    cycleBalance,
    utilization_percentage,
    days_until_due,
    credit_limit
  } = card;

  const showUtilizationWarning = utilization_percentage != null && utilization_percentage > 75;
  const showDueWarning = days_until_due != null && days_until_due <= 7;
  const isOverdue = days_until_due != null && days_until_due <= 0;

  const getDueLabel = () => {
    if (days_until_due == null) return null;
    if (days_until_due <= 0) return 'Overdue';
    if (days_until_due === 1) return 'Due tomorrow';
    return `Due in ${days_until_due} days`;
  };

  return (
    <div className={`credit-card-row ${showDueWarning ? 'due-warning' : ''}`} data-testid={`credit-card-row-${id}`}>
      <div className="credit-card-row-main">
        <div className="credit-card-row-info">
          <div className="credit-card-row-name">
            {name}
            {showUtilizationWarning && (
              <span className="credit-card-utilization-badge" data-testid="utilization-warning">
                ⚠️ {Math.round(utilization_percentage)}% used
              </span>
            )}
            {showDueWarning && (
              <span className={`credit-card-due-badge ${isOverdue ? 'overdue' : 'due-soon'}`} data-testid="due-warning">
                {isOverdue ? '🔴' : '🟡'} {getDueLabel()}
              </span>
            )}
          </div>
          <div className="credit-card-row-balances">
            <span className="credit-card-row-balance">
              <span className="balance-label">Current:</span> {formatCurrency(currentBalance)}
            </span>
            <span className="credit-card-row-balance">
              <span className="balance-label">Statement:</span> {statementBalance != null ? formatCurrency(statementBalance) : '—'}
            </span>
            <span className="credit-card-row-balance">
              <span className="balance-label">Cycle:</span> {cycleBalance != null ? formatCurrency(cycleBalance) : '—'}
            </span>
          </div>
        </div>
        <div className="credit-card-row-actions">
          <button
            className="financial-action-btn-primary"
            onClick={() => onPay && onPay(card)}
            title={`Log payment for ${name}`}
          >
            Pay
          </button>
          <button
            className="financial-action-btn-secondary"
            onClick={() => onViewDetails && onViewDetails(card)}
            title={`View details for ${name}`}
          >
            View
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreditCardRow;
