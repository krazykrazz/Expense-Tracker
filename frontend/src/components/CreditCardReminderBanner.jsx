import React from 'react';
import './CreditCardReminderBanner.css';

/**
 * Banner component for credit card payment due date reminders
 * Shows overdue (urgent) or due soon (warning) alerts
 */
const CreditCardReminderBanner = ({ 
  cards, 
  isOverdue = false, 
  onDismiss, 
  onClick 
}) => {
  if (!cards || cards.length === 0) {
    return null;
  }

  const icon = isOverdue ? '🚨' : '⏰';
  const bannerClass = isOverdue ? 'credit-card-reminder-banner overdue' : 'credit-card-reminder-banner due-soon';
  
  // Build message based on number of cards
  const buildMessage = () => {
    if (cards.length === 1) {
      const card = cards[0];
      const daysText = isOverdue 
        ? `${Math.abs(card.days_until_due)} day${Math.abs(card.days_until_due) !== 1 ? 's' : ''} overdue`
        : card.days_until_due === 0 
          ? 'due today'
          : `due in ${card.days_until_due} day${card.days_until_due !== 1 ? 's' : ''}`;
      
      return isOverdue
        ? `${card.display_name} payment is ${daysText}!`
        : `${card.display_name} payment ${daysText}`;
    } else {
      return isOverdue
        ? `${cards.length} credit card payments are overdue!`
        : `${cards.length} credit card payments due soon`;
    }
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

  return (
    <div className={bannerClass} onClick={handleClick} role="button" tabIndex={0}>
      <div className="reminder-content">
        <span className="reminder-icon">{icon}</span>
        <span className="reminder-message">{buildMessage()}</span>
        {cards.length > 1 && (
          <span className="reminder-cards-list">
            ({cards.map(c => c.display_name).join(', ')})
          </span>
        )}
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

export default CreditCardReminderBanner;
