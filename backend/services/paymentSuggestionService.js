/**
 * Payment Suggestion Service
 * 
 * Provides smart payment suggestions for loans and mortgages.
 * - For mortgages (priority order):
 *   1. Configured monthly payment from mortgage_payments table
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
const mortgagePaymentService = require('./mortgagePaymentService');
const balanceCalculationService = require('./balanceCalculationService');
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
   * Returns the configured monthly payment amount from mortgage_payments table.
   * Falls back to a calculated suggestion using the interest-aware balance,
   * rate, and remaining amortization period when no configured payment exists.
   * @param {number} mortgageId - Mortgage loan ID
   * @param {Object} loan - Loan record from DB
   * @returns {Promise<Object>} Suggestion object
   */
  async getMortgageSuggestion(mortgageId, loan) {
    // Priority 1: configured monthly payment from mortgage_payments table
    const currentPayment = await mortgagePaymentService.getCurrentPayment(mortgageId);

    if (currentPayment && currentPayment.payment_amount > 0) {
      return {
        suggestedAmount: currentPayment.payment_amount,
        source: 'monthly_payment',
        confidence: 'high',
        message: 'Based on your configured monthly payment'
      };
    }

    // Priority 2: calculate from interest-aware balance + rate + amortization
    try {
      const calcResult = await balanceCalculationService.calculateBalance(mortgageId);

      if (calcResult.interestAware && calcResult.currentBalance > 0) {
        const balance = calcResult.currentBalance;

        // Resolve the current rate
        let annualRate = null;
        if (loan.fixed_interest_rate) {
          annualRate = loan.fixed_interest_rate;
        }
        // If no fixed rate, try to get from the latest snapshot via calcResult
        if (annualRate == null) {
          const snapshots = await loanBalanceRepository.getBalanceHistory(mortgageId);
          if (snapshots.length > 0) {
            annualRate = snapshots[snapshots.length - 1].rate;
          }
        }

        if (annualRate != null && annualRate > 0) {
          // Determine remaining months
          let remainingMonths = null;
          if (loan.amortization_period) {
            // amortization_period is in months; subtract elapsed months
            const startDate = loan.start_date ? new Date(loan.start_date) : null;
            if (startDate) {
              const now = new Date();
              const elapsedMonths = (now.getFullYear() - startDate.getFullYear()) * 12
                + (now.getMonth() - startDate.getMonth());
              remainingMonths = Math.max(1, loan.amortization_period - elapsedMonths);
            } else {
              remainingMonths = loan.amortization_period;
            }
          }

          if (remainingMonths && remainingMonths > 0) {
            // Standard amortization formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
            const monthlyRate = (annualRate / 100) / 12;
            const factor = Math.pow(1 + monthlyRate, remainingMonths);
            const payment = balance * (monthlyRate * factor) / (factor - 1);
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
          const monthlyRate = (annualRate / 100) / 12;
          const interestOnly = Math.round(balance * monthlyRate * 100) / 100;

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
