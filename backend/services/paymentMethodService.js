const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const logger = require('../config/logger');
const { getTodayString } = require('../utils/dateUtils');
const activityLogService = require('./activityLogService');
const paymentMethodValidationService = require('./paymentMethodValidationService');
const paymentMethodBalanceService = require('./paymentMethodBalanceService');
const paymentMethodBillingCycleService = require('./paymentMethodBillingCycleService');

/**
 * Service for managing payment methods
 * Orchestrates CRUD operations and delegates to sub-services:
 * - paymentMethodValidationService: input validation
 * - paymentMethodBalanceService: balance/utilization calculations
 * - paymentMethodBillingCycleService: billing cycle calculations
 */
class PaymentMethodService {
  // ─── Validation (delegated) ───────────────────────────────────────

  validatePaymentMethod(data, options = {}) {
    return paymentMethodValidationService.validatePaymentMethod(data, options);
  }

  async isDisplayNameUnique(displayName, excludeId = null) {
    return paymentMethodValidationService.isDisplayNameUnique(displayName, excludeId);
  }

  // ─── CRUD Operations ─────────────────────────────────────────────

  /**
   * Create a new payment method with type-specific validation
   * @param {Object} data - Payment method data
   * @param {string|null} tabId - Tab ID for SSE filtering
   * @returns {Promise<Object>} Created payment method
   */
  async createPaymentMethod(data, tabId = null) {
    const validation = this.validatePaymentMethod(data, { isUpdate: false });
    if (!validation.isValid) {
      throw new Error(validation.errors.join('; '));
    }

    const isUnique = await this.isDisplayNameUnique(data.display_name);
    if (!isUnique) {
      throw new Error('A payment method with this display name already exists');
    }

    const paymentMethodData = {
      type: data.type.trim().toLowerCase(),
      display_name: data.display_name.trim(),
      full_name: data.full_name ? data.full_name.trim() : null,
      account_details: data.account_details ? data.account_details.trim() : null,
      credit_limit: data.credit_limit || null,
      current_balance: data.current_balance || 0,
      payment_due_day: data.payment_due_day || null,
      billing_cycle_day: data.billing_cycle_day || null,
      billing_cycle_start: data.billing_cycle_start || null,
      billing_cycle_end: data.billing_cycle_end || null,
      is_active: data.is_active !== undefined ? data.is_active : 1
    };

    const created = await paymentMethodRepository.create(paymentMethodData);
    
    logger.info('Created payment method:', { 
      id: created.id, 
      type: created.type, 
      displayName: created.display_name 
    });

    await activityLogService.logEvent(
      'payment_method_added',
      'payment_method',
      created.id,
      `Added payment method: ${created.display_name}`,
      { name: created.display_name, type: created.type, tabId }
    );

    return created;
  }

