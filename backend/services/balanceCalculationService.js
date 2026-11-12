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

const roundCents = (value) => Math.round(value * 100) / 100;
const monthIndex = (year, month) => year * 12 + (month - 1);
const dateIndex = (isoDate) => {
  const [year, month] = isoDate.split('-').map(Number);
  return monthIndex(year, month);
};
const currentIndex = () => {
  const now = new Date();
  return monthIndex(now.getFullYear(), now.getMonth() + 1);
};
const indexToYearMonth = (index) => ({ year: Math.floor(index / 12), month: (index % 12) + 1 });

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
   * Prepare the inputs shared by every mortgage walk.
   * @param {Object} loan - Loan record
   * @returns {Promise<Object>} { snapshots, payments, snapshotByIndex, paymentsByIndex, rateChangeIndexes, startIndex, rateType }
   * @private
   */
  async _loadMortgageData(loan) {
    const snapshots = await loanBalanceRepository.getBalanceHistory(loan.id);
    const paymentsDesc = await loanPaymentRepository.findByLoanOrdered(loan.id);
    const payments = [...paymentsDesc].reverse();

    const snapshotByIndex = new Map();
    // Months whose snapshot rate differs from the snapshot before it: a recorded rate change
    const rateChangeIndexes = new Set();
    let previousRate = null;
    for (const snap of snapshots) {
      const index = monthIndex(snap.year, snap.month);
      snapshotByIndex.set(index, snap);
      if (previousRate !== null && snap.rate !== previousRate) {
        rateChangeIndexes.add(index);
      }
      previousRate = snap.rate;
    }

    const paymentsByIndex = new Map();
    for (const payment of payments) {
      const index = dateIndex(payment.payment_date);
      if (!paymentsByIndex.has(index)) paymentsByIndex.set(index, []);
      paymentsByIndex.get(index).push(payment);
    }

    const startIndex = loan.start_date ? dateIndex(loan.start_date) : currentIndex();

    return {
      snapshots,
      payments,
      snapshotByIndex,
      paymentsByIndex,
      rateChangeIndexes,
      startIndex,
      rateType: loan.rate_type || null
    };
  }

  /**
   * Rate in effect at a month when no snapshot gives one: the latest earlier snapshot rate,
   * then the earliest snapshot rate, then the loan's fixed rate.
   * @private
   */
  _fallbackRate(loan, snapshots, index) {
    let rate = null;
    for (const snap of snapshots) {
      if (monthIndex(snap.year, snap.month) <= index) rate = snap.rate;
    }
    if (rate == null && snapshots.length > 0) rate = snapshots[0].rate;
    if (rate == null && loan.fixed_interest_rate) rate = loan.fixed_interest_rate;
    return rate;
  }

  /**
   * Calculate mortgage balance using interest accrual engine.
   *
   * Anchors on the latest snapshot on or before the target month (or initial_balance at
   * start_date), then walks forward month by month: add the month's interest, subtract
   * the month's payments. Payments in the anchor month are already reflected in the anchor.
   *
   * @param {Object} loan - Full loan object (already fetched)
   * @param {Object} [options] - { targetDate: 'YYYY-MM-DD' } (defaults to today)
   * @returns {Promise<Object>} { currentBalance, totalInterestAccrued, anchorBased, interestAware, loanId, initialBalance, totalPayments, calculatedBalance, actualBalance, paymentCount, lastPaymentDate, hasDiscrepancy }
   */
  async calculateMortgageBalance(loan, options = {}) {
    const data = await this._loadMortgageData(loan);
    const { snapshots, payments, paymentsByIndex } = data;

    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
    const paymentCount = payments.length;
    const lastPaymentDate = payments.length > 0 ? payments[payments.length - 1].payment_date : null;
    const calculatedBalance = Math.max(0, loan.initial_balance - totalPayments);
    const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    const actualBalance = latestSnapshot ? latestSnapshot.remaining_balance : null;
    const hasDiscrepancy = actualBalance !== null && Math.abs(actualBalance - calculatedBalance) > 0.01;

    const targetIndex = options.targetDate ? dateIndex(options.targetDate) : currentIndex();

    let anchor = null;
    for (const snap of snapshots) {
      if (monthIndex(snap.year, snap.month) <= targetIndex) anchor = snap;
    }
    const anchorBased = anchor !== null;
    const anchorIndex = anchorBased ? monthIndex(anchor.year, anchor.month) : data.startIndex;
    let balance = anchorBased ? anchor.remaining_balance : loan.initial_balance;
    let rate = anchorBased ? anchor.rate : this._fallbackRate(loan, snapshots, anchorIndex);
    const interestAware = rate != null;

    let totalInterestAccrued = 0;
    for (let i = anchorIndex + 1; i <= targetIndex; i++) {
      const interest = interestAware ? calculateMonthlyInterest(balance, rate, data.rateType) : 0;
      const paid = (paymentsByIndex.get(i) || []).reduce((sum, p) => sum + p.amount, 0);
      totalInterestAccrued += interest;
      balance = Math.max(0, balance + interest - paid);
    }

    return {
      loanId: loan.id,
      initialBalance: loan.initial_balance,
      totalPayments,
      // Without a rate or anchor every payment simply reduces the initial balance
      currentBalance: !interestAware && !anchorBased ? calculatedBalance : roundCents(balance),
      calculatedBalance,
      actualBalance,
      paymentCount,
      lastPaymentDate,
      hasDiscrepancy,
      anchorBased,
      totalInterestAccrued: roundCents(totalInterestAccrued),
      interestAware
    };
  }

  /**
   * Rebuild the generated ('auto') monthly snapshots of a mortgage from a month onward.
   *
   * Starts from the snapshot before `fromDate`'s month (or initial_balance at start_date)
   * and walks to the later of the current month and the last payment month. Each month
   * accrues interest at the rate in effect and subtracts that month's payments.
   * User-entered ('manual') snapshots are kept and re-anchor the walk. Recorded rate
   * changes are kept. Auto snapshots past the end of the walk are removed.
   *
   * Call after any change to a mortgage's payments, rate or balance snapshots.
   * @param {Object|number} loanOrId - Loan record or ID (no-op for non-mortgages)
   * @param {string} fromDate - First affected date (YYYY-MM-DD); only its month matters
   * @returns {Promise<number|null>} Balance at the end of the walk, or null when skipped
   */
  async recomputeMortgageSnapshots(loanOrId, fromDate) {
    const loan = typeof loanOrId === 'object' ? loanOrId : await loanRepository.findById(loanOrId);
    if (!loan || loan.loan_type !== 'mortgage') {
      return null;
    }

    const data = await this._loadMortgageData(loan);
    const { snapshots, snapshotByIndex, paymentsByIndex, rateChangeIndexes, startIndex } = data;

    const fromIndex = Math.max(dateIndex(fromDate), startIndex);
    let base = null;
    for (const snap of snapshots) {
      if (monthIndex(snap.year, snap.month) < fromIndex) base = snap;
    }

    let balance;
    let rate;
    let begin;
    if (base) {
      balance = base.remaining_balance;
      rate = base.rate;
      // Walk every month after the base snapshot so months without one still accrue interest
      begin = monthIndex(base.year, base.month) + 1;
    } else {
      balance = loan.initial_balance;
      rate = this._fallbackRate(loan, snapshots, startIndex) ?? 0;
      // The start month's own snapshot (if any) anchors it; otherwise initial_balance does
      begin = snapshotByIndex.has(startIndex) ? startIndex : startIndex + 1;
    }

    const lastPaymentIndex = Math.max(-Infinity, ...paymentsByIndex.keys());
    const endIndex = Math.max(currentIndex(), lastPaymentIndex, begin - 1);

    for (let i = begin; i <= endIndex; i++) {
      const snap = snapshotByIndex.get(i);
      if (snap && snap.source !== 'auto') {
        balance = snap.remaining_balance;
        rate = snap.rate;
        continue;
      }
      if (snap && rateChangeIndexes.has(i)) {
        rate = snap.rate;
      }
      const interest = calculateMonthlyInterest(balance, rate, data.rateType);
      const paid = (paymentsByIndex.get(i) || []).reduce((sum, p) => sum + p.amount, 0);
      balance = roundCents(Math.max(0, balance + interest - paid));

      const { year, month } = indexToYearMonth(i);
      await loanBalanceRepository.upsertAuto({ loan_id: loan.id, year, month, remaining_balance: balance, rate });
    }

    const end = indexToYearMonth(endIndex);
    await loanBalanceRepository.deleteAutoAfter(loan.id, end.year, end.month);

    logger.debug('Recomputed mortgage snapshots', { loanId: loan.id, fromDate, balance });
    return balance;
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
      return this._getMortgageBalanceHistory(loan);
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
   * Walks every month from the start: a month's closing balance is its snapshot when one
   * exists (snapshots are authoritative), otherwise opening balance + interest − payments.
   * The month's interest is (closing − opening + payments); earlier payments in the month
   * absorb it first. The last payment of a month lands on the month's closing balance.
   *
   * @param {Object} loan - Full loan object
   * @returns {Promise<Array>} History entries (newest first) with interestAccrued and principalPaid
   * @private
   */
  async _getMortgageBalanceHistory(loan) {
    const data = await this._loadMortgageData(loan);
    const { snapshots, payments, snapshotByIndex, paymentsByIndex, startIndex } = data;
    if (payments.length === 0) {
      return [];
    }

    const startSnapshot = snapshotByIndex.get(startIndex);
    let balance = startSnapshot ? startSnapshot.remaining_balance : loan.initial_balance;
    let rate = startSnapshot ? startSnapshot.rate : this._fallbackRate(loan, snapshots, startIndex);

    const history = [];
    const entry = (payment, runningBalance, interestAccrued, principalPaid) => ({
      id: payment.id,
      date: payment.payment_date,
      payment: payment.amount,
      notes: payment.notes,
      runningBalance: roundCents(Math.max(0, runningBalance)),
      interestAccrued: roundCents(interestAccrued),
      principalPaid: roundCents(principalPaid)
    });

    // Payments on or before the start month are already reflected in the opening balance
    for (const payment of payments) {
      if (dateIndex(payment.payment_date) <= startIndex) {
        history.push(entry(payment, balance, 0, payment.amount));
      }
    }

    const lastIndex = dateIndex(payments[payments.length - 1].payment_date);
    for (let i = startIndex + 1; i <= lastIndex; i++) {
      const snap = snapshotByIndex.get(i);
      if (snap) rate = snap.rate;
      const monthPayments = paymentsByIndex.get(i) || [];
      const paid = monthPayments.reduce((sum, p) => sum + p.amount, 0);

      let closing;
      let interest;
      if (snap) {
        closing = snap.remaining_balance;
        interest = closing - balance + paid;
      } else {
        interest = rate != null ? calculateMonthlyInterest(balance, rate, data.rateType) : 0;
        closing = Math.max(0, balance + interest - paid);
      }

      let running = balance + interest;
      let interestLeft = Math.max(0, interest);
      monthPayments.forEach((payment, idx) => {
        const absorbed = Math.min(interestLeft, payment.amount);
        interestLeft -= absorbed;
        running -= payment.amount;
        const after = idx === monthPayments.length - 1 ? closing : running;
        history.push(entry(payment, after, absorbed, payment.amount - absorbed));
      });

      balance = closing;
    }

    // Newest first for display
    return history.reverse();
  }
}

module.exports = new BalanceCalculationService();
