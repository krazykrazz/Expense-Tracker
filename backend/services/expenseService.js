const expenseRepository = require('../repositories/expenseRepository');
const { calculateWeek } = require('../utils/dateUtils');

class ExpenseService {
  /**
   * Validate expense data
   * @param {Object} expense - Expense data to validate
   * @throws {Error} If validation fails
   */
  validateExpense(expense) {
    const errors = [];

    // Required fields validation
    if (!expense.date) {
      errors.push('Date is required');
    }

    if (expense.amount === undefined || expense.amount === null) {
      errors.push('Amount is required');
    }

    if (!expense.type) {
      errors.push('Type is required');
    }

    if (!expense.method) {
      errors.push('Payment method is required');
    }

    // Data type validation
    if (expense.date && !this.isValidDate(expense.date)) {
      errors.push('Date must be a valid date in YYYY-MM-DD format');
    }

    if (expense.amount !== undefined && expense.amount !== null) {
      const amount = parseFloat(expense.amount);
      if (isNaN(amount) || amount <= 0) {
        errors.push('Amount must be a positive number');
      }
      // Check for max 2 decimal places
      if (!/^\d+(\.\d{1,2})?$/.test(expense.amount.toString())) {
        errors.push('Amount must have at most 2 decimal places');
      }
    }

    // Type validation
    const validTypes = ['Other', 'Food', 'Gas'];
    if (expense.type && !validTypes.includes(expense.type)) {
      errors.push(`Type must be one of: ${validTypes.join(', ')}`);
    }

    // Method validation
    const validMethods = ['Cash', 'Debit', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];
    if (expense.method && !validMethods.includes(expense.method)) {
      errors.push(`Payment method must be one of: ${validMethods.join(', ')}`);
    }

    // String length validation
    if (expense.place && expense.place.length > 200) {
      errors.push('Place must not exceed 200 characters');
    }

    if (expense.notes && expense.notes.length > 200) {
      errors.push('Notes must not exceed 200 characters');
    }

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }
  }

  /**
   * Check if a date string is valid
   * @param {string} dateString - Date string to validate
   * @returns {boolean} True if valid
   */
  isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date) && dateString.match(/^\d{4}-\d{2}-\d{2}$/);
  }

  /**
   * Create a new expense
   * @param {Object} expenseData - Expense data
   * @returns {Promise<Object>} Created expense
   */
  async createExpense(expenseData) {
    // Validate the expense data
    this.validateExpense(expenseData);

    // Calculate week from date
    const week = calculateWeek(expenseData.date);

    // Prepare expense object with calculated week
    const expense = {
      date: expenseData.date,
      place: expenseData.place || null,
      notes: expenseData.notes || null,
      amount: parseFloat(expenseData.amount),
      type: expenseData.type,
      week: week,
      method: expenseData.method,
      recurring_id: expenseData.recurring_id !== undefined ? expenseData.recurring_id : null,
      is_generated: expenseData.is_generated !== undefined ? expenseData.is_generated : 0
    };

    // Create expense in repository
    return await expenseRepository.create(expense);
  }

  /**
   * Get all expenses with optional filters
   * @param {Object} filters - Optional filters { year, month }
   * @returns {Promise<Array>} Array of expenses
   */
  async getExpenses(filters = {}) {
    return await expenseRepository.findAll(filters);
  }

  /**
   * Get a single expense by ID
   * @param {number} id - Expense ID
   * @returns {Promise<Object|null>} Expense or null
   */
  async getExpenseById(id) {
    return await expenseRepository.findById(id);
  }

  /**
   * Toggle highlight on an expense
   * @param {number} id - Expense ID
   * @param {boolean} highlighted - Highlight state
   * @returns {Promise<Object|null>} Updated expense or null
   */
  async toggleHighlight(id, highlighted) {
    return await expenseRepository.toggleHighlight(id, highlighted ? 1 : 0);
  }

  /**
   * Update an expense
   * @param {number} id - Expense ID
   * @param {Object} expenseData - Updated expense data
   * @returns {Promise<Object|null>} Updated expense or null
   */
  async updateExpense(id, expenseData) {
    // Validate the expense data
    this.validateExpense(expenseData);

    // Calculate week from date
    const week = calculateWeek(expenseData.date);

    // Prepare expense object with calculated week
    const expense = {
      date: expenseData.date,
      place: expenseData.place || null,
      notes: expenseData.notes || null,
      amount: parseFloat(expenseData.amount),
      type: expenseData.type,
      week: week,
      method: expenseData.method
    };

    // Update expense in repository
    return await expenseRepository.update(id, expense);
  }

  /**
   * Delete an expense
   * @param {number} id - Expense ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteExpense(id) {
    return await expenseRepository.delete(id);
  }

  /**
   * Get summary data for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object>} Summary object
   */
  async getSummary(year, month) {
    // Validate year and month
    if (!year || !month) {
      throw new Error('Year and month are required for summary');
    }

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum)) {
      throw new Error('Year and month must be valid numbers');
    }

    if (monthNum < 1 || monthNum > 12) {
      throw new Error('Month must be between 1 and 12');
    }

    const summary = await expenseRepository.getSummary(yearNum, monthNum);
    const monthlyGross = await expenseRepository.getMonthlyGross(yearNum, monthNum);
    
    // Add monthly gross and net balance to summary
    summary.monthlyGross = monthlyGross || 0;
    summary.netBalance = summary.monthlyGross - summary.total;
    
    return summary;
  }

  /**
   * Get monthly gross income
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<number|null>} Gross amount
   */
  async getMonthlyGross(year, month) {
    return await expenseRepository.getMonthlyGross(year, month);
  }

  /**
   * Set monthly gross income
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @param {number} grossAmount - Gross income amount
   * @returns {Promise<Object>} Updated record
   */
  async setMonthlyGross(year, month, grossAmount) {
    // Validate inputs
    if (!year || !month || grossAmount === undefined || grossAmount === null) {
      throw new Error('Year, month, and gross amount are required');
    }

    const amount = parseFloat(grossAmount);
    if (isNaN(amount) || amount < 0) {
      throw new Error('Gross amount must be a non-negative number');
    }

    return await expenseRepository.setMonthlyGross(year, month, amount);
  }
}

module.exports = new ExpenseService();
