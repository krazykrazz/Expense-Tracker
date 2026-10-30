# Budget Plan Integration: planned savings across the tracker

## Summary

Follow-up to `specs/budget-plan/`. Planned savings (budget allocations) only appeared on the Plan tab and the main-screen Balance card. This spec puts them next to actual savings wherever the app reports results, and warns when the plan does not fit the income. Allocations stay **plan only**: they are never counted as spending, Cash Flow "Saved" or Balance.

## Requirements

1. **Cash Flow**: `GET /api/analytics/period-summary` returns `totals.plannedSavings` and `totals.plannedSavingsRate` (% of income, `null` without income). Cash Flow shows "$X ahead of/short of $Y planned" under Saved, plus *Planned savings* and *Ahead of / Short of plan* rows in the P&L footer, only when the range has a plan.
2. **Annual Summary**: `GET /api/expenses/annual-summary` returns `totalPlannedSavings` and `monthlyTotals[].plannedSavings`. A *Planned Savings* card shows the total, its % of income, and the gap to the Balance (hidden when 0).
3. **Budget History**: `GET /api/budgets/history` returns `plannedSavings: { history[{year, month, planned, saved, met}], totalPlanned, totalSaved, successRate }`. Saved = Cash Flow net. The History tab shows a Planned savings table and the CSV export adds `Planned savings` rows.
4. **Copy with income/fixed expenses**: copying income or carrying forward fixed expenses also stores carried-forward allocations in the month (copy endpoint, never overwriting). Months with their own allocations are untouched. A failure is logged and does not undo the income/fixed copy.
5. **Over-planned notification**: `GET /api/expenses/summary` returns `plannedBudgets` and `plannedUnassigned` (same formula as the Plan tab's `unassigned`). When income > 0 and `plannedUnassigned < 0`, the main screen shows a dismissible notification that opens Budgets on the Plan tab.
6. Range totals (1-3) are carry-forward aware like the Plan tab. Months after the current business month count as 0, because there are no actuals to compare with yet.

## Design

### Backend
- `allocationRepository.sumByMonthRange(startIdx, endIdx)`: stored totals per month.
- `allocationService.getPlannedSavingsByMonth(start, end)`: per-month planned totals; a month without stored rows uses the previous month's stored total (one level, like `loadWithCarryForward`); months after the current business month (`timeBoundaryService`) are 0.
- `periodSummaryService.getPeriodSummary` adds `plannedSavings` / `plannedSavingsRate`.
- `expenseAggregationService.getAnnualSummary` adds `totalPlannedSavings` / `monthlyTotals[].plannedSavings`; `_getMonthSummary` adds `plannedBudgets` (`budgetService.getBudgets`, carry-forward aware) and `plannedUnassigned`.
- `budgetService.getBudgetHistory` adds `plannedSavings` via `_getPlannedSavingsHistory` (one `getPeriodSummary` per month, so saved/planned match Cash Flow).

### Frontend
- `CashFlowView`, `AnnualSummary`, `BudgetsModal` History tab (table + CSV).
- `budgetApi.savePlannedSavingsFromPreviousMonth(year, month)`; called by `IncomeManagementModal` and `FixedExpensesModal` after a successful copy.
- `notifications/OverPlannedBanner`; `SummaryPanel` shows it; `ModalContext.openBudgets(category, tab)` + `budgetsInitialTab`; `BudgetsModal` `initialTab` prop.

## Cleanup done with it

- Budget History CSV export threw `TypeError` (`null.toFixed`) whenever a category had a month without a budget, which is almost always. Those cells are now empty.

## Tasks

- [x] Backend: repository range sum, `getPlannedSavingsByMonth`, period/annual/history/month summary fields
- [x] Backend tests: `plannedSavings.integration.test.js` (carry-forward, future months, Cash Flow, Annual, History, Plan/summary consistency)
- [x] Frontend: Cash Flow, Annual Summary card, History table + CSV, copy hooks, over-planned banner, `openBudgets` tab
- [x] Frontend tests: PeriodAnalyticsPanel, AnnualSummary, BudgetsModal, SummaryPanel, Income/FixedExpenses modals, ModalContext, `budgetApi`
- [x] Docs: API_DOCUMENTATION, ANALYTICS_HUB, ENHANCED_ANNUAL_SUMMARY, BUDGET_MANAGEMENT_GUIDE, USER_GUIDE
- [ ] Full-suite validation: `.\scripts\run-test-summary.ps1`; then move this spec to `specs/archive/`
