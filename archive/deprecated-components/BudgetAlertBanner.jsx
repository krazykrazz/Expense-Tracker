/**
 * DEPRECATED: This component has been replaced by BudgetReminderBanner
 * 
 * This file is kept for rollback purposes only.
 * The new BudgetReminderBanner follows the unified reminder banner pattern
 * used by CreditCardReminderBanner, LoanPaymentReminderBanner, etc.
 * 
 * Migration date: February 2026
 * Replaced by: frontend/src/components/BudgetReminderBanner.jsx
 */

import { memo } from 'react';
import './BudgetAlertBanner.css';

/**
 * BudgetAlertBanner Component
 * Displays individual budget alert with severity-based styling and actions
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 4.1, 4.3, 6.1, 6.2, 6.3
 * Performance: React.memo prevents unnecessary re-renders (Requirement 7.1)
 */
const BudgetAlertBanner = memo(({ 
  alert, 
  onDismiss, 
  onManageBudgets,
  onViewExpenses 
}) => {
  if (!alert) {
    return null;
  }

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss(alert.id);
    }
  };

  const handleManageBudgets = () => {
    if (onManageBudgets) {
      onManageBudgets(alert.category);
    }
  };

  const handleViewExpenses = () => {
    if (onViewExpenses) {
      onViewExpenses(alert.category);
    }
  };

  return (
    <div 
      className={`budget-alert-banner budget-alert-${alert.severity}`}
      role="alert"
      aria-live="polite"
      aria-label={`Budget alert: ${alert.message}`}
    >
      <div className="budget-alert-content">
        <div className="budget-alert-icon" aria-hidden="true">
          {alert.icon}
        </div>
        
        <div className="budget-alert-message">
          {alert.message}
        </div>
        
        <div className="budget-alert-actions">
          <button
            type="button"
            className="budget-alert-action-btn budget-alert-view-btn"
            onClick={handleViewExpenses}
            aria-label={`View ${alert.category} expenses`}
          >
            View Expenses
          </button>
          
          <button
            type="button"
            className="budget-alert-action-btn budget-alert-manage-btn"
            onClick={handleManageBudgets}
            aria-label={`Manage ${alert.category} budget`}
          >
            Manage Budget
          </button>
          
          <button
            type="button"
            className="budget-alert-dismiss-btn"
            onClick={handleDismiss}
            aria-label={`Dismiss ${alert.category} budget alert`}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
});

// Display name for debugging
BudgetAlertBanner.displayName = 'BudgetAlertBanner';

export default BudgetAlertBanner;
