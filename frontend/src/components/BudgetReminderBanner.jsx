import React from 'react';
import './BudgetReminderBanner.css';

/**
 * Banner component for budget alert reminders
 * Follows the reminder banner pattern (single click to navigate)
 * Uses orange/amber color scheme to differentiate from other reminder types
 * _Requirements: 6.1, 6.3, 6.5, 6.6_
 */
const BudgetReminderBanner = ({ 
  alerts, 
  onDismiss, 
  onClick 
}) => {
  if (!alerts || alerts.length === 0) {
    return null;
  }

  /**
   * Format currency for display
   */
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

  /**
   * Get severity indicator based on alert severity
   * _Requirements: 6.3_
   */
  const getSeverityIndicator = (alert) => {
    switch (alert.severity) {
      case 'critical':
        return { icon: '⚠', label: 'Exceeded', className: 'critical' };
      case 'danger':
        return { icon: '!', label: 'Near Limit', className: 'danger' };
      case 'warning':
        return { icon: '⚡', label: 'Approaching', className: 'warning' };
      default:
        return { icon: '📊', label: '', className: '' };
    }
  };

  /**
   * Get banner class based on most severe alert
   */
  const getBannerClass = () => {
    const hasCritical = alerts.some(a => a.severity === 'critical');
    const hasDanger = alerts.some(a => a.severity === 'danger');
    
    if (hasCritical) return 'budget-reminder-banner critical';
    if (hasDanger) return 'budget-reminder-banner danger';
    return 'budget-reminder-banner warning';
  };

  const icon = '💰';
  const bannerClass = getBannerClass();
  
  /**
   * Build message based on number of alerts
   * _Requirements: 6.5, 6.6_
   */
  const buildMessage = () => {
    if (alerts.length === 1) {
      const alert = alerts[0];
      if (alert.severity === 'critical') {
        return `${alert.category} budget exceeded!`;
      }
      return `${alert.category} budget is ${alert.progress.toFixed(1)}% used`;
    } else {
      const hasCritical = alerts.some(a => a.severity === 'critical');
      if (hasCritical) {
        const criticalCount = alerts.filter(a => a.severity === 'critical').length;
        return `${criticalCount} budget${criticalCount > 1 ? 's' : ''} exceeded! ${alerts.length} total alerts`;
      }
      return `${alerts.length} budget alerts need attention`;
    }
  };

  const handleClick = (e, category = null) => {
    // Don't trigger onClick if the dismiss button was clicked
    if (e.target.closest('.reminder-dismiss-btn')) {
      return;
    }
    if (onClick) {
      // Pass the category for navigation - Requirements: 6.4
      onClick(category || (alerts.length === 1 ? alerts[0].category : null));
    }
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    if (onDismiss) {
      onDismiss();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e);
    }
  };

  // Single alert view with detailed info
  if (alerts.length === 1) {
    const alert = alerts[0];
    const severity = getSeverityIndicator(alert);
    const remaining = alert.limit - alert.spent;
    
    return (
      <div 
        className={bannerClass} 
        onClick={handleClick} 
        onKeyDown={handleKeyDown}
        role="button" 
        tabIndex={0}
        data-testid="budget-reminder-banner"
      >
        <div className="reminder-content">
          <span className="reminder-icon">{icon}</span>
          <div className="reminder-details">
            <span className="reminder-message">{buildMessage()}</span>
            {/* Budget info - Requirements: 6.5 */}
            <div className="reminder-budget-info">
              <span className="reminder-budget-label">Spent:</span>
              <span className="reminder-budget-amount" data-testid="budget-spent">
                {formatCurrency(alert.spent)}
              </span>
              <span className="reminder-budget-separator">/</span>
              <span className="reminder-budget-limit" data-testid="budget-limit">
                {formatCurrency(alert.limit)}
              </span>
              {/* Progress badge */}
              <span 
                className={`progress-badge ${severity.className}`}
                data-testid="progress-badge"
              >
                {alert.progress.toFixed(0)}%
              </span>
              {/* Severity indicator */}
              {severity.label && (
                <span 
                  className={`reminder-severity-badge ${severity.className}`}
                  data-testid="severity-indicator"
                >
                  {severity.icon} {severity.label}
                </span>
              )}
            </div>
            {/* Remaining amount */}
            <span className="reminder-remaining" data-testid="budget-remaining">
              {remaining >= 0 
                ? `${formatCurrency(remaining)} remaining`
                : `${formatCurrency(Math.abs(remaining))} over budget`
              }
            </span>
          </div>
        </div>
        <button 
          className="reminder-dismiss-btn" 
          onClick={handleDismiss}
          aria-label="Dismiss reminder"
        >
          ×
        </button>
      </div>
    );
  }

  // Multiple alerts view with summary - Requirements: 6.6
  return (
    <div 
      className={bannerClass} 
      onClick={handleClick} 
      onKeyDown={handleKeyDown}
      role="button" 
      tabIndex={0}
      data-testid="budget-reminder-banner"
    >
      <div className="reminder-content">
        <span className="reminder-icon">{icon}</span>
        <div className="reminder-details">
          <span className="reminder-message">{buildMessage()}</span>
          {/* Summary count badge */}
          <div className="reminder-budget-info">
            <span 
              className="reminder-alert-count"
              data-testid="alert-count"
            >
              {alerts.length} categories need attention
            </span>
          </div>
          {/* Alerts breakdown */}
          <div className="reminder-alerts-breakdown">
            {alerts.map(alert => {
              const severity = getSeverityIndicator(alert);
              return (
                <div 
                  key={alert.id} 
                  className="reminder-alert-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClick(e, alert.category);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <span className="reminder-alert-category">{alert.category}</span>
                  <span className="reminder-alert-progress">{alert.progress.toFixed(0)}%</span>
                  <span className="reminder-alert-amounts">
                    {formatCurrency(alert.spent)} / {formatCurrency(alert.limit)}
                  </span>
                  {/* Severity indicator per alert */}
                  <span 
                    className={`reminder-severity-badge small ${severity.className}`}
                    data-testid={`severity-indicator-${alert.id}`}
                  >
                    {severity.icon}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <button 
        className="reminder-dismiss-btn" 
        onClick={handleDismiss}
        aria-label="Dismiss reminder"
      >
        ×
      </button>
    </div>
  );
};

export default BudgetReminderBanner;
