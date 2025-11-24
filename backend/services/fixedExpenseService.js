const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const { validateYearMonth } = require('../utils/validators');

class FixedExpenseService {
  /**
   * Validate fixed expense data
   * @param {Object} fixedExpense - Fixed expense data to validate
   * @throws {Error} If validation fails
   */
  validateFixedExpense(fixedExpense) {
    const errors = [];

    // Required fields validation
    if (!fixedExpense.name || fixedExpense.name.trim() === '') {
      errors.push('Name is required');
    }

    if (fixedExpense.amount === undefined || fixedExpense.amount === null) {
      errors.push('Amount is required');
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

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }
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
   * Create a new fixed expense item
   * @param {Object} data - { year, month, name, amount }
   * @returns {Promise<Object>} Created fixed expense
   */
  async createFixedExpense(data) {
    // Validate required fields
    if (!data.year || !data.month) {
      throw new Error('Year and month are required');
    }

    // Validate the fixed expense data
    this.validateFixedExpense(data);

    // Prepare fixed expense object
    const fixedExpense = {
      year: parseInt(data.year),
      month: parseInt(data.month),
      name: data.name.trim(),
      amount: parseFloat(data.amount)
    };

    // Create fixed expense in repository
    return await fixedExpenseRepository.createFixedExpense(fixedExpense);
  }

  /**
   * Update a fixed expense item
   * @param {number} id - Fixed expense ID
   * @param {Object} data - { name, amount }
   * @returns {Promise<Object|null>} Updated fixed expense or null if not found
   */
  async updateFixedExpense(id, data) {
    // Validate ID
    if (!id) {
      throw new Error('Fixed expense ID is required');
    }

    // Validate the fixed expense data
    this.validateFixedExpense(data);

    // Prepare updates object
    const updates = {
      name: data.name.trim(),
      amount: parseFloat(data.amount)
    };

    // Update fixed expense in repository
    return await fixedExpenseRepository.updateFixedExpense(id, updates);
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

    // Delete fixed expense from repository
    return await fixedExpenseRepository.deleteFixedExpense(id);
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
}

module.exports = new FixedExpenseService();
