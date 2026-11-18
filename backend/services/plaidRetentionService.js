const plaidConfig = require('../config/plaid');
const plaidRepository = require('../repositories/plaidRepository');
const settingsRepository = require('../repositories/settingsRepository');
const activityLogService = require('./activityLogService');
const { getTodayString } = require('../utils/dateUtils');
const logger = require('../config/logger');

const RETENTION_KEY = 'plaid_retention_months';
const DEFAULT_RETENTION_MONTHS = 2;
const MAX_RETENTION_MONTHS = 120;

/** @param {string} date YYYY-MM-DD @returns {string} the same day `months` earlier, clamped to the month's length */
function monthsBefore(date, months) {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Data hygiene for staged bank transactions (spec 2.5.1): ignored rows older than the retention period are
 * deleted daily. Rows linked to an expense, income or payment are never touched, and neither are rows still to review.
 */
class PlaidRetentionService {
  /** The retention period in months: the saved setting when it is a whole number from 1 to 120, else 2. */
  async getRetentionMonths() {
    const months = Number(await settingsRepository.getSetting(RETENTION_KEY));
    return Number.isInteger(months) && months >= 1 && months <= MAX_RETENTION_MONTHS ? months : DEFAULT_RETENTION_MONTHS;
  }

  /**
   * Delete ignored rows past the retention period. Does nothing while Plaid isn't configured (principle 1: no
   * background jobs without it). Never throws.
   * @param {string} [today] YYYY-MM-DD in the business timezone
   * @returns {Promise<{skipped?: string, deleted?: number}>}
   */
  async run(today = getTodayString()) {
    if (!plaidConfig.isEnabled()) return { skipped: 'plaid_disabled' };
    try {
      const months = await this.getRetentionMonths();
      const cutoff = monthsBefore(today, months);
      const deleted = await plaidRepository.deleteIgnoredBefore(cutoff);
      logger[deleted > 0 ? 'info' : 'debug']('Plaid retention cleanup completed', { deleted, cutoff, months });
      if (deleted > 0) {
        await activityLogService.logEvent(
          'plaid_transactions_cleaned',
          'plaid_transaction',
          null,
          `Removed ${deleted} ignored bank transaction${deleted === 1 ? '' : 's'} older than ${months} month${months === 1 ? '' : 's'}`,
          { deleted, cutoff, months }
        );
      }
      return { deleted };
    } catch (err) {
      logger.error('Plaid retention cleanup failed', { error: err.message });
      return { skipped: 'error' };
    }
  }
}

const instance = new PlaidRetentionService();
instance.DEFAULT_RETENTION_MONTHS = DEFAULT_RETENTION_MONTHS;
instance.RETENTION_KEY = RETENTION_KEY;
instance._monthsBefore = monthsBefore;

module.exports = instance;
