/**
 * Payment Suggestion Service
 * 
 * Provides smart payment suggestions for loans and mortgages.
 * - For mortgages: Returns the configured monthly payment amount
 * - For loans with history: Returns the average of previous payments
 * - For loans without history: Returns null
 * 
 * Requirements: 3.1, 3.2, 3.3
 */

const loanRepository = require('../repositories/loanRepository');
const loanPaymentRepository = require('../repositories/loanPaymentRepository');
const mortgagePaymentService = require('./mortgagePaymentService');

class PaymentSuggestionService {
  /**
   * Get suggested payment amount for a loan
   * @param {number} loanId - Loan ID
   * @returns {Promise<Object>} { suggestedAmount, source, confidence, message }
   */
  async getSuggestion(loanId) {
    // Validate loan ID
    if (!loanId) {
      throw new Error('Loan ID is required');
    }

    // Get the loan
    const loan = await loanRepository.findById(loanId);
    
    if (!loan) {
      throw new Error('Loan not found');
    }

    // Lines of credit don't use payment tracking
    if (loan.loan_type === 'line_of_credit') {
      throw new Error('Payment suggestions are not available for lines of credit');
    }

    // For mortgages: return the configured monthly payment (Requirement 3.1)
    if (loan.loan_type === 'mortgage') {
      return await this.getMortgageSuggestion(loanId);
    }

    // For regular loans: return average of previous payments (Requirement 3.2, 3.3)
    return await this.getLoanSuggestion(loanId);
  }

  /**
   * Get payment suggestion for a mortgage
   * Returns the configured monthly payment amount from mortgage_payments table
   * @param {number} mortgageId - Mortgage loan ID
   * @returns {Promise<Object>} Suggestion object
   */
  async getMortgageSuggestion(mortgageId) {
    const currentPayment = await mortgagePaymentService.getCurrentPayment(mortgageId);

    if (currentPayment && currentPayment.payment_amount > 0) {
      return {
        suggestedAmount: currentPayment.payment_amount,
        source: 'monthly_payment',
        confidence: 'high',
        message: 'Based on your configured monthly payment'
      };
    }

    // No payment configured for mortgage
    return {
      suggestedAmount: null,
      source: 'none',
      confidence: 'low',
      message: 'No monthly payment configured for this mortgage'
    };
  }

  /**
   * Get payment suggestion for a regular loan
   * Returns the average of previous payments if history exists
   * @param {number} loanId - Loan ID
   * @returns {Promise<Object>} Suggestion object
   */
  async getLoanSuggestion(loanId) {
    // Get all payments for this loan
    const payments = await loanPaymentRepository.findByLoan(loanId);

    // No payment history (Requirement 3.3)
    if (!payments || payments.length === 0) {
      return {
        suggestedAmount: null,
        source: 'none',
        confidence: 'low',
        message: 'No payment history available'
      };
    }

    // Calculate average of previous payments (Requirement 3.2)
    const totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const averageAmount = totalAmount / payments.length;

    // Round to 2 decimal places
    const roundedAverage = Math.round(averageAmount * 100) / 100;

    // Determine confidence based on number of payments
    let confidence = 'low';
    if (payments.length >= 6) {
      confidence = 'high';
    } else if (payments.length >= 3) {
      confidence = 'medium';
    }

    return {
      suggestedAmount: roundedAverage,
      source: 'average_history',
      confidence: confidence,
      message: `Based on average of ${payments.length} previous payment${payments.length === 1 ? '' : 's'}`
    };
  }
}

module.exports = new PaymentSuggestionService();
