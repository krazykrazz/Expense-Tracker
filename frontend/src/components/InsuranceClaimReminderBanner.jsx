import React from 'react';
import './InsuranceClaimReminderBanner.css';

/**
 * Banner component for insurance claim reminders
 * Shows pending claims that have been "In Progress" for an extended period
 * Uses green/teal color scheme to differentiate from other reminder types
 * _Requirements: 2.1, 2.2, 2.3, 2.4_
 */
const InsuranceClaimReminderBanner = ({ 
  claims, 
  onDismiss, 
  onClick 
}) => {
  if (!claims || claims.length === 0) {
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
   * Get urgency indicator based on days pending
   * _Requirements: 2.2_
   */
  const getUrgencyIndicator = (claim) => {
    if (claim.daysPending >= 90) {
      return { icon: '⚠️', label: 'Long Pending', className: 'long-pending' };
    }
    if (claim.daysPending >= 60) {
      return { icon: '⏳', label: 'Extended', className: 'extended' };
    }
    return { icon: '📋', label: 'Pending', className: 'pending' };
  };

  const icon = '🏥';
  const bannerClass = 'insurance-claim-reminder-banner';
  
  /**
   * Build message based on number of claims
   * _Requirements: 2.1, 2.3_
   */
  const buildMessage = () => {
    if (claims.length === 1) {
      const claim = claims[0];
      return `Insurance claim at ${claim.place} pending for ${claim.daysPending} days`;
    } else {
      return `${claims.length} insurance claims pending follow-up`;
    }
  };

  /**
   * Calculate total pending amount across all claims
   * _Requirements: 2.2_
   */
  const getTotalPendingAmount = () => {
    return claims.reduce((total, claim) => total + (claim.originalCost || claim.amount || 0), 0);
  };

  const handleClick = (e) => {
    // Don't trigger onClick if the dismiss button was clicked
    if (e.target.closest('.reminder-dismiss-btn')) {
      return;
    }
    if (onClick) {
      onClick();
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


  // Single claim view with detailed info
  if (claims.length === 1) {
    const claim = claims[0];
    const urgency = getUrgencyIndicator(claim);
    
    return (
      <div 
        className={bannerClass} 
        onClick={handleClick} 
        onKeyDown={handleKeyDown}
        role="button" 
        tabIndex={0}
        data-testid="insurance-claim-reminder-banner"
      >
        <div className="reminder-content">
          <span className="reminder-icon">{icon}</span>
          <div className="reminder-details">
            <span className="reminder-message">{buildMessage()}</span>
            {/* Claim amount - Requirements: 2.2 */}
            <div className="reminder-payment-info">
              <span className="reminder-payment-label">Original Cost:</span>
              <span className="reminder-payment-amount" data-testid="claim-amount">
                {formatCurrency(claim.originalCost || claim.amount)}
              </span>
              {/* Days pending badge */}
              <span 
                className="days-pending-badge"
                data-testid="days-pending-badge"
              >
                {claim.daysPending} days
              </span>
              {/* Urgency indicator - Requirements: 2.2 */}
              {urgency.label && (
                <span 
                  className={`reminder-urgency-badge ${urgency.className}`}
                  data-testid="urgency-indicator"
                >
                  {urgency.icon} {urgency.label}
                </span>
              )}
            </div>
            {/* Person names if associated */}
            {claim.personNames && claim.personNames.length > 0 && (
              <span className="reminder-person-names" data-testid="person-names">
                For: {Array.isArray(claim.personNames) ? claim.personNames.join(', ') : claim.personNames}
              </span>
            )}
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

  // Multiple claims view with summary
  const totalAmount = getTotalPendingAmount();
  
  return (
    <div 
      className={bannerClass} 
      onClick={handleClick} 
      onKeyDown={handleKeyDown}
      role="button" 
      tabIndex={0}
      data-testid="insurance-claim-reminder-banner"
    >
      <div className="reminder-content">
        <span className="reminder-icon">{icon}</span>
        <div className="reminder-details">
          <span className="reminder-message">{buildMessage()}</span>
          {/* Total pending amount for multiple claims - Requirements: 2.3 */}
          <div className="reminder-payment-info">
            <span className="reminder-payment-label">Total Pending:</span>
            <span className="reminder-payment-amount" data-testid="claim-amount">
              {formatCurrency(totalAmount)}
            </span>
          </div>
          {/* Claims list with individual amounts */}
          <div className="reminder-claims-breakdown">
            {claims.map(claim => {
              const urgency = getUrgencyIndicator(claim);
              return (
                <div key={claim.expenseId} className="reminder-claim-item">
                  <span className="reminder-claim-place">{claim.place}</span>
                  <span className="reminder-claim-amount">{formatCurrency(claim.originalCost || claim.amount)}</span>
                  <span className="reminder-claim-days">{claim.daysPending}d</span>
                  {/* Urgency indicator per claim */}
                  {urgency.label && (
                    <span 
                      className={`reminder-urgency-badge small ${urgency.className}`}
                      data-testid={`urgency-indicator-${claim.expenseId}`}
                    >
                      {urgency.icon}
                    </span>
                  )}
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

export default InsuranceClaimReminderBanner;
