const { getDatabase } = require('../database/db');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const logger = require('../config/logger');

/**
 * StatementBalanceService
 * Calculates statement balance based on billing cycle and expenses
 * 
 * Statement balance represents the amount due from the previous billing cycle,
 * which is the sum of expenses posted during that cycle minus any payments made
 * since the statement date.
 */
class StatementBalanceService {
  /**
   * Calculate the previous billing cycle date range
   * For a billing_cycle_day of 15, the previous cycle is:
   * - Start: 16th of two months ago
   * - End: 15th of previous month
   * 
   * @param {number} billingCycleDay - Day of month when statement closes (1-31)
   * @param {Date} referenceDate - Reference date (defaults to today)
   * @returns {Object} { startDate, endDate } in YYYY-MM-DD format
   * _Requirements: 3.3, 3.4_
   */
  calculatePreviousCycleDates(billingCycleDay, referenceDate = new Date()) {
    if (!billingCycleDay || billingCycleDay < 1 || billingCycleDay > 31) {
      throw new Error('Billing cycle day must be between 1 and 31');
    }

    // Normalize reference date - use UTC methods to avoid timezone issues
    // If referenceDate is a string, parse it; if it's a Date, use it directly
    let refYear, refMonth, refDay;
    
    if (typeof referenceDate === 'string') {
      // Parse YYYY-MM-DD string directly to avoid timezone conversion
      const parts = referenceDate.split('-');
      refYear = parseInt(parts[0], 10);
      refMonth = parseInt(parts[1], 10) - 1; // Convert to 0-indexed
      refDay = parseInt(parts[2], 10);
    } else {
      // For Date objects, use UTC methods to get consistent values
      const refDate = new Date(referenceDate);
      refYear = refDate.getUTCFullYear();
      refMonth = refDate.getUTCMonth(); // 0-indexed
      refDay = refDate.getUTCDate();
    }

    // Determine which billing cycle we're in
    // If we're past the billing cycle day, we're in the current cycle
    // If we're on or before the billing cycle day, we're still in the previous cycle
    let cycleEndYear, cycleEndMonth;
    
    if (refDay > billingCycleDay) {
      // We're past the statement close date this month
      // Previous cycle ended on billingCycleDay of current month
      cycleEndYear = refYear;
      cycleEndMonth = refMonth;
    } else {
      // We're on or before the statement close date
      // Previous cycle ended on billingCycleDay of previous month
      cycleEndYear = refYear;
      cycleEndMonth = refMonth - 1;
      if (cycleEndMonth < 0) {
        cycleEndMonth = 11;
        cycleEndYear--;
      }
    }

    // Calculate cycle start (day after billing_cycle_day of the month before cycle end)
    let cycleStartYear = cycleEndYear;
    let cycleStartMonth = cycleEndMonth - 1;
    if (cycleStartMonth < 0) {
      cycleStartMonth = 11;
      cycleStartYear--;
    }

    // Handle months with fewer days than billingCycleDay
    const daysInEndMonth = new Date(cycleEndYear, cycleEndMonth + 1, 0).getDate();
    const actualEndDay = Math.min(billingCycleDay, daysInEndMonth);

    const daysInStartMonth = new Date(cycleStartYear, cycleStartMonth + 1, 0).getDate();
    const actualStartDay = Math.min(billingCycleDay + 1, daysInStartMonth + 1);
    
    // If billingCycleDay + 1 exceeds days in month, start on 1st of next month
    let startDay, startMonth, startYear;
    if (actualStartDay > daysInStartMonth) {
      startDay = 1;
      startMonth = cycleStartMonth + 1;
      startYear = cycleStartYear;
      if (startMonth > 11) {
        startMonth = 0;
        startYear++;
      }
    } else {
      startDay = actualStartDay;
      startMonth = cycleStartMonth;
      startYear = cycleStartYear;
    }

    // Format dates as YYYY-MM-DD
    const formatDate = (year, month, day) => {
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };

    return {
      startDate: formatDate(startYear, startMonth, startDay),
      endDate: formatDate(cycleEndYear, cycleEndMonth, actualEndDay)
    };
  }

