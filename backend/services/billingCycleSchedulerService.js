const billingCycleRepository = require('../repositories/billingCycleRepository');
const billingCycleHistoryService = require('./billingCycleHistoryService');
const activityLogService = require('./activityLogService');
const logger = require('../config/logger');

const DURATION_WARNING_THRESHOLD_MS = 30000;
const SCHEDULER_MONTHS_BACK = 1;

/**
 * BillingCycleSchedulerService
 * 
 * Proactive background scheduler that detects completed billing cycles
 * across all credit cards and auto-generates billing cycle records.
 * Replaces the lazy frontend-triggered auto-generation approach.
 * 
 * _Requirements: 1.2, 1.3, 1.4, 1.5, 5.2, 5.4, 6.1, 6.2, 6.3, 8.1, 8.2, 8.3, 8.4, 8.5_
 */
class BillingCycleSchedulerService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Execute a single scheduler run.
   * Called by cron and on startup.
   * Acquires in-memory lock to prevent concurrent execution (Req 5.2).
   * @param {Date} referenceDate - Reference date for cycle detection
   * @returns {{ generatedCount: number, errors: Array }} Run summary
   */
  async runAutoGeneration(referenceDate = new Date()) {
    // Lightweight lock to prevent concurrent execution (Req 5.2)
    if (this.isRunning) {
      logger.debug('Billing cycle scheduler: skipping run, already in progress');
      return { generatedCount: 0, errors: [], skipped: true };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const errors = [];
    let generatedCount = 0;

    try {
      // Get all active credit cards with billing_cycle_day (Req 1.2)
      const cards = await billingCycleRepository.getCreditCardsNeedingBillingCycleEntry(referenceDate);

      if (cards.length === 0) {
        logger.debug('Billing cycle scheduler: no credit cards to process');
      }

      // Process each card with error isolation (Req 1.4)
      for (const card of cards) {
        try {
          const created = await this.processCard(card, referenceDate);
          generatedCount += created.length;
        } catch (error) {
          const cardName = card.display_name || card.full_name || `Card ${card.id}`;
          const errorInfo = {
            cardId: card.id,
            cardName,
            error: error.message
          };
          errors.push(errorInfo);
          logger.error('Billing cycle scheduler: error processing card', errorInfo);

          // Log error activity event (Req 6.3)
          await activityLogService.logEvent(
            'billing_cycle_scheduler_error',
            'system',
            null,
            `Billing cycle scheduler error for ${cardName}: ${error.message}`,
            { errorMessage: error.message, cardId: card.id }
          );
        }
      }

      // Track run duration and warn if exceeds threshold (Req 5.4)
      const durationMs = Date.now() - startTime;
      if (durationMs > DURATION_WARNING_THRESHOLD_MS) {
        logger.warn('Billing cycle scheduler: run exceeded duration threshold', {
          durationMs,
          thresholdMs: DURATION_WARNING_THRESHOLD_MS
        });
      }

      // Log summary (Req 1.5)
      logger.info('Billing cycle scheduler: run complete', {
        generatedCount,
        errorCount: errors.length,
        durationMs
      });

      // Log summary activity event (Req 6.2)
      await activityLogService.logEvent(
        'billing_cycle_scheduler_run',
        'system',
        null,
        `Billing cycle scheduler completed: ${generatedCount} cycles generated, ${errors.length} errors`,
        { generatedCount, errorCount: errors.length, durationMs }
      );

      return { generatedCount, errors };
    } catch (error) {
      logger.error('Billing cycle scheduler: fatal error during run', { error: error.message });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process a single credit card: find missing periods (limited to 1 month back),
   * create auto-generated cycles with calculated balances.
   * 
   * Uses getMissingCyclePeriods with monthsBack=1 for detection, then creates
   * cycles using the same expense calculation logic as autoGenerateBillingCycles.
   * 
   * @param {Object} card - Credit card payment method record
   * @param {Date} referenceDate - Reference date for cycle detection
   * @returns {Array} Array of created cycle records
   */
  async processCard(card, referenceDate) {
    const paymentMethodId = card.id;
    const billingCycleDay = card.billing_cycle_day;
    const cardName = card.display_name || card.full_name || `Card ${paymentMethodId}`;

    // Get missing periods limited to 1 month back (Req 1.2)
    const missingPeriods = await billingCycleHistoryService.getMissingCyclePeriods(
      paymentMethodId,
      billingCycleDay,
      referenceDate,
      SCHEDULER_MONTHS_BACK
    );

    if (missingPeriods.length === 0) {
      logger.debug('Billing cycle scheduler: no missing periods for card', { paymentMethodId, cardName });
      return [];
    }

    const generatedCycles = [];

    for (const period of missingPeriods) {
      try {
        // Use shared helper for balance calculation (Req 1.1, 1.2, 1.3, 1.4, 1.5, 8.1)
        const { calculatedBalance, previousBalance, totalExpenses, totalPayments } =
          await billingCycleHistoryService.calculateCycleBalance(paymentMethodId, period.startDate, period.endDate);

        // Create auto-generated cycle record (Req 8.2, 8.3, 8.4)
        const cycle = await billingCycleRepository.create({
          payment_method_id: paymentMethodId,
          cycle_start_date: period.startDate,
          cycle_end_date: period.endDate,
          actual_statement_balance: 0,
          calculated_statement_balance: calculatedBalance,
          minimum_payment: null,
          notes: null,
          statement_pdf_path: null
        });

        generatedCycles.push(cycle);

        // Log activity event for each generated cycle (Req 6.1)
        await activityLogService.logEvent(
          'billing_cycle_auto_generated',
          'billing_cycle',
          cycle.id,
          `Auto-generated billing cycle for ${cardName} (${period.startDate} to ${period.endDate})`,
          {
            cardName,
            cycleStartDate: period.startDate,
            cycleEndDate: period.endDate,
            calculatedBalance
          }
        );

        logger.debug('Billing cycle scheduler: created cycle', {
          id: cycle.id,
          paymentMethodId,
          cycleEndDate: period.endDate,
          calculatedBalance,
          previousBalance,
          totalExpenses,
          totalPayments
        });
      } catch (error) {
        // Skip duplicate entries (UNIQUE constraint) — treat as "already exists" (Req 8.5)
        if (error.message && error.message.includes('UNIQUE constraint')) {
          logger.debug('Billing cycle scheduler: cycle already exists, skipping', {
            paymentMethodId,
            period
          });
          continue;
        }
        // Re-throw other errors to be caught by the card-level error handler
        throw error;
      }
    }

    return generatedCycles;
  }
}

module.exports = new BillingCycleSchedulerService();
