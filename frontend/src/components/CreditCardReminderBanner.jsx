import React from 'react';
import { formatCAD as formatCurrency } from '../utils/formatters';
import './CreditCardReminderBanner.css';

/**
 * Banner component for credit card payment due date reminders
 * Shows overdue (urgent) or due soon (warning) alerts with required payment amounts
 * _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
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

  /**
   * Get urgency indicator based on card status
   * _Requirements: 8.4_
   */
  const getUrgencyIndicator = (card) => {
    if (card.is_statement_paid) {
      return { icon: '✓', label: 'Paid', className: 'paid' };
    }
    if (card.is_overdue) {
      return { icon: '🚨', label: 'Overdue', className: 'overdue' };
    }
    if (card.is_due_soon) {
      if (card.days_until_due === 0) {
        return { icon: '⚠️', label: 'Due Today', className: 'due-today' };
      }
      if (card.days_until_due <= 3) {
        return { icon: '⏰', label: 'Due Soon', className: 'due-soon' };
      }
      return { icon: '📅', label: 'Upcoming', className: 'upcoming' };
    }
    return { icon: '💳', label: '', className: '' };
  };

  const icon = isOverdue ? '🚨' : '⏰';
  const bannerClass = isOverdue ? 'credit-card-reminder-banner overdue' : 'credit-card-reminder-banner due-soon';
  
  /**
   * Build message based on number of cards
   * Includes required payment amount when available
   * _Requirements: 8.1, 8.2, 8.3_
   */
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

  /**
   * Calculate total required payment across all cards
   * _Requirements: 8.1_
   */
  const getTotalRequiredPayment = () => {
    return cards.reduce((total, card) => total + (card.required_payment || 0), 0);
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

  // Single card view with detailed payment info
  if (cards.length === 1) {
    const card = cards[0];
    const urgency = getUrgencyIndicator(card);
    
    return (
      <div 
        className={bannerClass} 
        onClick={handleClick} 
        onKeyDown={handleKeyDown}
        role="button" 
        tabIndex={0}
        data-testid="credit-card-reminder-banner"
      >
        <div className="reminder-content">
          <span className="reminder-icon">{icon}</span>
          <div className="reminder-details">
            <span className="reminder-message">{buildMessage()}</span>
            {/* Required payment amount - Requirements: 8.1 */}
            <div className="reminder-payment-info">
              <span className="reminder-payment-label">Required Payment:</span>
              <span className="reminder-payment-amount" data-testid="required-payment-amount">
                {formatCurrency(card.required_payment)}
              </span>
              {/* Statement indicator - Requirements: 7.3 */}
              <span 
                className={`reminder-balance-source ${card.has_statement_pdf ? 'actual' : 'required'}`}
                data-testid="balance-source-indicator"
                title={card.has_statement_pdf ? 'Statement PDF uploaded' : 'Statement PDF required'}
              >
                {card.has_statement_pdf ? '✓' : '📄'} Statement
              </span>
              {/* Urgency indicator - Requirements: 8.4 */}
              {urgency.label && (
                <span 
                  className={`reminder-urgency-badge ${urgency.className}`}
                  data-testid="urgency-indicator"
                >
                  {urgency.icon} {urgency.label}
                </span>
              )}
            </div>
            {/* Due date - Requirements: 8.2 */}
            {card.payment_due_day && (
              <span className="reminder-due-date" data-testid="payment-due-date">
                Due on day {card.payment_due_day} of each month
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

  // Multiple cards view with summary
  const totalRequired = getTotalRequiredPayment();
  
  return (
    <div 
      className={bannerClass} 
      onClick={handleClick} 
      onKeyDown={handleKeyDown}
      role="button" 
      tabIndex={0}
      data-testid="credit-card-reminder-banner"
    >
      <div className="reminder-content">
        <span className="reminder-icon">{icon}</span>
        <div className="reminder-details">
          <span className="reminder-message">{buildMessage()}</span>
          {/* Total required payment for multiple cards - Requirements: 8.1 */}
          <div className="reminder-payment-info">
            <span className="reminder-payment-label">Total Required:</span>
            <span className="reminder-payment-amount" data-testid="required-payment-amount">
              {formatCurrency(totalRequired)}
            </span>
          </div>
          {/* Card list with individual amounts */}
          <div className="reminder-cards-breakdown">
            {cards.map(card => {
              const urgency = getUrgencyIndicator(card);
              return (
                <div key={card.id} className="reminder-card-item">
                  <div className="reminder-card-main-info">
                    <span className="reminder-card-name">{card.display_name}</span>
                    <span className="reminder-card-amount">{formatCurrency(card.required_payment)}</span>
                  </div>
                  <div className="reminder-card-badges">
                    {/* Statement badge - Requirements: 1.1, 1.2, 1.3 */}
                    <span 
                      className={`reminder-balance-source ${card.has_statement_pdf ? 'actual' : 'required'}`}
                      data-testid={`balance-source-indicator-${card.id}`}
                      title={card.has_statement_pdf ? 'Statement PDF uploaded' : 'Statement PDF required'}
                    >
                      {card.has_statement_pdf ? '✓' : '📄'} Statement
                    </span>
                    {/* Urgency indicator per card - Requirements: 8.4, 4.1 */}
                    {urgency.label && (
                      <span 
                        className={`reminder-urgency-badge small ${urgency.className}`}
                        data-testid={`urgency-indicator-${card.id}`}
                      >
                        {urgency.icon}
                      </span>
                    )}
                  </div>
                  {/* Due date - Requirements: 2.1, 2.2, 2.3 */}
                  {card.payment_due_day && (
                    <span className="reminder-card-due-date" data-testid={`payment-due-date-${card.id}`}>
                      Due: day {card.payment_due_day}
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

export default CreditCardReminderBanner;
