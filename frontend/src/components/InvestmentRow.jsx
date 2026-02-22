import React from 'react';
import { formatCurrency } from '../utils/formatters';
import './InvestmentRow.css';

/**
 * InvestmentRow — displays a single investment in the unified Financial Overview.
 * Shows investment name, current value, type badge, conditional indicators, and quick action buttons.
 */
const InvestmentRow = ({ investment, needsUpdate = false, onUpdateValue, onViewDetails, onEdit, onDelete }) => {
  const {
    id,
    name,
    type,
    currentValue
  } = investment;

  return (
    <div className={`investment-row ${needsUpdate ? 'needs-update' : ''}`} data-testid={`investment-row-${id}`}>
      <div className="investment-row-main">
        <div className="investment-row-info">
          <div className="investment-row-name">
            {name}
            <span className="investment-row-type-badge" data-testid="type-badge">
              {type}
            </span>
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
          </div>
        </div>
        <div className="investment-row-actions">
          <button
            className="investment-row-update-value-button"
            onClick={() => onUpdateValue && onUpdateValue(investment)}
            title={`Update value for ${name}`}
          >
            📈 Update Value
          </button>
          <button
            className="investment-row-view-button"
            onClick={() => onViewDetails && onViewDetails(investment)}
            title={`View details for ${name}`}
          >
            👁️ View Details
          </button>
          <button
            className="investment-row-edit-button"
            onClick={() => onEdit && onEdit(investment)}
            title={`Edit ${name}`}
          >
            ✏️
          </button>
          <button
            className="investment-row-delete-button"
            onClick={() => onDelete && onDelete(investment)}
            title={`Delete ${name}`}
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvestmentRow;
