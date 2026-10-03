const dbHelper = require('../utils/dbHelper');

const round2 = (n) => Math.round((n || 0) * 100) / 100;
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

class PeriodSummaryService {
  /**
   * Income vs. spending breakdown over an inclusive month range.
   * Spending = variable expenses + fixed expenses (same model as the annual summary).
   * @param {{year:number, month:number}} start
   * @param {{year:number, month:number}} end
   */
  async getPeriodSummary(start, end) {
    const startIdx = start.year * 12 + (start.month - 1);
    const endIdx = end.year * 12 + (end.month - 1);
    const monthCount = endIdx - startIdx + 1;

    const startDate = `${start.year}-${String(start.month).padStart(2, '0')}-01`;
    const afterEndYear = end.month === 12 ? end.year + 1 : end.year;
    const afterEndMonth = end.month === 12 ? 1 : end.month + 1;
    const endDateExclusive = `${afterEndYear}-${String(afterEndMonth).padStart(2, '0')}-01`;

    // The year prefilter lets SQLite use the (year, month) indexes; the expression trims partial years
    const monthRangeSql = 'year BETWEEN ? AND ? AND (year * 12 + month - 1) BETWEEN ? AND ?';
    const monthRangeParams = [start.year, end.year, startIdx, endIdx];

    const [variableRows, fixedRows, incomeRows] = await Promise.all([
      dbHelper.queryAll(
        `SELECT type AS category, SUM(amount) AS total, COUNT(*) AS cnt
         FROM expenses WHERE date >= ? AND date < ? GROUP BY type`,
        [startDate, endDateExclusive]
      ),
      dbHelper.queryAll(
        `SELECT COALESCE(category, 'Other') AS category, SUM(amount) AS total
         FROM fixed_expenses WHERE ${monthRangeSql} GROUP BY COALESCE(category, 'Other')`,
        monthRangeParams
      ),
      dbHelper.queryAll(
        `SELECT COALESCE(category, 'Other') AS category, SUM(amount) AS total
         FROM income_sources WHERE ${monthRangeSql} GROUP BY COALESCE(category, 'Other')`,
        monthRangeParams
      ),
    ]);

    const categoryMap = new Map();
    const entry = (category) => {
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { category, variable: 0, fixed: 0, transactionCount: 0 });
      }
      return categoryMap.get(category);
    };
    for (const r of variableRows) {
      const e = entry(r.category);
      e.variable += r.total;
      e.transactionCount += r.cnt;
    }
    for (const r of fixedRows) {
      entry(r.category).fixed += r.total;
    }

    const variableTotal = round2(variableRows.reduce((s, r) => s + r.total, 0));
    const fixedTotal = round2(fixedRows.reduce((s, r) => s + r.total, 0));
    const expenseTotal = round2(variableTotal + fixedTotal);
    const incomeTotal = round2(incomeRows.reduce((s, r) => s + r.total, 0));
    const transactionCount = variableRows.reduce((s, r) => s + r.cnt, 0);
    const net = round2(incomeTotal - expenseTotal);

    const expensesByCategory = [...categoryMap.values()]
      .map(e => {
        const total = round2(e.variable + e.fixed);
        return {
          category: e.category,
          total,
          variable: round2(e.variable),
          fixed: round2(e.fixed),
          transactionCount: e.transactionCount,
          percentOfExpenses: pct(total, expenseTotal),
          percentOfIncome: pct(total, incomeTotal),
        };
      })
      .filter(e => e.total > 0)
      .sort((a, b) => b.total - a.total);

    const incomeByCategory = incomeRows
      .map(r => {
        const total = round2(r.total);
        return { category: r.category, total, percentOfIncome: pct(total, incomeTotal) };
      })
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total);

    return {
      range: {
        startYear: start.year,
        startMonth: start.month,
        endYear: end.year,
        endMonth: end.month,
        monthCount,
      },
      totals: {
        income: incomeTotal,
        expenses: expenseTotal,
        variableExpenses: variableTotal,
        fixedExpenses: fixedTotal,
        net,
        savingsRate: incomeTotal > 0 ? pct(net, incomeTotal) : null,
        averageMonthlyExpenses: round2(expenseTotal / monthCount),
        transactionCount,
      },
      incomeByCategory,
      expensesByCategory,
    };
  }
}

module.exports = new PeriodSummaryService();
