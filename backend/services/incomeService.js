const incomeRepository = require('../repositories/incomeRepository');

class IncomeService {
  /**
   * Validate income source data
   * @param {Object} incomeSource - Income source data to validate
   * @throws {Error} If validation fails
   */
  validateIncomeSource(incomeSource) {
    const errors = [];

    // Required fields validation
    if (!incomeSource.name || incomeSource.name.trim() === '') {
      errors.push('Name is required');
    }

    if (incomeSource.amount === undefined || incomeSource.amount === null) {
      errors.push('Amount is required');
    }

    // String length validation
    if (incomeSource.name && incomeSource.name.length > 100) {
      errors.push('Name must not exceed 100 characters');
    }

    // Amount validation
    if (incomeSource.amount !== undefined && incomeSource.amount !== null) {
      const amount = parseFloat(incomeSource.amount);
      if (isNaN(amount)) {
        errors.push('Amount must be a valid number');
      } else if (amount < 0) {
        errors.push('Amount must be a non-negative number');
      }
      // Check for max 2 decimal places
      if (!/^\d+(\.\d{1,2})?$/.test(incomeSource.amount.toString())) {
        errors.push('Amount must have at most 2 decimal places');
      }
    }

    // Year and month validation (when provided)
    if (incomeSource.year !== undefined) {
      const year = parseInt(incomeSource.year);
      if (isNaN(year)) {
        errors.push('Year must be a valid number');
      }
    }

    if (incomeSource.month !== undefined) {
      const month = parseInt(incomeSource.month);
      if (isNaN(month) || month < 1 || month > 12) {
        errors.push('Month must be between 1 and 12');
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }
  }

  /**
   * Get all income sources for a month with total
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object>} { sources: Array, total: number }
   */
  async getMonthlyIncome(year, month) {
    // Validate year and month
    if (!year || !month) {
      throw new Error('Year and month are required');
    }

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum)) {
      throw new Error('Year and month must be valid numbers');
    }

    if (monthNum < 1 || monthNum > 12) {
      throw new Error('Month must be between 1 and 12');
    }

    // Fetch income sources and total from repository
    const sources = await incomeRepository.getIncomeSources(yearNum, monthNum);
    const total = await incomeRepository.getTotalMonthlyGross(yearNum, monthNum);

    return {
      sources,
      total
    };
  }

  /**
   * Create a new income source
   * @param {Object} data - { year, month, name, amount }
   * @returns {Promise<Object>} Created income source
   */
  async createIncomeSource(data) {
    // Validate required fields
    if (!data.year || !data.month) {
      throw new Error('Year and month are required');
    }

    // Validate the income source data
    this.validateIncomeSource(data);

    // Prepare income source object
    const incomeSource = {
      year: parseInt(data.year),
      month: parseInt(data.month),
      name: data.name.trim(),
      amount: parseFloat(data.amount)
    };

    // Create income source in repository
    return await incomeRepository.createIncomeSource(incomeSource);
  }

  /**
   * Update an income source
   * @param {number} id - Income source ID
   * @param {Object} data - { name, amount }
   * @returns {Promise<Object|null>} Updated income source or null if not found
   */
  async updateIncomeSource(id, data) {
    // Validate ID
    if (!id) {
      throw new Error('Income source ID is required');
    }

    // Validate the income source data
    this.validateIncomeSource(data);

    // Prepare updates object
    const updates = {
      name: data.name.trim(),
      amount: parseFloat(data.amount)
    };

    // Update income source in repository
    return await incomeRepository.updateIncomeSource(id, updates);
  }

  /**
   * Delete an income source
   * @param {number} id - Income source ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteIncomeSource(id) {
    // Validate ID
    if (!id) {
      throw new Error('Income source ID is required');
    }

    // Delete income source from repository
    return await incomeRepository.deleteIncomeSource(id);
  }

  /**
   * Copy income sources from previous month
   * @param {number} year - Target year
   * @param {number} month - Target month (1-12)
   * @returns {Promise<Array>} Array of created income sources
   */
  async copyFromPreviousMonth(year, month) {
    // Validate year and month
    if (!year || !month) {
      throw new Error('Year and month are required');
    }

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum)) {
      throw new Error('Year and month must be valid numbers');
    }

    if (monthNum < 1 || monthNum > 12) {
      throw new Error('Month must be between 1 and 12');
    }

    // Check if current month already has income sources
    const existingSources = await incomeRepository.getIncomeSources(yearNum, monthNum);
    if (existingSources.length > 0) {
      throw new Error('Cannot copy from previous month. Current month already has income sources.');
    }

    // Copy from previous month
    return await incomeRepository.copyFromPreviousMonth(yearNum, monthNum);
  }
}

module.exports = new IncomeService();
