/**
 * TimeBoundaryService
 *
 * Converts UTC timestamps into business-local dates and period boundaries
 * using a configured IANA timezone. All timezone-aware logic uses
 * Intl.DateTimeFormat — no manual offset calculations.
 *
 * Design principle: UTC everywhere internally; local timezone only at the
 * business-date derivation boundary via Intl.DateTimeFormat.
 */

const logger = require('../config/logger');
const { DEFAULT_BUSINESS_TIMEZONE } = require('../config/timezone');

// Lazy require to avoid circular dependency (settingsService may import other services)
let _settingsService = null;
function getSettingsService() {
  if (!_settingsService) {
    _settingsService = require('./settingsService');
  }
  return _settingsService;
}

class TimeBoundaryService {
  /**
   * Get the configured business timezone from settings.
   * Falls back to DEFAULT_BUSINESS_TIMEZONE if the setting is unavailable.
   *
   * @returns {Promise<string>} IANA timezone identifier (e.g. 'America/Toronto')
   */
  async getBusinessTimezone() {
    try {
      const tz = await getSettingsService().getBusinessTimezone();
      return tz || DEFAULT_BUSINESS_TIMEZONE;
    } catch (err) {
      logger.warn('TimeBoundaryService: failed to read business_timezone from settings, using default', {
        default: DEFAULT_BUSINESS_TIMEZONE,
        error: err.message
      });
      return DEFAULT_BUSINESS_TIMEZONE;
    }
  }

