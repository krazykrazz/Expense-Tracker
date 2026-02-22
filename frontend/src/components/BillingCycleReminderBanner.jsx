import React from 'react';
import './BillingCycleReminderBanner.css';

/**
 * Banner component for billing cycle entry reminders
 * Prompts users to enter their actual statement balance after a billing cycle ends
 * _Requirements: 4.1, 4.2, 4.4_
 */
const BillingCycleReminderBanner = ({ 
  cards, 
  onDismiss, 
  onClick 
}) => {
  if (!cards || cards.length === 0) {
    return null;
  }

  /**
   * Format date for display
   */
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric'
    });
  };

  const handleClick = (e) => {
    // Don't trigger onClick if the dismiss button was clicked
    if (e.target.closest('.reminder-dismiss-btn')) {
      return;
    }
    if (onClick) {
      // Pass the first card for deep-link navigation
      onClick(cards[0]);
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

  /**
   * Build message based on number of cards
   */
  const buildMessage = () => {
    if (cards.length === 1) {
      const card = cards[0];
      return `Enter statement balance for ${card.displayName}`;
    } else {
      return `${cards.length} credit cards need statement balance entry`;
    }
  };

  // Single card view
  if (cards.length === 1) {
    const card = cards[0];
    
    return (
      <div 
        className="billing-cycle-reminder-banner" 
        onClick={handleClick} 
        onKeyDown={handleKeyDown}
        role="button" 
        tabIndex={0}
        data-testid="billing-cycle-reminder-banner"
      >
        <div className="reminder-content">
          <span className="reminder-icon">📋</span>
          <div className="reminder-details">
            <span className="reminder-message">{buildMessage()}</span>
            <div className="reminder-cycle-info">
              <span className="reminder-cycle-dates" data-testid="cycle-dates">
                Cycle: {formatDate(card.cycleStartDate)} - {formatDate(card.cycleEndDate)}
              </span>
            </div>
            <span className="reminder-action-hint">Click to enter your actual statement balance</span>
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

  // Multiple cards view
  return (
    <div 
      className="billing-cycle-reminder-banner" 
      onClick={handleClick} 
      onKeyDown={handleKeyDown}
      role="button" 
      tabIndex={0}
      data-testid="billing-cycle-reminder-banner"
    >
      <div className="reminder-content">
        <span className="reminder-icon">📋</span>
        <div className="reminder-details">
          <span className="reminder-message">{buildMessage()}</span>
          {/* Card list */}
          <div className="reminder-cards-list">
            {cards.map(card => (
              <div key={card.paymentMethodId} className="reminder-card-item">
                <span className="reminder-card-name">{card.displayName}</span>
                <span className="reminder-card-cycle">
                  {formatDate(card.cycleStartDate)} - {formatDate(card.cycleEndDate)}
                </span>
              </div>
            ))}
          </div>
          <span className="reminder-action-hint">Click to manage billing cycles</span>
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

export default BillingCycleReminderBanner;
