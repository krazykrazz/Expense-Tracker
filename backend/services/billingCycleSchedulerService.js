'use strict';

const billingCycleRepository = require('../repositories/billingCycleRepository');
const billingCycleHistoryService = require('./billingCycleHistoryService');
const activityLogService = require('./activityLogService');
const timeBoundaryService = require('./timeBoundaryService');
const settingsService = require('./settingsService');
const logger = require('../config/logger');

const DURATION_WARNING_THRESHOLD_MS = 30000;

/**
 * BillingCycleSchedulerService
 *
 * Date-driven background scheduler that detects completed billing cycles
 * across all credit cards and auto-generates billing cycle records.
 *
 * Uses a last_processed_date cursor stored in settings to determine which
 * business dates need processing. On each run it processes every date in
 * [last_processed_date + 1 .. currentBusinessDate] sequentially, updating
 * the cursor after each date so a crash mid-run resumes correctly.
 *
 * _Requirements: 5.1-5.10, 6.1-6.3_
 */
class BillingCycleSchedulerService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Execute a single scheduler run.
   * Called by cron and on startup.
   * Acquires in-memory lock to prevent concurrent execution (Req 5.2).
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
      const lastProcessedDate = await settingsService.getLastProcessedDate();

      logger.info('Billing cycle scheduler: starting run', {
        utcNow: utcNow.toISOString(),
        timezone,
        currentBusinessDate,
        lastProcessedDate
      });

      let datesToProcess;
      if (lastProcessedDate === null) {
        datesToProcess = [currentBusinessDate];
      } else if (currentBusinessDate > lastProcessedDate) {
        datesToProcess = this.getDateRange(
          this._addOneDay(lastProcessedDate),
          currentBusinessDate
        );
      } else {
        logger.debug('Billing cycle scheduler: already up to date', {
          currentBusinessDate,
          lastProcessedDate
        });
        return { generatedCount: 0, errors: [] };
      }

      for (const businessDate of datesToProcess) {
        const dateStart = timeBoundaryService.localDateToUTC(businessDate, timezone);
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

        await settingsService.updateLastProcessedDate(businessDate);
        logger.debug('Billing cycle scheduler: processed date', { businessDate, cards: cards.length });
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
        durationMs,
        datesProcessed: datesToProcess.length
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
   *
   * @param {Object} card - Credit card payment method record
   * @param {Date} referenceDate - Reference date for cycle detection
   * @returns {Promise<Array>} Array of created cycle records
   */
  async processCard(card, referenceDate) {
    const paymentMethodId = card.id;
    const billingCycleDay = card.billing_cycle_day;
    const cardName = card.display_name || card.full_name || `Card ${paymentMethodId}`;

    const missingPeriods = await billingCycleHistoryService.getMissingCyclePeriods(
      paymentMethodId,
      billingCycleDay,
      referenceDate,
      1
    );

    if (missingPeriods.length === 0) {
      logger.debug('Billing cycle scheduler: no missing periods for card', { paymentMethodId, cardName });
      return [];
    }

    const generatedCycles = [];

    for (const period of missingPeriods) {
      try {
        const { calculatedBalance, previousBalance, totalExpenses, totalPayments } =
          await billingCycleHistoryService.calculateCycleBalance(
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
          calculatedBalance,
          previousBalance,
          totalExpenses,
          totalPayments
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

  /**
   * Return an array of YYYY-MM-DD strings from fromDate to toDate (inclusive).
   * Returns [] if fromDate > toDate.
   *
   * @param {string} fromDate - YYYY-MM-DD
   * @param {string} toDate   - YYYY-MM-DD
   * @returns {string[]}
   */
  getDateRange(fromDate, toDate) {
    const dates = [];
    let current = fromDate;
    while (current <= toDate) {
      dates.push(current);
      current = this._addOneDay(current);
    }
    return dates;
  }

  /**
   * Add one calendar day to a YYYY-MM-DD string.
   *
   * @param {string} dateStr - YYYY-MM-DD
   * @returns {string} YYYY-MM-DD
   */
  _addOneDay(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  }
}

module.exports = new BillingCycleSchedulerService();
