import React, { useState } from 'react';
import { formatCAD as formatCurrency } from '../utils/formatters';
import './AutoLogPrompt.css';

/**
 * AutoLogPrompt Component
 * 
 * Modal/toast for auto-log confirmation when loan payments are due.
 * Shows expense name, amount, loan name and provides Log Payment and Skip buttons.
 * 
 * _Requirements: 4.4, 4.5_
 */
const AutoLogPrompt = ({ 
  suggestions, 
  onLogPayment, 
  onSkip, 
  onDismissAll,
  loading = false 
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [processingId, setProcessingId] = useState(null);

  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  const currentSuggestion = suggestions[currentIndex];
  const hasMultiple = suggestions.length > 1;

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

  /**
   * Format date for display
   */
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  /**
   * Handle log payment click
   * _Requirements: 4.4_
   */
  const handleLogPayment = async () => {
    if (loading || processingId) return;
    
    setProcessingId(currentSuggestion.fixedExpenseId);
    
    try {
      await onLogPayment(currentSuggestion);
      
      // Move to next suggestion or close if done
      if (currentIndex < suggestions.length - 1) {
        setCurrentIndex(prev => prev + 1);
      }
    } finally {
      setProcessingId(null);
    }
  };

  /**
   * Handle skip click
   * _Requirements: 4.5_
   */
  const handleSkip = () => {
    if (loading || processingId) return;
    
    onSkip(currentSuggestion);
    
    // Move to next suggestion or close if done
    if (currentIndex < suggestions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  /**
   * Handle dismiss all
   */
  const handleDismissAll = () => {
    if (loading || processingId) return;
    onDismissAll();
  };

  const isProcessing = processingId === currentSuggestion.fixedExpenseId;

  return (
    <div className="auto-log-prompt-overlay" data-testid="auto-log-prompt">
      <div className="auto-log-prompt-modal">
        {/* Header */}
        <div className="auto-log-prompt-header">
          <div className="auto-log-prompt-icon">🏦</div>
          <h3 className="auto-log-prompt-title">Log Loan Payment?</h3>
          {hasMultiple && (
            <span className="auto-log-prompt-counter" data-testid="suggestion-counter">
              {currentIndex + 1} of {suggestions.length}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="auto-log-prompt-content">
          <p className="auto-log-prompt-description">
            A payment is due for your linked fixed expense. Would you like to automatically log this payment?
          </p>

          {/* Payment Details */}
          <div className="auto-log-prompt-details">
            <div className="auto-log-detail-row">
              <span className="auto-log-detail-label">Fixed Expense:</span>
              <span className="auto-log-detail-value" data-testid="expense-name">
                {currentSuggestion.fixedExpenseName}
              </span>
            </div>
            
            <div className="auto-log-detail-row">
              <span className="auto-log-detail-label">Loan:</span>
              <span className="auto-log-detail-value" data-testid="loan-name">
                {currentSuggestion.loanName}
                <span className="auto-log-loan-type-badge">
                  {formatLoanType(currentSuggestion.loanType)}
                </span>
              </span>
            </div>
            
            <div className="auto-log-detail-row highlight">
              <span className="auto-log-detail-label">Amount:</span>
              <span className="auto-log-detail-value amount" data-testid="payment-amount">
                {formatCurrency(currentSuggestion.amount)}
              </span>
            </div>
            
            <div className="auto-log-detail-row">
              <span className="auto-log-detail-label">Payment Date:</span>
              <span className="auto-log-detail-value" data-testid="payment-date">
                {formatDate(currentSuggestion.suggestedPaymentDate)}
              </span>
            </div>
          </div>

          {/* Info note */}
          <p className="auto-log-prompt-note">
            <span className="note-icon">ℹ️</span>
            The payment will be recorded with a note indicating it was auto-logged from this fixed expense.
          </p>
        </div>

        {/* Actions */}
        <div className="auto-log-prompt-actions">
          <button
            className="auto-log-btn auto-log-btn-primary"
            onClick={handleLogPayment}
            disabled={loading || isProcessing}
            data-testid="log-payment-btn"
          >
            {isProcessing ? (
              <>
                <span className="btn-spinner"></span>
                Logging...
              </>
            ) : (
              <>
                <span className="btn-icon">✓</span>
                Log Payment
              </>
            )}
          </button>
          
          <button
            className="auto-log-btn auto-log-btn-secondary"
            onClick={handleSkip}
            disabled={loading || isProcessing}
            data-testid="skip-btn"
          >
            <span className="btn-icon">→</span>
            Skip
          </button>
          
          {hasMultiple && (
            <button
              className="auto-log-btn auto-log-btn-tertiary"
              onClick={handleDismissAll}
              disabled={loading || isProcessing}
              data-testid="dismiss-all-btn"
            >
              Dismiss All
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutoLogPrompt;
