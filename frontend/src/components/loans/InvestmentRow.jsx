import React from 'react';
import { formatCurrency } from '../../utils/formatters';
import BankLinkedBadge from '../bank-import/BankLinkedBadge';
import BankBalance from '../bank-import/BankBalance';
import './InvestmentRow.css';

/**
 * @param {{investment: object, bankAccounts?: Array<object>}} props bankAccounts: the bank accounts linked to this
 *   investment (useInvestmentBankLinks); the bank's balance is shown next to the entered value, which it never replaces
 */
const InvestmentRow = ({ investment, bankAccounts, needsUpdate = false, onUpdateValue, onViewDetails, onEdit, onDelete }) => {
  const { id, name, type, currentValue } = investment;

  return (
    <div className={`investment-row ${needsUpdate ? 'needs-update' : ''}`} data-testid={`investment-row-${id}`}>
      <div className="investment-row-main">
        <div className="investment-row-info">
          <div className="investment-row-name">
            {name}
            <span className="investment-row-type-badge" data-testid="type-badge">
              {type}
            </span>
            <BankLinkedBadge accounts={bankAccounts} name={name} balanceOnly />
            {needsUpdate && (
              <span className="investment-row-needs-update-badge" data-testid="needs-update-badge">
                ⚠️ Update Needed
              </span>
            )}
          </div>
          <div className="investment-row-details">
            <span className="investment-row-current-value">
              Current Value: {formatCurrency(currentValue)}
            </span>
            <BankBalance accounts={bankAccounts} />
          </div>
        </div>
        <div className="investment-row-actions">
          <button
            className="financial-cc-view-btn"
            onClick={() => onViewDetails && onViewDetails(investment)}
            title={`View details for ${name}`}
          >
            View
          </button>
          <button
            className="financial-action-btn-secondary"
            onClick={() => onEdit && onEdit(investment)}
            title={`Edit ${name}`}
          >
            Edit
          </button>
          <button
            className="financial-action-btn-danger"
            onClick={() => onDelete && onDelete(investment)}
            title={`Delete ${name}`}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvestmentRow;
