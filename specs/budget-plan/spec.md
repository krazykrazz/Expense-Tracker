# Budget Plan: savings/investment allocations and remaining money

## Summary

Budgets are per-category spending caps. This feature adds a **monthly plan**: income − fixed expenses − category budgets − savings/investment allocations = **Unassigned**, so the user can budget RRSP/TFSA/emergency savings and see what that leaves.

Allocations are **plan only** (no contribution tracking) and are **not expenses**: they never count as spending, Cash Flow "Saved", or the expense list.

## Requirements

1. A user can create, edit and delete named allocations per month, each with an amount > 0 and an optional link to an existing `investments` account. Names are unique within a month.
2. A month with no allocations shows the previous month's allocations as transient rows (`carriedForward: true`, no id) without storing them, like budgets.
3. Any write in a carried-forward month first stores the carried rows (copy endpoint, never overwriting) so nothing disappears and every row has an id.
4. `GET /api/budgets/plan` returns income, fixed expenses, budgeted, allocated, unassigned, variable spent, balance and balance after planned savings. Income/fixed/variable figures come from `periodSummaryService` (the Cash Flow engine), so Plan, Analytics → Cash Flow and the main-screen Balance agree.
5. The Budgets modal has a **Plan** tab. The main-screen Balance card shows one "After planned savings" line only when allocations exist.
6. Allocation mutations write activity-log events (entity `budget`, so existing SSE refresh applies).
7. No new income/fixed/variable SQL, no duplicated carry-forward/copy/previous-month logic.

## Where things live (UX map)

| Area | Question | Content |
|---|---|---|
| Main screen, Monthly Summary | How is this month going? | Balance; **new** "After planned savings" line |
| Budgets → Manage | What may I spend per category? | Category limits (unchanged) |
| Budgets → Plan | Where does this month's income go? | Income → fixed → budgets → allocations → Unassigned; balance so far |
| Budgets → History | How did I do against category budgets? | Unchanged |
| Analytics | What actually happened? | Actuals; budget card now uses the same totals as Budgets |
| Financial | Which accounts exist? | TFSA/RRSP accounts (Plan links to them) |

Glossary: *Remaining / Over budget* = category limits − spent (Manage). *Unassigned* = planned income left (Plan). *Balance* = income − fixed − variable (main screen = Cash Flow "Saved"). *After planned savings* = Balance − allocated.

## Design

### Data
`budget_allocations(id, year, month CHECK 1-12, name, amount CHECK > 0, investment_id → investments ON DELETE SET NULL, created_at, updated_at, UNIQUE(year, month, name))`, index on (year, month), `update_budget_allocations_timestamp` trigger. Created by `schema.js` (idempotent `CREATE TABLE IF NOT EXISTS`), so no migration is needed.

### Backend
- `utils/monthlyRows.js`: `previousMonth`, `loadWithCarryForward`, `copyRows` (shared by budgets and allocations).
- `utils/validators.parseYearMonth`: parse/validate string or number year/month, 400 `Invalid year or month specified`.
- `allocationRepository` (`dbHelper`), `allocationService` (validation, CRUD, carry-forward, copy, activity log), `budgetPlanService.getBudgetPlan`, `budgetPlanController` (`asyncHandler`, `statusCode` errors).
- Routes under `/api/budgets`, registered before `/:id`: `GET /plan`, `GET|POST /allocations`, `PUT|DELETE /allocations/:id`, `POST /allocations/copy`.
- `expenseAggregationService._getMonthSummary` adds `plannedAllocations`.

### Frontend
- `budgetApi.js` + `API_ENDPOINTS` entries; `hooks/useCarryForward` (`ensurePersisted`); `BudgetPlanTab.jsx`; Plan tab in `BudgetsModal`; Balance-card line in `SummaryPanel`.

## Cleanup done with this feature

- Deleted the unused `BudgetSummaryPanel` (+ css, tests, barrel export) and its `BudgetRealTimeUpdates` integration test (it only exercised that panel).
- Analytics `monthlySummaryService._getBudgetSummary` now delegates to `budgetService.getBudgetSummary` (one source of truth; includes carried-forward budgets).
- Fixed editing/removing/adding budgets in a carried-forward month (previously `updateBudget(undefined)` failed and adding one budget hid the others). Manage tab uses `useCarryForward`; the copy button no longer asks to overwrite when only carried rows are showing.
- Replaced duplicated previous-month math (`budgetService`, `incomeRepository`, `incomeService`, `fixedExpenseService`, `expenseAggregationService`, `monthlySummaryService`, `activityInsightsService`, frontend `BudgetsModal`) with `previousMonth` / `shiftMonth`; removed the pass-through `_calculatePreviousMonth` delegate.
- `budgetService` carry-forward/copy use the shared helpers; removed the now-unused `budgetRepository.findForCopy`; budget year/month validation uses the shared validator (**year floor 2000 → 1900**).
- Removed the no-op `budgetRecalculation` event pipeline (`events/budgetEvents.js`, listener in `budgetService`, `expenseService._triggerBudgetRecalculation` and its call sites) and its tests.

## Noted, intentionally not changed here

- `SharedDataContext` still fetches `budgets` that no component reads (tracked under remediation R7/SharedDataContext; removing it ripples into `useDataSync` and `App`).
- `expenseRepository.getMonthlyGross` is a third "sum income" query. The plan uses `periodSummaryService` and adds none.
- Controllers other than the new one still use the pre-`asyncHandler` pattern (R9).

## Tasks

- [x] Shared helpers (`monthlyRows`, `parseYearMonth`) + tests
- [x] Refactor budgetService; remove event pipeline; dedupe previous-month math
- [x] Analytics budget summary delegates to budgetService
- [x] `budget_allocations` schema + schema tests
- [x] Allocation repository/service, plan service, controller/routes, aggregation field + tests
- [x] Frontend API layer, `useCarryForward`, Manage-tab fix, Plan tab, Balance line, delete dead panel + tests
- [x] Docs: DATABASE_SCHEMA, API_DOCUMENTATION, ACTIVITY_LOG, BUDGET_MANAGEMENT_GUIDE, USER_GUIDE, README
- [ ] Changelog entries are added by the Release workflow (versions are not bumped on feature branches)
- [ ] Full-suite validation: `.\scripts\run-test-summary.ps1`; then move this spec to `specs/archive/`
