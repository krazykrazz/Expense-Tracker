const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const logger = require('../config/logger');
const { getTodayString, calculateDaysUntilDue } = require('../utils/dateUtils');
const activityLogService = require('./activityLogService');

/**
 * Valid payment method types
 */
const PAYMENT_METHOD_TYPES = ['cash', 'cheque', 'debit', 'credit_card'];

/**
 * Service for managing payment methods
 * Handles validation, business logic, and orchestration for payment method operations
 */
class PaymentMethodService {
  /**
   * Validate payment method data based on type
   * @param {Object} data - Payment method data to validate
   * @param {Object} options - Validation options
   * @param {boolean} options.isUpdate - Whether this is an update operation
   * @param {Object} options.existing - Existing payment method data (for updates)
   * @returns {Object} Validation result { isValid, errors }
   */
  validatePaymentMethod(data, options = {}) {
    const errors = [];
    const { isUpdate = false, existing = null } = options;

    // Trim whitespace from string inputs
    const displayName = data.display_name ? data.display_name.trim() : '';
    const fullName = data.full_name ? data.full_name.trim() : '';
    const type = data.type ? data.type.trim().toLowerCase() : '';

    // Validate type
    if (!type) {
      errors.push('Payment method type is required');
    } else if (!PAYMENT_METHOD_TYPES.includes(type)) {
      errors.push(`Invalid payment method type. Must be one of: ${PAYMENT_METHOD_TYPES.join(', ')}`);
    }

    // Validate display_name (required for all types)
    if (!displayName) {
      errors.push('Display name is required');
    } else if (displayName.length > 50) {
      errors.push('Display name must not exceed 50 characters');
    }

    // Type-specific validation
    if (type === 'credit_card') {
      // Credit cards require full_name
      if (!fullName) {
        errors.push('Full name is required for credit cards');
      } else if (fullName.length > 100) {
        errors.push('Full name must not exceed 100 characters');
      }

      // Validate credit_limit if provided
      if (data.credit_limit !== undefined && data.credit_limit !== null) {
        if (typeof data.credit_limit !== 'number' || data.credit_limit <= 0) {
          errors.push('Credit limit must be a positive number');
        }
      }

      // Validate current_balance if provided
      if (data.current_balance !== undefined && data.current_balance !== null) {
        if (typeof data.current_balance !== 'number' || data.current_balance < 0) {
          errors.push('Balance cannot be negative');
        }
      }

      // Validate billing_cycle_day - REQUIRED for new credit cards
      // Requirements 1.1, 1.3, 1.5, 1.6
      if (data.billing_cycle_day === undefined || data.billing_cycle_day === null) {
        if (!isUpdate) {
          // Required for new credit cards
          errors.push('Billing cycle day is required for credit cards');
        } else if (existing && existing.billing_cycle_day !== null) {
          // Cannot set to null on update if it was previously set
          errors.push('Billing cycle day cannot be removed once set');
        }
      } else {
        // Validate range (1-31)
        const billingCycleDay = Number(data.billing_cycle_day);
        if (!Number.isInteger(billingCycleDay) || billingCycleDay < 1 || billingCycleDay > 31) {
          errors.push('Billing cycle day must be between 1 and 31');
        }
      }

      // Validate payment_due_day - REQUIRED for new credit cards
      // Requirements 1.2, 1.4, 1.5, 1.6
      if (data.payment_due_day === undefined || data.payment_due_day === null) {
        if (!isUpdate) {
          // Required for new credit cards
          errors.push('Payment due day is required for credit cards');
        } else if (existing && existing.payment_due_day !== null) {
          // Cannot set to null on update if it was previously set
          errors.push('Payment due day cannot be removed once set');
        }
      } else {
        // Validate range (1-31)
        const paymentDueDay = Number(data.payment_due_day);
        if (!Number.isInteger(paymentDueDay) || paymentDueDay < 1 || paymentDueDay > 31) {
          errors.push('Payment due day must be between 1 and 31');
        }
      }

      // Validate billing_cycle_start if provided (deprecated but still supported)
      if (data.billing_cycle_start !== undefined && data.billing_cycle_start !== null) {
        if (!Number.isInteger(data.billing_cycle_start) || data.billing_cycle_start < 1 || data.billing_cycle_start > 31) {
          errors.push('Billing cycle start day must be between 1 and 31');
        }
      }

      // Validate billing_cycle_end if provided (deprecated but still supported)
      if (data.billing_cycle_end !== undefined && data.billing_cycle_end !== null) {
        if (!Number.isInteger(data.billing_cycle_end) || data.billing_cycle_end < 1 || data.billing_cycle_end > 31) {
          errors.push('Billing cycle end day must be between 1 and 31');
        }
      }
    }

    // Validate account_details length if provided (for cheque and debit)
    if (data.account_details && data.account_details.length > 100) {
      errors.push('Account details must not exceed 100 characters');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if display name is unique among active payment methods
   * @param {string} displayName - Display name to check
   * @param {number} excludeId - Optional ID to exclude (for updates)
   * @returns {Promise<boolean>} True if unique
   */
  async isDisplayNameUnique(displayName, excludeId = null) {
    const trimmedName = displayName.trim();
    const existing = await paymentMethodRepository.findByDisplayName(trimmedName);
    
    if (!existing) {
      return true;
    }

    // If we're updating, allow the same name for the same record
    if (excludeId && existing.id === excludeId) {
      return true;
    }

    return false;
  }

  /**
   * Create a new payment method with type-specific validation
   * @param {Object} data - Payment method data
   * @returns {Promise<Object>} Created payment method
   */
  async createPaymentMethod(data) {
    // Validate input (isUpdate = false for creation)
    const validation = this.validatePaymentMethod(data, { isUpdate: false });
    if (!validation.isValid) {
      throw new Error(validation.errors.join('; '));
    }

    // Check display name uniqueness
    const isUnique = await this.isDisplayNameUnique(data.display_name);
    if (!isUnique) {
      throw new Error('A payment method with this display name already exists');
    }

    // Prepare data with trimmed values
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

    // Log activity event
    await activityLogService.logEvent(
      'payment_method_added',
      'payment_method',
      created.id,
      `Added payment method: ${created.display_name}`,
      {
        name: created.display_name,
        type: created.type
      }
    );

    return created;
  }

  /**
   * Update a payment method
   * @param {number} id - Payment method ID
   * @param {Object} data - Updated payment method data
   * @returns {Promise<Object|null>} Updated payment method or null if not found
   */
  async updatePaymentMethod(id, data) {
    if (!id) {
      throw new Error('Payment method ID is required');
    }

    // Check if payment method exists
    const existing = await paymentMethodRepository.findById(id);
    if (!existing) {
      return null;
    }

    // Validate input (isUpdate = true, pass existing for null prevention check)
    const validation = this.validatePaymentMethod(data, { isUpdate: true, existing });
    if (!validation.isValid) {
      throw new Error(validation.errors.join('; '));
    }

    // Check display name uniqueness (excluding current record)
    const isUnique = await this.isDisplayNameUnique(data.display_name, id);
    if (!isUnique) {
      throw new Error('A payment method with this display name already exists');
    }

    // Prepare data with trimmed values
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

      // Log activity event
      await activityLogService.logEvent(
        'payment_method_updated',
        'payment_method',
        id,
        `Updated payment method: ${updated.display_name}`,
        {
          name: updated.display_name,
          type: updated.type
        }
      );
    }

    return updated;
  }

  /**
   * Delete a payment method (only if no associated expenses)
   * @param {number} id - Payment method ID
   * @returns {Promise<Object>} Deletion result
   */
  async deletePaymentMethod(id) {
    if (!id) {
      throw new Error('Payment method ID is required');
    }

    // Check if payment method exists
    const existing = await paymentMethodRepository.findById(id);
    if (!existing) {
      return {
        success: false,
        message: 'Payment method not found'
      };
    }

    // Check for associated expenses
    const expenseCount = await paymentMethodRepository.countAssociatedExpenses(id);
    if (expenseCount > 0) {
      return {
        success: false,
        message: `Cannot delete payment method with associated expenses. Mark it as inactive instead. (${expenseCount} expense(s) found)`,
        expenseCount
      };
    }

    // Check if this is the last active payment method
    const activePaymentMethods = await paymentMethodRepository.findAll({ activeOnly: true });
    if (activePaymentMethods.length === 1 && activePaymentMethods[0].id === id) {
      return {
        success: false,
        message: 'Cannot delete the last active payment method. At least one active payment method must exist'
      };
    }

    // Delete the payment method
    const deleted = await paymentMethodRepository.delete(id);

    if (deleted) {
      logger.info('Deleted payment method:', { 
        id, 
        type: existing.type, 
        displayName: existing.display_name 
      });
      
      return {
        success: true,
        message: 'Payment method deleted successfully'
      };
    }

    return {
      success: false,
      message: 'Failed to delete payment method'
    };
  }

  /**
   * Activate or deactivate a payment method
   * @param {number} id - Payment method ID
   * @param {boolean} isActive - Active status
   * @returns {Promise<Object|null>} Updated payment method or null if not found
   */
  async setPaymentMethodActive(id, isActive) {
    if (!id) {
      throw new Error('Payment method ID is required');
    }

    // Check if payment method exists
    const existing = await paymentMethodRepository.findById(id);
    if (!existing) {
      return null;
    }

    // If deactivating, check if this is the last active payment method
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

      // Log activity event when deactivating
      if (!isActive) {
        await activityLogService.logEvent(
          'payment_method_deactivated',
          'payment_method',
          id,
          `Deactivated payment method: ${updated.display_name}`,
          {
            name: updated.display_name,
            type: updated.type
          }
        );
      }
    }

    return updated;
  }

