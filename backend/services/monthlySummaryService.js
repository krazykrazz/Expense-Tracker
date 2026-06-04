const dbHelper = require('../utils/dbHelper');
const logger = require('../config/logger');

class MonthlySummaryService {
  /**
   * Compute date range bounds for a given year/month (index-friendly)
   * @private
   */
  _dateRange(year, month) {
    const yr = parseInt(year);
    const mo = parseInt(month);
    const start = `${yr}-${String(mo).padStart(2, '0')}-01`;
    const end = mo === 12 ? `${yr + 1}-01-01` : `${yr}-${String(mo + 1).padStart(2, '0')}-01`;
    return { start, end };
  }

  /**
   * Get complete monthly summary for a given year/month.
   * @param {number} year
   * @param {number} month - 1-12
   * @returns {Promise<Object>} MonthlySummaryResponse
   */
  async getMonthlySummary(year, month) {
    const range = this._dateRange(year, month);

    const [totalSpending, topCategories, topMerchants, monthOverMonth, budgetSummary] =
      await Promise.all([
        this._getTotalSpending(range),
        this._getTopCategories(range),
        this._getTopMerchants(range),
        this._getMonthOverMonth(year, month),
        this._getBudgetSummary(year, month, range),
      ]);

    return {
      totalSpending,
      topCategories,
      topMerchants,
      monthOverMonth,
      budgetSummary,
    };
  }

  /**
   * @returns {Promise<number>} total spending for the month
   */
  async _getTotalSpending(range) {
    const row = await dbHelper.queryOne(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM expenses
       WHERE date >= ? AND date < ?`,
      [range.start, range.end]
    );
    return row.total;
  }

  /**
   * @returns {Promise<Array<{category: string, total: number}>>} top 5 categories
   */
  async _getTopCategories(range) {
    const rows = await dbHelper.queryAll(
      `SELECT type AS category, SUM(amount) AS total
       FROM expenses
       WHERE date >= ? AND date < ?
       GROUP BY type
       ORDER BY total DESC
       LIMIT 5`,
      [range.start, range.end]
    );
    return rows.map(r => ({
      category: r.category,
      total: parseFloat(r.total.toFixed(2)),
    }));
  }

  /**
   * @returns {Promise<Array<{merchant: string, total: number}>>} top 5 merchants
   */
  async _getTopMerchants(range) {
    const rows = await dbHelper.queryAll(
      `SELECT place AS merchant, SUM(amount) AS total
       FROM expenses
       WHERE date >= ? AND date < ?
         AND place IS NOT NULL AND place != ''
       GROUP BY place
       ORDER BY total DESC
       LIMIT 5`,
      [range.start, range.end]
    );
    return rows.map(r => ({
      merchant: r.merchant,
      total: parseFloat(r.total.toFixed(2)),
    }));
  }

  /**
   * @returns {Promise<Object|null>} month-over-month comparison or null
   */
  async _getMonthOverMonth(year, month) {
    // Calculate previous month
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = year - 1;
    }

    const prevRange = this._dateRange(prevYear, prevMonth);
    const currRange = this._dateRange(year, month);

    const prevRow = await dbHelper.queryOne(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
       FROM expenses
       WHERE date >= ? AND date < ?`,
      [prevRange.start, prevRange.end]
    );

    // No expenses in previous month → null
    if (!prevRow || prevRow.cnt === 0) {
      return null;
    }

    const previousTotal = prevRow.total;

    const currRow = await dbHelper.queryOne(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM expenses
       WHERE date >= ? AND date < ?`,
      [currRange.start, currRange.end]
    );
    const currentTotal = currRow.total;

    const difference = parseFloat((currentTotal - previousTotal).toFixed(2));
    const percentageChange = previousTotal !== 0
      ? parseFloat(((difference / previousTotal) * 100).toFixed(1))
      : null;

    return {
      previousTotal: parseFloat(previousTotal.toFixed(2)),
      difference,
      percentageChange,
    };
  }

  /**
   * @returns {Promise<Object|null>} budget summary or null when no budgets exist
   */
  async _getBudgetSummary(year, month, range) {
    // Get all budgets for this month
    const budgets = await dbHelper.queryAll(
      `SELECT category, "limit" AS budget_limit
       FROM budgets
       WHERE year = ? AND month = ?`,
      [year, month]
    );

    if (budgets.length === 0) {
      return null;
    }

    const totalBudgeted = budgets.reduce((sum, b) => sum + b.budget_limit, 0);

    // Get actual spending per budgeted category
    const categories = budgets.map(b => b.category);
    const placeholders = categories.map(() => '?').join(',');
    const spendingRows = await dbHelper.queryAll(
      `SELECT type AS category, SUM(amount) AS total
       FROM expenses
       WHERE date >= ? AND date < ?
         AND type IN (${placeholders})
       GROUP BY type`,
      [range.start, range.end, ...categories]
    );

    const spendingMap = {};
    for (const row of spendingRows) {
      spendingMap[row.category] = row.total;
    }

    const totalSpent = budgets.reduce(
      (sum, b) => sum + (spendingMap[b.category] || 0),
      0
    );

    const utilizationPercentage = totalBudgeted > 0
      ? parseFloat(((totalSpent / totalBudgeted) * 100).toFixed(1))
      : 0;

    return {
      totalBudgeted: parseFloat(totalBudgeted.toFixed(2)),
      totalSpent: parseFloat(totalSpent.toFixed(2)),
      utilizationPercentage,
    };
  }
}

module.exports = new MonthlySummaryService();
