const investmentRepository = require('../repositories/investmentRepository');
const activityLogService = require('./activityLogService');

// Valid investment types
const VALID_INVESTMENT_TYPES = ['TFSA', 'RRSP'];

class InvestmentService {
  /**
   * Validate investment data
   * @param {Object} investment - Investment data to validate
   * @throws {Error} If validation fails
   */
  validateInvestment(investment) {
    const errors = [];

    // Required fields validation
    if (!investment.name || investment.name.trim() === '') {
      errors.push('Name is required');
    }

    if (!investment.type || investment.type.trim() === '') {
      errors.push('Type is required');
    }

    if (investment.initial_value === undefined || investment.initial_value === null) {
      errors.push('Initial value is required');
    }

    // String length validation
    if (investment.name && investment.name.length > 100) {
      errors.push('Name must not exceed 100 characters');
    }

    // Type validation
    if (investment.type && !VALID_INVESTMENT_TYPES.includes(investment.type)) {
      errors.push(`Invalid type. Must be one of: ${VALID_INVESTMENT_TYPES.join(', ')}`);
    }

    // Initial value validation
    if (investment.initial_value !== undefined && investment.initial_value !== null) {
      const initialValue = parseFloat(investment.initial_value);
      if (isNaN(initialValue)) {
        errors.push('Initial value must be a valid number');
      } else if (initialValue < 0) {
        errors.push('Initial value must be a non-negative number');
      }
      // Check for max 2 decimal places
      if (!/^\d+(\.\d{1,2})?$/.test(investment.initial_value.toString())) {
        errors.push('Initial value must have at most 2 decimal places');
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }
  }

  /**
   * Create a new investment
   * @param {Object} data - { name, type, initial_value }
   * @returns {Promise<Object>} Created investment
   */
  async createInvestment(data) {
    // Validate the investment data
    this.validateInvestment(data);

    // Prepare investment object
    const investment = {
      name: data.name.trim(),
      type: data.type.trim(),
      initial_value: parseFloat(data.initial_value)
    };

    // Create investment in repository
    const createdInvestment = await investmentRepository.create(investment);
    
    // Log activity event
    await activityLogService.logEvent(
      'investment_added',
      'investment',
      createdInvestment.id,
      `Added investment: ${createdInvestment.name}`,
      {
        name: createdInvestment.name,
        account_type: createdInvestment.type
      }
    );
    
    return createdInvestment;
  }

  /**
   * Update an investment
   * @param {number} id - Investment ID
   * @param {Object} data - { name, type } (initial_value cannot be updated)
   * @returns {Promise<Object|null>} Updated investment or null if not found
   */
  async updateInvestment(id, data) {
    // Validate ID
    if (!id) {
      throw new Error('Investment ID is required');
    }

    // Validate only name and type (initial_value cannot be updated)
    const errors = [];

    // Validate name
    if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
      errors.push('Name is required');
    } else if (data.name.trim().length > 100) {
      errors.push('Name must be 100 characters or less');
    }

    // Validate type
    if (!data.type || typeof data.type !== 'string') {
      errors.push('Type is required');
    } else if (!['TFSA', 'RRSP'].includes(data.type.trim())) {
      errors.push('Type must be TFSA or RRSP');
    }

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }

    // Fetch old investment for change tracking
    const oldInvestment = await investmentRepository.findById(id);

    // Prepare updates object (only name and type)
    const updates = {
      name: data.name.trim(),
      type: data.type.trim()
    };

    // Update investment in repository
    const updatedInvestment = await investmentRepository.update(id, updates);
    
    if (updatedInvestment) {
      // Build change description
      const changes = [];
      if (oldInvestment && oldInvestment.name !== updatedInvestment.name) {
        changes.push(`name: ${oldInvestment.name} → ${updatedInvestment.name}`);
      }
      if (oldInvestment && oldInvestment.type !== updatedInvestment.type) {
        changes.push(`type: ${oldInvestment.type} → ${updatedInvestment.type}`);
      }
      const changeSummary = changes.length > 0 ? ` (${changes.join(', ')})` : '';

      // Log activity event
      await activityLogService.logEvent(
        'investment_updated',
        'investment',
        updatedInvestment.id,
        `Updated investment: ${updatedInvestment.name}${changeSummary}`,
        {
          name: updatedInvestment.name,
          account_type: updatedInvestment.type,
          changes: changes
        }
      );
    }
    
    return updatedInvestment;
  }

  /**
   * Delete an investment
   * @param {number} id - Investment ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteInvestment(id) {
    // Validate ID
    if (!id) {
      throw new Error('Investment ID is required');
    }

    // Get investment details before deletion for logging
    const investment = await investmentRepository.findById(id);
    
    // Delete investment from repository
    const deleted = await investmentRepository.delete(id);
    
    if (deleted && investment) {
      // Log activity event
      await activityLogService.logEvent(
        'investment_deleted',
        'investment',
        id,
        `Deleted investment: ${investment.name}`,
        {
          name: investment.name,
          account_type: investment.type
        }
      );
    }
    
    return deleted;
  }

  /**
   * Get all investments with their current values
   * @returns {Promise<Array>} Array of investments with currentValue field
   */
  async getAllInvestments() {
    // Fetch all investments with current values from repository
    return await investmentRepository.getAllWithCurrentValues();
  }

  /**
   * Calculate total investment value across all investments
   * @param {Array} investments - Array of investment objects with currentValue field
   * @returns {number} Total investment value
   */
  calculateTotalInvestmentValue(investments) {
    if (!Array.isArray(investments)) {
      return 0;
    }

    return investments.reduce((total, investment) => {
      const currentValue = parseFloat(investment.currentValue) || 0;
      return total + currentValue;
    }, 0);
  }
}

module.exports = new InvestmentService();
