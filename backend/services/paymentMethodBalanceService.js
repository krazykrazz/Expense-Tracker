const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const logger = require('../config/logger');
const { getTodayString } = require('../utils/dateUtils');

/**
 * Service for credit card balance and utilization calculations
 * Extracted from paymentMethodService.js for separation of concerns
 */
class PaymentMethodBalanceService {
  /**
   * Calculate projected balance for a credit card
   * Sum of ALL expenses minus ALL payments
   * @param {number} paymentMethodId - Credit card ID
   * @returns {Promise<number>} Projected balance (minimum 0)
   */
  async calculateProjectedBalance(paymentMethodId) {
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    
    if (!paymentMethod || paymentMethod.type !== 'credit_card') {
      throw new Error('Balance calculations only available for credit cards');
    }

    const { getDatabase } = require('../database/db');
    const db = await getDatabase();

    // Sum ALL expenses regardless of date
    // Use original_cost when set (for medical expenses with insurance) to reflect full credit card charge
    const expenseTotal = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COALESCE(SUM(COALESCE(original_cost, amount)), 0) as total FROM expenses WHERE payment_method_id = ?',
        [paymentMethodId],
        (err, row) => {
          if (err) return reject(err);
          resolve(row?.total || 0);
        }
      );
    });

    // Sum ALL payments regardless of date
    const paymentTotal = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COALESCE(SUM(amount), 0) as total FROM credit_card_payments WHERE payment_method_id = ?',
        [paymentMethodId],
        (err, row) => {
          if (err) return reject(err);
          resolve(row?.total || 0);
        }
      );
    });

    const balance = Math.max(0, Math.round((expenseTotal - paymentTotal) * 100) / 100);

    logger.debug('Calculated projected balance:', {
      paymentMethodId,
      expenseTotal,
      paymentTotal,
      balance
    });

    return balance;
  }

  /**
   * Calculate current (posted) balance for a credit card
   * Sum of expenses with effective_date <= today minus payments <= today
   * @param {number} paymentMethodId - Credit card ID
   * @returns {Promise<number>} Current balance (minimum 0)
   */
  async calculateCurrentBalance(paymentMethodId) {
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    
    if (!paymentMethod || paymentMethod.type !== 'credit_card') {
      throw new Error('Balance calculations only available for credit cards');
    }

    const { getDatabase } = require('../database/db');
    const db = await getDatabase();

    const todayStr = getTodayString();

    // Sum expenses where effective_date <= today
    const expenseTotal = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COALESCE(SUM(COALESCE(original_cost, amount)), 0) as total FROM expenses WHERE payment_method_id = ? AND COALESCE(posted_date, date) <= ?',
        [paymentMethodId, todayStr],
        (err, row) => {
          if (err) return reject(err);
          resolve(row?.total || 0);
        }
      );
    });

    // Sum payments where payment_date <= today
    const paymentTotal = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COALESCE(SUM(amount), 0) as total FROM credit_card_payments WHERE payment_method_id = ? AND payment_date <= ?',
        [paymentMethodId, todayStr],
        (err, row) => {
          if (err) return reject(err);
          resolve(row?.total || 0);
        }
      );
    });

    const balance = Math.max(0, Math.round((expenseTotal - paymentTotal) * 100) / 100);

    logger.debug('Calculated current balance:', {
      paymentMethodId,
      todayStr,
      expenseTotal,
      paymentTotal,
      balance
    });

    return balance;
  }

  /**
   * Calculate statement balance for a credit card
   * Delegates to statementBalanceService when billing_cycle_day is configured.
   * Falls back to legacy billing_cycle_start/end calculation for backward compatibility.
   * @param {number} paymentMethodId - Credit card ID
   * @returns {Promise<number|null>} Statement balance or null if no billing cycle
   */
  async calculateStatementBalance(paymentMethodId) {
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    
    if (!paymentMethod || paymentMethod.type !== 'credit_card') {
      throw new Error('Balance calculations only available for credit cards');
    }

    // MODERN APPROACH: Use statementBalanceService when billing_cycle_day is configured
    if (paymentMethod.billing_cycle_day) {
      const statementBalanceService = require('./statementBalanceService');
      const result = await statementBalanceService.calculateStatementBalance(paymentMethodId);
      return result ? result.statementBalance : null;
    }

    // LEGACY FALLBACK: Use billing_cycle_start/end for cards without billing_cycle_day
    if (!paymentMethod.billing_cycle_start || !paymentMethod.billing_cycle_end) {
      return null;
    }

    // Lazy require to avoid circular dependency
    const paymentMethodBillingCycleService = require('./paymentMethodBillingCycleService');
    const billingCycle = paymentMethodBillingCycleService.calculateCurrentBillingCycle(
      paymentMethod.billing_cycle_start,
      paymentMethod.billing_cycle_end
    );

    if (!billingCycle) {
      return null;
    }

    const { getDatabase } = require('../database/db');
    const db = await getDatabase();

    const expenseTotal = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COALESCE(SUM(COALESCE(original_cost, amount)), 0) as total FROM expenses WHERE payment_method_id = ? AND COALESCE(posted_date, date) < ?',
        [paymentMethodId, billingCycle.startDate],
        (err, row) => {
          if (err) return reject(err);
          resolve(row?.total || 0);
        }
      );
    });

    const paymentTotal = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COALESCE(SUM(amount), 0) as total FROM credit_card_payments WHERE payment_method_id = ? AND payment_date < ?',
        [paymentMethodId, billingCycle.startDate],
        (err, row) => {
          if (err) return reject(err);
          resolve(row?.total || 0);
        }
      );
    });

    const balance = Math.max(0, Math.round((expenseTotal - paymentTotal) * 100) / 100);

    logger.debug('Calculated statement balance (legacy):', {
      paymentMethodId,
      cycleStartDate: billingCycle.startDate,
      expenseTotal,
      paymentTotal,
      balance
    });

    return balance;
  }

  /**
   * Get all three balance types for a credit card
   * @param {number} paymentMethodId - Credit card ID
   * @returns {Promise<Object>} Object with all balance types
   */
  async getAllBalanceTypes(paymentMethodId) {
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    
    if (!paymentMethod || paymentMethod.type !== 'credit_card') {
      throw new Error('Balance calculations only available for credit cards');
    }

    const [statementBalance, currentBalance, projectedBalance] = await Promise.all([
      this.calculateStatementBalance(paymentMethodId),
      this.calculateCurrentBalance(paymentMethodId),
      this.calculateProjectedBalance(paymentMethodId)
    ]);

    const hasPendingExpenses = projectedBalance !== currentBalance;

    // Lazy require to avoid circular dependency
    const paymentMethodBillingCycleService = require('./paymentMethodBillingCycleService');
    let billingCycle = null;
    if (paymentMethod.billing_cycle_start && paymentMethod.billing_cycle_end) {
      billingCycle = paymentMethodBillingCycleService.calculateCurrentBillingCycle(
        paymentMethod.billing_cycle_start,
        paymentMethod.billing_cycle_end
      );
    }

    logger.debug('Retrieved all balance types:', {
      paymentMethodId,
      statementBalance,
      currentBalance,
      projectedBalance,
      hasPendingExpenses
    });

    return {
      statement_balance: statementBalance,
      current_balance: currentBalance,
      projected_balance: projectedBalance,
      has_pending_expenses: hasPendingExpenses,
      billing_cycle: billingCycle ? {
        start_date: billingCycle.startDate,
        end_date: billingCycle.endDate
      } : null
    };
  }

  /**
   * Calculate credit utilization percentage
   * @param {number} balance - Current balance
   * @param {number} creditLimit - Credit limit
   * @returns {number|null} Utilization percentage (0-100+) or null if no limit
   */
  calculateUtilizationPercentage(balance, creditLimit) {
    if (!creditLimit || creditLimit <= 0) {
      return null;
    }
    
    const utilization = (balance / creditLimit) * 100;
    return Math.round(utilization * 100) / 100;
  }

  /**
   * Get utilization status based on percentage
   * @param {number} utilizationPercentage - Utilization percentage
   * @returns {string} Status: 'good', 'warning', or 'danger'
   */
  getUtilizationStatus(utilizationPercentage) {
    if (utilizationPercentage === null || utilizationPercentage === undefined) {
      return 'unknown';
    }
    
    if (utilizationPercentage >= 70) {
      return 'danger';
    } else if (utilizationPercentage >= 30) {
      return 'warning';
    }
    
    return 'good';
  }

  /**
   * Recalculate the current balance for a credit card based on actual expenses and payments
   * @param {number} id - Payment method ID
   * @returns {Promise<Object>} Updated payment method with recalculated balance
   */
  async recalculateBalance(id) {
    if (!id) {
      throw new Error('Payment method ID is required');
    }

    const paymentMethod = await paymentMethodRepository.findById(id);
    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    if (paymentMethod.type !== 'credit_card') {
      throw new Error('Balance recalculation is only available for credit cards');
    }

    const { getDatabase } = require('../database/db');
    const db = await getDatabase();

    const todayStr = getTodayString();

    const expenseTotal = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COALESCE(SUM(COALESCE(original_cost, amount)), 0) as total FROM expenses WHERE payment_method_id = ? AND COALESCE(posted_date, date) <= ?',
        [id, todayStr],
        (err, row) => {
          if (err) return reject(err);
          resolve(row?.total || 0);
        }
      );
    });

    const paymentTotal = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COALESCE(SUM(amount), 0) as total FROM credit_card_payments WHERE payment_method_id = ?',
        [id],
        (err, row) => {
          if (err) return reject(err);
          resolve(row?.total || 0);
        }
      );
    });

    const newBalance = Math.max(0, Math.round((expenseTotal - paymentTotal) * 100) / 100);

    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE payment_methods SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newBalance, id],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });

    logger.info('Recalculated credit card balance:', {
      paymentMethodId: id,
      displayName: paymentMethod.display_name,
      expenseTotal,
      paymentTotal,
      newBalance,
      todayStr
    });

    return paymentMethodRepository.findById(id);
  }
}

module.exports = new PaymentMethodBalanceService();