  /**
   * Update a payment method
   * @param {number} id - Payment method ID
   * @param {Object} data - Updated payment method data
   * @param {string|null} tabId - Tab ID for SSE filtering
   * @returns {Promise<Object|null>} Updated payment method or null if not found
   */
  async updatePaymentMethod(id, data, tabId = null) {
    if (!id) {
      throw new Error('Payment method ID is required');
    }

    const existing = await paymentMethodRepository.findById(id);
    if (!existing) {
      return null;
    }

    const validation = this.validatePaymentMethod(data, { isUpdate: true, existing });
    if (!validation.isValid) {
      throw new Error(validation.errors.join('; '));
    }

    const isUnique = await this.isDisplayNameUnique(data.display_name, id);
    if (!isUnique) {
      throw new Error('A payment method with this display name already exists');
    }

    const updateData = {
      type: data.type.trim().toLowerCase(),
      display_name: data.display_name.trim(),
      full_name: data.full_name ? data.full_name.trim() : null,
      account_details: data.account_details ? data.account_details.trim() : null,
      credit_limit: data.credit_limit || null,
      current_balance: data.current_balance !== undefined ? data.current_balance : existing.current_balance,
      payment_due_day: data.payment_due_day !== undefined ? data.payment_due_day : existing.payment_due_day,
      billing_cycle_day: data.billing_cycle_day !== undefined ? data.billing_cycle_day : existing.billing_cycle_day,
      billing_cycle_start: data.billing_cycle_start || null,
      billing_cycle_end: data.billing_cycle_end || null,
      is_active: data.is_active !== undefined ? data.is_active : existing.is_active
    };

    const updated = await paymentMethodRepository.update(id, updateData);
    
    if (updated) {
      logger.info('Updated payment method:', { 
        id, 
        type: updated.type, 
        displayName: updated.display_name 
      });

      const changes = [];
      if (existing.display_name !== updated.display_name) {
        changes.push(`name: ${existing.display_name} → ${updated.display_name}`);
      }
      if (existing.type !== updated.type) {
        changes.push(`type: ${existing.type} → ${updated.type}`);
      }
      if (existing.credit_limit !== updated.credit_limit) {
        changes.push(`credit limit: ${existing.credit_limit || 0} → ${updated.credit_limit || 0}`);
      }
      if (existing.billing_cycle_day !== updated.billing_cycle_day) {
        changes.push(`billing cycle day: ${existing.billing_cycle_day || 'none'} → ${updated.billing_cycle_day || 'none'}`);
      }
      if (existing.payment_due_day !== updated.payment_due_day) {
        changes.push(`payment due day: ${existing.payment_due_day || 'none'} → ${updated.payment_due_day || 'none'}`);
      }
      const changeSummary = changes.length > 0 ? ` (${changes.join(', ')})` : '';

      await activityLogService.logEvent(
        'payment_method_updated',
        'payment_method',
        id,
        `Updated payment method: ${updated.display_name}${changeSummary}`,
        { name: updated.display_name, type: updated.type, changes, tabId }
      );
    }

    return updated;
  }

  /**
   * Delete a payment method (only if no associated expenses)
   * @param {number} id - Payment method ID
   * @param {string|null} tabId - Tab ID for SSE filtering
   * @returns {Promise<Object>} Deletion result
   */
  async deletePaymentMethod(id, tabId = null) {
    if (!id) {
      throw new Error('Payment method ID is required');
    }

    const existing = await paymentMethodRepository.findById(id);
    if (!existing) {
      return { success: false, message: 'Payment method not found' };
    }

    const expenseCount = await paymentMethodRepository.countAssociatedExpenses(id);
    if (expenseCount > 0) {
      return {
        success: false,
        message: `Cannot delete payment method with associated expenses. Mark it as inactive instead. (${expenseCount} expense(s) found)`,
        expenseCount
      };
    }

    const activePaymentMethods = await paymentMethodRepository.findAll({ activeOnly: true });
    if (activePaymentMethods.length === 1 && activePaymentMethods[0].id === id) {
      return {
        success: false,
        message: 'Cannot delete the last active payment method. At least one active payment method must exist'
      };
    }

    const deleted = await paymentMethodRepository.delete(id);

    if (deleted) {
      logger.info('Deleted payment method:', { 
        id, 
        type: existing.type, 
        displayName: existing.display_name 
      });

      try {
        await activityLogService.logEvent(
          'payment_method_deleted',
          'payment_method',
          id,
          `Deleted payment method: ${existing.display_name} (${existing.type})`,
          { name: existing.display_name, type: existing.type, id, tabId }
        );
      } catch (error) {
        logger.error('Failed to log payment method deletion activity:', { error, id });
      }

      return { success: true, message: 'Payment method deleted successfully' };
    }

    return { success: false, message: 'Failed to delete payment method' };
  }

  /**
   * Activate or deactivate a payment method
   * @param {number} id - Payment method ID
   * @param {boolean} isActive - Active status
   * @param {string|null} tabId - Tab ID for SSE filtering
   * @returns {Promise<Object|null>} Updated payment method or null if not found
   */
  async setPaymentMethodActive(id, isActive, tabId = null) {
    if (!id) {
      throw new Error('Payment method ID is required');
    }

    const existing = await paymentMethodRepository.findById(id);
    if (!existing) {
      return null;
    }

    if (!isActive) {
      const activePaymentMethods = await paymentMethodRepository.findAll({ activeOnly: true });
      if (activePaymentMethods.length === 1 && activePaymentMethods[0].id === id) {
        throw new Error('Cannot deactivate the last active payment method');
      }
    }

    const updated = await paymentMethodRepository.setActive(id, isActive);
    
    if (updated) {
      logger.info('Set payment method active status:', { 
        id, 
        displayName: updated.display_name, 
        isActive 
      });

      if (!isActive) {
        await activityLogService.logEvent(
          'payment_method_deactivated',
          'payment_method',
          id,
          `Deactivated payment method: ${updated.display_name}`,
          { name: updated.display_name, type: updated.type, tabId }
        );
      }
    }

    return updated;
  }

