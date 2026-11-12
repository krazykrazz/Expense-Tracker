const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const loanRepository = require('../repositories/loanRepository');
const loanPaymentRepository = require('../repositories/loanPaymentRepository');
const activityLogService = require('./activityLogService');
const balanceCalculationService = require('./balanceCalculationService');
const { validateNumber, validateYearMonth } = require('../utils/validators');
const logger = require('../config/logger');

const monthStart = (year, month) => `${year}-${String(month).padStart(2, '0')}-01`;
const nextMonthStart = (year, month) => (month === 12 ? monthStart(year + 1, 1) : monthStart(year, month + 1));

class LoanBalanceService {
  /**
   * Rebuild a mortgage's generated snapshots after its balance history changed.
   * No-op for other loan types; failures are logged, never thrown.
   * @param {number} loanId - Loan ID
   * @param {string} fromDate - First affected date (YYYY-MM-DD)
   * @returns {Promise<void>}
   */
  async recomputeMortgage(loanId, fromDate) {
    try {
      await balanceCalculationService.recomputeMortgageSnapshots(loanId, fromDate);
    } catch (err) {
      logger.warn('Failed to recompute mortgage balances after snapshot change', { loanId, error: err.message });
    }
  }

  /**
   * Validate balance entry data
   * @param {Object} entry - Balance entry data to validate
   * @throws {Error} If validation fails
   */
  validateBalanceEntry(entry) {
    // Validate loan_id
    validateNumber(entry.loan_id, 'Loan ID');

    // Validate year and month
    validateYearMonth(entry.year, entry.month);

    // Validate remaining balance
    validateNumber(entry.remaining_balance, 'Remaining balance', { min: 0 });

    // Validate interest rate
    validateNumber(entry.rate, 'Interest rate', { min: 0, max: 100 });
  }

  /**
   * Create or update a balance entry (upsert)
   * @param {Object} data - Balance entry data
   * @returns {Promise<Object>} Created or updated balance entry
   */
  async createOrUpdateBalance(data) {
    this.validateBalanceEntry(data);
    
    const balanceData = {
      loan_id: data.loan_id,
      year: data.year,
      month: data.month,
      remaining_balance: data.remaining_balance,
      rate: data.rate
    };

    const result = await loanBalanceRepository.upsert(balanceData);
    
    // Activity logging (fire-and-forget)
    try {
      const loan = await loanRepository.findById(data.loan_id);
      const loanName = loan ? loan.name : 'Unknown';
      activityLogService.logEvent(
        'loan_balance_updated',
        'loan_balance',
        result.id,
        `Updated loan balance for ${loanName} (${data.year}-${String(data.month).padStart(2, '0')}) to $${data.remaining_balance.toFixed(2)}`,
        { loanId: data.loan_id, year: data.year, month: data.month, remaining_balance: data.remaining_balance, rate: data.rate, loanName }
      );
    } catch (e) {
      // Fire-and-forget - don't block the operation
    }

    // Auto-mark loan as paid off if balance reaches zero
    if (data.remaining_balance === 0) {
      await this.autoMarkPaidOff(data.loan_id, 0);
    }
    
    // Recalculate estimated months left
    await this.recalculateEstimatedMonths(data.loan_id);

    // A user-entered mortgage balance anchors the months after it
    await this.recomputeMortgage(data.loan_id, nextMonthStart(data.year, data.month));
    
    return result;
  }

  /**
   * Update an existing balance entry
   * @param {number} id - Balance entry ID
   * @param {Object} data - Updated balance entry data
   * @returns {Promise<Object|null>} Updated balance entry or null if not found
   */
  async updateBalance(id, data) {
    this.validateBalanceEntry(data);
    const previous = await loanBalanceRepository.findById(id);
    
    const balanceData = {
      year: data.year,
      month: data.month,
      remaining_balance: data.remaining_balance,
      rate: data.rate
    };

    const result = await loanBalanceRepository.update(id, balanceData);
    
    // Activity logging (fire-and-forget)
    if (result) {
      activityLogService.logEvent(
        'loan_balance_updated',
        'loan_balance',
        id,
        `Updated loan balance #${id} (${data.year}-${String(data.month).padStart(2, '0')}) to $${data.remaining_balance.toFixed(2)}`,
        { id, year: data.year, month: data.month, remaining_balance: data.remaining_balance, rate: data.rate }
      );
    }

    // Auto-mark loan as paid off if balance reaches zero
    if (result && data.remaining_balance === 0) {
      await this.autoMarkPaidOff(data.loan_id, 0);
    }
    
    // Recalculate estimated months left
    if (result) {
      await this.recalculateEstimatedMonths(data.loan_id);

      // Same month: the edited anchor drives the months after it. Moved: rebuild from the
      // earlier month, since the old month lost its anchor.
      const newIndex = data.year * 12 + data.month;
      const oldIndex = previous ? previous.year * 12 + previous.month : newIndex;
      const fromDate = oldIndex === newIndex
        ? nextMonthStart(data.year, data.month)
        : (oldIndex < newIndex ? monthStart(previous.year, previous.month) : monthStart(data.year, data.month));
      await this.recomputeMortgage(data.loan_id, fromDate);
    }
    
    return result;
  }

