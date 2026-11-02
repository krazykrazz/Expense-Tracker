'use strict';

const plaidConfig = require('../config/plaid');
const plaidService = require('./plaidService');
const settingsRepository = require('../repositories/settingsRepository');
const activityLogService = require('./activityLogService');
const timeBoundaryService = require('./timeBoundaryService');
const logger = require('../config/logger');

/** The cron tick; each tick syncs only banks whose last sync is older than the interval. */
const TICK_CRON = '*/5 * * * *';
/** A tick can land a few minutes short of the interval; without slack a 30-minute interval drifts to 35. */
const SLACK_MINUTES = 3;
const INTERVALS = [30, 60, 120];

const KEYS = {
  enabled: 'plaid_auto_sync_enabled',
  intervalMinutes: 'plaid_auto_sync_interval_minutes',
  startHour: 'plaid_auto_sync_start_hour',
  endHour: 'plaid_auto_sync_end_hour'
};
const DEFAULTS = { enabled: true, intervalMinutes: 30, startHour: 6, endHour: 23 };

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const toInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
};

/** Hour and minute of `date` in an IANA timezone. */
function localTime(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date);
  const get = (type) => Number(parts.find(part => part.type === type).value);
  return { hour: get('hour'), minute: get('minute') };
}

/** Active hours are inclusive of the end hour's :00 (06–23 runs from 06:00 to 23:00). */
function isWithinActiveHours({ hour, minute }, { startHour, endHour }) {
  const minutes = hour * 60 + minute;
  return minutes >= startHour * 60 && minutes <= endHour * 60;
}

/**
 * Automatic Plaid sync: every `intervalMinutes` during active hours (business timezone), plus on demand when
 * the app is opened (see plaidController.sync with `ifStaleMinutes`). Nothing runs while Plaid is not
 * configured or no bank is connected. Settings live in the settings table, defaulting to every 30 minutes
 * from 06:00 to 23:00.
 */
class PlaidSyncSchedulerService {
  constructor() {
    this.isRunning = false;
  }

  async getSettings() {
    const values = await settingsRepository.getMultiple(Object.values(KEYS));
    const stored = (key) => values[KEYS[key]];
    return {
      enabled: stored('enabled') == null || stored('enabled') === '' ? DEFAULTS.enabled : stored('enabled') === '1',
      intervalMinutes: toInt(stored('intervalMinutes'), DEFAULTS.intervalMinutes),
      startHour: toInt(stored('startHour'), DEFAULTS.startHour),
      endHour: toInt(stored('endHour'), DEFAULTS.endHour)
    };
  }

  /**
   * @param {{enabled?: boolean, intervalMinutes?: number, startHour?: number, endHour?: number}} input
   */
  async saveSettings(input = {}, tabId = null) {
    const current = await this.getSettings();
    const next = {
      enabled: input.enabled === undefined ? current.enabled : input.enabled === true,
      intervalMinutes: input.intervalMinutes === undefined ? current.intervalMinutes : Number(input.intervalMinutes),
      startHour: input.startHour === undefined ? current.startHour : Number(input.startHour),
      endHour: input.endHour === undefined ? current.endHour : Number(input.endHour)
    };
    if (!INTERVALS.includes(next.intervalMinutes)) {
      throw fail(`intervalMinutes must be one of: ${INTERVALS.join(', ')}`, 400);
    }
    const validHour = (h, min, max) => Number.isInteger(h) && h >= min && h <= max;
    if (!validHour(next.startHour, 0, 23) || !validHour(next.endHour, 1, 24) || next.startHour >= next.endHour) {
      throw fail('Active hours must be whole hours with start before end (start 0-23, end 1-24)', 400);
    }

    await settingsRepository.setSetting(KEYS.enabled, next.enabled ? '1' : '0');
    await settingsRepository.setSetting(KEYS.intervalMinutes, String(next.intervalMinutes));
    await settingsRepository.setSetting(KEYS.startHour, String(next.startHour));
    await settingsRepository.setSetting(KEYS.endHour, String(next.endHour));

    await activityLogService.logEvent(
      'settings_updated',
      'settings',
      null,
      next.enabled
        ? `Bank auto sync: every ${next.intervalMinutes} minutes, ${next.startHour}:00-${next.endHour}:00`
        : 'Bank auto sync turned off',
      { section: 'plaid_auto_sync', ...next, tabId }
    );
    return next;
  }

  /**
   * One cron tick. Syncs the banks whose last sync (or failed attempt) is older than the interval, when
   * Plaid is configured, auto sync is on and the business-local time is inside the active hours.
   * @returns {Promise<{skipped?: string, synced?: number}>}
   */
  async tick(now = new Date()) {
    if (!plaidConfig.isEnabled()) return { skipped: 'plaid_disabled' };
    if (this.isRunning) return { skipped: 'running' };
    this.isRunning = true;
    try {
      const settings = await this.getSettings();
      if (!settings.enabled) return { skipped: 'off' };
      const timezone = await timeBoundaryService.getBusinessTimezone();
      if (!isWithinActiveHours(localTime(now, timezone), settings)) return { skipped: 'outside_hours' };

      const stale = await plaidService.findStaleItems(settings.intervalMinutes - SLACK_MINUTES, now.getTime());
      if (stale.length === 0) return { synced: 0 };
      const { synced, totals } = await plaidService.syncItems(stale, 'scheduled');
      logger.debug('Scheduled Plaid sync complete', { synced, ...totals });
      return { synced };
    } catch (err) {
      logger.error('Scheduled Plaid sync failed', { error: err.message });
      return { skipped: 'error' };
    } finally {
      this.isRunning = false;
    }
  }
}

const instance = new PlaidSyncSchedulerService();
instance.TICK_CRON = TICK_CRON;
instance.SLACK_MINUTES = SLACK_MINUTES;
instance.INTERVALS = INTERVALS;
instance.DEFAULTS = DEFAULTS;
instance._localTime = localTime;
instance._isWithinActiveHours = isWithinActiveHours;

module.exports = instance;
