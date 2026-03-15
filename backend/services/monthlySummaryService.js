const dbHelper = require('../utils/dbHelper');
const logger = require('../config/logger');

class MonthlySummaryService {
  /**
   * Get complete monthly summary for a given year/month.
   * @param {number} year
   * @param {number} month - 1-12
   * @returns {Promise<Object>} MonthlySummaryResponse
   */
  async getMonthlySummary(year, month) {
    const yearStr = String(year);
    const monthStr = String(month).padStart(2, '0');

    const [totalSpending, topCategories, topMerchants, monthOverMonth, budgetSummary] =
      await Promise.all([
        this._getTotalSpending(yearStr, monthStr),
        this._getTopCategories(yearStr, monthStr),
        this._getTopMerchants(yearStr, monthStr),
        this._getMonthOverMonth(year, month),
        this._getBudgetSummary(year, month, yearStr, monthStr),
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
  async _getTotalSpending(yearStr, monthStr) {
    const row = await dbHelper.queryOne(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM expenses
       WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?`,
      [yearStr, monthStr]
    );
    return row.total;
  }

  /**
   * @returns {Promise<Array<{category: string, total: number}>>} top 5 categories
   */
  async _getTopCategories(yearStr, monthStr) {
    const rows = await dbHelper.queryAll(
      `SELECT type AS category, SUM(amount) AS total
       FROM expenses
       WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?
       GROUP BY type
       ORDER BY total DESC
       LIMIT 5`,
      [yearStr, monthStr]
    );
    return rows.map(r => ({
      category: r.category,
      total: parseFloat(r.total.toFixed(2)),
    }));
  }

  /**
   * @returns {Promise<Array<{merchant: string, total: number}>>} top 5 merchants
   */
  async _getTopMerchants(yearStr, monthStr) {
    const rows = await dbHelper.queryAll(
      `SELECT place AS merchant, SUM(amount) AS total
       FROM expenses
       WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?
         AND place IS NOT NULL AND place != ''
       GROUP BY place
       ORDER BY total DESC
       LIMIT 5`,
      [yearStr, monthStr]
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

    const prevYearStr = String(prevYear);
    const prevMonthStr = String(prevMonth).padStart(2, '0');

    const prevRow = await dbHelper.queryOne(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
       FROM expenses
       WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?`,
      [prevYearStr, prevMonthStr]
    );

    // No expenses in previous month → null
    if (!prevRow || prevRow.cnt === 0) {
      return null;
    }

    const previousTotal = prevRow.total;

    // Get current month total
    const currYearStr = String(year);
    const currMonthStr = String(month).padStart(2, '0');
    const currRow = await dbHelper.queryOne(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM expenses
       WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?`,
      [currYearStr, currMonthStr]
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
  async _getBudgetSummary(year, month, yearStr, monthStr) {
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
       WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?
         AND type IN (${placeholders})
       GROUP BY type`,
      [yearStr, monthStr, ...categories]
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
