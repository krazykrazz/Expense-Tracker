const billingCycleRepository = require('../repositories/billingCycleRepository');
const statementBalanceService = require('./statementBalanceService');
const { calculateEffectiveBalance } = require('../utils/effectiveBalanceUtil');
const logger = require('../config/logger');

/**
 * CycleGenerationService
 * Handles auto-generation logic, missing cycle detection, balance computation,
 * and current cycle status.
 * Extracted from BillingCycleHistoryService as part of the billing cycle simplification.
 *
 * Dependencies:
 *   - billingCycleRepository: data access for billing cycle records
 *   - statementBalanceService: cycle date calculation
 *   - effectiveBalanceUtil: effective balance determination
 *
 * _Requirements: 4.3, 4.4, 5.4_
 */

/**
 * Lazy-load cycleCrudService to access validatePaymentMethod.
 * Avoids circular dependency issues.
 */
function getCycleCrudService() {
  return require('./cycleCrudService');
}

/**
 * Calculate the statement balance for a billing cycle period.
 * Formula: max(0, round(previousBalance + totalExpenses - totalPayments, 2))
 *
 * @param {number} paymentMethodId - Payment method ID
 * @param {string} startDate - Cycle start date (YYYY-MM-DD)
 * @param {string} endDate - Cycle end date (YYYY-MM-DD)
 * @param {number|null} [previousCycleOverride=null] - Override for previous cycle balance (used in batch generation)
 * @returns {Promise<{calculatedBalance: number, previousBalance: number, totalExpenses: number, totalPayments: number}>}
 */
async function calculateCycleBalance(paymentMethodId, startDate, endDate, previousCycleOverride = null) {
  const { getDatabase } = require('../database/db');
  const db = await getDatabase();

  // Query total expenses in the cycle period
  const totalExpenses = await new Promise((resolve, reject) => {
    const sql = `
      SELECT COALESCE(SUM(COALESCE(original_cost, amount)), 0) as total
      FROM expenses
      WHERE payment_method_id = ?
        AND COALESCE(posted_date, date) >= ?
        AND COALESCE(posted_date, date) <= ?
    `;
    db.get(sql, [paymentMethodId, startDate, endDate], (err, row) => {
      if (err) {
        logger.error('Failed to query expenses for cycle balance calculation:', err);
        reject(err);
        return;
      }
      resolve(row?.total || 0);
    });
  });

  // Query total payments in the cycle period
  const totalPayments = await new Promise((resolve, reject) => {
    const sql = `
      SELECT COALESCE(SUM(amount), 0) as total
      FROM credit_card_payments
      WHERE payment_method_id = ?
        AND payment_date >= ?
        AND payment_date <= ?
    `;
    db.get(sql, [paymentMethodId, startDate, endDate], (err, row) => {
      if (err) {
        logger.error('Failed to query payments for cycle balance calculation:', err);
        reject(err);
        return;
      }
      resolve(row?.total || 0);
    });
  });

  // Determine previous cycle balance
  let previousBalance;
  if (typeof previousCycleOverride === 'number') {
    previousBalance = previousCycleOverride;
  } else {
    const previousCycle = await billingCycleRepository.findPreviousCycle(paymentMethodId, startDate);
    const { effectiveBalance } = calculateEffectiveBalance(previousCycle);
    previousBalance = effectiveBalance;
  }

  // Formula: max(0, round(previousBalance + totalExpenses - totalPayments, 2))
  const calculatedBalance = Math.max(0, Math.round((previousBalance + totalExpenses - totalPayments) * 100) / 100);

  return { calculatedBalance, previousBalance, totalExpenses, totalPayments };
}

/**
 * Recalculate the statement balance for a billing cycle period.
 * Convenience wrapper around calculateCycleBalance.
 *
 * @param {number} paymentMethodId - Payment method ID
 * @param {string} cycleStartDate - Cycle start date (YYYY-MM-DD)
 * @param {string} cycleEndDate - Cycle end date (YYYY-MM-DD)
 * @returns {Promise<number>} Calculated balance
 */
async function recalculateBalance(paymentMethodId, cycleStartDate, cycleEndDate) {
  const { calculatedBalance } = await calculateCycleBalance(paymentMethodId, cycleStartDate, cycleEndDate);
  return calculatedBalance;
}

/**
 * Get missing billing cycle periods for a payment method.
 * Looks back monthsBack months from referenceDate and identifies periods
 * without existing billing cycle records.
 *
 * @param {number} paymentMethodId - Payment method ID
 * @param {number} billingCycleDay - Day of month for billing cycle
 * @param {Date} [referenceDate=new Date()] - Reference date
 * @param {number} [monthsBack=12] - Number of months to look back
 * @returns {Promise<Array<{startDate: string, endDate: string}>>} Missing periods (newest-first)
 */
async function getMissingCyclePeriods(paymentMethodId, billingCycleDay, referenceDate = new Date(), monthsBack = 12) {
  if (!billingCycleDay || billingCycleDay < 1 || billingCycleDay > 31) {
    return [];
  }

  // Get existing billing cycle records
  const existingCycles = await billingCycleRepository.findByPaymentMethod(paymentMethodId);
  const existingEndDates = new Set(existingCycles.map(c => c.cycle_end_date));

  const missingPeriods = [];
  let currentRef = new Date(referenceDate);

  // Generate cycle periods going back monthsBack months
  for (let i = 0; i < monthsBack; i++) {
    const cycleDates = statementBalanceService.calculatePreviousCycleDates(
      billingCycleDay,
      currentRef
    );

    // Check if this period already has a record
    if (!existingEndDates.has(cycleDates.endDate)) {
      missingPeriods.push({
        startDate: cycleDates.startDate,
        endDate: cycleDates.endDate
      });
    }

    // Move reference date back by one month using UTC methods
    // to stay consistent with calculatePreviousCycleDates which reads UTC
    currentRef = new Date(currentRef);
    currentRef.setUTCMonth(currentRef.getUTCMonth() - 1);
  }

  return missingPeriods;
}

