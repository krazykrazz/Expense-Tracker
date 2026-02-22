const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const logger = require('../config/logger');
const { getTodayString, calculateDaysUntilDue } = require('../utils/dateUtils');

/**
 * Service for billing cycle calculations and history
 * Extracted from paymentMethodService.js for separation of concerns
 */
class PaymentMethodBillingCycleService {
  /**
   * Calculate days until next payment due date
   * Delegates to shared utility function in dateUtils
   * @param {number} paymentDueDay - Day of month payment is due (1-31)
   * @param {Date} referenceDate - Reference date (defaults to today)
   * @returns {number|null} Days until due or null if no due day set
   */
  calculateDaysUntilDue(paymentDueDay, referenceDate = new Date()) {
    return calculateDaysUntilDue(paymentDueDay, referenceDate);
  }

  /**
   * Calculate current billing cycle dates
   * @param {number} billingCycleStart - Start day of billing cycle (1-31)
   * @param {number} billingCycleEnd - End day of billing cycle (1-31)
   * @param {Date} referenceDate - Reference date (defaults to today)
   * @returns {Object|null} { startDate, endDate } or null if no cycle defined
   */
  calculateCurrentBillingCycle(billingCycleStart, billingCycleEnd, referenceDate = new Date()) {
    if (!billingCycleStart || !billingCycleEnd) {
      return null;
    }

    const today = new Date(referenceDate);
    today.setHours(0, 0, 0, 0);
    
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    let startDate, endDate;
    
    if (billingCycleStart <= billingCycleEnd) {
      // Billing cycle is within the same month (e.g., 1st to 28th)
      if (currentDay >= billingCycleStart && currentDay <= billingCycleEnd) {
        startDate = new Date(currentYear, currentMonth, billingCycleStart);
        endDate = new Date(currentYear, currentMonth, billingCycleEnd);
      } else if (currentDay < billingCycleStart) {
        startDate = new Date(currentYear, currentMonth - 1, billingCycleStart);
        endDate = new Date(currentYear, currentMonth - 1, billingCycleEnd);
      } else {
        startDate = new Date(currentYear, currentMonth + 1, billingCycleStart);
        endDate = new Date(currentYear, currentMonth + 1, billingCycleEnd);
      }
    } else {
      // Billing cycle spans two months (e.g., 15th to 14th)
      if (currentDay >= billingCycleStart) {
        startDate = new Date(currentYear, currentMonth, billingCycleStart);
        endDate = new Date(currentYear, currentMonth + 1, billingCycleEnd);
      } else if (currentDay <= billingCycleEnd) {
        startDate = new Date(currentYear, currentMonth - 1, billingCycleStart);
        endDate = new Date(currentYear, currentMonth, billingCycleEnd);
      } else {
        startDate = new Date(currentYear, currentMonth, billingCycleStart);
        endDate = new Date(currentYear, currentMonth + 1, billingCycleEnd);
      }
    }
    
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate)
    };
  }

  /**
   * Get billing cycle details for a specific period
   * @param {number} paymentMethodId - Credit card ID
   * @param {string} startDate - Cycle start date (YYYY-MM-DD)
   * @param {string} endDate - Cycle end date (YYYY-MM-DD)
   * @returns {Promise<Object>} Cycle details with transaction count and total
   */
  async getBillingCycleDetails(paymentMethodId, startDate, endDate) {
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    
    if (!paymentMethod || paymentMethod.type !== 'credit_card') {
      throw new Error('Billing cycle details only available for credit cards');
    }

    const { getDatabase } = require('../database/db');
    const db = await getDatabase();

    const transactionData = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as transaction_count, COALESCE(SUM(COALESCE(original_cost, amount)), 0) as total_amount
         FROM expenses 
         WHERE payment_method_id = ? 
         AND COALESCE(posted_date, date) >= ? 
         AND COALESCE(posted_date, date) <= ?`,
        [paymentMethodId, startDate, endDate],
        (err, row) => {
          if (err) return reject(err);
          resolve({
            transaction_count: row?.transaction_count || 0,
            total_amount: Math.round((row?.total_amount || 0) * 100) / 100
          });
        }
      );
    });

    const paymentData = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as payment_count, COALESCE(SUM(amount), 0) as payment_total
         FROM credit_card_payments 
         WHERE payment_method_id = ? 
         AND payment_date >= ? 
         AND payment_date <= ?`,
        [paymentMethodId, startDate, endDate],
        (err, row) => {
          if (err) return reject(err);
          resolve({
            payment_count: row?.payment_count || 0,
            payment_total: Math.round((row?.payment_total || 0) * 100) / 100
          });
        }
      );
    });

    const todayStr = getTodayString();
    const isCurrent = startDate <= todayStr && todayStr <= endDate;

    logger.debug('Retrieved billing cycle details:', {
      paymentMethodId,
      startDate,
      endDate,
      transactionData,
      paymentData,
      isCurrent
    });

    return {
      start_date: startDate,
      end_date: endDate,
      transaction_count: transactionData.transaction_count,
      total_amount: transactionData.total_amount,
      payment_count: paymentData.payment_count,
      payment_total: paymentData.payment_total,
      is_current: isCurrent
    };
  }

  /**
   * Get current billing cycle details
   * @param {number} paymentMethodId - Credit card ID
   * @returns {Promise<Object|null>} Current cycle details or null if no billing cycle
   */
  async getCurrentBillingCycleDetails(paymentMethodId) {
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    
    if (!paymentMethod || paymentMethod.type !== 'credit_card') {
      throw new Error('Billing cycle details only available for credit cards');
    }

    if (!paymentMethod.billing_cycle_start || !paymentMethod.billing_cycle_end) {
      return null;
    }

    const billingCycle = this.calculateCurrentBillingCycle(
      paymentMethod.billing_cycle_start,
      paymentMethod.billing_cycle_end
    );

    if (!billingCycle) {
      return null;
    }

    return this.getBillingCycleDetails(
      paymentMethodId,
      billingCycle.startDate,
      billingCycle.endDate
    );
  }

  /**
   * Get previous billing cycles (for history view)
   * @param {number} paymentMethodId - Credit card ID
   * @param {number} count - Number of past cycles to retrieve (default 6)
   * @returns {Promise<Array>} Array of past cycle details sorted by date descending
   */
  async getPreviousBillingCycles(paymentMethodId, count = 6) {
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    
    if (!paymentMethod || paymentMethod.type !== 'credit_card') {
      throw new Error('Billing cycle details only available for credit cards');
    }

    if (!paymentMethod.billing_cycle_start || !paymentMethod.billing_cycle_end) {
      return [];
    }

    const cycles = [];
    const billingCycleStart = paymentMethod.billing_cycle_start;
    const billingCycleEnd = paymentMethod.billing_cycle_end;

    let referenceDate = new Date();
    
    const currentCycle = this.calculateCurrentBillingCycle(
      billingCycleStart,
      billingCycleEnd,
      referenceDate
    );

    if (!currentCycle) {
      return [];
    }

    const currentCycleDetails = await this.getBillingCycleDetails(
      paymentMethodId,
      currentCycle.startDate,
      currentCycle.endDate
    );
    cycles.push(currentCycleDetails);

    const [startYear, startMonth, startDay] = currentCycle.startDate.split('-').map(Number);
    referenceDate = new Date(startYear, startMonth - 1, startDay);
    referenceDate.setDate(referenceDate.getDate() - 1);

    for (let i = 1; i < count; i++) {
      const previousCycle = this.calculateCurrentBillingCycle(
        billingCycleStart,
        billingCycleEnd,
        referenceDate
      );

      if (!previousCycle) {
        break;
      }

      const cycleDetails = await this.getBillingCycleDetails(
        paymentMethodId,
        previousCycle.startDate,
        previousCycle.endDate
      );
      cycles.push(cycleDetails);

      const [prevStartYear, prevStartMonth, prevStartDay] = previousCycle.startDate.split('-').map(Number);
      referenceDate = new Date(prevStartYear, prevStartMonth - 1, prevStartDay);
      referenceDate.setDate(referenceDate.getDate() - 1);
    }

    logger.debug('Retrieved previous billing cycles:', {
      paymentMethodId,
      count,
      cyclesReturned: cycles.length
    });

    return cycles.sort((a, b) => b.start_date.localeCompare(a.start_date));
  }
}

module.exports = new PaymentMethodBillingCycleService();
