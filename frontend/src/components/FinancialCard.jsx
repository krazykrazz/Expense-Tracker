import React from 'react';
import { formatAmount } from '../utils/formatters';
import './FinancialCard.css';

/**
 * FinancialCard Component
 * Card component for financial health items with action buttons
 * Used in the Financial Health tab for Income, Fixed Expenses, Loans, and Investments
 * 
 * @param {string} title - Card title (e.g., "Income", "Fixed Expenses")
 * @param {string} icon - Emoji/icon for the card
 * @param {number} value - Main value to display
 * @param {string} valueColor - Color variant: 'positive', 'negative', or 'neutral'
 * @param {string} actionLabel - Button label (e.g., "View/Edit", "Manage")
 * @param {function} onAction - Click handler for the action button
 * @param {Array} details - Optional array of detail items [{label, value}]
 */
const FinancialCard = ({
  title,
  icon,
  value = 0,
  valueColor = 'neutral',
  actionLabel,
  onAction,
  details = []
}) => {
  // Determine the CSS class for value color
  const getValueColorClass = () => {
    switch (valueColor) {
      case 'positive':
        return 'value-positive';
      case 'negative':
        return 'value-negative';
      default:
        return 'value-neutral';
    }
  };

  return (
    <div className="financial-card">
      <div className="financial-card-header">
        {icon && <span className="financial-card-icon">{icon}</span>}
        <span className="financial-card-title">{title}</span>
      </div>

      <div className={`financial-card-value ${getValueColorClass()}`}>
        ${formatAmount(value)}
      </div>

      {details.length > 0 && (
        <div className="financial-card-details">
          {details.map((detail, index) => (
            <div key={index} className="financial-card-detail-item">
              <span className="detail-label">{detail.label}</span>
              <span className="detail-value">${formatAmount(detail.value)}</span>
            </div>
          ))}
        </div>
      )}

      {actionLabel && onAction && (
        <button 
          className="financial-card-action-btn"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default FinancialCard;