  /**
   * Convert a UTC timestamp to a business date string (YYYY-MM-DD) in the
   * given timezone.
   *
   * Uses Intl.DateTimeFormat with the 'en-CA' locale, which natively produces
   * YYYY-MM-DD output.
   *
   * @param {Date} utcNow - UTC timestamp (default: new Date())
   * @param {string} timezone - IANA timezone identifier
   * @returns {string} YYYY-MM-DD in the business timezone
   */
  getBusinessDate(utcNow = new Date(), timezone) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(utcNow);
  }

  /**
   * Get the start and end of the business day that contains the given UTC time.
   *
   * @param {Date} utcNow - UTC timestamp (default: new Date())
   * @param {string} timezone - IANA timezone identifier
   * @returns {{ startLocal: string, endLocal: string, startUTC: Date, endUTC: Date }}
   *   startLocal / endLocal are YYYY-MM-DD strings (same date / next date)
   *   startUTC / endUTC are UTC Date objects at local midnight
   */
  getBusinessDayBounds(utcNow = new Date(), timezone) {
    const todayLocal = this.getBusinessDate(utcNow, timezone);

    // Compute next calendar date in local space
    const [year, month, day] = todayLocal.split('-').map(Number);
    const tomorrowLocal = this._addDays(year, month, day, 1);

    const startUTC = this.localDateToUTC(todayLocal, timezone);
    const endUTC = this.localDateToUTC(tomorrowLocal, timezone);

    return {
      startLocal: todayLocal,
      endLocal: tomorrowLocal,
      startUTC,
      endUTC
    };
  }

  /**
   * Get the start and end of the business week (Monday–Sunday) that contains
   * the given UTC time.
   *
   * @param {Date} utcNow - UTC timestamp (default: new Date())
   * @param {string} timezone - IANA timezone identifier
   * @returns {{ startLocal: string, endLocal: string, startUTC: Date, endUTC: Date }}
   */
  getBusinessWeekBounds(utcNow = new Date(), timezone) {
    const todayLocal = this.getBusinessDate(utcNow, timezone);
    const [year, month, day] = todayLocal.split('-').map(Number);

    // Determine day-of-week in local timezone using Intl
    const dowFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short'
    });
    const dowStr = dowFormatter.format(utcNow); // 'Mon', 'Tue', …, 'Sun'
    const dowMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const dayOffset = dowMap[dowStr] ?? 0; // 0 = Monday, 6 = Sunday

    const mondayLocal = this._addDays(year, month, day, -dayOffset);
    const nextMondayLocal = this._addDays(year, month, day, 7 - dayOffset);

    const startUTC = this.localDateToUTC(mondayLocal, timezone);
    const endUTC = this.localDateToUTC(nextMondayLocal, timezone);

    return {
      startLocal: mondayLocal,
      endLocal: nextMondayLocal,
      startUTC,
      endUTC
    };
  }

  /**
   * Get the start and end of the business month that contains the given UTC time.
   * Start = 1st of the month; end = 1st of the next month.
   *
   * @param {Date} utcNow - UTC timestamp (default: new Date())
   * @param {string} timezone - IANA timezone identifier
   * @returns {{ startLocal: string, endLocal: string, startUTC: Date, endUTC: Date }}
   */
  getBusinessMonthBounds(utcNow = new Date(), timezone) {
    const todayLocal = this.getBusinessDate(utcNow, timezone);
    const [year, month] = todayLocal.split('-').map(Number);

    const startLocal = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;

    // First day of next month
    let nextYear = year;
    let nextMonth = month + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    const endLocal = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;

    const startUTC = this.localDateToUTC(startLocal, timezone);
    const endUTC = this.localDateToUTC(endLocal, timezone);

    return {
      startLocal,
      endLocal,
      startUTC,
      endUTC
    };
  }

  /**
   * Convert a local date string (YYYY-MM-DD) to the UTC Date at the start of
   * that local day (i.e. local midnight → UTC).
   *
   * Uses a binary search over UTC milliseconds to find the exact UTC instant
   * where the local clock reads 00:00:00 on the target date. This correctly
   * handles DST transitions without any manual offset arithmetic.
   *
   * @param {string} localDate - YYYY-MM-DD
   * @param {string} timezone - IANA timezone identifier
   * @returns {Date} UTC Date at start of that local day
   */
  localDateToUTC(localDate, timezone) {
    const [year, month, day] = localDate.split('-').map(Number);

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    // Search range: [day-2 noon UTC, day+1 noon UTC] — wide enough for any UTC offset (up to +14h)
    // UTC+14 (e.g. Pacific/Kiritimati) means local midnight is at day-1 10:00 UTC,
    // so we need lo to be at least day-1 00:00 UTC. Using day-2 noon gives ample margin.
    let lo = new Date(Date.UTC(year, month - 1, day - 2, 12, 0, 0)).getTime();
    let hi = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0)).getTime();

    while (hi - lo > 1000) {
      const mid = Math.floor((lo + hi) / 2);
      const midDate = new Date(mid);
      const parts = formatter.formatToParts(midDate);

      const pYear = parseInt(parts.find(p => p.type === 'year').value, 10);
      const pMonth = parseInt(parts.find(p => p.type === 'month').value, 10);
      const pDay = parseInt(parts.find(p => p.type === 'day').value, 10);
      const pHour = parseInt(parts.find(p => p.type === 'hour').value, 10);
      const pMin = parseInt(parts.find(p => p.type === 'minute').value, 10);
      const pSec = parseInt(parts.find(p => p.type === 'second').value, 10);

      // Normalise hour=24 (some Intl implementations emit 24 for midnight)
      const effectiveHour = pHour === 24 ? 0 : pHour;
      const localMs = effectiveHour * 3_600_000 + pMin * 60_000 + pSec * 1_000;

      const localDateNum = pYear * 10_000 + pMonth * 100 + pDay;
      const targetDateNum = year * 10_000 + month * 100 + day;

      if (localDateNum < targetDateNum || (localDateNum === targetDateNum && localMs < 0)) {
        lo = mid;
      } else if (localDateNum > targetDateNum || (localDateNum === targetDateNum && localMs > 0)) {
        hi = mid;
      } else {
        // localMs === 0 and date matches — exact midnight found
        return new Date(mid);
      }
    }

    return new Date(Math.floor((lo + hi) / 2));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Add `n` calendar days to a YYYY-MM-DD date and return the result as
   * a YYYY-MM-DD string. Uses Date.UTC to avoid local-time ambiguity.
   *
   * @param {number} year
   * @param {number} month  1-based
   * @param {number} day
   * @param {number} n      days to add (may be negative)
   * @returns {string} YYYY-MM-DD
   */
  _addDays(year, month, day, n) {
    const d = new Date(Date.UTC(year, month - 1, day + n));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const dd = d.getUTCDate();
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
}

// Export a singleton instance
const timeBoundaryService = new TimeBoundaryService();
module.exports = timeBoundaryService;
