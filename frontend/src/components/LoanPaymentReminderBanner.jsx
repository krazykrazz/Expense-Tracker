import React from 'react';
import './LoanPaymentReminderBanner.css';

/**
 * Banner component for loan payment due date reminders
 * Shows overdue (urgent) or due soon (warning) alerts for linked fixed expenses
 * Uses distinct visual style (blue/purple) to differentiate from credit card reminders (yellow/red)
 * _Requirements: 5.1, 5.2, 5.3_
 */
const LoanPaymentReminderBanner = ({ 
  payments, 
  isOverdue = false, 
  onDismiss, 
  onClick 
}) => {
  if (!payments || payments.length === 0) {
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
   * Get urgency indicator based on payment status
   * _Requirements: 5.2_
   */
  const getUrgencyIndicator = (payment) => {
    if (payment.isOverdue) {
      return { icon: '🚨', label: 'Overdue', className: 'overdue' };
    }
    if (payment.isDueSoon) {
      if (payment.daysUntilDue === 0) {
        return { icon: '⚠️', label: 'Due Today', className: 'due-today' };
      }
      return { icon: '⏰', label: 'Due Soon', className: 'due-soon' };
    }
    return { icon: '🏦', label: '', className: '' };
  };

  /**
   * Format loan type for display
   */
  const formatLoanType = (loanType) => {
    if (!loanType) return 'Loan';
    switch (loanType) {
      case 'mortgage':
        return 'Mortgage';
      case 'line_of_credit':
        return 'Line of Credit';
      case 'loan':
      default:
        return 'Loan';
    }
  };

  const icon = isOverdue ? '🚨' : '🏦';
  const bannerClass = isOverdue ? 'loan-payment-reminder-banner overdue' : 'loan-payment-reminder-banner due-soon';
  
  /**
   * Build message based on number of payments
   * _Requirements: 5.1, 5.2, 5.3_
   */
  const buildMessage = () => {
    if (payments.length === 1) {
      const payment = payments[0];
      const daysText = isOverdue 
        ? `${Math.abs(payment.daysUntilDue)} day${Math.abs(payment.daysUntilDue) !== 1 ? 's' : ''} overdue`
        : payment.daysUntilDue === 0 
          ? 'due today'
          : `due in ${payment.daysUntilDue} day${payment.daysUntilDue !== 1 ? 's' : ''}`;
      
      return isOverdue
        ? `${payment.loanName} payment is ${daysText}!`
        : `${payment.loanName} payment ${daysText}`;
    } else {
      return isOverdue
        ? `${payments.length} loan payments are overdue!`
        : `${payments.length} loan payments due soon`;
    }
  };

  /**
   * Calculate total payment amount across all loans
   * _Requirements: 5.3_
   */
  const getTotalPaymentAmount = () => {
    return payments.reduce((total, payment) => total + (payment.amount || 0), 0);
  };

  const handleClick = (e) => {
    // Don't trigger onClick if the dismiss button was clicked
    if (e.target.closest('.reminder-dismiss-btn')) {
      return;
    }
    if (onClick) {
      onClick(payments.length === 1 ? payments[0].loanId : null);
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

  // Single payment view with detailed info
  if (payments.length === 1) {
    const payment = payments[0];
    const urgency = getUrgencyIndicator(payment);
    
    return (
      <div 
        className={bannerClass} 
        onClick={handleClick} 
        onKeyDown={handleKeyDown}
        role="button" 
        tabIndex={0}
        data-testid="loan-payment-reminder-banner"
      >
        <div className="reminder-content">
          <span className="reminder-icon">{icon}</span>
          <div className="reminder-details">
            <span className="reminder-message">{buildMessage()}</span>
            {/* Payment amount - Requirements: 5.3 */}
            <div className="reminder-payment-info">
              <span className="reminder-payment-label">Payment Amount:</span>
              <span className="reminder-payment-amount" data-testid="payment-amount">
                {formatCurrency(payment.amount)}
              </span>
              {/* Loan type badge */}
              <span 
                className="loan-type-badge"
                data-testid="loan-type-badge"
              >
                {formatLoanType(payment.loanType)}
              </span>
              {/* Urgency indicator - Requirements: 5.2 */}
              {urgency.label && (
                <span 
                  className={`reminder-urgency-badge ${urgency.className}`}
                  data-testid="urgency-indicator"
                >
                  {urgency.icon} {urgency.label}
                </span>
              )}
            </div>
            {/* Due date - Requirements: 5.3 */}
            {payment.paymentDueDay && (
              <span className="reminder-due-date" data-testid="payment-due-date">
                Due on day {payment.paymentDueDay} of each month
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

  // Multiple payments view with summary
  const totalAmount = getTotalPaymentAmount();
  
  return (
    <div 
      className={bannerClass} 
      onClick={handleClick} 
      onKeyDown={handleKeyDown}
      role="button" 
      tabIndex={0}
      data-testid="loan-payment-reminder-banner"
    >
      <div className="reminder-content">
        <span className="reminder-icon">{icon}</span>
        <div className="reminder-details">
          <span className="reminder-message">{buildMessage()}</span>
          {/* Total payment amount for multiple loans - Requirements: 5.3 */}
          <div className="reminder-payment-info">
            <span className="reminder-payment-label">Total Due:</span>
            <span className="reminder-payment-amount" data-testid="payment-amount">
              {formatCurrency(totalAmount)}
            </span>
          </div>
          {/* Loans list with individual amounts */}
          <div className="reminder-loans-breakdown">
            {payments.map(payment => {
              const urgency = getUrgencyIndicator(payment);
              return (
                <div key={payment.fixedExpenseId} className="reminder-loan-item">
                  <span className="reminder-loan-name">{payment.loanName}</span>
                  <span className="reminder-loan-amount">{formatCurrency(payment.amount)}</span>
                  {/* Urgency indicator per loan - Requirements: 5.2 */}
                  {urgency.label && (
                    <span 
                      className={`reminder-urgency-badge small ${urgency.className}`}
                      data-testid={`urgency-indicator-${payment.fixedExpenseId}`}
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

export default LoanPaymentReminderBanner;
