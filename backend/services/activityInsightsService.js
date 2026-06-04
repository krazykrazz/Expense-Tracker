const dbHelper = require('../utils/dbHelper');
const logger = require('../config/logger');

/**
 * Day-of-week names indexed by SQLite strftime('%w') result (0 = Sunday).
 */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

class ActivityInsightsService {
  /**
   * Compute date range bounds for activity_logs timestamp queries (index-friendly)
   * @private
   */
  _timestampRange(year, month) {
    const mo = parseInt(month);
    const yr = parseInt(year);
    const start = `${yr}-${String(mo).padStart(2, '0')}-01`;
    const end = mo === 12 ? `${yr + 1}-01-01` : `${yr}-${String(mo + 1).padStart(2, '0')}-01`;
    return { start, end };
  }

  /**
   * Get activity insights for a given year/month.
   * @param {number} year
   * @param {number} month - 1-12
   * @returns {Promise<Object>} ActivityInsightsResponse
   */
  async getActivityInsights(year, month) {
    const range = this._timestampRange(year, month);

    const [entryVelocity, entityBreakdown, recentChanges, dayOfWeekPatterns] =
      await Promise.all([
        this._getEntryVelocity(year, month, range),
        this._getEntityBreakdown(range),
        this._getRecentChanges(range),
        this._getDayOfWeekPatterns(range),
      ]);

    return {
      entryVelocity,
      entityBreakdown,
      recentChanges,
      dayOfWeekPatterns,
    };
  }

  /**
   * Compute entry velocity: current month count vs previous month count.
   * @returns {Promise<Object>} { currentMonth, previousMonth, difference }
   */
  async _getEntryVelocity(year, month, range) {
    // Current month count
    const currRow = await dbHelper.queryOne(
      `SELECT COUNT(*) AS cnt
       FROM activity_logs
       WHERE timestamp >= ? AND timestamp < ?`,
      [range.start, range.end]
    );
    const currentMonth = currRow ? currRow.cnt : 0;

    // Previous month
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    const prevRange = this._timestampRange(prevYear, prevMonth);

    const prevRow = await dbHelper.queryOne(
      `SELECT COUNT(*) AS cnt
       FROM activity_logs
       WHERE timestamp >= ? AND timestamp < ?`,
      [prevRange.start, prevRange.end]
    );
    const previousMonth = prevRow ? prevRow.cnt : 0;

    return {
      currentMonth,
      previousMonth,
      difference: currentMonth - previousMonth,
    };
  }

  /**
   * Group activity logs by entity_type for the given month, sorted by count desc.
   * @returns {Promise<Array<{entityType: string, count: number}>>}
   */
  async _getEntityBreakdown(range) {
    const rows = await dbHelper.queryAll(
      `SELECT entity_type, COUNT(*) AS cnt
       FROM activity_logs
       WHERE timestamp >= ? AND timestamp < ?
       GROUP BY entity_type
       ORDER BY cnt DESC`,
      [range.start, range.end]
    );
    return rows.map(r => ({
      entityType: r.entity_type,
      count: r.cnt,
    }));
  }

  /**
   * Return the 10 most recent activity log entries for the given month
   * with parsed metadata.
   * @returns {Promise<Array>}
   */
  async _getRecentChanges(range) {
    const rows = await dbHelper.queryAll(
      `SELECT id, timestamp, entity_type, user_action, metadata
       FROM activity_logs
       WHERE timestamp >= ? AND timestamp < ?
       ORDER BY timestamp DESC
       LIMIT 10`,
      [range.start, range.end]
    );
    return rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      entityType: r.entity_type,
      userAction: r.user_action,
      metadata: this._parseMetadata(r.metadata),
    }));
  }

  /**
   * Compute day-of-week activity patterns for the given month.
   * @returns {Promise<Array<{day: string, count: number}>>}
   */
  async _getDayOfWeekPatterns(range) {
    const rows = await dbHelper.queryAll(
      `SELECT strftime('%w', timestamp) AS dow, COUNT(*) AS cnt
       FROM activity_logs
       WHERE timestamp >= ? AND timestamp < ?
       GROUP BY dow
       ORDER BY cnt DESC`,
      [range.start, range.end]
    );
    return rows.map(r => ({
      day: DAY_NAMES[parseInt(r.dow, 10)],
      count: r.cnt,
    }));
  }

  /**
   * Safely parse a JSON metadata string.
   * @param {string|null} raw - Raw metadata JSON string
   * @returns {Object|null} Parsed object or null
   */
  _parseMetadata(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      logger.warn('ActivityInsightsService: Failed to parse metadata', { raw, error: err.message });
      return null;
    }
  }
}

module.exports = new ActivityInsightsService();
