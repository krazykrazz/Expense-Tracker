/**
 * Balance Calculation Service
 * 
 * Computes current loan balance using an anchor-based approach:
 * - If balance history exists, uses the most recent snapshot as an anchor
 *   and subtracts only payments made after that snapshot month.
 * - If no balance history exists, falls back to initial_balance - all payments.
 * 
 * This handles both pre-existing loans (where tracking started mid-life with
 * migrated payments) and fresh loans (where all payments are tracked from the start).
 * 
 * Requirements: 2.1, 2.2, 2.4
 */

const loanPaymentRepository = require('../repositories/loanPaymentRepository');
const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');

class BalanceCalculationService {
  /**
   * Calculate current balance for a loan using anchor-based approach.
   * 
   * Strategy:
   * 1. If loan_balances has entries, use the most recent snapshot as anchor:
   *    currentBalance = max(0, snapshot_balance - sum(payments after snapshot month))
   * 2. If no loan_balances entries, fall back to:
   *    currentBalance = max(0, initial_balance - sum(all payments))
   * 
   * This correctly handles:
   * - Pre-existing loans with migrated payments (snapshot anchors the balance)
   * - Fresh loans with complete payment history (no snapshot, uses initial_balance)
   * - New payments logged after the latest snapshot (subtracted from anchor)
   * 
   * @param {number} loanId - Loan ID
   * @returns {Promise<Object>} { loanId, initialBalance, totalPayments, currentBalance, calculatedBalance, actualBalance, paymentCount, lastPaymentDate, hasDiscrepancy, anchorBased }
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
    
    // Get total payments and payment count (for reporting purposes)
    const totalPayments = await loanPaymentRepository.getTotalPayments(loanId);
    const paymentCount = await loanPaymentRepository.getPaymentCount(loanId);
    
    // Get the last payment date
    const lastPayment = await loanPaymentRepository.getLastPayment(loanId);
    const lastPaymentDate = lastPayment ? lastPayment.payment_date : null;
    
    // Calculate the naive balance from all payments
    const calculatedBalance = Math.max(0, loan.initial_balance - totalPayments);
    
    // Get the actual balance from balance history (most recent entry)
    const balanceHistory = await loanBalanceRepository.findByLoan(loanId);
    const latestSnapshot = balanceHistory.length > 0 ? balanceHistory[0] : null;
    const actualBalance = latestSnapshot ? latestSnapshot.remaining_balance : null;
    
    // Determine current balance using anchor-based approach
    let currentBalance;
    let anchorBased = false;
    
    if (latestSnapshot) {
      // Anchor-based: use snapshot balance minus payments after the snapshot month
      const paymentsAfterSnapshot = await loanPaymentRepository.getTotalPaymentsAfterMonth(
        loanId, latestSnapshot.year, latestSnapshot.month
      );
      currentBalance = Math.max(0, latestSnapshot.remaining_balance - paymentsAfterSnapshot);
      anchorBased = true;
    } else {
      // No snapshot: fall back to initial_balance - all payments
      currentBalance = calculatedBalance;
    }
    
    // Check if there's a discrepancy between the naive calculation and anchor-based
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
      hasDiscrepancy: hasDiscrepancy,
      anchorBased: anchorBased
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