  /**
   * Calculate statement balance for a credit card
   * Statement balance = expenses in previous cycle - payments since statement date
   * 
   * @param {number} paymentMethodId - Credit card ID
   * @param {Date} referenceDate - Reference date (defaults to today)
   * @returns {Promise<Object>} { 
   *   statementBalance, 
   *   cycleStartDate, 
   *   cycleEndDate,
   *   totalExpenses,
   *   totalPayments,
   *   isPaid 
   * }
   * _Requirements: 3.1, 3.2, 3.5, 3.6_
   */
  async calculateStatementBalance(paymentMethodId, referenceDate = new Date()) {
    // Get payment method to verify it's a credit card with billing cycle configured
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    
    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    if (paymentMethod.type !== 'credit_card') {
      throw new Error('Statement balance calculation only available for credit cards');
    }

    // Check if billing_cycle_day is configured
    if (!paymentMethod.billing_cycle_day) {
      return null; // No billing cycle configured, return null for backward compatibility
    }

    // Calculate previous cycle dates
    const cycleDates = this.calculatePreviousCycleDates(
      paymentMethod.billing_cycle_day,
      referenceDate
    );

    const db = await getDatabase();

    // Get total expenses in the previous billing cycle
    // Use COALESCE(posted_date, date) to determine effective posting date
    // Use COALESCE(original_cost, amount) to get full charge amount (for insurance cases)
    const totalExpenses = await new Promise((resolve, reject) => {
      const sql = `
        SELECT COALESCE(SUM(COALESCE(original_cost, amount)), 0) as total
        FROM expenses
        WHERE payment_method_id = ?
          AND COALESCE(posted_date, date) >= ?
          AND COALESCE(posted_date, date) <= ?
      `;
      
      db.get(sql, [paymentMethodId, cycleDates.startDate, cycleDates.endDate], (err, row) => {
        if (err) {
          logger.error('Failed to get expenses for statement balance:', err);
          reject(err);
          return;
        }
        resolve(row?.total || 0);
      });
    });

    // Get total payments made since the statement date (cycle end date)
    // Payments made after the statement closes reduce the statement balance
    const totalPayments = await new Promise((resolve, reject) => {
      const sql = `
        SELECT COALESCE(SUM(amount), 0) as total
        FROM credit_card_payments
        WHERE payment_method_id = ?
          AND payment_date > ?
      `;
      
      db.get(sql, [paymentMethodId, cycleDates.endDate], (err, row) => {
        if (err) {
          logger.error('Failed to get payments for statement balance:', err);
          reject(err);
          return;
        }
        resolve(row?.total || 0);
      });
    });

    // Calculate statement balance (floor at zero for overpayment scenarios)
    const rawBalance = totalExpenses - totalPayments;
    const statementBalance = Math.max(0, Math.round(rawBalance * 100) / 100);

    logger.debug('Calculated statement balance:', {
      paymentMethodId,
      cycleStartDate: cycleDates.startDate,
      cycleEndDate: cycleDates.endDate,
      totalExpenses,
      totalPayments,
      statementBalance
    });

    return {
      statementBalance,
      cycleStartDate: cycleDates.startDate,
      cycleEndDate: cycleDates.endDate,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      totalPayments: Math.round(totalPayments * 100) / 100,
      isPaid: statementBalance <= 0
    };
  }

  /**
   * Get statement balance info for multiple credit cards
   * @param {Array<number>} paymentMethodIds - Array of credit card IDs
   * @param {Date} referenceDate - Reference date
   * @returns {Promise<Map<number, Object>>} Map of paymentMethodId to balance info
   */
  async getStatementBalances(paymentMethodIds, referenceDate = new Date()) {
    if (!Array.isArray(paymentMethodIds) || paymentMethodIds.length === 0) {
      return new Map();
    }

    const results = new Map();

    // Process each payment method
    for (const id of paymentMethodIds) {
      try {
        const balanceInfo = await this.calculateStatementBalance(id, referenceDate);
        results.set(id, balanceInfo);
      } catch (error) {
        logger.warn('Failed to calculate statement balance for payment method:', {
          paymentMethodId: id,
          error: error.message
        });
        results.set(id, null);
      }
    }

    return results;
  }
}

module.exports = new StatementBalanceService();
