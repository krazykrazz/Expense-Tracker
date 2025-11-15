const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const loanRepository = require('../repositories/loanRepository');

class LoanBalanceService {
  /**
   * Validate balance entry data
   * @param {Object} entry - Balance entry data to validate
   * @throws {Error} If validation fails
   */
  validateBalanceEntry(entry) {
    if (!entry.loan_id || typeof entry.loan_id !== 'number') {
      throw new Error('Loan ID is required and must be a number');
    }

    if (!entry.year || typeof entry.year !== 'number') {
      throw new Error('Year is required and must be a number');
    }

    if (entry.year < 1900 || entry.year > 2100) {
      throw new Error('Year must be between 1900 and 2100');
    }

    if (!entry.month || typeof entry.month !== 'number') {
      throw new Error('Month is required and must be a number');
    }

    if (entry.month < 1 || entry.month > 12) {
      throw new Error('Month must be between 1 and 12');
    }

    if (entry.remaining_balance === undefined || entry.remaining_balance === null) {
      throw new Error('Remaining balance is required');
    }

    if (typeof entry.remaining_balance !== 'number' || entry.remaining_balance < 0) {
      throw new Error('Remaining balance must be a non-negative number');
    }

    if (entry.rate === undefined || entry.rate === null) {
      throw new Error('Interest rate is required');
    }

    if (typeof entry.rate !== 'number' || entry.rate < 0) {
      throw new Error('Interest rate must be a non-negative number');
    }

    if (entry.rate > 100) {
      throw new Error('Interest rate must not exceed 100%');
    }
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
    
    return result;
  }

  /**
   * Delete a balance entry
   * @param {number} id - Balance entry ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteBalance(id) {
    return await loanBalanceRepository.delete(id);
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
}

module.exports = new LoanBalanceService();
