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
  onViewDetails 
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

  const handleViewDetails = () => {
    if (onViewDetails) {
      onViewDetails(alert.category);
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
            onClick={handleViewDetails}
            aria-label={`View details for ${alert.category} budget`}
          >
            View Details
          </button>
          
          <button
            type="button"
            className="budget-alert-action-btn budget-alert-manage-btn"
            onClick={handleManageBudgets}
            aria-label={`Manage ${alert.category} budget`}
          >
            Manage Budgets
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