  /**
   * Delete a balance entry
   * @param {number} id - Balance entry ID
   * @param {number} loanId - Loan ID (for recalculation)
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteBalance(id, loanId) {
    // Fetch balance entry BEFORE deletion for activity log metadata
    const existingBalance = await loanBalanceRepository.findById(id);

    const result = await loanBalanceRepository.delete(id);
    
    // Activity logging (fire-and-forget)
    if (result && existingBalance) {
      activityLogService.logEvent(
        'loan_balance_deleted',
        'loan_balance',
        id,
        `Deleted loan balance #${id} (${existingBalance.year}-${String(existingBalance.month).padStart(2, '0')})`,
        { id, loanId: existingBalance.loan_id, year: existingBalance.year, month: existingBalance.month }
      );
    }

    // Recalculate estimated months left after deletion
    if (result && loanId) {
      await this.recalculateEstimatedMonths(loanId);
    }

    if (result && existingBalance) {
      await this.recomputeMortgage(existingBalance.loan_id, monthStart(existingBalance.year, existingBalance.month));
    }
    
    return result;
  }

  /**
   * Get balance history for a loan with balance and rate change calculations
   * @param {number} loanId - Loan ID
   * @returns {Promise<Array>} Array of balance entries with change calculations
   */
  async getBalanceHistory(loanId) {
    const balances = await loanBalanceRepository.getBalanceHistory(loanId);
    
    // Calculate changes from previous month (balances are in chronological order)
    const balancesWithChanges = balances.map((balance, index) => {
      let balanceChange = null;
      let rateChange = null;
      
      if (index > 0) {
        const previousBalance = balances[index - 1];
        balanceChange = this.calculateBalanceChange(balance.remaining_balance, previousBalance.remaining_balance);
        rateChange = this.calculateRateChange(balance.rate, previousBalance.rate);
      }
      
      return {
        ...balance,
        balanceChange,
        rateChange
      };
    });
    
    // Reverse to show most recent first, but recalculate changes for display order
    const reversed = balancesWithChanges.reverse();
    
    // Recalculate changes for reversed order (compare to next month, not previous)
    return reversed.map((balance, index) => {
      let balanceChange = null;
      let rateChange = null;
      
      // For reversed order, compare to the next item (which is chronologically previous)
      if (index < reversed.length - 1) {
        const previousBalance = reversed[index + 1];
        balanceChange = this.calculateBalanceChange(balance.remaining_balance, previousBalance.remaining_balance);
        rateChange = this.calculateRateChange(balance.rate, previousBalance.rate);
      }
      
      return {
        ...balance,
        balanceChange,
        rateChange
      };
    });
  }

  /**
   * Calculate balance change from previous month
   * @param {number} currentBalance - Current month's balance
   * @param {number} previousBalance - Previous month's balance
   * @returns {number} Balance change (negative means paid down)
   */
  calculateBalanceChange(currentBalance, previousBalance) {
    return currentBalance - previousBalance;
  }

  /**
   * Calculate rate change from previous month
   * @param {number} currentRate - Current month's rate
   * @param {number} previousRate - Previous month's rate
   * @returns {number} Rate change
   */
  calculateRateChange(currentRate, previousRate) {
    return currentRate - previousRate;
  }

  /**
   * Automatically mark a loan as paid off when balance reaches zero
   * Only applies to traditional loans, not lines of credit
   * @param {number} loanId - Loan ID
   * @param {number} balance - Current balance
   * @returns {Promise<void>}
   */
  async autoMarkPaidOff(loanId, balance) {
    if (balance === 0) {
      // Check loan type - only auto-mark traditional loans as paid off
      const loan = await loanRepository.findById(loanId);
      if (loan && loan.loan_type !== 'line_of_credit') {
        await loanRepository.markPaidOff(loanId, 1);
      }
    }
  }

