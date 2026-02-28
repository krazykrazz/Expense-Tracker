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
const { calculateMonthlyInterest } = require('../utils/interestCalculation');
const logger = require('../config/logger');

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
  async calculateBalance(loanId, options = {}) {
    // Get the loan to retrieve initial_balance
    const loan = await loanRepository.findById(loanId);
    
    if (!loan) {
      throw new Error('Loan not found');
    }

    // Dispatch to interest-aware engine for mortgages
    if (loan.loan_type === 'mortgage') {
      return this.calculateMortgageBalance(loan, options);
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
   * Resolve the effective interest rate at a given year/month.
   * Finds the most recent loan_balances entry on or before the target month
   * that has a non-null rate.
   * 
   * @param {Array} snapshots - Balance snapshots sorted chronologically
   * @param {number} year - Target year
   * @param {number} month - Target month
   * @returns {number|null} Annual interest rate or null if unavailable
   * 
   * Requirements: 1.3
   */
  resolveRateAtDate(snapshots, year, month) {
    let resolved = null;
    for (const snapshot of snapshots) {
      if (snapshot.rate == null) continue;
      if (snapshot.year < year || (snapshot.year === year && snapshot.month <= month)) {
        resolved = snapshot.rate;
      }
    }
    return resolved;
  }

  /**
   * Calculate mortgage balance using interest accrual engine.
   *
   * Walks forward month-by-month from an anchor point, adding monthly interest
   * and subtracting payments in each month. Uses balance snapshots for anchor
   * and rate resolution.
   *
   * @param {Object} loan - Full loan object (already fetched)
   * @returns {Promise<Object>} { currentBalance, totalInterestAccrued, anchorBased, interestAware, loanId, initialBalance, totalPayments, calculatedBalance, actualBalance, paymentCount, lastPaymentDate, hasDiscrepancy }
   *
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 9.2, 9.4
   */
  async calculateMortgageBalance(loan, options = {}) {
    // Get snapshots chronologically (ASC) and payments chronologically
    const snapshots = await loanBalanceRepository.getBalanceHistory(loan.id);
    const paymentsDesc = await loanPaymentRepository.findByLoanOrdered(loan.id);
    const payments = [...paymentsDesc].reverse(); // chronological order

    // Gather reporting data
    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
    const paymentCount = payments.length;
    const lastPaymentDate = payments.length > 0 ? payments[payments.length - 1].payment_date : null;
    const calculatedBalance = Math.max(0, loan.initial_balance - totalPayments);
    const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    const actualBalance = latestSnapshot ? latestSnapshot.remaining_balance : null;

    // Determine anchor: most recent snapshot or initial_balance at start_date
    let anchorBalance;
    let anchorYear;
    let anchorMonth;
    let anchorBased = false;

    if (latestSnapshot) {
      anchorBalance = latestSnapshot.remaining_balance;
      anchorYear = latestSnapshot.year;
      anchorMonth = latestSnapshot.month;
      anchorBased = true;
    } else {
      anchorBalance = loan.initial_balance;
      // Parse start_date (YYYY-MM-DD format)
      if (loan.start_date) {
        const parts = loan.start_date.split('-');
        anchorYear = parseInt(parts[0], 10);
        anchorMonth = parseInt(parts[1], 10);
      } else {
        // No start_date available, use current date as fallback
        const now = new Date();
        anchorYear = now.getFullYear();
        anchorMonth = now.getMonth() + 1;
      }
    }

    // Resolve interest rate at anchor point
    let rate = this.resolveRateAtDate(snapshots, anchorYear, anchorMonth);

    // If no rate from snapshots, check loan's fixed_interest_rate
    if (rate == null && loan.fixed_interest_rate) {
      rate = loan.fixed_interest_rate;
    }

    // If still no rate, fall back to naive calculation (interestAware: false)
    if (rate == null) {
      logger.debug('No interest rate available for mortgage, falling back to naive calculation', { loanId: loan.id });
      const hasDiscrepancy = actualBalance !== null &&
                            Math.abs(actualBalance - calculatedBalance) > 0.01;
      return {
        loanId: loan.id,
        initialBalance: loan.initial_balance,
        totalPayments,
        currentBalance: anchorBased
          ? Math.max(0, anchorBalance - payments
              .filter(p => {
                const d = p.payment_date.split('-');
                const py = parseInt(d[0], 10);
                const pm = parseInt(d[1], 10);
                return py > anchorYear || (py === anchorYear && pm > anchorMonth);
              })
              .reduce((s, p) => s + p.amount, 0))
          : calculatedBalance,
        calculatedBalance,
        actualBalance,
        paymentCount,
        lastPaymentDate,
        hasDiscrepancy,
        anchorBased,
        totalInterestAccrued: 0,
        interestAware: false
      };
    }

    // Walk forward month-by-month from anchor to target date (or current date)
    let targetYear, targetMonth;
    if (options.targetDate) {
      const parts = options.targetDate.split('-');
      targetYear = parseInt(parts[0], 10);
      targetMonth = parseInt(parts[1], 10);
    } else {
      const now = new Date();
      targetYear = now.getFullYear();
      targetMonth = now.getMonth() + 1;
    }

    const currentYear = targetYear;
    const currentMonth = targetMonth;

    let balance = anchorBalance;
    let totalInterestAccrued = 0;
    let walkYear = anchorYear;
    let walkMonth = anchorMonth;

    // Build a map of payments by year-month for quick lookup
    const paymentsByMonth = {};
    for (const payment of payments) {
      const parts = payment.payment_date.split('-');
      const py = parseInt(parts[0], 10);
      const pm = parseInt(parts[1], 10);
      const key = `${py}-${pm}`;
      if (!paymentsByMonth[key]) {
        paymentsByMonth[key] = [];
      }
      paymentsByMonth[key].push(payment);
    }

    // Build a map of snapshots by year-month for rate updates
    const snapshotsByMonth = {};
    for (const snap of snapshots) {
      const key = `${snap.year}-${snap.month}`;
      snapshotsByMonth[key] = snap;
    }

    // Advance one month at a time
    // Start from the month AFTER the anchor (anchor month is the starting point)
    walkMonth++;
    if (walkMonth > 12) {
      walkMonth = 1;
      walkYear++;
    }

    while (walkYear < currentYear || (walkYear === currentYear && walkMonth <= currentMonth)) {
      // Check if a snapshot in this month provides a new rate
      const monthKey = `${walkYear}-${walkMonth}`;
      const snap = snapshotsByMonth[monthKey];
      if (snap && snap.rate != null) {
        rate = snap.rate;
      }

      // Accrue monthly interest
      const monthlyInterest = calculateMonthlyInterest(balance, rate);
      balance += monthlyInterest;
      totalInterestAccrued += monthlyInterest;

      // Subtract payments in this month
      const monthPayments = paymentsByMonth[monthKey];
      if (monthPayments) {
        for (const p of monthPayments) {
          balance -= p.amount;
        }
      }

      // Clamp balance >= 0
      balance = Math.max(0, balance);

      // Advance to next month
      walkMonth++;
      if (walkMonth > 12) {
        walkMonth = 1;
        walkYear++;
      }
    }

    // Also subtract any payments in the anchor month that are after the anchor
    // (if anchor is a snapshot, payments in that same month should already be accounted for
    //  by the snapshot balance, so we only subtract payments in months AFTER the anchor)
    // Note: payments in the anchor month are NOT subtracted because the anchor balance
    // already reflects the state at that month.

    // Round to 2 decimal places
    balance = Math.round(balance * 100) / 100;
    totalInterestAccrued = Math.round(totalInterestAccrued * 100) / 100;

    const hasDiscrepancy = actualBalance !== null &&
                          Math.abs(actualBalance - calculatedBalance) > 0.01;

    return {
      loanId: loan.id,
      initialBalance: loan.initial_balance,
      totalPayments,
      currentBalance: balance,
      calculatedBalance,
      actualBalance,
      paymentCount,
      lastPaymentDate,
      hasDiscrepancy,
      anchorBased,
      totalInterestAccrued,
      interestAware: true
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
  /**
   * Get balance history with running totals.
   * 
   * For mortgages: walks payments chronologically, accruing interest between
   * each payment to compute accurate running balances with interestAccrued
   * and principalPaid per entry.
   * 
   * For non-mortgages: returns payments with naive running balance
   * (initial_balance minus cumulative payments).
   * 
   * @param {number} loanId - Loan ID
   * @returns {Promise<Array>} Array of { id, date, payment, notes, runningBalance, interestAccrued?, principalPaid? }
   * @throws {Error} If loan not found
   * 
   * Requirements: 4.1, 4.2, 4.3, 4.4
   */
  async getBalanceHistory(loanId) {
    const loan = await loanRepository.findById(loanId);

    if (!loan) {
      throw new Error('Loan not found');
    }

    // Get all payments ordered by payment_date (reverse chronological)
    const payments = await loanPaymentRepository.findByLoanOrdered(loanId);

    // Reverse to get chronological order for running balance calculation
    const chronologicalPayments = [...payments].reverse();

    // For mortgages, use interest-aware calculation
    if (loan.loan_type === 'mortgage') {
      return this._getMortgageBalanceHistory(loan, chronologicalPayments);
    }

    // Non-mortgage: existing naive subtraction logic
    let runningBalance = loan.initial_balance;
    const history = chronologicalPayments.map(payment => {
      runningBalance = runningBalance - payment.amount;
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

  /**
   * Compute interest-aware balance history for a mortgage.
   * 
   * Walks payments chronologically from the anchor point, accruing interest
   * month-by-month and subtracting payments. Returns interestAccrued and
   * principalPaid per entry.
   * 
   * @param {Object} loan - Full loan object
   * @param {Array} chronologicalPayments - Payments sorted oldest-first
   * @returns {Promise<Array>} History entries with interestAccrued and principalPaid
   * @private
   */
  async _getMortgageBalanceHistory(loan, chronologicalPayments) {
    const snapshots = await loanBalanceRepository.getBalanceHistory(loan.id);

    // Determine anchor (same logic as calculateMortgageBalance)
    let anchorBalance;
    let anchorYear;
    let anchorMonth;

    const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

    if (latestSnapshot) {
      anchorBalance = latestSnapshot.remaining_balance;
      anchorYear = latestSnapshot.year;
      anchorMonth = latestSnapshot.month;
    } else {
      anchorBalance = loan.initial_balance;
      if (loan.start_date) {
        const parts = loan.start_date.split('-');
        anchorYear = parseInt(parts[0], 10);
        anchorMonth = parseInt(parts[1], 10);
      } else {
        const now = new Date();
        anchorYear = now.getFullYear();
        anchorMonth = now.getMonth() + 1;
      }
    }

    // Resolve rate at anchor
    let rate = this.resolveRateAtDate(snapshots, anchorYear, anchorMonth);
    if (rate == null && loan.fixed_interest_rate) {
      rate = loan.fixed_interest_rate;
    }

    // If no rate available, fall back to naive calculation with zero interest
    if (rate == null) {
      logger.debug('No interest rate for mortgage balance history, using naive calculation', { loanId: loan.id });
      let runningBalance = loan.initial_balance;
      const history = chronologicalPayments.map(payment => {
        runningBalance = runningBalance - payment.amount;
        return {
          id: payment.id,
          date: payment.payment_date,
          payment: payment.amount,
          notes: payment.notes,
          runningBalance: Math.max(0, runningBalance),
          interestAccrued: 0,
          principalPaid: payment.amount
        };
      });
      return history.reverse();
    }

    // Build snapshot map for rate updates
    const snapshotsByMonth = {};
    for (const snap of snapshots) {
      snapshotsByMonth[`${snap.year}-${snap.month}`] = snap;
    }

    // Group payments by year-month
    const paymentsByMonth = {};
    for (const payment of chronologicalPayments) {
      const parts = payment.payment_date.split('-');
      const key = `${parseInt(parts[0], 10)}-${parseInt(parts[1], 10)}`;
      if (!paymentsByMonth[key]) {
        paymentsByMonth[key] = [];
      }
      paymentsByMonth[key].push(payment);
    }

    // Find the last payment month to know when to stop walking
    let endYear = anchorYear;
    let endMonth = anchorMonth;
    if (chronologicalPayments.length > 0) {
      const lastPmt = chronologicalPayments[chronologicalPayments.length - 1];
      const parts = lastPmt.payment_date.split('-');
      endYear = parseInt(parts[0], 10);
      endMonth = parseInt(parts[1], 10);
    }

    // Walk month-by-month from anchor, building history entries in a single pass
    let balance = anchorBalance;
    let walkYear = anchorYear;
    let walkMonth = anchorMonth;

    // Advance past anchor month
    walkMonth++;
    if (walkMonth > 12) {
      walkMonth = 1;
      walkYear++;
    }

    const history = [];

    while (walkYear < endYear || (walkYear === endYear && walkMonth <= endMonth)) {
      const monthKey = `${walkYear}-${walkMonth}`;

      // Check for rate update from snapshot
      const snap = snapshotsByMonth[monthKey];
      if (snap && snap.rate != null) {
        rate = snap.rate;
      }

      // Accrue monthly interest
      const monthlyInterest = calculateMonthlyInterest(balance, rate);
      balance += monthlyInterest;

      // Process payments in this month
      const monthPayments = paymentsByMonth[monthKey];
      if (monthPayments) {
        for (const payment of monthPayments) {
          const interestAccrued = Math.round(monthlyInterest * 100) / 100;
          const principalPaid = Math.round(Math.max(0, payment.amount - interestAccrued) * 100) / 100;

          balance -= payment.amount;
          balance = Math.max(0, balance);

          history.push({
            id: payment.id,
            date: payment.payment_date,
            payment: payment.amount,
            notes: payment.notes,
            runningBalance: Math.round(balance * 100) / 100,
            interestAccrued,
            principalPaid
          });
        }
      }

      // Advance to next month
      walkMonth++;
      if (walkMonth > 12) {
        walkMonth = 1;
        walkYear++;
      }
    }

    // Return in reverse chronological order (newest first)
    return history.reverse();
  }
}

module.exports = new BalanceCalculationService();
