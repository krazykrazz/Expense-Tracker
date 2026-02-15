const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const mortgageService = require('./mortgageService');
const { validateNumber, validateString } = require('../utils/validators');
const activityLogService = require('./activityLogService');

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
    if (loan.loan_type && !['loan', 'line_of_credit', 'mortgage'].includes(loan.loan_type)) {
      throw new Error('Loan type must be "loan", "line_of_credit", or "mortgage"');
    }

    // Validate estimated_months_left if provided
    if (loan.estimated_months_left !== undefined && loan.estimated_months_left !== null) {
      validateNumber(loan.estimated_months_left, 'Estimated months left', { min: 0 });
      if (!Number.isInteger(loan.estimated_months_left)) {
        throw new Error('Estimated months left must be a whole number');
      }
    }

    // Validate fixed_interest_rate if provided
    if (loan.fixed_interest_rate !== undefined && loan.fixed_interest_rate !== null) {
      // Fixed interest rate can only be set for loan_type='loan'
      const loanType = loan.loan_type || 'loan';
      if (loanType !== 'loan') {
        throw new Error('Fixed interest rate can only be set for loans, not for lines of credit or mortgages');
      }
      
      // Validate that the rate is a valid non-negative number
      if (typeof loan.fixed_interest_rate !== 'number' || isNaN(loan.fixed_interest_rate)) {
        throw new Error('Fixed interest rate must be a valid number');
      }
      
      if (loan.fixed_interest_rate < 0) {
        throw new Error('Fixed interest rate must be greater than or equal to zero');
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
    
    const loanType = data.loan_type || 'loan';
    
    const loanData = {
      name: data.name.trim(),
      initial_balance: data.initial_balance,
      start_date: data.start_date,
      notes: data.notes ? data.notes.trim() : null,
      loan_type: loanType,
      is_paid_off: 0,
      estimated_months_left: data.estimated_months_left || null,
      // Only include fixed_interest_rate for loan_type='loan'
      fixed_interest_rate: loanType === 'loan' ? (data.fixed_interest_rate ?? null) : null
    };

    const createdLoan = await loanRepository.create(loanData);
    
    // Log activity event
    await activityLogService.logEvent(
      'loan_added',
      'loan',
      createdLoan.id,
      `Added loan: ${createdLoan.name}`,
      {
        name: createdLoan.name,
        loan_type: createdLoan.loan_type,
        initial_balance: createdLoan.initial_balance,
        start_date: createdLoan.start_date
      }
    );
    
    return createdLoan;
  }

  /**
   * Update an existing loan
   * Only allows updating: name, notes, fixed_interest_rate (for loan type)
   * Prevents modification of: initial_balance, start_date, loan_type
   * @param {number} id - Loan ID
   * @param {Object} data - Updated loan data
   * @returns {Promise<Object|null>} Updated loan or null if not found
   */
  async updateLoan(id, data) {
    // First, verify the loan exists
    const existingLoan = await loanRepository.findById(id);
    
    if (!existingLoan) {
      return null;
    }
    
    // Validate name if provided
    if (data.name !== undefined) {
      validateString(data.name, 'Loan name', { minLength: 1, maxLength: 100 });
    }
    
    // Validate fixed_interest_rate if provided (only for loan type)
    if (data.fixed_interest_rate !== undefined && data.fixed_interest_rate !== null) {
      // Fixed interest rate can only be set for loan_type='loan'
      if (existingLoan.loan_type !== 'loan') {
        throw new Error('Fixed interest rate can only be set for loans, not for lines of credit or mortgages');
      }
      
      // Validate that the rate is a valid non-negative number
      if (typeof data.fixed_interest_rate !== 'number' || isNaN(data.fixed_interest_rate)) {
        throw new Error('Fixed interest rate must be a valid number');
      }
      
      if (data.fixed_interest_rate < 0) {
        throw new Error('Fixed interest rate must be greater than or equal to zero');
      }
    }
    
    // Build the update object with only allowed fields
    const updates = {};
    
    if (data.name !== undefined) {
      updates.name = data.name.trim();
    }
    
    if (data.notes !== undefined) {
      updates.notes = data.notes ? data.notes.trim() : null;
    }
    
    // Only include fixed_interest_rate for loan type
    if (existingLoan.loan_type === 'loan' && data.fixed_interest_rate !== undefined) {
      updates.fixed_interest_rate = data.fixed_interest_rate;
    }
    
    // Use the repository method that only updates specified fields
    const updatedLoan = await loanRepository.updateFields(id, updates);
    
    if (updatedLoan) {
      // Build change description
      const changes = [];
      if (existingLoan.name !== updatedLoan.name) {
        changes.push(`name: ${existingLoan.name} → ${updatedLoan.name}`);
      }
      if ((existingLoan.notes || '') !== (updatedLoan.notes || '')) {
        changes.push(`notes changed`);
      }
      if (existingLoan.loan_type === 'loan' && existingLoan.fixed_interest_rate !== updatedLoan.fixed_interest_rate) {
        changes.push(`rate: ${existingLoan.fixed_interest_rate ?? 'none'} → ${updatedLoan.fixed_interest_rate ?? 'none'}`);
      }
      const changeSummary = changes.length > 0 ? ` (${changes.join(', ')})` : '';

      // Log activity event
      await activityLogService.logEvent(
        'loan_updated',
        'loan',
        updatedLoan.id,
        `Updated loan: ${updatedLoan.name}${changeSummary}`,
        {
          name: updatedLoan.name,
          loan_type: updatedLoan.loan_type,
          changes: changes
        }
      );
    }
    
    return updatedLoan;
  }

  /**
   * Create a new mortgage
   * @param {Object} data - Mortgage data including mortgage-specific fields
   * @returns {Promise<Object>} Created mortgage
   */
  async createMortgage(data) {
    // Validate standard loan fields first
    this.validateLoan({ ...data, loan_type: 'mortgage' });
    
    // Validate mortgage-specific fields
    mortgageService.validateMortgageFields(data);
    
    const mortgageData = {
      name: data.name.trim(),
      initial_balance: data.initial_balance,
      start_date: data.start_date,
      notes: data.notes ? data.notes.trim() : null,
      loan_type: 'mortgage',
      is_paid_off: 0,
      estimated_months_left: data.estimated_months_left || null,
      // Mortgage-specific fields
      amortization_period: data.amortization_period,
      term_length: data.term_length,
      renewal_date: data.renewal_date,
      rate_type: data.rate_type,
      payment_frequency: data.payment_frequency,
      estimated_property_value: data.estimated_property_value || null
    };

    const createdMortgage = await loanRepository.create(mortgageData);
    
    // Log activity event
    await activityLogService.logEvent(
      'loan_added',
      'loan',
      createdMortgage.id,
      `Added loan: ${createdMortgage.name}`,
      {
        name: createdMortgage.name,
        loan_type: createdMortgage.loan_type,
        initial_balance: createdMortgage.initial_balance,
        start_date: createdMortgage.start_date
      }
    );
    
    return createdMortgage;
  }

  /**
   * Update mortgage-specific fields
   * Only allows updating: name, notes, estimated_property_value, renewal_date
   * Prevents modification of: initial_balance, start_date, amortization_period, term_length
   * @param {number} id - Loan ID
   * @param {Object} data - Updated mortgage data
   * @returns {Promise<Object|null>} Updated mortgage or null if not found
   */
  async updateMortgage(id, data) {
    // First, verify the loan exists and is a mortgage
    const existingLoan = await loanRepository.findById(id);
    
    if (!existingLoan) {
      return null;
    }
    
    if (existingLoan.loan_type !== 'mortgage') {
      throw new Error('Cannot use updateMortgage on a non-mortgage loan');
    }
    
    // Validate the allowed fields
    if (data.name !== undefined) {
      validateString(data.name, 'Mortgage name', { minLength: 1, maxLength: 100 });
    }
    
    if (data.estimated_property_value !== undefined && data.estimated_property_value !== null) {
      if (typeof data.estimated_property_value !== 'number' || data.estimated_property_value <= 0) {
        throw new Error('Estimated property value must be greater than zero');
      }
    }
    
    if (data.renewal_date !== undefined && data.renewal_date !== null) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(data.renewal_date)) {
        throw new Error('Renewal date must be in YYYY-MM-DD format');
      }
      
      const renewalDate = new Date(data.renewal_date);
      if (isNaN(renewalDate.getTime())) {
        throw new Error('Renewal date must be in YYYY-MM-DD format');
      }
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (renewalDate <= today) {
        throw new Error('Renewal date must be in the future');
      }
    }
    
    // Build the update object with only allowed fields
    const updates = {};
    
    if (data.name !== undefined) {
      updates.name = data.name.trim();
    }
    
    if (data.notes !== undefined) {
      updates.notes = data.notes ? data.notes.trim() : null;
    }
    
    if (data.estimated_property_value !== undefined) {
      updates.estimated_property_value = data.estimated_property_value;
    }
    
    if (data.renewal_date !== undefined) {
      updates.renewal_date = data.renewal_date;
    }
    
    // Use the repository method that only updates allowed fields
    const updatedMortgage = await loanRepository.updateMortgageFields(id, updates);
    
    if (updatedMortgage) {
      // Build change description
      const changes = [];
      if (existingLoan.name !== updatedMortgage.name) {
        changes.push(`name: ${existingLoan.name} → ${updatedMortgage.name}`);
      }
      if ((existingLoan.notes || '') !== (updatedMortgage.notes || '')) {
        changes.push(`notes changed`);
      }
      if (existingLoan.estimated_property_value !== updatedMortgage.estimated_property_value) {
        changes.push(`property value: $${existingLoan.estimated_property_value || 0} → $${updatedMortgage.estimated_property_value || 0}`);
      }
      if (existingLoan.renewal_date !== updatedMortgage.renewal_date) {
        changes.push(`renewal date: ${existingLoan.renewal_date || 'none'} → ${updatedMortgage.renewal_date || 'none'}`);
      }
      const changeSummary = changes.length > 0 ? ` (${changes.join(', ')})` : '';

      // Log activity event
      await activityLogService.logEvent(
        'loan_updated',
        'loan',
        updatedMortgage.id,
        `Updated loan: ${updatedMortgage.name}${changeSummary}`,
        {
          name: updatedMortgage.name,
          loan_type: updatedMortgage.loan_type,
          changes: changes
        }
      );
    }
    
    return updatedMortgage;
  }

  /**
   * Delete a loan
   * @param {number} id - Loan ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteLoan(id) {
    // Get loan details before deletion for logging
    const loan = await loanRepository.findById(id);
    
    const deleted = await loanRepository.delete(id);
    
    if (deleted && loan) {
      // Log activity event
      await activityLogService.logEvent(
        'loan_deleted',
        'loan',
        id,
        `Deleted loan: ${loan.name}`,
        {
          name: loan.name,
          loan_type: loan.loan_type,
          initial_balance: loan.initial_balance,
          start_date: loan.start_date
        }
      );
    }
    
    return deleted;
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
      const loan = await loanRepository.findById(id);

      // Log paid-off state change
      if (isPaidOff) {
        await activityLogService.logEvent(
          'loan_paid_off',
          'loan',
          id,
          `Marked loan as paid off: ${loan.name}`,
          {
            name: loan.name,
            paid_off_date: new Date().toISOString().split('T')[0]
          }
        );
      } else {
        await activityLogService.logEvent(
          'loan_reactivated',
          'loan',
          id,
          `Reactivated loan: ${loan.name}`,
          {
            name: loan.name
          }
        );
      }

      return loan;
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