  /**
   * Calculate estimated months left based on balance history
   * @param {Array} balanceHistory - Array of balance entries sorted chronologically
   * @param {number} currentBalance - Current remaining balance
   * @returns {number|null} Estimated months or null if cannot calculate
   */
  calculateEstimatedMonths(balanceHistory, currentBalance) {
    if (balanceHistory.length < 2) {
      return null; // Need at least 2 data points
    }

    if (currentBalance <= 0) {
      return 0; // Already paid off
    }

    // Use the most recent entries (up to 12 months)
    const recentEntries = balanceHistory.slice(-12);

    if (recentEntries.length < 2) {
      return null;
    }

    // Calculate average monthly paydown
    let totalPaydown = 0;
    let monthCount = 0;

    for (let i = 1; i < recentEntries.length; i++) {
      const prev = recentEntries[i - 1];
      const curr = recentEntries[i];
      
      const monthsDiff = (curr.year - prev.year) * 12 + (curr.month - prev.month);
      
      if (monthsDiff > 0) {
        const balanceChange = prev.remaining_balance - curr.remaining_balance;
        const monthlyPaydown = balanceChange / monthsDiff;
        
        if (monthlyPaydown > 0) {
          totalPaydown += monthlyPaydown;
          monthCount++;
        }
      }
    }

    if (monthCount === 0 || totalPaydown <= 0) {
      return null; // No positive paydown trend
    }

    const avgMonthlyPaydown = totalPaydown / monthCount;
    const estimatedMonths = Math.ceil(currentBalance / avgMonthlyPaydown);

    return estimatedMonths;
  }

  /**
   * Recalculate and update estimated months left for a loan
   * @param {number} loanId - Loan ID
   * @returns {Promise<void>}
   */
  async recalculateEstimatedMonths(loanId) {
    const loan = await loanRepository.findById(loanId);
    
    // Only calculate for traditional loans, not lines of credit or mortgages
    // Mortgages have their own amortization schedule
    if (!loan || loan.loan_type === 'line_of_credit' || loan.loan_type === 'mortgage') {
      return;
    }

    // Get balance history
    const balanceHistory = await loanBalanceRepository.getBalanceHistory(loanId);
    
    // Get current balance
    const currentBalanceEntry = await loanRepository.getCurrentBalance(loanId);
    const currentBalance = currentBalanceEntry ? currentBalanceEntry.remaining_balance : loan.initial_balance;

    // Calculate estimated months
    let estimatedMonths = this.calculateEstimatedMonths(balanceHistory, currentBalance);
    
    // If balance is zero but calculation returned null (not enough history), set to 0
    if (currentBalance === 0 && estimatedMonths === null) {
      estimatedMonths = 0;
    }

    // Update the loan - preserve all existing fields including mortgage fields
    await loanRepository.update(loanId, {
      name: loan.name,
      initial_balance: loan.initial_balance,
      start_date: loan.start_date,
      notes: loan.notes,
      loan_type: loan.loan_type,
      estimated_months_left: estimatedMonths,
      // Preserve mortgage fields (will be null for non-mortgages)
      amortization_period: loan.amortization_period,
      term_length: loan.term_length,
      renewal_date: loan.renewal_date,
      rate_type: loan.rate_type,
      payment_frequency: loan.payment_frequency,
      estimated_property_value: loan.estimated_property_value
    });
  }

  /**
   * Get total debt over time across all loans, including paid-off loans for the months they had balances.
   * Months without a snapshot use the anchor rule (last snapshot minus later payments), as the current-balance calculation does.
   * Active loans are carried forward to the current month; paid-off loans stop at their last snapshot or last payment, whichever is later.
   * Balances are anchored on snapshots, never on initial_balance, so loans whose tracking began mid-life are handled.
   * @returns {Promise<Array>} Array of {year, month, total_debt, loan_count} sorted chronologically
   */
  async getTotalDebtOverTime() {
    const [snapshots, payments] = await Promise.all([
      loanBalanceRepository.getAllSnapshotsWithLoanStatus(),
      loanPaymentRepository.getMonthlyTotalsByLoan()
    ]);
    const now = new Date();
    return this.buildTotalDebtHistory(snapshots, payments, now.getUTCFullYear(), now.getUTCMonth() + 1);
  }

