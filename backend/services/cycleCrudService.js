const billingCycleRepository = require('../repositories/billingCycleRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const statementBalanceService = require('./statementBalanceService');
const activityLogService = require('./activityLogService');
const { calculateEffectiveBalance } = require('../utils/effectiveBalanceUtil');
const logger = require('../config/logger');

/**
 * CycleCrudService
 * Handles create, read, update, and delete operations for billing cycles.
 * Extracted from BillingCycleHistoryService as part of the billing cycle simplification.
 *
 * Dependencies:
 *   - billingCycleRepository: data access for billing cycle records
 *   - paymentMethodRepository: payment method lookup for validation
 *   - statementBalanceService: cycle date calculation
 *   - activityLogService: activity event logging
 *   - effectiveBalanceUtil: effective balance determination
 *
 * _Requirements: 4.1, 4.4, 5.2_
 */

/**
 * Lazy-load cycleGenerationService for calculateCycleBalance.
 * Avoids circular dependency (cycleGenerationService also lazy-loads cycleCrudService).
 */
function getCycleGenerationService() {
  return require('./cycleGenerationService');
}

/**
 * Lazy-load cycleAnalyticsService for calculateDiscrepancy.
 * Avoids circular dependency (cycleAnalyticsService also lazy-loads cycleCrudService).
 */
function getCycleAnalyticsService() {
  return require('./cycleAnalyticsService');
}

/**
 * Compute effective_balance and balance_type for persisted columns.
 * Uses effectiveBalanceUtil to ensure consistency with in-memory computation.
 * @param {Object} cycleData - Object with actual_statement_balance, calculated_statement_balance, is_user_entered
 * @returns {{ effective_balance: number, balance_type: string }}
 */
function computeEffectiveBalanceColumns(cycleData) {
  const { effectiveBalance, balanceType } = calculateEffectiveBalance(cycleData);
  return { effective_balance: effectiveBalance, balance_type: balanceType };
}

/**
 * Validate payment method for billing cycle operations
 * @param {number} paymentMethodId - Payment method ID
 * @returns {Promise<Object>} Payment method if valid
 * @throws {Error} If payment method not found, not a credit card, or no billing cycle configured
 */
async function validatePaymentMethod(paymentMethodId) {
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
 * @param {string} [data.notes] - Optional notes
 * @param {string} [data.statement_pdf_path] - Optional PDF file path
 * @param {Date} [referenceDate] - Reference date for cycle calculation (defaults to today)
 * @returns {Promise<Object>} Created record with discrepancy
 * _Requirements: 2.1, 2.5_
 */
async function createBillingCycle(paymentMethodId, data, referenceDate = new Date()) {
  const cycleGenService = getCycleGenerationService();
  const analyticsService = getCycleAnalyticsService();

  // Validate payment method
  const paymentMethod = await validatePaymentMethod(paymentMethodId);

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

  // Get calculated statement balance using the common formula:
  // max(0, round(previousBalance + expenses - payments, 2))
  const { calculatedBalance: computedBalance } = await cycleGenService.calculateCycleBalance(
    paymentMethodId,
    cycleDates.startDate,
    cycleDates.endDate
  );

  const calculatedBalance = computedBalance;

  // Create the billing cycle record
  const billingCycle = await billingCycleRepository.create({
    payment_method_id: paymentMethodId,
    cycle_start_date: cycleDates.startDate,
    cycle_end_date: cycleDates.endDate,
    actual_statement_balance: data.actual_statement_balance,
    calculated_statement_balance: calculatedBalance,
    minimum_payment: data.minimum_payment,
    notes: data.notes,
    statement_pdf_path: data.statement_pdf_path,
    is_user_entered: 1,  // User-created cycles are marked as user-entered
    ...computeEffectiveBalanceColumns({
      actual_statement_balance: data.actual_statement_balance,
      calculated_statement_balance: calculatedBalance,
      is_user_entered: 1
    })
  });

  // Calculate and add discrepancy
  const discrepancy = analyticsService.calculateDiscrepancy(
    data.actual_statement_balance,
    calculatedBalance
  );

  logger.info('Created billing cycle record:', {
    id: billingCycle.id,
    paymentMethodId,
    cycleEndDate: cycleDates.endDate,
    actualBalance: data.actual_statement_balance,
    calculatedBalance,
    discrepancy: discrepancy.amount,
    hasPdf: !!data.statement_pdf_path
  });

  // Log activity event (fire-and-forget)
  try {
    await activityLogService.logEvent(
      'billing_cycle_added',
      'billing_cycle',
      billingCycle.id,
      `Added billing cycle for ${paymentMethod.display_name} ending ${cycleDates.endDate}`,
      {
        paymentMethodId,
        cycleEndDate: cycleDates.endDate,
        actualBalance: data.actual_statement_balance,
        cardName: paymentMethod.display_name
      }
    );
  } catch (err) {
    logger.error('Failed to log billing cycle creation activity:', err);
  }

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
async function getBillingCycleHistory(paymentMethodId, options = {}) {
  const analyticsService = getCycleAnalyticsService();

  // Validate payment method exists
  await validatePaymentMethod(paymentMethodId);

  // Get billing cycle records
  const cycles = await billingCycleRepository.findByPaymentMethod(paymentMethodId, options);

  // Add discrepancy calculation to each record
  return cycles.map(cycle => ({
    ...cycle,
    discrepancy: analyticsService.calculateDiscrepancy(
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
 * @param {string} [data.notes] - Updated notes
 * @returns {Promise<Object>} Updated record with discrepancy
 * _Requirements: 2.3_
 */
async function updateBillingCycle(paymentMethodId, cycleId, data) {
  const analyticsService = getCycleAnalyticsService();

  // Validate payment method
  const paymentMethod = await validatePaymentMethod(paymentMethodId);

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
  // Mark as user-entered since user is explicitly updating
  const updatePayload = {
    actual_statement_balance: data.actual_statement_balance,
    minimum_payment: data.minimum_payment,
    notes: data.notes,
    is_user_entered: 1,  // Mark as user-entered when user updates
    ...computeEffectiveBalanceColumns({
      actual_statement_balance: data.actual_statement_balance !== undefined
        ? data.actual_statement_balance
        : existing.actual_statement_balance,
      calculated_statement_balance: existing.calculated_statement_balance,
      is_user_entered: 1
    })
  };

  // Pass statement_pdf_path if provided (from PDF upload)
  if (data.statement_pdf_path !== undefined) {
    updatePayload.statement_pdf_path = data.statement_pdf_path;
  }

  const updated = await billingCycleRepository.update(cycleId, updatePayload);

  if (!updated) {
    const error = new Error('Failed to update billing cycle record');
    error.code = 'UPDATE_FAILED';
    throw error;
  }

  // Calculate and add discrepancy
  const discrepancy = analyticsService.calculateDiscrepancy(
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

  // Build changes array for activity log
  const changes = [];
  if (existing.actual_statement_balance !== updated.actual_statement_balance) {
    changes.push({ field: 'actual_statement_balance', from: existing.actual_statement_balance, to: updated.actual_statement_balance });
  }
  if (existing.minimum_payment !== updated.minimum_payment) {
    changes.push({ field: 'minimum_payment', from: existing.minimum_payment, to: updated.minimum_payment });
  }
  if (existing.notes !== updated.notes) {
    changes.push({ field: 'notes', from: existing.notes, to: updated.notes });
  }
  if (existing.statement_pdf_path !== updated.statement_pdf_path) {
    changes.push({ field: 'statement_pdf_path', from: existing.statement_pdf_path || null, to: updated.statement_pdf_path || null });
  }

  // Log activity event (fire-and-forget)
  try {
    await activityLogService.logEvent(
      'billing_cycle_updated',
      'billing_cycle',
      cycleId,
      `Updated billing cycle for ${paymentMethod.display_name} ending ${updated.cycle_end_date}`,
      {
        paymentMethodId,
        cycleEndDate: updated.cycle_end_date,
        changes,
        cardName: paymentMethod.display_name
      }
    );
  } catch (err) {
    logger.error('Failed to log billing cycle update activity:', err);
  }

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
async function deleteBillingCycle(paymentMethodId, cycleId) {
  // Validate payment method
  const paymentMethod = await validatePaymentMethod(paymentMethodId);

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

  // Log activity event (fire-and-forget)
  try {
    await activityLogService.logEvent(
      'billing_cycle_deleted',
      'billing_cycle',
      cycleId,
      `Deleted billing cycle for ${paymentMethod.display_name} ending ${existing.cycle_end_date}`,
      {
        paymentMethodId,
        cycleEndDate: existing.cycle_end_date,
        cardName: paymentMethod.display_name
      }
    );
  } catch (err) {
    logger.error('Failed to log billing cycle deletion activity:', err);
  }

  return deleted;
}

module.exports = {
  validatePaymentMethod,
  createBillingCycle,
  getBillingCycleHistory,
  updateBillingCycle,
  deleteBillingCycle
};
