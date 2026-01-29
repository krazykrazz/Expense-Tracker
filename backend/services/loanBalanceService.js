const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const loanRepository = require('../repositories/loanRepository');
const { validateNumber, validateYearMonth } = require('../utils/validators');

class LoanBalanceService {
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
    
    // Auto-mark loan as paid off if balance reaches zero
    if (data.remaining_balance === 0) {
      await this.autoMarkPaidOff(data.loan_id, 0);
    }
    
    // Recalculate estimated months left
    await this.recalculateEstimatedMonths(data.loan_id);
    
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
    
    const balanceData = {
      year: data.year,
      month: data.month,
      remaining_balance: data.remaining_balance,
      rate: data.rate
    };

    const result = await loanBalanceRepository.update(id, balanceData);
    
    // Auto-mark loan as paid off if balance reaches zero
    if (result && data.remaining_balance === 0) {
      await this.autoMarkPaidOff(data.loan_id, 0);
    }
    
    // Recalculate estimated months left
    if (result) {
      await this.recalculateEstimatedMonths(data.loan_id);
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
    const result = await loanBalanceRepository.delete(id);
    
    // Recalculate estimated months left after deletion
    if (result && loanId) {
      await this.recalculateEstimatedMonths(loanId);
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
   * Get total debt over time across all active loans
   * @returns {Promise<Array>} Array of monthly total debt values
   */
  async getTotalDebtOverTime() {
    return await loanBalanceRepository.getTotalDebtOverTime();
  }

  /**
   * Update just the interest rate for the current month's balance entry
   * Creates a new entry if one doesn't exist for the current month
   * Useful for variable rate mortgages where rate can change mid-month
   * @param {number} loanId - Loan ID
   * @param {number} newRate - New interest rate (percentage)
   * @returns {Promise<Object>} Updated or created balance entry
   */
  async updateCurrentRate(loanId, newRate) {
    // Validate inputs
    validateNumber(loanId, 'Loan ID');
    validateNumber(newRate, 'Interest rate', { min: 0, max: 100 });

    // Get current date
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Check if there's an existing balance entry for this month
    const existingEntry = await loanBalanceRepository.findByLoanAndMonth(loanId, currentYear, currentMonth);

    if (existingEntry) {
      // Update the existing entry's rate only
      const result = await loanBalanceRepository.update(existingEntry.id, {
        year: existingEntry.year,
        month: existingEntry.month,
        remaining_balance: existingEntry.remaining_balance,
        rate: newRate
      });
      return result;
    }

    // No entry for current month - need to create one
    // Get the most recent balance to use as the current balance
    const balanceHistory = await loanBalanceRepository.findByLoan(loanId);
    let currentBalance;

    if (balanceHistory.length > 0) {
      // Use the most recent balance (sorted DESC by year, month)
      currentBalance = balanceHistory[0].remaining_balance;
    } else {
      // No balance history - use initial balance from loan
      const loan = await loanRepository.findById(loanId);
      if (!loan) {
        throw new Error('Loan not found');
      }
      currentBalance = loan.initial_balance;
    }

    // Create new balance entry with the new rate
    const result = await loanBalanceRepository.create({
      loan_id: loanId,
      year: currentYear,
      month: currentMonth,
      remaining_balance: currentBalance,
      rate: newRate
    });

    return result;
  }

}

module.exports = new LoanBalanceService();
