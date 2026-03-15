/**
 * TrendsService
 *
 * Facade service that composes existing predictionService,
 * spendingPatternsService, and direct DB queries into a single
 * consolidated trends response for the Trends tab.
 *
 * Part of the Analytics Hub Revamp feature.
 */

const predictionService = require('./predictionService');
const spendingPatternsService = require('./spendingPatternsService');
const dbHelper = require('../utils/dbHelper');
const logger = require('../config/logger');
const { ANALYTICS_CONFIG } = require('../utils/analyticsConstants');

class TrendsService {
  /**
   * Get consolidated trends data for a given year/month.
   * Each sub-service call is wrapped in its own try-catch so that
   * one failure does not break the entire response.
   * @param {number} year
   * @param {number} month - 1-12
   * @returns {Promise<Object>} TrendsResponse
   */
  async getTrends(year, month) {
    // Fetch all sub-sections independently
    const [predictionResult, historyResult, patternsResult] = await Promise.all([
      this._fetchPrediction(year, month),
      this._fetchMonthlyHistory(year, month),
      this._fetchRecurringPatterns(),
    ]);

    // Compute data sufficiency flags
    const dataSufficiency = {
      prediction: predictionResult !== null,
      monthlyHistory: historyResult !== null && historyResult.length > 0,
      recurringPatterns: patternsResult !== null && patternsResult.length > 0,
    };

    // Compute data quality from completed months only (exclude current month)
    const dataQuality = await this._computeDataQuality(year, month);

    return {
      prediction: dataSufficiency.prediction ? predictionResult : null,
      monthlyHistory: dataSufficiency.monthlyHistory ? historyResult : null,
      recurringPatterns: dataSufficiency.recurringPatterns ? patternsResult : null,
      dataSufficiency,
      dataQuality,
    };
  }

  /**
   * Fetch prediction data from predictionService.
   * Returns a simplified prediction object or null on failure / insufficient data.
   * @private
   */
  async _fetchPrediction(year, month) {
    try {
      const prediction = await predictionService.getMonthEndPrediction(year, month);
      if (!prediction) {
        return null;
      }
      return {
        predictedTotal: prediction.predictedTotal,
        confidenceLevel: prediction.confidenceLevel,
        currentSpent: prediction.currentSpent,
        daysRemaining: prediction.daysRemaining,
      };
    } catch (error) {
      logger.error('TrendsService: failed to fetch prediction:', error);
      return null;
    }
  }

  /**
   * Fetch 6-month spending history via direct DB query.
   * Returns an array of { year, month, total } for the 6 months
   * preceding (and including) the requested month, or null on failure.
   * @private
   */
  async _fetchMonthlyHistory(year, month) {
    try {
      // Build the 6-month window ending at the requested year/month
      const months = [];
      let y = year;
      let m = month;
      for (let i = 0; i < 6; i++) {
        months.push({ year: y, month: m });
        m--;
        if (m < 1) {
          m = 12;
          y--;
        }
      }

      // Query totals for each month
      const history = [];
      for (const { year: yr, month: mo } of months) {
        const yearStr = String(yr);
        const monthStr = String(mo).padStart(2, '0');
        const row = await dbHelper.queryOne(
          `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
           FROM expenses
           WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?`,
          [yearStr, monthStr]
        );
        if (row && row.cnt > 0) {
          history.push({
            year: yr,
            month: mo,
            total: parseFloat(row.total.toFixed(2)),
          });
        }
      }

      // Sort chronologically (oldest first)
      history.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

      return history;
    } catch (error) {
      logger.error('TrendsService: failed to fetch monthly history:', error);
      return null;
    }
  }

  /**
   * Fetch recurring patterns from spendingPatternsService.
   * Returns the top 10 patterns by occurrence count, or null on failure.
   * @private
   */
  async _fetchRecurringPatterns() {
    try {
      const patterns = await spendingPatternsService.getRecurringPatterns();
      if (!patterns || patterns.length === 0) {
        return null;
      }
      // Limit to top 10 by occurrence count (already sorted by the service)
      return patterns.slice(0, 10).map(p => ({
        merchant: p.merchantName,
        frequency: p.frequency,
        averageAmount: p.averageAmount,
        occurrences: p.occurrenceCount,
      }));
    } catch (error) {
      logger.error('TrendsService: failed to fetch recurring patterns:', error);
      return null;
    }
  }

  /**
   * Compute data quality score and months-of-data count from
   * completed months only (current month excluded).
   * @private
   */
  async _computeDataQuality(year, month) {
    try {
      const rows = await dbHelper.queryAll(
        `SELECT strftime('%Y', date) AS yr, strftime('%m', date) AS mo,
                COUNT(*) AS cnt
         FROM expenses
         GROUP BY yr, mo`,
        []
      );

      if (!rows || rows.length === 0) {
        return { score: 0, monthsOfData: 0 };
      }

      const currentKey = `${year}-${String(month).padStart(2, '0')}`;

      // Filter out the current month
      const completedMonths = rows.filter(
        r => `${r.yr}-${r.mo}` !== currentKey
      );

      const monthsOfData = completedMonths.length;

      if (monthsOfData === 0) {
        return { score: 0, monthsOfData: 0 };
      }

      // Compute quality score using the same approach as spendingPatternsService:
      // coverage (months with data / total months in range) weighted 70%
      // consistency (inverse coefficient of variation of expense counts) weighted 30%

      // Find the earliest and latest completed months
      const sortedMonths = completedMonths
        .map(r => ({ yr: parseInt(r.yr), mo: parseInt(r.mo) }))
        .sort((a, b) => a.yr !== b.yr ? a.yr - b.yr : a.mo - b.mo);

      const earliest = sortedMonths[0];
      const latest = sortedMonths[sortedMonths.length - 1];

      // Count total months in the range
      let totalMonthsInRange = 0;
      const cursor = new Date(Date.UTC(earliest.yr, earliest.mo - 1, 1));
      const endDate = new Date(Date.UTC(latest.yr, latest.mo - 1, 1));
      while (cursor <= endDate) {
        totalMonthsInRange++;
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
      totalMonthsInRange = Math.max(totalMonthsInRange, 1);

      const coverageScore = (monthsOfData / totalMonthsInRange) * 100;

      // Consistency score from expense count variance
      const counts = completedMonths.map(r => r.cnt);
      const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
      let consistencyScore = 100;
      if (avgCount > 0 && counts.length > 1) {
        const variance = counts.reduce((sum, c) => sum + Math.pow(c - avgCount, 2), 0) / counts.length;
        const stdDev = Math.sqrt(variance);
        const cv = stdDev / avgCount;
        consistencyScore = Math.max(0, 100 - (cv * ANALYTICS_CONFIG.CV_MULTIPLIER));
      }

      const score = Math.min(100, Math.max(0, Math.round(
        (coverageScore * ANALYTICS_CONFIG.COVERAGE_WEIGHT) +
        (consistencyScore * ANALYTICS_CONFIG.CONSISTENCY_WEIGHT)
      )));

      return { score, monthsOfData };
    } catch (error) {
      logger.error('TrendsService: failed to compute data quality:', error);
      return { score: 0, monthsOfData: 0 };
    }
  }
}

module.exports = new TrendsService();
