const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const { validateNumber, validateString } = require('../utils/validators');

class LoanService {
  /**
   * Validate loan data
   * @param {Object} loan - Loan data to validate
   * @throws {Error} If validation fails
   */
  validateLoan(loan) {
    // Validate name
    validateString(loan.name, 'Loan name', { minLength: 1, maxLength: 100 });

    // Validate initial balance
    validateNumber(loan.initial_balance, 'Initial balance', { min: 0 });

    // Validate start date
    validateString(loan.start_date, 'Start date');
    
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(loan.start_date)) {
      throw new Error('Start date must be in YYYY-MM-DD format');
    }

    // Validate that the date is valid
    const date = new Date(loan.start_date);
    if (isNaN(date.getTime())) {
      throw new Error('Start date must be a valid date');
    }

    // Validate loan type if provided
    if (loan.loan_type && !['loan', 'line_of_credit'].includes(loan.loan_type)) {
      throw new Error('Loan type must be either "loan" or "line_of_credit"');
    }

    // Validate estimated_months_left if provided
    if (loan.estimated_months_left !== undefined && loan.estimated_months_left !== null) {
      validateNumber(loan.estimated_months_left, 'Estimated months left', { min: 0 });
      if (!Number.isInteger(loan.estimated_months_left)) {
        throw new Error('Estimated months left must be a whole number');
      }
    }
  }

  /**
   * Create a new loan
   * @param {Object} data - Loan data
   * @returns {Promise<Object>} Created loan
   */
  async createLoan(data) {
    this.validateLoan(data);
    
    const loanData = {
      name: data.name.trim(),
      initial_balance: data.initial_balance,
      start_date: data.start_date,
      notes: data.notes ? data.notes.trim() : null,
      loan_type: data.loan_type || 'loan', // Default to 'loan' if not specified
      is_paid_off: 0,
      estimated_months_left: data.estimated_months_left || null
    };

    return await loanRepository.create(loanData);
  }

  /**
   * Update an existing loan
   * @param {number} id - Loan ID
   * @param {Object} data - Updated loan data
   * @returns {Promise<Object|null>} Updated loan or null if not found
   */
  async updateLoan(id, data) {
    this.validateLoan(data);
    
    const loanData = {
      name: data.name.trim(),
      initial_balance: data.initial_balance,
      start_date: data.start_date,
      notes: data.notes ? data.notes.trim() : null,
      loan_type: data.loan_type || 'loan',
      estimated_months_left: data.estimated_months_left || null
    };

    return await loanRepository.update(id, loanData);
  }

  /**
   * Delete a loan
   * @param {number} id - Loan ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteLoan(id) {
    return await loanRepository.delete(id);
  }

  /**
   * Mark a loan as paid off or reactivate it
   * @param {number} id - Loan ID
   * @param {boolean} isPaidOff - True to mark as paid off, false to reactivate
   * @returns {Promise<Object|null>} Updated loan or null if not found
   */
  async markPaidOff(id, isPaidOff) {
    const isPaidOffValue = isPaidOff ? 1 : 0;
    const updated = await loanRepository.markPaidOff(id, isPaidOffValue);
    
    if (!updated) {
      return null;
    }
    
    // Return the updated loan
    return await loanRepository.findById(id);
  }

  /**
   * Get the current interest rate for a loan from the most recent balance entry
   * @param {number} loanId - Loan ID
   * @returns {Promise<number>} Current rate or 0 if no balance entries exist
   */
  async getCurrentRate(loanId) {
    const currentBalance = await loanRepository.getCurrentBalance(loanId);
    return currentBalance ? currentBalance.rate : 0;
  }

  /**
   * Get all loans with current balances and rates
   * @returns {Promise<Array>} Array of loans with currentBalance and currentRate
   */
  async getAllLoans() {
    const loans = await loanRepository.getAllWithCurrentBalances();
    
    // Convert is_paid_off to boolean for easier frontend handling
    return loans.map(loan => ({
      ...loan,
      isPaidOff: loan.is_paid_off === 1
    }));
  }

  /**
   * Get loans for a specific month (filtering by start_date and excluding paid off)
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Array>} Array of active loans for the month
   */
  async getLoansForMonth(year, month) {
    const loans = await loanRepository.getLoansForMonth(year, month);
    
    // Filter out paid off loans
    const activeLoans = loans.filter(loan => loan.is_paid_off === 0);
    
    // Convert to frontend-friendly format
    return activeLoans.map(loan => ({
      ...loan,
      isPaidOff: false
    }));
  }

  /**
   * Calculate total outstanding debt from an array of loans
   * @param {Array} loans - Array of loan objects with currentBalance
   * @returns {number} Total outstanding debt
   */
  calculateTotalOutstandingDebt(loans) {
    return loans.reduce((total, loan) => {
      return total + (loan.currentBalance || 0);
    }, 0);
  }
}

module.exports = new LoanService();
