const incomeRepository = require('../repositories/incomeRepository');
const { validateYearMonth } = require('../utils/validators');
const { INCOME_CATEGORIES } = require('../utils/constants');
const activityLogService = require('./activityLogService');
const logger = require('../config/logger');

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

    // Category validation
    if (incomeSource.category) {
      if (!INCOME_CATEGORIES.includes(incomeSource.category)) {
        errors.push(`Category must be one of: ${INCOME_CATEGORIES.join(', ')}`);
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
   * Get all income sources for a month with total and category breakdown
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object>} { sources: Array, total: number, byCategory: Object }
   */
  async getMonthlyIncome(year, month) {
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

    // Fetch income sources, total, and category breakdown from repository
    const sources = await incomeRepository.getIncomeSources(yearNum, monthNum);
    const total = await incomeRepository.getTotalMonthlyGross(yearNum, monthNum);
    const byCategory = await incomeRepository.getIncomeByCategoryForMonth(yearNum, monthNum);

    return {
      sources,
      total,
      byCategory
    };
  }

  /**
   * Create a new income source
   * @param {Object} data - { year, month, name, amount, category }
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
      amount: parseFloat(data.amount),
      category: data.category || 'Other'  // Default to Other
    };

    // Create income source in repository
    const created = await incomeRepository.createIncomeSource(incomeSource);

    // Log activity event (fire-and-forget)
    activityLogService.logEvent(
      'income_source_added',
      'income_source',
      created.id,
      `Added income source "${incomeSource.name}" of $${incomeSource.amount.toFixed(2)}`,
      {
        name: incomeSource.name,
        amount: incomeSource.amount,
        category: incomeSource.category,
        year: incomeSource.year,
        month: incomeSource.month
      }
    );

    return created;
  }

  /**
   * Update an income source
   * @param {number} id - Income source ID
   * @param {Object} data - { name, amount, category }
   * @returns {Promise<Object|null>} Updated income source or null if not found
   */
  async updateIncomeSource(id, data) {
    // Validate ID
    if (!id) {
      throw new Error('Income source ID is required');
    }

    // Validate the income source data
    this.validateIncomeSource(data);

    // Fetch existing source before update for changes tracking
    const existingSource = await incomeRepository.findById(id);

    // Prepare updates object
    const updates = {
      name: data.name.trim(),
      amount: parseFloat(data.amount),
      category: data.category || 'Other'
    };

    // Update income source in repository
    const updated = await incomeRepository.updateIncomeSource(id, updates);

    if (updated && existingSource) {
      // Build changes array
      const changes = [];
      if (existingSource.name !== updates.name) {
        changes.push({ field: 'name', from: existingSource.name, to: updates.name });
      }
      if (existingSource.amount !== updates.amount) {
        changes.push({ field: 'amount', from: existingSource.amount, to: updates.amount });
      }
      if (existingSource.category !== updates.category) {
        changes.push({ field: 'category', from: existingSource.category, to: updates.category });
      }

      // Log activity event (fire-and-forget)
      activityLogService.logEvent(
        'income_source_updated',
        'income_source',
        id,
        `Updated income source "${updates.name}"`,
        {
          name: updates.name,
          amount: updates.amount,
          category: updates.category,
          changes
        }
      );
    }

    return updated;
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

    // Fetch income source BEFORE deletion to capture metadata (Requirement 14.1)
    const existingSource = await incomeRepository.findById(id);

    // Delete income source from repository
    const deleted = await incomeRepository.deleteIncomeSource(id);

    if (deleted && existingSource) {
      // Log activity event (fire-and-forget)
      activityLogService.logEvent(
        'income_source_deleted',
        'income_source',
        id,
        `Deleted income source "${existingSource.name}" of $${existingSource.amount.toFixed(2)}`,
        {
          name: existingSource.name,
          amount: existingSource.amount,
          category: existingSource.category
        }
      );
    }

    return deleted;
  }

  /**
   * Copy income sources from previous month
   * @param {number} year - Target year
   * @param {number} month - Target month (1-12)
   * @returns {Promise<Array>} Array of created income sources
   */
  async copyFromPreviousMonth(year, month) {
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

    // Check if current month already has income sources
    const existingSources = await incomeRepository.getIncomeSources(yearNum, monthNum);
    if (existingSources.length > 0) {
      throw new Error('Cannot copy from previous month. Current month already has income sources.');
    }

    // Copy from previous month
    const copiedSources = await incomeRepository.copyFromPreviousMonth(yearNum, monthNum);

    if (copiedSources.length > 0) {
      // Calculate source month
      let sourceMonth = monthNum - 1;
      let sourceYear = yearNum;
      if (sourceMonth < 1) {
        sourceMonth = 12;
        sourceYear = yearNum - 1;
      }

      // Log activity event (fire-and-forget)
      activityLogService.logEvent(
        'income_sources_copied',
        'income_source',
        null,
        `Copied ${copiedSources.length} income source(s) from ${sourceYear}-${String(sourceMonth).padStart(2, '0')} to ${yearNum}-${String(monthNum).padStart(2, '0')}`,
        {
          sourceMonth: `${sourceYear}-${String(sourceMonth).padStart(2, '0')}`,
          targetMonth: `${yearNum}-${String(monthNum).padStart(2, '0')}`,
          count: copiedSources.length
        }
      );
    }

    return copiedSources;
  }

  /**
   * Get annual income breakdown by category
   * @param {number} year - Year
   * @returns {Promise<Object>} Category breakdown for the year
   */
  async getAnnualIncomeByCategory(year) {
    const yearNum = parseInt(year);
    
    if (isNaN(yearNum)) {
      throw new Error('Year must be a valid number');
    }

    return await incomeRepository.getIncomeByCategoryForYear(yearNum);
  }
}

module.exports = new IncomeService();
