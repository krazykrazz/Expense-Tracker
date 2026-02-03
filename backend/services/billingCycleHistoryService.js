const billingCycleRepository = require('../repositories/billingCycleRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const statementBalanceService = require('./statementBalanceService');
const logger = require('../config/logger');

/**
 * BillingCycleHistoryService
 * Business logic for managing billing cycle history records
 * 
 * Handles creation, retrieval, update, and deletion of billing cycle records
 * with automatic calculation of statement balances and discrepancy analysis.
 * 
 * _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_
 */
class BillingCycleHistoryService {
  /**
   * Calculate discrepancy between actual and calculated balance
   * @param {number} actualBalance - User-provided actual statement balance
   * @param {number} calculatedBalance - System-calculated statement balance
   * @returns {Object} { amount, type, description }
   * _Requirements: 3.1, 3.2, 3.3, 3.4_
   */
  calculateDiscrepancy(actualBalance, calculatedBalance) {
    const amount = actualBalance - calculatedBalance;
    const roundedAmount = Math.round(amount * 100) / 100;
    
    let type, description;
    
    if (roundedAmount > 0) {
      type = 'higher';
      description = `Actual balance is $${Math.abs(roundedAmount).toFixed(2)} higher than tracked (potential untracked expenses)`;
    } else if (roundedAmount < 0) {
      type = 'lower';
      description = `Actual balance is $${Math.abs(roundedAmount).toFixed(2)} lower than tracked (potential untracked returns/credits)`;
    } else {
      type = 'match';
      description = 'Tracking is accurate';
    }
    
    return { amount: roundedAmount, type, description };
  }

  /**
   * Validate payment method for billing cycle operations
   * @param {number} paymentMethodId - Payment method ID
   * @returns {Promise<Object>} Payment method if valid
   * @throws {Error} If payment method not found, not a credit card, or no billing cycle configured
   */
  async validatePaymentMethod(paymentMethodId) {
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    
    if (!paymentMethod) {
      const error = new Error('Payment method not found');
      error.code = 'NOT_FOUND';
      throw error;
    }
    
    if (paymentMethod.type !== 'credit_card') {
      const error = new Error('Billing cycle history only available for credit cards');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    
    if (!paymentMethod.billing_cycle_day) {
      const error = new Error('Billing cycle day not configured for this credit card');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    
    return paymentMethod;
  }


  /**
   * Create a billing cycle record with auto-calculation of calculated_statement_balance
   * @param {number} paymentMethodId - Payment method ID
   * @param {Object} data - Billing cycle data
   * @param {number} data.actual_statement_balance - User-provided actual balance
   * @param {number} [data.minimum_payment] - Optional minimum payment amount
   * @param {string} [data.due_date] - Optional due date (YYYY-MM-DD)
   * @param {string} [data.notes] - Optional notes
   * @param {Date} [referenceDate] - Reference date for cycle calculation (defaults to today)
   * @returns {Promise<Object>} Created record with discrepancy
   * _Requirements: 2.1, 2.5_
   */
  async createBillingCycle(paymentMethodId, data, referenceDate = new Date()) {
    // Validate payment method
    const paymentMethod = await this.validatePaymentMethod(paymentMethodId);
    
    // Validate actual_statement_balance
    if (data.actual_statement_balance === undefined || data.actual_statement_balance === null) {
      const error = new Error('Missing required field: actual_statement_balance');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    
    if (typeof data.actual_statement_balance !== 'number' || data.actual_statement_balance < 0) {
      const error = new Error('Actual statement balance must be a non-negative number');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    
    // Calculate cycle dates and statement balance
    const cycleDates = statementBalanceService.calculatePreviousCycleDates(
      paymentMethod.billing_cycle_day,
      referenceDate
    );
    
    // Check for duplicate entry
    const existing = await billingCycleRepository.findByPaymentMethodAndCycleEnd(
      paymentMethodId,
      cycleDates.endDate
    );
    
    if (existing) {
      const error = new Error('Billing cycle record already exists for this period');
      error.code = 'DUPLICATE_ENTRY';
      throw error;
    }
    
    // Get calculated statement balance
    const statementInfo = await statementBalanceService.calculateStatementBalance(
      paymentMethodId,
      referenceDate
    );
    
    const calculatedBalance = statementInfo ? statementInfo.statementBalance : 0;
    
    // Create the billing cycle record
    const billingCycle = await billingCycleRepository.create({
      payment_method_id: paymentMethodId,
      cycle_start_date: cycleDates.startDate,
      cycle_end_date: cycleDates.endDate,
      actual_statement_balance: data.actual_statement_balance,
      calculated_statement_balance: calculatedBalance,
      minimum_payment: data.minimum_payment,
      due_date: data.due_date,
      notes: data.notes
    });
    
    // Calculate and add discrepancy
    const discrepancy = this.calculateDiscrepancy(
      data.actual_statement_balance,
      calculatedBalance
    );
    
    logger.info('Created billing cycle record:', {
      id: billingCycle.id,
      paymentMethodId,
      cycleEndDate: cycleDates.endDate,
      actualBalance: data.actual_statement_balance,
      calculatedBalance,
      discrepancy: discrepancy.amount
    });
    
    return {
      ...billingCycle,
      discrepancy
    };
  }

  /**
   * Get billing cycle history with discrepancy calculations
   * @param {number} paymentMethodId - Payment method ID
   * @param {Object} [options] - Query options
   * @param {number} [options.limit] - Maximum number of records
   * @param {string} [options.startDate] - Filter by cycle_end_date >= startDate
   * @param {string} [options.endDate] - Filter by cycle_end_date <= endDate
   * @returns {Promise<Array>} Array of billing cycle records with discrepancy
   * _Requirements: 2.2_
   */
  async getBillingCycleHistory(paymentMethodId, options = {}) {
    // Validate payment method exists
    await this.validatePaymentMethod(paymentMethodId);
    
    // Get billing cycle records
    const cycles = await billingCycleRepository.findByPaymentMethod(paymentMethodId, options);
    
    // Add discrepancy calculation to each record
    return cycles.map(cycle => ({
      ...cycle,
      discrepancy: this.calculateDiscrepancy(
        cycle.actual_statement_balance,
        cycle.calculated_statement_balance
      )
    }));
  }


  /**
   * Update a billing cycle record
   * Preserves the calculated_statement_balance from the original record
   * @param {number} paymentMethodId - Payment method ID
   * @param {number} cycleId - Billing cycle ID
   * @param {Object} data - Updated data
   * @param {number} [data.actual_statement_balance] - Updated actual balance
   * @param {number} [data.minimum_payment] - Updated minimum payment
   * @param {string} [data.due_date] - Updated due date
   * @param {string} [data.notes] - Updated notes
   * @returns {Promise<Object>} Updated record with discrepancy
   * _Requirements: 2.3_
   */
  async updateBillingCycle(paymentMethodId, cycleId, data) {
    // Validate payment method
    await this.validatePaymentMethod(paymentMethodId);
    
    // Get existing record to verify ownership and preserve calculated balance
    const existing = await billingCycleRepository.findById(cycleId);
    
    if (!existing) {
      const error = new Error('Billing cycle record not found');
      error.code = 'NOT_FOUND';
      throw error;
    }
    
    if (existing.payment_method_id !== paymentMethodId) {
      const error = new Error('Billing cycle record does not belong to this payment method');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    
    // Validate actual_statement_balance if provided
    if (data.actual_statement_balance !== undefined) {
      if (typeof data.actual_statement_balance !== 'number' || data.actual_statement_balance < 0) {
        const error = new Error('Actual statement balance must be a non-negative number');
        error.code = 'VALIDATION_ERROR';
        throw error;
      }
    }
    
    // Update the record (repository preserves calculated_statement_balance)
    const updated = await billingCycleRepository.update(cycleId, {
      actual_statement_balance: data.actual_statement_balance,
      minimum_payment: data.minimum_payment,
      due_date: data.due_date,
      notes: data.notes
    });
    
    if (!updated) {
      const error = new Error('Failed to update billing cycle record');
      error.code = 'UPDATE_FAILED';
      throw error;
    }
    
    // Calculate and add discrepancy
    const discrepancy = this.calculateDiscrepancy(
      updated.actual_statement_balance,
      updated.calculated_statement_balance
    );
    
    logger.info('Updated billing cycle record:', {
      id: cycleId,
      paymentMethodId,
      actualBalance: updated.actual_statement_balance,
      calculatedBalance: updated.calculated_statement_balance,
      discrepancy: discrepancy.amount
    });
    
    return {
      ...updated,
      discrepancy
    };
  }

  /**
   * Delete a billing cycle record
   * @param {number} paymentMethodId - Payment method ID
   * @param {number} cycleId - Billing cycle ID
   * @returns {Promise<boolean>} True if deleted
   * _Requirements: 2.4_
   */
  async deleteBillingCycle(paymentMethodId, cycleId) {
    // Validate payment method
    await this.validatePaymentMethod(paymentMethodId);
    
    // Get existing record to verify ownership
    const existing = await billingCycleRepository.findById(cycleId);
    
    if (!existing) {
      const error = new Error('Billing cycle record not found');
      error.code = 'NOT_FOUND';
      throw error;
    }
    
    if (existing.payment_method_id !== paymentMethodId) {
      const error = new Error('Billing cycle record does not belong to this payment method');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    
    const deleted = await billingCycleRepository.delete(cycleId);
    
    logger.info('Deleted billing cycle record:', {
      id: cycleId,
      paymentMethodId,
      cycleEndDate: existing.cycle_end_date
    });
    
    return deleted;
  }

  /**
   * Get current billing cycle status for a payment method
   * @param {number} paymentMethodId - Payment method ID
   * @param {Date} [referenceDate] - Reference date (defaults to today)
   * @returns {Promise<Object>} Current cycle status
   * _Requirements: 8.5_
   */
  async getCurrentCycleStatus(paymentMethodId, referenceDate = new Date()) {
    // Validate payment method
    const paymentMethod = await this.validatePaymentMethod(paymentMethodId);
    
    // Calculate current cycle dates
    const cycleDates = statementBalanceService.calculatePreviousCycleDates(
      paymentMethod.billing_cycle_day,
      referenceDate
    );
    
    // Check if entry exists for current cycle
    const existingEntry = await billingCycleRepository.findByPaymentMethodAndCycleEnd(
      paymentMethodId,
      cycleDates.endDate
    );
    
    // Get calculated statement balance
    const statementInfo = await statementBalanceService.calculateStatementBalance(
      paymentMethodId,
      referenceDate
    );
    
    const calculatedBalance = statementInfo ? statementInfo.statementBalance : 0;
    
    // Calculate days until cycle end
    const today = new Date(referenceDate);
    const cycleEnd = new Date(cycleDates.endDate);
    const daysUntilCycleEnd = Math.ceil((cycleEnd - today) / (1000 * 60 * 60 * 24));
    
    return {
      hasActualBalance: !!existingEntry,
      cycleStartDate: cycleDates.startDate,
      cycleEndDate: cycleDates.endDate,
      actualBalance: existingEntry ? existingEntry.actual_statement_balance : null,
      calculatedBalance,
      daysUntilCycleEnd,
      needsEntry: !existingEntry
    };
  }
}

module.exports = new BillingCycleHistoryService();
