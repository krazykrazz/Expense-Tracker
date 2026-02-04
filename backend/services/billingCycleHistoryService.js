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
   * Calculate effective balance for a billing cycle
   * Returns actual_statement_balance if provided (including 0), otherwise calculated_statement_balance
   * @param {Object} cycle - Billing cycle record
   * @returns {Object} { effectiveBalance, balanceType }
   * _Requirements: 4.1, 4.2_
   */
  calculateEffectiveBalance(cycle) {
    if (!cycle) {
      return { effectiveBalance: 0, balanceType: 'calculated' };
    }

    const calculatedBalance = cycle.calculated_statement_balance || 0;

    // Check if actual_statement_balance was explicitly set (including 0)
    // Auto-generated cycles have actual_statement_balance = 0 but should show as 'calculated'
    // User-entered cycles with actual_statement_balance = 0 should show as 'actual'
    // We distinguish by checking if the cycle has been "entered" (has minimum_payment, due_date, or notes)
    // OR if actual_statement_balance differs from 0 (user explicitly set a non-zero value)
    const hasMinimumPayment = cycle.minimum_payment !== null && cycle.minimum_payment !== undefined;
    const hasDueDate = cycle.due_date !== null && cycle.due_date !== undefined;
    const hasNotes = cycle.notes !== null && cycle.notes !== undefined;
    
    const hasActualBalance = cycle.actual_statement_balance !== null && 
                             cycle.actual_statement_balance !== undefined &&
                             (cycle.actual_statement_balance !== 0 || 
                              hasMinimumPayment || 
                              hasDueDate || 
                              hasNotes);

    if (hasActualBalance) {
      return {
        effectiveBalance: cycle.actual_statement_balance,
        balanceType: 'actual'
      };
    }

    return {
      effectiveBalance: calculatedBalance,
      balanceType: 'calculated'
    };
  }

  /**
   * Calculate trend indicator comparing two cycles
   * @param {number} currentEffectiveBalance - Current cycle's effective balance
   * @param {number|null} previousEffectiveBalance - Previous cycle's effective balance (null if no previous)
   * @returns {Object|null} { type, icon, amount, cssClass } or null if no previous cycle
   * _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
   */
  calculateTrendIndicator(currentEffectiveBalance, previousEffectiveBalance) {
    // Return null if no previous cycle to compare against
    if (previousEffectiveBalance === null || previousEffectiveBalance === undefined) {
      return null;
    }

    const difference = currentEffectiveBalance - previousEffectiveBalance;
    const absoluteDiff = Math.abs(difference);
    const roundedDiff = Math.round(absoluteDiff * 100) / 100;

    // $1 tolerance for "same" classification
    if (roundedDiff <= 1.00) {
      return {
        type: 'same',
        icon: '✓',
        amount: 0,
        cssClass: 'trend-same'
      };
    }

    if (difference > 0) {
      return {
        type: 'higher',
        icon: '↑',
        amount: roundedDiff,
        cssClass: 'trend-higher'
      };
    }

    return {
      type: 'lower',
      icon: '↓',
      amount: roundedDiff,
      cssClass: 'trend-lower'
    };
  }

  /**
   * Get transaction count for a billing cycle period
   * Counts expenses where COALESCE(posted_date, date) falls within the cycle period
   * @param {number} paymentMethodId - Payment method ID
   * @param {string} cycleStartDate - Cycle start date (YYYY-MM-DD)
   * @param {string} cycleEndDate - Cycle end date (YYYY-MM-DD)
   * @returns {Promise<number>} Transaction count
   * _Requirements: 3.1, 3.2_
   */
  async getTransactionCount(paymentMethodId, cycleStartDate, cycleEndDate) {
    const { getDatabase } = require('../database/db');
    const db = await getDatabase();

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT COUNT(*) as count
        FROM expenses
        WHERE payment_method_id = ?
          AND COALESCE(posted_date, date) >= ?
          AND COALESCE(posted_date, date) <= ?
      `;

      db.get(sql, [paymentMethodId, cycleStartDate, cycleEndDate], (err, row) => {
        if (err) {
          logger.error('Failed to get transaction count:', err);
          reject(err);
          return;
        }
        resolve(row?.count || 0);
      });
    });
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
   * @param {string} [data.statement_pdf_path] - Optional PDF file path
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
      notes: data.notes,
      statement_pdf_path: data.statement_pdf_path
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
      discrepancy: discrepancy.amount,
      hasPdf: !!data.statement_pdf_path
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
   * Get historical periods that need billing cycle records
   * @param {number} paymentMethodId - Payment method ID
   * @param {number} billingCycleDay - Day of month when statement closes
   * @param {Date} referenceDate - Reference date
   * @param {number} monthsBack - How many months to look back (default 12)
   * @returns {Promise<Array>} Array of { startDate, endDate } for missing periods
   * _Requirements: 2.2, 2.6_
   */
  async getMissingCyclePeriods(paymentMethodId, billingCycleDay, referenceDate = new Date(), monthsBack = 12) {
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

      // Move reference date back by one month
      currentRef = new Date(currentRef);
      currentRef.setMonth(currentRef.getMonth() - 1);
    }

    return missingPeriods;
  }

  /**
   * Auto-generate billing cycles for historical periods
   * @param {number} paymentMethodId - Payment method ID
   * @param {number} billingCycleDay - Day of month when statement closes
   * @param {Date} referenceDate - Reference date (generates up to 12 months back)
   * @returns {Promise<Array>} Array of newly generated cycle records
   * _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
   */
  async autoGenerateBillingCycles(paymentMethodId, billingCycleDay, referenceDate = new Date()) {
    // Validate billing cycle day
    if (!billingCycleDay || billingCycleDay < 1 || billingCycleDay > 31) {
      logger.debug('Auto-generation skipped: no valid billing_cycle_day', { paymentMethodId, billingCycleDay });
      return [];
    }

    // Get missing periods
    const missingPeriods = await this.getMissingCyclePeriods(
      paymentMethodId,
      billingCycleDay,
      referenceDate,
      12
    );

    if (missingPeriods.length === 0) {
      logger.debug('Auto-generation: no missing periods found', { paymentMethodId });
      return [];
    }

    const generatedCycles = [];

    for (const period of missingPeriods) {
      try {
        // Calculate statement balance for this period
        // We need to use a reference date that would produce this cycle
        // The cycle end date + 1 day should give us the correct cycle
        // Parse the date string directly to avoid timezone issues
        const [year, month, day] = period.endDate.split('-').map(Number);
        // Create a date string for the day after cycle end
        // This ensures calculatePreviousCycleDates returns the correct cycle
        const nextDay = day + 1;
        const daysInMonth = new Date(year, month, 0).getDate();
        let refYear = year;
        let refMonth = month;
        let refDay = nextDay;
        
        if (nextDay > daysInMonth) {
          refDay = 1;
          refMonth = month + 1;
          if (refMonth > 12) {
            refMonth = 1;
            refYear = year + 1;
          }
        }
        
        // Format as YYYY-MM-DD string to pass to calculateStatementBalance
        const cycleRefDateStr = `${refYear}-${String(refMonth).padStart(2, '0')}-${String(refDay).padStart(2, '0')}`;

        // For auto-generated historical cycles, calculate expenses directly
        // without subtracting payments (payments are for paying off the statement,
        // not reducing the historical calculated balance)
        const { getDatabase } = require('../database/db');
        const db = await getDatabase();
        
        const totalExpenses = await new Promise((resolve, reject) => {
          const sql = `
            SELECT COALESCE(SUM(COALESCE(original_cost, amount)), 0) as total
            FROM expenses
            WHERE payment_method_id = ?
              AND COALESCE(posted_date, date) >= ?
              AND COALESCE(posted_date, date) <= ?
          `;
          
          db.get(sql, [paymentMethodId, period.startDate, period.endDate], (err, row) => {
            if (err) {
              logger.error('Failed to get expenses for auto-generation:', err);
              reject(err);
              return;
            }
            resolve(row?.total || 0);
          });
        });

        const calculatedBalance = Math.round(totalExpenses * 100) / 100;

        // Create the billing cycle record with actual_statement_balance = 0
        const billingCycle = await billingCycleRepository.create({
          payment_method_id: paymentMethodId,
          cycle_start_date: period.startDate,
          cycle_end_date: period.endDate,
          actual_statement_balance: 0, // Auto-generated cycles have 0 actual balance
          calculated_statement_balance: calculatedBalance,
          minimum_payment: null,
          due_date: null,
          notes: null,
          statement_pdf_path: null
        });

        generatedCycles.push(billingCycle);

        logger.debug('Auto-generated billing cycle:', {
          id: billingCycle.id,
          paymentMethodId,
          cycleEndDate: period.endDate,
          calculatedBalance
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

  /**
   * Get unified billing cycles with auto-generation, transaction counts, and trends
   * @param {number} paymentMethodId - Payment method ID
   * @param {Object} options - Query options
   * @param {number} [options.limit=12] - Maximum cycles to return
   * @param {boolean} [options.includeAutoGenerate=true] - Whether to auto-generate missing cycles
   * @param {Date} [options.referenceDate] - Reference date for calculations
   * @returns {Promise<Object>} { billingCycles, autoGeneratedCount, totalCount }
   * _Requirements: 6.1, 8.2, 8.3_
   */
  async getUnifiedBillingCycles(paymentMethodId, options = {}) {
    const {
      limit = 12,
      includeAutoGenerate = true,
      referenceDate = new Date()
    } = options;

    // Validate payment method
    const paymentMethod = await this.validatePaymentMethod(paymentMethodId);

    let autoGeneratedCount = 0;

    // Auto-generate missing cycles if requested
    if (includeAutoGenerate) {
      const generated = await this.autoGenerateBillingCycles(
        paymentMethodId,
        paymentMethod.billing_cycle_day,
        referenceDate
      );
      autoGeneratedCount = generated.length;
    }

    // Get all billing cycles (sorted by cycle_end_date DESC)
    const cycles = await billingCycleRepository.findByPaymentMethod(paymentMethodId, { limit });

    // Enrich each cycle with effective_balance, balance_type, transaction_count, trend_indicator
    const enrichedCycles = [];
    
    for (let i = 0; i < cycles.length; i++) {
      const cycle = cycles[i];
      
      // Calculate effective balance
      const { effectiveBalance, balanceType } = this.calculateEffectiveBalance(cycle);
      
      // Get transaction count
      const transactionCount = await this.getTransactionCount(
        paymentMethodId,
        cycle.cycle_start_date,
        cycle.cycle_end_date
      );
      
      // Calculate trend indicator (compare with previous cycle)
      let trendIndicator = null;
      if (i < cycles.length - 1) {
        const previousCycle = cycles[i + 1];
        const { effectiveBalance: previousEffectiveBalance } = this.calculateEffectiveBalance(previousCycle);
        trendIndicator = this.calculateTrendIndicator(effectiveBalance, previousEffectiveBalance);
      }
      
      enrichedCycles.push({
        ...cycle,
        effective_balance: effectiveBalance,
        balance_type: balanceType,
        transaction_count: transactionCount,
        trend_indicator: trendIndicator
      });
    }

    logger.debug('Retrieved unified billing cycles:', {
      paymentMethodId,
      count: enrichedCycles.length,
      autoGeneratedCount
    });

    return {
      billingCycles: enrichedCycles,
      autoGeneratedCount,
      totalCount: enrichedCycles.length
    };
  }
}

module.exports = new BillingCycleHistoryService();