  /**
   * Get all payment methods with expense counts for current period
   * For credit cards: uses billing cycle if configured, otherwise current month
   * For other types: uses current month
   * Also includes total_expense_count for delete validation
   * Credit card balances are calculated dynamically (excludes future pre-logged expenses)
   * 
   * OPTIMIZED: Uses single query to fetch base data, reducing N+1 queries
   * @returns {Promise<Array>} Array of payment methods with expense counts
   */
  async getAllWithExpenseCounts() {
    // Use timezone-aware date for balance calculation
    const todayStr = getTodayString();
    
    // Single optimized query fetches payment methods with expense counts and balance data
    const paymentMethods = await paymentMethodRepository.findAllWithExpenseCounts(todayStr);
    
    // Process results - only need to calculate period-specific expense counts
    // and utilization (which uses pre-fetched balance data)
    const withCounts = await Promise.all(
      paymentMethods.map(async (pm) => {
        // Get expense count for current period (billing cycle or current month)
        const expenseCount = await this.getExpenseCountForCurrentPeriod(pm);
        
        // For credit cards, calculate dynamic balance from pre-fetched totals
        // and compute utilization percentage
        let currentBalance = pm.current_balance;
        let utilizationPercentage = null;
        
        if (pm.type === 'credit_card') {
          // Calculate balance from pre-fetched expense and payment totals
          currentBalance = Math.max(0, Math.round((pm.expense_total_to_date - pm.payment_total_to_date) * 100) / 100);
          utilizationPercentage = this.calculateUtilizationPercentage(currentBalance, pm.credit_limit);
        }
        
        // Remove internal fields from output
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

    // For credit cards with billing cycle configured, use billing cycle dates
    if (paymentMethod.type === 'credit_card' && 
        paymentMethod.billing_cycle_start && 
        paymentMethod.billing_cycle_end) {
      const billingCycle = this.calculateCurrentBillingCycle(
        paymentMethod.billing_cycle_start,
        paymentMethod.billing_cycle_end
      );
      if (billingCycle) {
        startDate = billingCycle.startDate;
        endDate = billingCycle.endDate;
      }
    }

    // Fallback to current month if no billing cycle
    if (!startDate || !endDate) {
      const year = today.getFullYear();
      const month = today.getMonth();
      startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      // Get last day of current month
      const lastDay = new Date(year, month + 1, 0).getDate();
      endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    return paymentMethodRepository.countExpensesInDateRange(
      paymentMethod.id,
      startDate,
      endDate
    );
  }

  /**
   * Get only active payment methods (for dropdowns)
   * @returns {Promise<Array>} Array of active payment methods
   */
  async getActivePaymentMethods() {
    return paymentMethodRepository.getActivePaymentMethods();
  }

  /**
   * Get a payment method by ID
   * @param {number} id - Payment method ID
   * @returns {Promise<Object|null>} Payment method or null if not found
   */
  async getPaymentMethodById(id) {
    if (!id) {
      throw new Error('Payment method ID is required');
    }

    return paymentMethodRepository.findById(id);
  }

  /**
   * Get a payment method by display name
   * @param {string} displayName - Display name
   * @returns {Promise<Object|null>} Payment method or null if not found
   */
  async getPaymentMethodByDisplayName(displayName) {
    if (!displayName) {
      throw new Error('Display name is required');
    }

    return paymentMethodRepository.findByDisplayName(displayName.trim());
  }

  /**
   * Get all payment methods with optional filtering
   * @param {Object} options - Filter options { type, activeOnly }
   * @returns {Promise<Array>} Array of payment methods
   */
  async getAllPaymentMethods(options = {}) {
    return paymentMethodRepository.findAll(options);
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
    // Round to 2 decimal places
    return Math.round(utilization * 100) / 100;
  }

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
        // We're in the current cycle
        startDate = new Date(currentYear, currentMonth, billingCycleStart);
        endDate = new Date(currentYear, currentMonth, billingCycleEnd);
      } else if (currentDay < billingCycleStart) {
        // We're before the cycle starts, use previous month's cycle
        startDate = new Date(currentYear, currentMonth - 1, billingCycleStart);
        endDate = new Date(currentYear, currentMonth - 1, billingCycleEnd);
      } else {
        // We're after the cycle ends, use next month's cycle
        startDate = new Date(currentYear, currentMonth + 1, billingCycleStart);
        endDate = new Date(currentYear, currentMonth + 1, billingCycleEnd);
      }
    } else {
      // Billing cycle spans two months (e.g., 15th to 14th)
      if (currentDay >= billingCycleStart) {
        // We're in the first part of the cycle (this month)
        startDate = new Date(currentYear, currentMonth, billingCycleStart);
        endDate = new Date(currentYear, currentMonth + 1, billingCycleEnd);
      } else if (currentDay <= billingCycleEnd) {
        // We're in the second part of the cycle (started last month)
        startDate = new Date(currentYear, currentMonth - 1, billingCycleStart);
        endDate = new Date(currentYear, currentMonth, billingCycleEnd);
      } else {
        // We're between cycles, use the upcoming cycle
        startDate = new Date(currentYear, currentMonth, billingCycleStart);
        endDate = new Date(currentYear, currentMonth + 1, billingCycleEnd);
      }
    }
    
    // Format dates as YYYY-MM-DD
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
   * Get credit card with computed fields (utilization, days until due, etc.)
   * Balance is calculated DYNAMICALLY to exclude future pre-logged expenses.
   * This ensures the displayed balance reflects "now" - as time passes, future
   * expenses automatically become current expenses in the balance.
   * 
   * Returns all three balance types:
   * - statement_balance: Sum of expenses from past billing cycles minus payments before current cycle
   * - current_balance: Sum of expenses with effective_date <= today minus payments <= today
   * - projected_balance: Sum of ALL expenses minus ALL payments
   * 
   * @param {number} id - Payment method ID
   * @returns {Promise<Object|null>} Credit card with computed fields or null
   * _Requirements: 4.1, 4.2, 4.3, 7.1_
   */
  async getCreditCardWithComputedFields(id) {
    const paymentMethod = await paymentMethodRepository.findById(id);
    
    if (!paymentMethod || paymentMethod.type !== 'credit_card') {
      return null;
    }
    
    // Get all three balance types using the dedicated methods
    const balanceTypes = await this.getAllBalanceTypes(id);
    
    // Calculate computed fields using current balance for utilization
    const utilizationPercentage = this.calculateUtilizationPercentage(
      balanceTypes.current_balance,
      paymentMethod.credit_limit
    );
    
    const daysUntilDue = this.calculateDaysUntilDue(paymentMethod.payment_due_day);
    
    const billingCycle = this.calculateCurrentBillingCycle(
      paymentMethod.billing_cycle_start,
      paymentMethod.billing_cycle_end
    );
    
    // Get current billing cycle details (transaction count and totals)
    const currentCycleDetails = await this.getCurrentBillingCycleDetails(id);
    
    // Get expense count for current period (billing cycle or current month)
    // This is kept for backward compatibility but deprecated in favor of current_cycle.transaction_count
    const expenseCount = await this.getExpenseCountForCurrentPeriod(paymentMethod);
    
    return {
      ...paymentMethod,
      // Balance types
      statement_balance: balanceTypes.statement_balance,
      current_balance: balanceTypes.current_balance,
      projected_balance: balanceTypes.projected_balance,
      has_pending_expenses: balanceTypes.has_pending_expenses,
      // Current billing cycle details
      current_cycle: currentCycleDetails ? {
        start_date: currentCycleDetails.start_date,
        end_date: currentCycleDetails.end_date,
        transaction_count: currentCycleDetails.transaction_count,
        total_amount: currentCycleDetails.total_amount,
        payment_count: currentCycleDetails.payment_count,
        payment_total: currentCycleDetails.payment_total
      } : null,
      // Computed fields
      utilization_percentage: utilizationPercentage,
      days_until_due: daysUntilDue,
      current_billing_cycle: billingCycle,
      // Deprecated: use current_cycle.transaction_count instead
      expense_count: expenseCount
    };
  }

  /**
   * Calculate dynamic balance for a credit card (excludes future pre-logged expenses)
   * Uses COALESCE(posted_date, date) for effective posting date
   * Formula: (expenses where COALESCE(posted_date, date) <= today) - (payments where payment_date <= today)
   * 
   * This method delegates to calculateCurrentBalance() to avoid code duplication.
   * Kept for backward compatibility with existing code that uses this method.
   * 
   * @param {number} id - Payment method ID
   * @returns {Promise<number>} Calculated balance
   * @private
   * _Requirements: 2.1, 2.2, 2.5_
   */
  async _calculateDynamicBalance(id) {
    // Delegate to calculateCurrentBalance to avoid code duplication
    // This ensures consistent behavior across all balance calculations
    try {
      return await this.calculateCurrentBalance(id);
    } catch (error) {
      // If calculateCurrentBalance fails (e.g., not a credit card), 
      // return 0 for backward compatibility
      logger.warn('_calculateDynamicBalance failed, returning 0:', { id, error: error.message });
      return 0;
    }
  }

  /**
   * Get all three balance types for a credit card
   * @param {number} paymentMethodId - Credit card ID
   * @returns {Promise<Object>} Object with all balance types
   * _Requirements: 7.1, 7.2, 7.3, 7.4_
   */
  async getAllBalanceTypes(paymentMethodId) {
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    
    if (!paymentMethod || paymentMethod.type !== 'credit_card') {
      throw new Error('Balance calculations only available for credit cards');
    }

    // Calculate all three balance types
    const [statementBalance, currentBalance, projectedBalance] = await Promise.all([
      this.calculateStatementBalance(paymentMethodId),
      this.calculateCurrentBalance(paymentMethodId),
      this.calculateProjectedBalance(paymentMethodId)
    ]);

    // Calculate has_pending_expenses flag (projected != current)
    const hasPendingExpenses = projectedBalance !== currentBalance;

    // Get billing cycle dates if configured
    let billingCycle = null;
    if (paymentMethod.billing_cycle_start && paymentMethod.billing_cycle_end) {
      billingCycle = this.calculateCurrentBillingCycle(
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
   * Calculate projected balance for a credit card
   * Sum of ALL expenses minus ALL payments
   * @param {number} paymentMethodId - Credit card ID
   * @returns {Promise<number>} Projected balance (minimum 0)
   * _Requirements: 3.1, 3.2, 3.3, 3.4_
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

    // Calculate balance (expenses - payments), minimum 0
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
   * _Requirements: 2.1, 2.2, 2.3, 2.4_
   */
  async calculateCurrentBalance(paymentMethodId) {
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    
    if (!paymentMethod || paymentMethod.type !== 'credit_card') {
      throw new Error('Balance calculations only available for credit cards');
    }

    const { getDatabase } = require('../database/db');
    const db = await getDatabase();

    // Use timezone-aware date to avoid UTC vs local date mismatch
    const todayStr = getTodayString();

    // Sum expenses where effective_date <= today
    // Use original_cost when set (for medical expenses with insurance) to reflect full credit card charge
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

    // Calculate balance (expenses - payments), minimum 0
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
   * 
   * CONSOLIDATED: This method now delegates to statementBalanceService when
   * billing_cycle_day is configured (modern approach). Falls back to legacy
   * billing_cycle_start/end calculation for backward compatibility.
   * 
   * @param {number} paymentMethodId - Credit card ID
   * @returns {Promise<number|null>} Statement balance or null if no billing cycle
   * _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 9.3 (backward compatibility)_
   */
  async calculateStatementBalance(paymentMethodId) {
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    
    if (!paymentMethod || paymentMethod.type !== 'credit_card') {
      throw new Error('Balance calculations only available for credit cards');
    }

    // MODERN APPROACH: Use statementBalanceService when billing_cycle_day is configured
    // This is the preferred method and single source of truth for statement balance calculation
    if (paymentMethod.billing_cycle_day) {
      const statementBalanceService = require('./statementBalanceService');
      const result = await statementBalanceService.calculateStatementBalance(paymentMethodId);
      
      // statementBalanceService returns an object with statementBalance property
      // Return just the number for backward compatibility with this method's signature
      return result ? result.statementBalance : null;
    }

    // LEGACY FALLBACK: Use billing_cycle_start/end for cards without billing_cycle_day
    // This maintains backward compatibility for older card configurations
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

    const { getDatabase } = require('../database/db');
    const db = await getDatabase();

    // Sum expenses where effective_date < current billing cycle start
    // Use original_cost when set (for medical expenses with insurance) to reflect full credit card charge
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

    // Sum payments where payment_date < current billing cycle start
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

    // Calculate balance (expenses - payments), minimum 0
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
   * Get billing cycle details for a specific period
   * @param {number} paymentMethodId - Credit card ID
   * @param {string} startDate - Cycle start date (YYYY-MM-DD)
   * @param {string} endDate - Cycle end date (YYYY-MM-DD)
   * @returns {Promise<Object>} Cycle details with transaction count and total
   * _Requirements: 8.4, 9.4_
   */
  async getBillingCycleDetails(paymentMethodId, startDate, endDate) {
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    
    if (!paymentMethod || paymentMethod.type !== 'credit_card') {
      throw new Error('Billing cycle details only available for credit cards');
    }

    const { getDatabase } = require('../database/db');
    const db = await getDatabase();

    // Query transaction count and total for the period using effective_date
    // Use original_cost when set (for medical expenses with insurance) to reflect full credit card charge
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

    // Query payment count and total for the period
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

    // Determine if this is the current cycle - use timezone-aware date
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
   * _Requirements: 8.1, 8.2, 8.3_
   */
  async getCurrentBillingCycleDetails(paymentMethodId) {
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    
    if (!paymentMethod || paymentMethod.type !== 'credit_card') {
      throw new Error('Billing cycle details only available for credit cards');
    }

    // Return null if no billing cycle configured
    if (!paymentMethod.billing_cycle_start || !paymentMethod.billing_cycle_end) {
      return null;
    }

    // Calculate current billing cycle dates using existing method
    const billingCycle = this.calculateCurrentBillingCycle(
      paymentMethod.billing_cycle_start,
      paymentMethod.billing_cycle_end
    );

    if (!billingCycle) {
      return null;
    }

    // Get billing cycle details for the current cycle
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
   * _Requirements: 9.1, 9.2, 9.3_
   */
  async getPreviousBillingCycles(paymentMethodId, count = 6) {
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    
    if (!paymentMethod || paymentMethod.type !== 'credit_card') {
      throw new Error('Billing cycle details only available for credit cards');
    }

    // Return empty array if no billing cycle configured
    if (!paymentMethod.billing_cycle_start || !paymentMethod.billing_cycle_end) {
      return [];
    }

    const cycles = [];
    const billingCycleStart = paymentMethod.billing_cycle_start;
    const billingCycleEnd = paymentMethod.billing_cycle_end;

    // Start from current date and work backwards
    let referenceDate = new Date();
    
    // Get current cycle first to establish the starting point
    const currentCycle = this.calculateCurrentBillingCycle(
      billingCycleStart,
      billingCycleEnd,
      referenceDate
    );

    if (!currentCycle) {
      return [];
    }

    // Add current cycle as the first entry
    const currentCycleDetails = await this.getBillingCycleDetails(
      paymentMethodId,
      currentCycle.startDate,
      currentCycle.endDate
    );
    cycles.push(currentCycleDetails);

    // Calculate previous cycles
    // Move reference date to before the current cycle start
    const [startYear, startMonth, startDay] = currentCycle.startDate.split('-').map(Number);
    referenceDate = new Date(startYear, startMonth - 1, startDay);
    referenceDate.setDate(referenceDate.getDate() - 1); // Go to day before current cycle

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

      // Move reference date to before this cycle
      const [prevStartYear, prevStartMonth, prevStartDay] = previousCycle.startDate.split('-').map(Number);
      referenceDate = new Date(prevStartYear, prevStartMonth - 1, prevStartDay);
      referenceDate.setDate(referenceDate.getDate() - 1);
    }

    logger.debug('Retrieved previous billing cycles:', {
      paymentMethodId,
      count,
      cyclesReturned: cycles.length
    });

    // Return sorted by date descending (most recent first)
    return cycles.sort((a, b) => b.start_date.localeCompare(a.start_date));
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
   * Only includes expenses where effective posting date <= today
   * Uses COALESCE(posted_date, date) for effective posting date
   * @param {number} id - Payment method ID
   * @returns {Promise<Object>} Updated payment method with recalculated balance
   * _Requirements: 2.1, 2.2_
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

    // Use timezone-aware date to avoid UTC vs local date mismatch
    const todayStr = getTodayString();

    // Sum all expenses for this card where effective posting date <= today
    // Uses COALESCE(posted_date, date) to determine effective posting date
    // Use original_cost when set (for medical expenses with insurance) to reflect full credit card charge
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

    // Sum all payments for this card
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

    // Calculate new balance (expenses - payments)
    const newBalance = Math.max(0, Math.round((expenseTotal - paymentTotal) * 100) / 100);

    // Update the balance
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

    // Return updated payment method
    return paymentMethodRepository.findById(id);
  }
}

module.exports = new PaymentMethodService();
