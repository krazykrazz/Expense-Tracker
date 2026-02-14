const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const loanRepository = require('../repositories/loanRepository');
const activityLogService = require('./activityLogService');
const { validateYearMonth } = require('../utils/validators');
const { CATEGORIES, normalizeCategory } = require('../utils/categories');

class FixedExpenseService {
  /**
   * Validate fixed expense data
   * Payment type is validated against database-driven payment methods
   * @param {Object} fixedExpense - Fixed expense data to validate
   * @param {Array} validPaymentTypes - Array of valid payment type display names from database
   * @throws {Error} If validation fails
   */
  validateFixedExpense(fixedExpense, validPaymentTypes = []) {
    const errors = [];

    // Required fields validation
    if (!fixedExpense.name || fixedExpense.name.trim() === '') {
      errors.push('Name is required');
    }

    if (fixedExpense.amount === undefined || fixedExpense.amount === null) {
      errors.push('Amount is required');
    }

    // Category validation
    if (!fixedExpense.category || fixedExpense.category.trim() === '') {
      errors.push('Category is required');
    } else {
      fixedExpense.category = normalizeCategory(fixedExpense.category);
      if (!CATEGORIES.includes(fixedExpense.category)) {
        errors.push(`Invalid category. Must be one of: ${CATEGORIES.join(', ')}`);
      }
    }

    // Payment type validation - validate against database-driven payment methods
    if (!fixedExpense.payment_type || fixedExpense.payment_type.trim() === '') {
      errors.push('Payment type is required');
    } else if (validPaymentTypes.length > 0 && !validPaymentTypes.includes(fixedExpense.payment_type)) {
      errors.push(`Invalid payment type. Must be one of: ${validPaymentTypes.join(', ')}`);
    }

    // String length validation
    if (fixedExpense.name && fixedExpense.name.length > 100) {
      errors.push('Name must not exceed 100 characters');
    }

    // Amount validation
    if (fixedExpense.amount !== undefined && fixedExpense.amount !== null) {
      const amount = parseFloat(fixedExpense.amount);
      if (isNaN(amount)) {
        errors.push('Amount must be a valid number');
      } else if (amount < 0) {
        errors.push('Amount must be a non-negative number');
      }
      // Check for max 2 decimal places
      if (!/^\d+(\.\d{1,2})?$/.test(fixedExpense.amount.toString())) {
        errors.push('Amount must have at most 2 decimal places');
      }
    }

    // Year and month validation (when provided)
    if (fixedExpense.year !== undefined) {
      const year = parseInt(fixedExpense.year);
      if (isNaN(year)) {
        errors.push('Year must be a valid number');
      }
    }

    if (fixedExpense.month !== undefined) {
      const month = parseInt(fixedExpense.month);
      if (isNaN(month) || month < 1 || month > 12) {
        errors.push('Month must be between 1 and 12');
      }
    }

    // Payment due day validation (optional field)
    const paymentDueDayError = this.validatePaymentDueDay(fixedExpense.payment_due_day);
    if (paymentDueDayError) {
      errors.push(paymentDueDayError);
    }

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }
  }

  /**
   * Validate payment_due_day field
   * @param {number|null|undefined} paymentDueDay - Payment due day value
   * @returns {string|null} Error message or null if valid
   */
  validatePaymentDueDay(paymentDueDay) {
    // Null or undefined is valid (optional field)
    if (paymentDueDay === null || paymentDueDay === undefined) {
      return null;
    }

    // Empty string should be treated as null (valid)
    if (paymentDueDay === '') {
      return null;
    }

    const day = parseInt(paymentDueDay);
    
    // Must be a valid number
    if (isNaN(day)) {
      return 'Payment due day must be a valid number';
    }

    // Must be between 1 and 31
    if (day < 1 || day > 31) {
      return 'Payment due day must be between 1 and 31';
    }

    return null;
  }

  /**
   * Validate linked_loan_id field
   * @param {number|null|undefined} linkedLoanId - Linked loan ID value
   * @returns {Promise<{error: string|null, loan: Object|null}>} Validation result with error message and loan object
   */
  async validateLinkedLoanId(linkedLoanId) {
    // Null or undefined is valid (optional field)
    if (linkedLoanId === null || linkedLoanId === undefined) {
      return { error: null, loan: null };
    }

    // Empty string should be treated as null (valid)
    if (linkedLoanId === '') {
      return { error: null, loan: null };
    }

    const loanId = parseInt(linkedLoanId);
    
    // Must be a valid number
    if (isNaN(loanId)) {
      return { error: 'Invalid loan ID', loan: null };
    }

    // Check if loan exists
    const loan = await loanRepository.findById(loanId);
    if (!loan) {
      return { error: 'Invalid loan ID', loan: null };
    }

    // Return the loan for potential warning about paid-off status
    return { error: null, loan };
  }

  /**
   * Get valid payment type display names from database
   * @returns {Promise<Array<string>>} Array of valid payment type display names
   */
  async getValidPaymentTypes() {
    const paymentMethods = await paymentMethodRepository.findAll();
    return paymentMethods.map(pm => pm.display_name);
  }

  /**
   * Get all fixed expenses for a month with total
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object>} { items: Array, total: number }
   */
  async getMonthlyFixedExpenses(year, month) {
    // Validate year and month
    validateYearMonth(year, month);

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum)) {
      throw new Error('Year and month must be valid numbers');
    }

    if (monthNum < 1 || monthNum > 12) {
      throw new Error('Month must be between 1 and 12');
    }

    // Fetch fixed expenses and total from repository
    const items = await fixedExpenseRepository.getFixedExpenses(yearNum, monthNum);
    const total = await fixedExpenseRepository.getTotalFixedExpenses(yearNum, monthNum);

    return {
      items,
      total
    };
  }

  /**
   * Get all fixed expenses for a month with loan details
   * Returns fixed expenses with joined loan information for linked expenses
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object>} { items: Array, total: number }
   * _Requirements: 1.4, 2.3, 6.4_
   */
  async getMonthlyFixedExpensesWithLoans(year, month) {
    // Validate year and month
    validateYearMonth(year, month);

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum)) {
      throw new Error('Year and month must be valid numbers');
    }

    if (monthNum < 1 || monthNum > 12) {
      throw new Error('Month must be between 1 and 12');
    }

    // Fetch fixed expenses with loan details and total from repository
    const items = await fixedExpenseRepository.getFixedExpensesWithLoans(yearNum, monthNum);
    const total = await fixedExpenseRepository.getTotalFixedExpenses(yearNum, monthNum);

    return {
      items,
      total
    };
  }

  /**
   * Create a new fixed expense item
   * @param {Object} data - { year, month, name, amount, category, payment_type, payment_due_day, linked_loan_id }
   * @returns {Promise<Object>} Created fixed expense with optional warning
   */
  async createFixedExpense(data) {
    // Validate required fields
    if (!data.year || !data.month) {
      throw new Error('Year and month are required');
    }

    // Get valid payment types from database
    const validPaymentTypes = await this.getValidPaymentTypes();

    // Validate the fixed expense data (includes payment_due_day validation)
    this.validateFixedExpense(data, validPaymentTypes);

    // Validate linked_loan_id if provided
    const { error: loanError, loan } = await this.validateLinkedLoanId(data.linked_loan_id);
    if (loanError) {
      throw new Error(loanError);
    }

    // Prepare fixed expense object
    const fixedExpense = {
      year: parseInt(data.year),
      month: parseInt(data.month),
      name: data.name.trim(),
      amount: parseFloat(data.amount),
      category: data.category.trim(),
      payment_type: data.payment_type.trim(),
      payment_due_day: this.normalizePaymentDueDay(data.payment_due_day),
      linked_loan_id: this.normalizeLinkedLoanId(data.linked_loan_id)
    };

    // Create fixed expense in repository
    const created = await fixedExpenseRepository.createFixedExpense(fixedExpense);

    // Log activity event
    await activityLogService.logEvent(
      'fixed_expense_added',
      'fixed_expense',
      created.id,
      `Added fixed expense: ${created.name} - $${created.amount.toFixed(2)}`,
      {
        name: created.name,
        amount: created.amount,
        category: created.category,
        payment_type: created.payment_type
      }
    );

    // Add warning if linked loan is paid off
    if (loan && loan.is_paid_off) {
      return {
        ...created,
        warning: 'Linked loan is marked as paid off'
      };
    }

    return created;
  }

  /**
   * Normalize payment_due_day value for storage
   * @param {any} value - Input value
   * @returns {number|null} Normalized value
   */
  normalizePaymentDueDay(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = parseInt(value);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Normalize linked_loan_id value for storage
   * @param {any} value - Input value
   * @returns {number|null} Normalized value
   */
  normalizeLinkedLoanId(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = parseInt(value);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Update a fixed expense item
   * @param {number} id - Fixed expense ID
   * @param {Object} data - { name, amount, category, payment_type, payment_due_day, linked_loan_id }
   * @returns {Promise<Object|null>} Updated fixed expense with optional warning, or null if not found
   */
  async updateFixedExpense(id, data) {
      // Validate ID
      if (!id) {
        throw new Error('Fixed expense ID is required');
      }

      // Fetch old fixed expense for change tracking
      const oldExpense = await fixedExpenseRepository.findById(id);
      if (!oldExpense) {
        return null;
      }

      // Get valid payment types from database
      const validPaymentTypes = await this.getValidPaymentTypes();

      // Validate the fixed expense data (includes payment_due_day validation)
      this.validateFixedExpense(data, validPaymentTypes);

      // Validate linked_loan_id if provided
      const { error: loanError, loan } = await this.validateLinkedLoanId(data.linked_loan_id);
      if (loanError) {
        throw new Error(loanError);
      }

      // Prepare updates object
      const updates = {
        name: data.name.trim(),
        amount: parseFloat(data.amount),
        category: data.category.trim(),
        payment_type: data.payment_type.trim(),
        payment_due_day: this.normalizePaymentDueDay(data.payment_due_day),
        linked_loan_id: this.normalizeLinkedLoanId(data.linked_loan_id)
      };

      // Update fixed expense in repository
      const updated = await fixedExpenseRepository.updateFixedExpense(id, updates);

      if (!updated) {
        return null;
      }

      // Build change description
      const changes = [];
      if (oldExpense.name !== updates.name) {
        changes.push(`name: ${oldExpense.name} → ${updates.name}`);
      }
      if (parseFloat(oldExpense.amount) !== updates.amount) {
        changes.push(`amount: $${parseFloat(oldExpense.amount).toFixed(2)} → $${updates.amount.toFixed(2)}`);
      }
      if (oldExpense.category !== updates.category) {
        changes.push(`category: ${oldExpense.category} → ${updates.category}`);
      }
      if (oldExpense.payment_type !== updates.payment_type) {
        changes.push(`payment: ${oldExpense.payment_type} → ${updates.payment_type}`);
      }
      if (oldExpense.payment_due_day !== updates.payment_due_day) {
        changes.push(`due day: ${oldExpense.payment_due_day || 'none'} → ${updates.payment_due_day || 'none'}`);
      }
      // Loan linkage changes
      const oldLoanId = oldExpense.linked_loan_id || null;
      const newLoanId = updates.linked_loan_id || null;
      if (oldLoanId !== newLoanId) {
        if (!oldLoanId && newLoanId) {
          const loanName = loan ? loan.name : `ID ${newLoanId}`;
          changes.push(`linked to loan: ${loanName}`);
        } else if (oldLoanId && !newLoanId) {
          changes.push('loan linkage removed');
        } else {
          const loanName = loan ? loan.name : `ID ${newLoanId}`;
          changes.push(`loan changed to: ${loanName}`);
        }
      }

      const changeSummary = changes.length > 0 ? ` (${changes.join(', ')})` : '';

      // Log activity event
      await activityLogService.logEvent(
        'fixed_expense_updated',
        'fixed_expense',
        updated.id,
        `Updated fixed expense: ${updated.name} - $${updated.amount.toFixed(2)}${changeSummary}`,
        {
          name: updated.name,
          amount: updated.amount,
          category: updated.category,
          payment_type: updated.payment_type,
          changes: changes
        }
      );

      // Add warning if linked loan is paid off
      if (loan && loan.is_paid_off) {
        return {
          ...updated,
          warning: 'Linked loan is marked as paid off'
        };
      }

      return updated;
    }



  /**
   * Delete a fixed expense item
   * @param {number} id - Fixed expense ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteFixedExpense(id) {
    // Validate ID
    if (!id) {
      throw new Error('Fixed expense ID is required');
    }

    // Get the fixed expense before deleting for logging
    const fixedExpense = await fixedExpenseRepository.findById(id);

    // Delete fixed expense from repository
    const deleted = await fixedExpenseRepository.deleteFixedExpense(id);

    // Log activity event if deletion was successful
    if (deleted && fixedExpense) {
      await activityLogService.logEvent(
        'fixed_expense_deleted',
        'fixed_expense',
        id,
        `Deleted fixed expense: ${fixedExpense.name} - $${fixedExpense.amount.toFixed(2)}`,
        {
          name: fixedExpense.name,
          amount: fixedExpense.amount,
          category: fixedExpense.category,
          payment_type: fixedExpense.payment_type
        }
      );
    }

    return deleted;
  }

  /**
   * Carry forward fixed expenses from previous month
   * @param {number} year - Target year
   * @param {number} month - Target month (1-12)
   * @returns {Promise<Object>} { items: Array, count: number }
   */
  async carryForwardFixedExpenses(year, month) {
    // Validate year and month
    validateYearMonth(year, month);

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum)) {
      throw new Error('Year and month must be valid numbers');
    }

    if (monthNum < 1 || monthNum > 12) {
      throw new Error('Month must be between 1 and 12');
    }

    // Calculate previous month
    let prevYear = yearNum;
    let prevMonth = monthNum - 1;
    
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = yearNum - 1;
    }

    // Check if previous month has any fixed expenses
    const previousExpenses = await fixedExpenseRepository.getFixedExpenses(prevYear, prevMonth);
    
    if (previousExpenses.length === 0) {
      // Return empty result instead of throwing error
      return {
        items: [],
        count: 0
      };
    }

    // Copy fixed expenses from previous month to current month
    const items = await fixedExpenseRepository.copyFixedExpenses(
      prevYear,
      prevMonth,
      yearNum,
      monthNum
    );

    return {
      items,
      count: items.length
    };
  }

  /**
   * Get fixed expenses linked to a specific loan
   * @param {number} loanId - Loan ID
   * @returns {Promise<Array>} Array of fixed expense objects
   */
  async getFixedExpensesByLoanId(loanId) {
    return await fixedExpenseRepository.getFixedExpensesByLoanId(loanId);
  }
}

module.exports = new FixedExpenseService();
