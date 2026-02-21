'use strict';

const billingCycleRepository = require('../repositories/billingCycleRepository');
const cycleGenerationService = require('./cycleGenerationService');
const activityLogService = require('./activityLogService');
const timeBoundaryService = require('./timeBoundaryService');
const logger = require('../config/logger');

const DURATION_WARNING_THRESHOLD_MS = 30000;

/**
 * BillingCycleSchedulerService
 *
 * Simplified background scheduler that detects completed billing cycles
 * across all credit cards and auto-generates billing cycle records.
 *
 * Processes only the current business date (determined via TimeBoundaryService).
 * Gap recovery for missed cycles is delegated to CycleGenerationService.getMissingCyclePeriods
 * which looks back up to 24 months to detect and fill any gaps.
 *
 * _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_
 */
class BillingCycleSchedulerService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Execute a single scheduler run.
   * Called by cron and on startup.
   * Acquires in-memory lock to prevent concurrent execution (Req 1.5).
   *
   * @param {Date} [utcNow=new Date()] - UTC reference time
   * @returns {Promise<{ generatedCount: number, errors: Array, skipped?: boolean }>}
   */
  async runAutoGeneration(utcNow = new Date()) {
    if (this.isRunning) {
      logger.debug('Billing cycle scheduler: skipping run, already in progress');
      return { generatedCount: 0, errors: [], skipped: true };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const errors = [];
    let generatedCount = 0;

    try {
      const timezone = await timeBoundaryService.getBusinessTimezone();
      const currentBusinessDate = timeBoundaryService.getBusinessDate(utcNow, timezone);
      const dateStart = timeBoundaryService.localDateToUTC(currentBusinessDate, timezone);

      logger.info('Billing cycle scheduler: starting run', {
        utcNow: utcNow.toISOString(),
        timezone,
        currentBusinessDate
      });

      const cards = await billingCycleRepository.getCreditCardsNeedingBillingCycleEntry(dateStart);

      for (const card of cards) {
        try {
          const created = await this.processCard(card, dateStart);
          generatedCount += created.length;
        } catch (error) {
          const cardName = card.display_name || card.full_name || `Card ${card.id}`;
          const errorInfo = { cardId: card.id, cardName, error: error.message };
          errors.push(errorInfo);
          logger.error('Billing cycle scheduler: error processing card', errorInfo);

          await activityLogService.logEvent(
            'billing_cycle_scheduler_error',
            'system',
            null,
            `Billing cycle scheduler error for ${cardName}: ${error.message}`,
            { errorMessage: error.message, cardId: card.id }
          );
        }
      }

      const durationMs = Date.now() - startTime;
      if (durationMs > DURATION_WARNING_THRESHOLD_MS) {
        logger.warn('Billing cycle scheduler: run exceeded duration threshold', {
          durationMs,
          thresholdMs: DURATION_WARNING_THRESHOLD_MS
        });
      }

      logger.info('Billing cycle scheduler: run complete', {
        generatedCount,
        errorCount: errors.length,
        durationMs
      });

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
   * Process a single credit card for a given reference date.
   * Delegates gap detection to CycleGenerationService.getMissingCyclePeriods
   * with monthsBack=24 to recover any missed cycles (Req 1.8).
   *
   * @param {Object} card - Credit card payment method record
   * @param {Date} referenceDate - Reference date for cycle detection
   * @returns {Promise<Array>} Array of created cycle records
   */
  async processCard(card, referenceDate) {
    const paymentMethodId = card.id;
    const billingCycleDay = card.billing_cycle_day;
    const cardName = card.display_name || card.full_name || `Card ${paymentMethodId}`;

    const missingPeriods = await cycleGenerationService.getMissingCyclePeriods(
      paymentMethodId,
      billingCycleDay,
      referenceDate,
      24
    );

    if (missingPeriods.length === 0) {
      logger.debug('Billing cycle scheduler: no missing periods for card', { paymentMethodId, cardName });
      return [];
    }

    const generatedCycles = [];

    for (const period of missingPeriods) {
      try {
        const { calculatedBalance } =
          await cycleGenerationService.calculateCycleBalance(
            paymentMethodId,
            period.startDate,
            period.endDate
          );

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

        await activityLogService.logEvent(
          'billing_cycle_auto_generated',
          'billing_cycle',
          cycle.id,
          `Auto-generated billing cycle for ${cardName} (${period.startDate} to ${period.endDate})`,
          { cardName, cycleStartDate: period.startDate, cycleEndDate: period.endDate, calculatedBalance }
        );

        logger.debug('Billing cycle scheduler: created cycle', {
          id: cycle.id,
          paymentMethodId,
          cycleEndDate: period.endDate,
          calculatedBalance
        });
      } catch (error) {
        if (error.message && error.message.includes('UNIQUE constraint')) {
          logger.debug('Billing cycle scheduler: cycle already exists, skipping', {
            paymentMethodId,
            period
          });
          continue;
        }
        throw error;
      }
    }

    return generatedCycles;
  }
}

module.exports = new BillingCycleSchedulerService();
