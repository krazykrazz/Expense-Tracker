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
   * Returns actual_statement_balance if user-entered (including 0), otherwise calculated_statement_balance
   * @param {Object} cycle - Billing cycle record
   * @returns {Object} { effectiveBalance, balanceType }
   * _Requirements: 4.1, 4.2_
   */
  calculateEffectiveBalance(cycle) {
    if (!cycle) {
      return { effectiveBalance: 0, balanceType: 'calculated' };
    }

    const calculatedBalance = cycle.calculated_statement_balance || 0;

    // Use is_user_entered flag to determine if actual balance should be used
    // is_user_entered = 1 means user explicitly entered/updated this cycle
    // is_user_entered = 0 (or null/undefined) means auto-generated
    const isUserEntered = cycle.is_user_entered === 1;

    if (isUserEntered) {
      return {
        effectiveBalance: cycle.actual_statement_balance,
        balanceType: 'actual'
      };
    }

    // For non-user-entered cycles, also check if actual_statement_balance differs from 0
    // This handles legacy data before is_user_entered was added
    if (cycle.actual_statement_balance !== null && 
        cycle.actual_statement_balance !== undefined &&
        cycle.actual_statement_balance !== 0) {
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
   * Shared helper that encapsulates the full billing cycle balance calculation.
   * Queries expenses, queries payments, looks up previous cycle balance, and
   * computes max(0, round(prev + expenses - payments, 2)).
   *
   * Used by recalculateBalance(), autoGenerateBillingCycles(), and
   * billingCycleSchedulerService.processCard() to eliminate duplication.
   *
   * @param {number} paymentMethodId - The credit card payment method ID
   * @param {string} startDate - Cycle start date (YYYY-MM-DD)
   * @param {string} endDate - Cycle end date (YYYY-MM-DD)
   * @param {number|null} previousCycleOverride - If a number, use as previous balance directly
   *   (for batch processing where the previous cycle was just created and isn't in DB yet).
   *   If null, queries the DB for the previous cycle.
   * @returns {Promise<{calculatedBalance: number, previousBalance: number, totalExpenses: number, totalPayments: number}>}
   */
  async calculateCycleBalance(paymentMethodId, startDate, endDate, previousCycleOverride = null) {
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
      const { effectiveBalance } = this.calculateEffectiveBalance(previousCycle);
      previousBalance = effectiveBalance;
    }

    // Formula: max(0, round(previousBalance + totalExpenses - totalPayments, 2))
    const calculatedBalance = Math.max(0, Math.round((previousBalance + totalExpenses - totalPayments) * 100) / 100);

    return { calculatedBalance, previousBalance, totalExpenses, totalPayments };
  }

  /**
   * Recalculate the statement balance for a billing cycle period.
   * Delegates to the shared calculateCycleBalance() method.
   * @param {number} paymentMethodId - Payment method ID
   * @param {string} cycleStartDate - Cycle start date (YYYY-MM-DD)
   * @param {string} cycleEndDate - Cycle end date (YYYY-MM-DD)
   * @returns {Promise<number>} Recalculated balance (rounded to 2 decimal places)
   */
  async recalculateBalance(paymentMethodId, cycleStartDate, cycleEndDate) {
    const { calculatedBalance } = await this.calculateCycleBalance(paymentMethodId, cycleStartDate, cycleEndDate);
    return calculatedBalance;
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
      notes: data.notes,
      statement_pdf_path: data.statement_pdf_path,
      is_user_entered: 1  // User-created cycles are marked as user-entered
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
    // Mark as user-entered since user is explicitly updating
    const updated = await billingCycleRepository.update(cycleId, {
      actual_statement_balance: data.actual_statement_balance,
      minimum_payment: data.minimum_payment,
      notes: data.notes,
      is_user_entered: 1  // Mark as user-entered when user updates
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

      // Reverse to process oldest-first (getMissingCyclePeriods returns newest-first)
      // This is critical for carry-forward: each cycle needs the previous cycle's balance
      missingPeriods.reverse();

      const generatedCycles = [];
      let previousCycleBalance = null; // Track carry-forward from just-created cycles

      for (const period of missingPeriods) {
        try {
          // Use shared helper — pass previousCycleOverride for batch carry-forward
          const { calculatedBalance, previousBalance, totalExpenses, totalPayments } =
            await this.calculateCycleBalance(paymentMethodId, period.startDate, period.endDate, previousCycleBalance);

          // Create the billing cycle record with actual_statement_balance = 0
          const billingCycle = await billingCycleRepository.create({
            payment_method_id: paymentMethodId,
            cycle_start_date: period.startDate,
            cycle_end_date: period.endDate,
            actual_statement_balance: 0, // Auto-generated cycles have 0 actual balance
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
      
      // For auto-generated cycles, recalculate the balance from current expenses
      // so it stays accurate when expenses are added/edited/deleted after generation
      if (cycle.is_user_entered !== 1) {
        const freshBalance = await this.recalculateBalance(
          paymentMethodId,
          cycle.cycle_start_date,
          cycle.cycle_end_date
        );
        
        // Update in-memory value for effective balance calculation
        if (freshBalance !== cycle.calculated_statement_balance) {
          cycle.calculated_statement_balance = freshBalance;
          
          // Persist the updated balance back to the database
          await billingCycleRepository.updateCalculatedBalance(cycle.id, freshBalance);
        }
      }
      
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
