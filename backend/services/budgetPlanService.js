const budgetService = require('./budgetService');
const allocationService = require('./allocationService');
const periodSummaryService = require('./periodSummaryService');
const { parseYearMonth } = require('../utils/validators');

const round2 = (n) => Math.round(n * 100) / 100;

class BudgetPlanService {
  /**
   * Where a month's income goes: fixed expenses, category budgets, planned
   * savings/investments, and what is left unassigned.
   *
   * Income, fixed and variable figures come from periodSummaryService (the Cash Flow
   * engine) so they always match Analytics and the main-screen Balance.
   *
   * @returns {Promise<Object>} plan with income, fixedExpenses, budgeted, allocated,
   *   unassigned (income - fixed - budgeted - allocated), and the "so far" balance
   */
  async getBudgetPlan(year, month) {
    const { year: y, month: m } = parseYearMonth(year, month);
    const monthRange = { year: y, month: m };

    const [period, budgetSummary, allocations] = await Promise.all([
      periodSummaryService.getPeriodSummary(monthRange, monthRange),
      budgetService.getBudgetSummary(y, m),
      allocationService.getAllocations(y, m)
    ]);

    const { income, fixedExpenses, variableExpenses, net } = period.totals;
    const budgeted = round2(budgetSummary.totalBudgeted);
    const allocated = round2(allocations.reduce((sum, allocation) => sum + allocation.amount, 0));

    return {
      year: y,
      month: m,
      income,
      fixedExpenses,
      budgeted,
      allocated,
      allocations,
      unassigned: round2(income - fixedExpenses - budgeted - allocated),
      variableExpenses,
      balance: net,
      balanceAfterPlannedSavings: round2(net - allocated),
      allocationRate: income > 0 ? Math.round((allocated / income) * 1000) / 10 : null
    };
  }
}

module.exports = new BudgetPlanService();