  // ─── Query Operations ─────────────────────────────────────────────

  async getActivePaymentMethods() {
    return paymentMethodRepository.getActivePaymentMethods();
  }

  async getPaymentMethodById(id) {
    if (!id) {
      throw new Error('Payment method ID is required');
    }
    return paymentMethodRepository.findById(id);
  }

  async getPaymentMethodByDisplayName(displayName) {
    if (!displayName) {
      throw new Error('Display name is required');
    }
    return paymentMethodRepository.findByDisplayName(displayName.trim());
  }

  async getAllPaymentMethods(options = {}) {
    return paymentMethodRepository.findAll(options);
  }

  /**
   * Get all payment methods with expense counts for current period
   * Credit card balances are calculated dynamically (excludes future pre-logged expenses)
   * @returns {Promise<Array>} Array of payment methods with expense counts
   */
  async getAllWithExpenseCounts() {
      const todayStr = getTodayString();
      const paymentMethods = await paymentMethodRepository.findAllWithExpenseCounts(todayStr);

      const results = await Promise.allSettled(
        paymentMethods.map(async (pm) => {
          const expenseCount = await this.getExpenseCountForCurrentPeriod(pm);

          let currentBalance = pm.current_balance;
          let utilizationPercentage = null;

          if (pm.type === 'credit_card') {
            currentBalance = Math.max(0, Math.round((pm.expense_total_to_date - pm.payment_total_to_date) * 100) / 100);
            utilizationPercentage = paymentMethodBalanceService.calculateUtilizationPercentage(currentBalance, pm.credit_limit);
          }

          const { expense_total_to_date, payment_total_to_date, ...cleanPm } = pm;

          return {
            ...cleanPm,
            current_balance: currentBalance,
            utilization_percentage: utilizationPercentage,
            expense_count: expenseCount,
            total_expense_count: pm.total_expense_count
          };
        })
      );

      // Extract fulfilled results; log and skip rejected ones
      const withCounts = [];
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'fulfilled') {
          withCounts.push(results[i].value);
        } else {
          logger.error('Failed to process payment method expense count', {
            paymentMethodId: paymentMethods[i]?.id,
            error: results[i].reason?.message || 'Unknown error'
          });
          // Return the payment method with fallback values so the list isn't broken
          const pm = paymentMethods[i];
          const { expense_total_to_date, payment_total_to_date, ...cleanPm } = pm;
          withCounts.push({
            ...cleanPm,
            current_balance: pm.current_balance,
            utilization_percentage: null,
            expense_count: 0,
            total_expense_count: pm.total_expense_count
          });
        }
      }

      return withCounts;
    }


  /**
   * Get expense count for the current period based on payment method type
   * @param {Object} paymentMethod - Payment method object
   * @returns {Promise<number>} Expense count for current period
   */
  async getExpenseCountForCurrentPeriod(paymentMethod) {
    const today = new Date();
    let startDate, endDate;

    if (paymentMethod.type === 'credit_card' && 
        paymentMethod.billing_cycle_start && 
        paymentMethod.billing_cycle_end) {
      const billingCycle = paymentMethodBillingCycleService.calculateCurrentBillingCycle(
        paymentMethod.billing_cycle_start,
        paymentMethod.billing_cycle_end
      );
      if (billingCycle) {
        startDate = billingCycle.startDate;
        endDate = billingCycle.endDate;
      }
    }

    if (!startDate || !endDate) {
      const year = today.getFullYear();
      const month = today.getMonth();
      startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    return paymentMethodRepository.countExpensesInDateRange(
      paymentMethod.id,
      startDate,
      endDate
    );
  }

  // ─── Balance (delegated) ──────────────────────────────────────────

  async calculateProjectedBalance(paymentMethodId) {
    return paymentMethodBalanceService.calculateProjectedBalance(paymentMethodId);
  }

  async calculateCurrentBalance(paymentMethodId) {
    return paymentMethodBalanceService.calculateCurrentBalance(paymentMethodId);
  }

  async calculateStatementBalance(paymentMethodId) {
    return paymentMethodBalanceService.calculateStatementBalance(paymentMethodId);
  }

  async getAllBalanceTypes(paymentMethodId) {
    return paymentMethodBalanceService.getAllBalanceTypes(paymentMethodId);
  }

  calculateUtilizationPercentage(balance, creditLimit) {
    return paymentMethodBalanceService.calculateUtilizationPercentage(balance, creditLimit);
  }

  getUtilizationStatus(utilizationPercentage) {
    return paymentMethodBalanceService.getUtilizationStatus(utilizationPercentage);
  }

  async recalculateBalance(id) {
    return paymentMethodBalanceService.recalculateBalance(id);
  }

  async _calculateDynamicBalance(id) {
    try {
      return await paymentMethodBalanceService.calculateCurrentBalance(id);
    } catch (error) {
      logger.warn('_calculateDynamicBalance failed, returning 0:', { id, error: error.message });
      return 0;
    }
  }

  // ─── Billing Cycle (delegated) ────────────────────────────────────

  calculateDaysUntilDue(paymentDueDay, referenceDate = new Date()) {
    return paymentMethodBillingCycleService.calculateDaysUntilDue(paymentDueDay, referenceDate);
  }

  calculateCurrentBillingCycle(billingCycleStart, billingCycleEnd, referenceDate = new Date()) {
    return paymentMethodBillingCycleService.calculateCurrentBillingCycle(billingCycleStart, billingCycleEnd, referenceDate);
  }

  async getBillingCycleDetails(paymentMethodId, startDate, endDate) {
    return paymentMethodBillingCycleService.getBillingCycleDetails(paymentMethodId, startDate, endDate);
  }

  async getCurrentBillingCycleDetails(paymentMethodId) {
    return paymentMethodBillingCycleService.getCurrentBillingCycleDetails(paymentMethodId);
  }

  async getPreviousBillingCycles(paymentMethodId, count = 6) {
    return paymentMethodBillingCycleService.getPreviousBillingCycles(paymentMethodId, count);
  }

  // ─── Composite / Display ──────────────────────────────────────────

  /**
   * Get credit card with computed fields (utilization, days until due, etc.)
   * @param {number} id - Payment method ID
   * @returns {Promise<Object|null>} Credit card with computed fields or null
   */
  async getCreditCardWithComputedFields(id) {
    const paymentMethod = await paymentMethodRepository.findById(id);
    
    if (!paymentMethod || paymentMethod.type !== 'credit_card') {
      return null;
    }
    
    const balanceTypes = await paymentMethodBalanceService.getAllBalanceTypes(id);
    
    const utilizationPercentage = paymentMethodBalanceService.calculateUtilizationPercentage(
      balanceTypes.current_balance,
      paymentMethod.credit_limit
    );
    
    const daysUntilDue = paymentMethodBillingCycleService.calculateDaysUntilDue(paymentMethod.payment_due_day);
    
    const billingCycle = paymentMethodBillingCycleService.calculateCurrentBillingCycle(
      paymentMethod.billing_cycle_start,
      paymentMethod.billing_cycle_end
    );
    
    const currentCycleDetails = await paymentMethodBillingCycleService.getCurrentBillingCycleDetails(id);
    const expenseCount = await this.getExpenseCountForCurrentPeriod(paymentMethod);
    
    return {
      ...paymentMethod,
      statement_balance: balanceTypes.statement_balance,
      current_balance: balanceTypes.current_balance,
      projected_balance: balanceTypes.projected_balance,
      has_pending_expenses: balanceTypes.has_pending_expenses,
      current_cycle: currentCycleDetails ? {
        start_date: currentCycleDetails.start_date,
        end_date: currentCycleDetails.end_date,
        transaction_count: currentCycleDetails.transaction_count,
        total_amount: currentCycleDetails.total_amount,
        payment_count: currentCycleDetails.payment_count,
        payment_total: currentCycleDetails.payment_total
      } : null,
      utilization_percentage: utilizationPercentage,
      days_until_due: daysUntilDue,
      current_billing_cycle: billingCycle,
      expense_count: expenseCount
    };
  }
}

module.exports = new PaymentMethodService();