/**
 * Auto-generate missing billing cycle records for a payment method.
 * Processes oldest-first for correct carry-forward of balances.
 *
 * @param {number} paymentMethodId - Payment method ID
 * @param {number} billingCycleDay - Day of month for billing cycle
 * @param {Date} [referenceDate=new Date()] - Reference date
 * @returns {Promise<Array>} Array of generated billing cycle records
 */
async function autoGenerateBillingCycles(paymentMethodId, billingCycleDay, referenceDate = new Date(), overrides = {}) {
  // Allow the facade to inject its own getMissingCyclePeriods / calculateCycleBalance
  // so that tests mocking the facade methods have their mocks take effect.
  const _getMissingCyclePeriods = overrides.getMissingCyclePeriods || getMissingCyclePeriods;
  const _calculateCycleBalance = overrides.calculateCycleBalance || calculateCycleBalance;

  // Validate billing cycle day
  if (!billingCycleDay || billingCycleDay < 1 || billingCycleDay > 31) {
    logger.debug('Auto-generation skipped: no valid billing_cycle_day', { paymentMethodId, billingCycleDay });
    return [];
  }

  // Get missing periods
  const missingPeriods = await _getMissingCyclePeriods(
    paymentMethodId,
    billingCycleDay,
    referenceDate,
    12
  );

  if (missingPeriods.length === 0) {
    logger.debug('Auto-generation: no missing periods found', { paymentMethodId });
    return [];
  }

  // Reverse to process oldest-first (getMissingCyclePeriods returns newest-first)
  // This is critical for carry-forward: each cycle needs the previous cycle's balance
  missingPeriods.reverse();

  const generatedCycles = [];
  let previousCycleBalance = null; // Track carry-forward from just-created cycles

  for (const period of missingPeriods) {
    try {
      // Use shared helper — pass previousCycleOverride for batch carry-forward
      const { calculatedBalance, previousBalance, totalExpenses, totalPayments } =
        await _calculateCycleBalance(paymentMethodId, period.startDate, period.endDate, previousCycleBalance);

      // Create the billing cycle record with actual_statement_balance = 0
      const billingCycle = await billingCycleRepository.create({
        payment_method_id: paymentMethodId,
        cycle_start_date: period.startDate,
        cycle_end_date: period.endDate,
        actual_statement_balance: 0, // Auto-generated cycles have no user-entered balance
        calculated_statement_balance: calculatedBalance,
        minimum_payment: null,
        notes: null,
        statement_pdf_path: null
      });

      // Track this cycle's calculated balance for carry-forward to the next period
      previousCycleBalance = calculatedBalance;

      generatedCycles.push(billingCycle);

      logger.debug('Auto-generated billing cycle:', {
        id: billingCycle.id,
        paymentMethodId,
        cycleEndDate: period.endDate,
        calculatedBalance,
        previousBalance,
        totalExpenses,
        totalPayments
      });
    } catch (error) {
      // Skip this period if there's an error (e.g., duplicate entry race condition)
      logger.warn('Failed to auto-generate billing cycle:', {
        paymentMethodId,
        period,
        error: error.message
      });
    }
  }

  logger.info('Auto-generated billing cycles:', {
    paymentMethodId,
    count: generatedCycles.length
  });

  return generatedCycles;
}

/**
 * Get the current billing cycle status for a payment method.
 *
 * @param {number} paymentMethodId - Payment method ID
 * @param {Date} [referenceDate=new Date()] - Reference date
 * @returns {Promise<Object>} Current cycle status
 */
async function getCurrentCycleStatus(paymentMethodId, referenceDate = new Date()) {
  const cycleCrudService = getCycleCrudService();

  // Validate payment method
  const paymentMethod = await cycleCrudService.validatePaymentMethod(paymentMethodId);

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

  // Get calculated statement balance using the common formula:
  // max(0, round(previousBalance + expenses - payments, 2))
  const { calculatedBalance } = await calculateCycleBalance(
    paymentMethodId,
    cycleDates.startDate,
    cycleDates.endDate
  );

  // Calculate days until cycle end
  const today = new Date(referenceDate);
  const cycleEnd = new Date(cycleDates.endDate);
  const daysUntilCycleEnd = Math.ceil((cycleEnd - today) / (1000 * 60 * 60 * 24));

  // Determine if entry has a user-provided actual balance
  // Use the same logic as calculateEffectiveBalance: check is_user_entered flag,
  // with fallback for legacy data where actual_statement_balance differs from 0
  let hasActualBalance = false;
  let actualBalance = null;
  if (existingEntry) {
    const { balanceType, effectiveBalance } = calculateEffectiveBalance(existingEntry);
    hasActualBalance = balanceType === 'actual';
    actualBalance = hasActualBalance ? effectiveBalance : null;
  }

  return {
    hasActualBalance,
    cycleStartDate: cycleDates.startDate,
    cycleEndDate: cycleDates.endDate,
    actualBalance,
    calculatedBalance,
    daysUntilCycleEnd,
    needsEntry: !existingEntry
  };
}

module.exports = {
  calculateCycleBalance,
  recalculateBalance,
  getMissingCyclePeriods,
  autoGenerateBillingCycles,
  getCurrentCycleStatus
};
