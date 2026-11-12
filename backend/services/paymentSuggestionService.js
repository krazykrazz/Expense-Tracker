/**
 * Payment Suggestion Service
 * 
 * Provides smart payment suggestions for loans and mortgages.
 * - For mortgages (priority order):
 *   1. Linked fixed expense amount (latest month up to the current one)
 *   2. Calculated amortization payment from interest-aware balance + rate + remaining term
 *   3. Interest-only minimum payment from balance + rate (no amortization data)
 *   4. Average of previous payments (fallback)
 * - For loans with history: Returns the average of previous payments
 * - For loans without history: Returns null
 * 
 * Requirements: 3.1, 3.2, 3.3
 */

const loanRepository = require('../repositories/loanRepository');
const loanPaymentRepository = require('../repositories/loanPaymentRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const balanceCalculationService = require('./balanceCalculationService');
const mortgageService = require('./mortgageService');
const mortgageInsightsService = require('./mortgageInsightsService');
const { periodicRate } = require('../utils/interestCalculation');
const logger = require('../config/logger');

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
      return await this.getMortgageSuggestion(loanId, loan);
    }

    // For regular loans: return average of previous payments (Requirement 3.2, 3.3)
    return await this.getLoanSuggestion(loanId);
  }

  /**
   * Get payment suggestion for a mortgage
   * Returns the linked fixed expense amount. Falls back to a calculated suggestion using the
   * interest-aware balance, rate, and remaining amortization period.
   * @param {number} mortgageId - Mortgage loan ID
   * @param {Object} loan - Loan record from DB
   * @returns {Promise<Object>} Suggestion object
   */
  async getMortgageSuggestion(mortgageId, loan) {
    // Priority 1: the linked fixed expense is the mortgage's payment
    const linkedExpense = await mortgageInsightsService.getCurrentLinkedPayment(mortgageId);
    if (linkedExpense && linkedExpense.amount > 0) {
      return {
        suggestedAmount: linkedExpense.amount,
        source: 'monthly_payment',
        confidence: 'high',
        message: 'Based on your linked fixed expense'
      };
    }

    // Priority 2: calculate from interest-aware balance + rate + amortization
    try {
      const calcResult = await balanceCalculationService.calculateBalance(mortgageId);

      if (calcResult.interestAware && calcResult.currentBalance > 0) {
        const balance = calcResult.currentBalance;

        const snapshots = await loanBalanceRepository.getBalanceHistory(mortgageId);
        let annualRate = snapshots.length > 0 ? snapshots[snapshots.length - 1].rate : null;
        if (annualRate == null && loan.fixed_interest_rate) {
          annualRate = loan.fixed_interest_rate;
        }

        if (annualRate != null && annualRate > 0) {
          const remainingMonths = mortgageService.getRemainingAmortizationMonths(loan);

          if (remainingMonths) {
            const payment = mortgageService.calculatePaymentAmount({
              balance,
              rate: annualRate,
              remainingMonths,
              paymentFrequency: 'monthly',
              rateType: loan.rate_type
            });
            const rounded = Math.round(payment * 100) / 100;

            if (isFinite(rounded) && rounded > 0) {
              return {
                suggestedAmount: rounded,
                source: 'calculated_amortization',
                confidence: 'medium',
                message: `Calculated from current balance and ${remainingMonths} months remaining`
              };
            }
          }

          // If no amortization period, suggest interest-only as a minimum
          const interestOnly = Math.round(balance * periodicRate(annualRate, 12, loan.rate_type) * 100) / 100;

          if (interestOnly > 0) {
            return {
              suggestedAmount: interestOnly,
              source: 'interest_projection',
              confidence: 'low',
              message: 'Minimum interest-only payment based on current balance and rate'
            };
          }
        }
      }
    } catch (err) {
      logger.warn('Failed to calculate mortgage payment suggestion', { mortgageId, error: err.message });
    }

    // Priority 3: fall back to average of previous payments (same as regular loans)
    return await this.getLoanSuggestion(mortgageId);
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
