const investmentValueRepository = require('../repositories/investmentValueRepository');
const activityLogService = require('./activityLogService');
const investmentRepository = require('../repositories/investmentRepository');

class InvestmentValueService {
  /**
   * Validate value entry data
   * @param {Object} entry - Value entry data to validate
   * @throws {Error} If validation fails
   */
  validateValueEntry(entry) {
    const errors = [];

    // Required fields validation
    if (entry.investment_id === undefined || entry.investment_id === null) {
      errors.push('Investment ID is required');
    }

    if (entry.year === undefined || entry.year === null) {
      errors.push('Year is required');
    }

    if (entry.month === undefined || entry.month === null) {
      errors.push('Month is required');
    }

    if (entry.value === undefined || entry.value === null) {
      errors.push('Value is required');
    }

    // Investment ID validation
    if (entry.investment_id !== undefined && entry.investment_id !== null) {
      const investmentId = parseInt(entry.investment_id);
      if (isNaN(investmentId) || investmentId <= 0) {
        errors.push('Investment ID must be a positive integer');
      }
    }

    // Year validation
    if (entry.year !== undefined && entry.year !== null) {
      const year = parseInt(entry.year);
      if (isNaN(year)) {
        errors.push('Year must be a valid number');
      } else if (year < 1900 || year > 2100) {
        errors.push('Year must be between 1900 and 2100');
      }
    }

    // Month validation
    if (entry.month !== undefined && entry.month !== null) {
      const month = parseInt(entry.month);
      if (isNaN(month)) {
        errors.push('Month must be a valid number');
      } else if (month < 1 || month > 12) {
        errors.push('Month must be between 1 and 12');
      }
    }

    // Value validation
    if (entry.value !== undefined && entry.value !== null) {
      const value = parseFloat(entry.value);
      if (isNaN(value)) {
        errors.push('Value must be a valid number');
      } else if (value < 0) {
        errors.push('Value must be a non-negative number');
      }
      // Check for max 2 decimal places
      if (!/^\d+(\.\d{1,2})?$/.test(entry.value.toString())) {
        errors.push('Value must have at most 2 decimal places');
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }
  }

  /**
   * Calculate value change from previous value
   * @param {number} currentValue - Current value
   * @param {number} previousValue - Previous value
   * @returns {number} Value change (current - previous)
   */
  calculateValueChange(currentValue, previousValue) {
    const current = parseFloat(currentValue) || 0;
    const previous = parseFloat(previousValue) || 0;
    return current - previous;
  }

  /**
   * Calculate percentage change from previous value
   * @param {number} currentValue - Current value
   * @param {number} previousValue - Previous value
   * @returns {number} Percentage change ((current - previous) / previous * 100)
   */
  calculatePercentageChange(currentValue, previousValue) {
    const current = parseFloat(currentValue) || 0;
    const previous = parseFloat(previousValue) || 0;
    
    // Avoid division by zero
    if (previous === 0) {
      return current === 0 ? 0 : 100;
    }
    
    return ((current - previous) / previous) * 100;
  }

  /**
   * Create or update a value entry (upsert)
   * @param {Object} data - { investment_id, year, month, value }
   * @returns {Promise<Object>} Created or updated value entry
   */
  async createOrUpdateValue(data) {
    // Validate the value entry data
    this.validateValueEntry(data);

    // Prepare value entry object
    const valueEntry = {
      investment_id: parseInt(data.investment_id),
      year: parseInt(data.year),
      month: parseInt(data.month),
      value: parseFloat(data.value)
    };

    // Upsert value entry in repository
    const result = await investmentValueRepository.upsert(valueEntry);

    // Activity logging (fire-and-forget)
    try {
      const investment = await investmentRepository.findById(valueEntry.investment_id);
      const investmentName = investment ? investment.name : 'Unknown';
      activityLogService.logEvent(
        'investment_value_updated',
        'investment_value',
        result.id,
        `Updated investment value for ${investmentName} (${valueEntry.year}-${String(valueEntry.month).padStart(2, '0')}) to $${valueEntry.value.toFixed(2)}`,
        { investmentId: valueEntry.investment_id, year: valueEntry.year, month: valueEntry.month, value: valueEntry.value, investmentName }
      );
    } catch (e) {
      // Fire-and-forget - don't block the operation
    }

    return result;
  }

  /**
   * Update a value entry
   * @param {number} id - Value entry ID
   * @param {Object} data - { value }
   * @returns {Promise<Object|null>} Updated value entry or null if not found
   */
  async updateValue(id, data) {
    // Validate ID
    if (!id) {
      throw new Error('Value entry ID is required');
    }

    // Validate value
    if (data.value === undefined || data.value === null) {
      throw new Error('Value is required');
    }

    const value = parseFloat(data.value);
    if (isNaN(value)) {
      throw new Error('Value must be a valid number');
    }
    if (value < 0) {
      throw new Error('Value must be a non-negative number');
    }
    // Check for max 2 decimal places
    if (!/^\d+(\.\d{1,2})?$/.test(data.value.toString())) {
      throw new Error('Value must have at most 2 decimal places');
    }

    // Prepare updates object
    const updates = {
      value: value
    };

    // Update value entry in repository
    const result = await investmentValueRepository.update(id, updates);

    // Activity logging (fire-and-forget)
    if (result) {
      activityLogService.logEvent(
        'investment_value_updated',
        'investment_value',
        id,
        `Updated investment value #${id} to $${value.toFixed(2)}`,
        { id, value }
      );
    }

    return result;
  }

  /**
   * Delete a value entry
   * @param {number} id - Value entry ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteValue(id) {
    // Validate ID
    if (!id) {
      throw new Error('Value entry ID is required');
    }

    // Fetch value entry BEFORE deletion for activity log metadata
    const existingValue = await investmentValueRepository.findById(id);

    // Delete value entry from repository
    const result = await investmentValueRepository.delete(id);

    // Activity logging (fire-and-forget)
    if (result && existingValue) {
      activityLogService.logEvent(
        'investment_value_deleted',
        'investment_value',
        id,
        `Deleted investment value #${id} (${existingValue.year}-${String(existingValue.month).padStart(2, '0')})`,
        { id, investmentId: existingValue.investment_id, year: existingValue.year, month: existingValue.month }
      );
    }

    return result;
  }

  /**
   * Get value history for an investment with change calculations
   * @param {number} investmentId - Investment ID
   * @returns {Promise<Array>} Array of value entries with valueChange and percentageChange fields
   */
  async getValueHistory(investmentId) {
    // Validate investment ID
    if (!investmentId) {
      throw new Error('Investment ID is required');
    }

    // Fetch value history from repository (sorted most recent first)
    const valueEntries = await investmentValueRepository.getValueHistory(investmentId);

    // Calculate changes for each entry
    const enrichedEntries = valueEntries.map((entry, index) => {
      // Get previous entry (next in array since sorted most recent first)
      const previousEntry = valueEntries[index + 1];

      let valueChange = 0;
      let percentageChange = 0;

      if (previousEntry) {
        valueChange = this.calculateValueChange(entry.value, previousEntry.value);
        percentageChange = this.calculatePercentageChange(entry.value, previousEntry.value);
      }

      return {
        ...entry,
        valueChange: parseFloat(valueChange.toFixed(2)),
        percentageChange: parseFloat(percentageChange.toFixed(2))
      };
    });

    return enrichedEntries;
  }
}

module.exports = new InvestmentValueService();