  /**
   * Combine per-loan snapshots and monthly payment totals into a monthly total-debt series
   * @param {Array} snapshots - {loan_id, is_paid_off, year, month, remaining_balance} sorted by loan then month
   * @param {Array} payments - {loan_id, year, month, total}
   * @param {number} currentYear - Year active loans are carried forward to
   * @param {number} currentMonth - Month (1-12) active loans are carried forward to
   * @returns {Array} {year, month, total_debt, loan_count}; loan_count counts loans with a balance above zero
   */
  buildTotalDebtHistory(snapshots, payments, currentYear, currentMonth) {
    const monthIndex = (year, month) => year * 12 + (month - 1);
    const currentIndex = monthIndex(currentYear, currentMonth);

    const paymentsByLoan = new Map();
    for (const p of payments) {
      if (!paymentsByLoan.has(p.loan_id)) paymentsByLoan.set(p.loan_id, new Map());
      paymentsByLoan.get(p.loan_id).set(monthIndex(p.year, p.month), p.total);
    }

    const snapshotsByLoan = new Map();
    for (const s of snapshots) {
      if (!snapshotsByLoan.has(s.loan_id)) snapshotsByLoan.set(s.loan_id, []);
      snapshotsByLoan.get(s.loan_id).push(s);
    }

    const totals = new Map();
    for (const [loanId, loanSnapshots] of snapshotsByLoan) {
      const byIndex = new Map(loanSnapshots.map(s => [monthIndex(s.year, s.month), s.remaining_balance]));
      const firstIndex = monthIndex(loanSnapshots[0].year, loanSnapshots[0].month);
      const last = loanSnapshots[loanSnapshots.length - 1];
      const lastIndex = monthIndex(last.year, last.month);
      const loanPayments = paymentsByLoan.get(loanId) || new Map();
      const lastPaymentIndex = Math.max(-Infinity, ...loanPayments.keys());
      const endIndex = last.is_paid_off
        ? Math.max(lastIndex, lastPaymentIndex)
        : Math.max(lastIndex, currentIndex);

      let balance = 0;
      for (let i = firstIndex; i <= endIndex; i++) {
        balance = byIndex.has(i)
          ? byIndex.get(i)
          : Math.max(0, balance - (loanPayments.get(i) || 0));

        const entry = totals.get(i) || { total: 0, count: 0 };
        entry.total += balance;
        if (balance > 0) entry.count += 1;
        totals.set(i, entry);
      }
    }

    return [...totals.keys()].sort((a, b) => a - b).map(i => ({
      year: Math.floor(i / 12),
      month: (i % 12) + 1,
      total_debt: Math.round(totals.get(i).total * 100) / 100,
      loan_count: totals.get(i).count
    }));
  }

  /**
   * Update the interest rate from the current month on (variable-rate mortgages).
   * Sets the rate on the current month's snapshot (creating one at the calculated balance
   * when none exists), then rebuilds the mortgage's generated snapshots from this month.
   * @param {number} loanId - Loan ID
   * @param {number} newRate - New interest rate (percentage)
   * @returns {Promise<Object>} The current month's balance entry
   */
  async updateCurrentRate(loanId, newRate) {
    validateNumber(loanId, 'Loan ID');
    validateNumber(newRate, 'Interest rate', { min: 0, max: 100 });

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const existingEntry = await loanBalanceRepository.findByLoanAndMonth(loanId, currentYear, currentMonth);
    let previousRate;

    if (existingEntry) {
      previousRate = existingEntry.rate;
      await loanBalanceRepository.update(existingEntry.id, {
        year: existingEntry.year,
        month: existingEntry.month,
        remaining_balance: existingEntry.remaining_balance,
        rate: newRate,
        source: existingEntry.source
      });
    } else {
      const loan = await loanRepository.findById(loanId);
      if (!loan) {
        throw new Error('Loan not found');
      }
      const balanceHistory = await loanBalanceRepository.findByLoan(loanId);
      previousRate = balanceHistory.length > 0 ? balanceHistory[0].rate : null;

      const calc = await balanceCalculationService.calculateBalance(loanId);
      await loanBalanceRepository.create({
        loan_id: loanId,
        year: currentYear,
        month: currentMonth,
        remaining_balance: calc.currentBalance,
        rate: newRate,
        source: loan.loan_type === 'mortgage' ? 'auto' : 'manual'
      });
    }

    const startOfMonth = monthStart(currentYear, currentMonth);
    if (existingEntry && existingEntry.source !== 'auto') {
      // A user-entered balance stays; only the following months change
      await this.recomputeMortgage(loanId, nextMonthStart(currentYear, currentMonth));
    } else {
      await this.recomputeMortgage(loanId, startOfMonth);
    }

    await activityLogService.logEvent(
      'loan_rate_updated',
      'loan',
      loanId,
      `Updated loan #${loanId} rate from ${previousRate}% to ${newRate}%`,
      { loanId, newRate, previousRate }
    );

    return loanBalanceRepository.findByLoanAndMonth(loanId, currentYear, currentMonth);
  }
}

module.exports = new LoanBalanceService();
