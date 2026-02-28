/**
 * Balance Calculation Service
 * 
 * Computes current loan balance from initial_balance minus sum of payments.
 * Provides balance history with running totals for payment tracking.
 * 
 * Requirements: 2.1, 2.2, 2.4
 */

const loanPaymentRepository = require('../repositories/loanPaymentRepository');
const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');

class BalanceCalculationService {
  /**
   * Calculate current balance for a loan
   * Formula: max(0, initial_balance - sum(all_payment_amounts))
   * 
   * For historical loans where payment tracking started later, the calculated
   * balance may differ from the actual balance in balance history. In this case,
   * we return both values so the UI can show the discrepancy.
   * 
   * @param {number} loanId - Loan ID
   * @returns {Promise<Object>} { loanId, initialBalance, totalPayments, currentBalance, calculatedBalance, actualBalance, paymentCount, lastPaymentDate, hasDiscrepancy }
   * @throws {Error} If loan not found
   * 
   * Requirements: 2.1, 2.2, 2.4
   */
  async calculateBalance(loanId) {
    // Get the loan to retrieve initial_balance
    const loan = await loanRepository.findById(loanId);
    
    if (!loan) {
      throw new Error('Loan not found');
    }
    
    // Get total payments and payment count
    const totalPayments = await loanPaymentRepository.getTotalPayments(loanId);
    const paymentCount = await loanPaymentRepository.getPaymentCount(loanId);
    
    // Get the last payment date
    const lastPayment = await loanPaymentRepository.getLastPayment(loanId);
    const lastPaymentDate = lastPayment ? lastPayment.payment_date : null;
    
    // Calculate balance from payments: initial_balance - sum(payments), clamped to 0
    const calculatedBalance = Math.max(0, loan.initial_balance - totalPayments);
    
    // Get the actual balance from balance history (most recent entry)
    const balanceHistory = await loanBalanceRepository.findByLoan(loanId);
    const actualBalance = balanceHistory.length > 0 
      ? balanceHistory[0].remaining_balance  // Most recent entry (sorted DESC)
      : null;
    
    // Determine which balance to use as "current"
    // Always use calculatedBalance (initial_balance - totalPayments) as the source of truth,
    // since it correctly reflects all logged payments. The actualBalance from loan_balances
    // is a manual snapshot that doesn't account for payments in the loan_payments table.
    const currentBalance = calculatedBalance;
    
    // Check if there's a discrepancy between calculated and actual
    // A discrepancy indicates the loan had payments before tracking started
    const hasDiscrepancy = actualBalance !== null && 
                          Math.abs(actualBalance - calculatedBalance) > 0.01;
    
    return {
      loanId: loanId,
      initialBalance: loan.initial_balance,
      totalPayments: totalPayments,
      currentBalance: currentBalance,
      calculatedBalance: calculatedBalance,
      actualBalance: actualBalance,
      paymentCount: paymentCount,
      lastPaymentDate: lastPaymentDate,
      hasDiscrepancy: hasDiscrepancy
    };
  }

  /**
   * Get balance history with running totals
   * Returns payments in chronological order with running balance after each payment
   * 
   * @param {number} loanId - Loan ID
   * @returns {Promise<Array>} Array of { id, date, payment, notes, runningBalance }
   * @throws {Error} If loan not found
   * 
   * Requirements: 2.1, 2.2, 2.4
   */
  async getBalanceHistory(loanId) {
    // Get the loan to retrieve initial_balance
    const loan = await loanRepository.findById(loanId);
    
    if (!loan) {
      throw new Error('Loan not found');
    }
    
    // Get all payments ordered by payment_date (reverse chronological)
    const payments = await loanPaymentRepository.findByLoanOrdered(loanId);
    
    // Reverse to get chronological order for running balance calculation
    const chronologicalPayments = [...payments].reverse();
    
    // Calculate running balance for each payment
    let runningBalance = loan.initial_balance;
    const history = chronologicalPayments.map(payment => {
      runningBalance = runningBalance - payment.amount;
      // Clamp to 0 if negative
      const clampedBalance = Math.max(0, runningBalance);
      
      return {
        id: payment.id,
        date: payment.payment_date,
        payment: payment.amount,
        notes: payment.notes,
        runningBalance: clampedBalance
      };
    });
    
    // Return in reverse chronological order (newest first) for display
    return history.reverse();
  }
}

module.exports = new BalanceCalculationService();
