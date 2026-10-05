# Analytics Hub

## Overview

The Analytics Hub (`frontend/src/components/analytics/AnalyticsHubModal.jsx`) is a tabbed modal that groups month-based reports, period-based spending/cash-flow views, merchant analytics, activity insights, and trends.

Anomaly alerts are **not** part of the hub; they are shown in the Summary Panel on the main screen (see [Anomaly Detection](./ANOMALY_DETECTION.md)).

## Access

Click the **📈 Analytics** button in the month selector (`MonthSelector`). The hub opens on the **Monthly Summary** tab for the currently selected month and resets to it when closed.

## Tabs

### 1. Monthly Summary (📋)

`MonthlySummaryView` — report card for the selected month (variable expenses only):
- **Total Spending** for the month
- **Month-over-Month**: previous month total, difference, and % change
- **Top Categories** and **Top Merchants** (top 5 each)
- **Budget Summary**: budgeted, spent, utilization % with a progress bar (warning at ≥80%, over-budget at ≥100%)

### 2. Spending (🍩)

`SpendingView` (inside `PeriodAnalyticsPanel`) — spending over a selected period:
- Stat cards: **Total spending** (with fixed-expense portion), **Average per month**, **Largest category** (% of spending), **Transactions**
- **Spending breakdown**: donut chart plus a ranked category list with amount, %, and fixed/variable indicator
- Clicking a category row closes the hub and shows that category's transactions for the selected period in the expense list (global category filter + date range). Fixed-only categories have no transactions and are not clickable

### 3. Cash Flow (💸)

`CashFlowView` (inside `PeriodAnalyticsPanel`) — income vs. spending over a selected period:
- Stat cards: **Income**, **Spending**, **Saved**/**Overspent**, **Savings rate** ("No income recorded" when income is zero)
- **Profit & loss** table with collapsible Income and Expenses sections (by category, % of income) and a **Net savings/shortfall** footer row

#### Period selector (Spending and Cash Flow)

- Presets: **Month**, **Year to date** (default), **Last 12 months**, **Full year**
- ‹ / › buttons step the range (by one month, or by a year for multi-month presets); bounded to 2000-01 – 2100-12
- The selected period is shared between the Spending and Cash Flow tabs
- While a new range loads, the previous result stays visible (dimmed); errors show a **Retry** button

Spending in these views = variable expenses + fixed expenses (same model as the annual summary); income comes from `income_sources`.

### 4. Merchants (🏪)

Embedded `MerchantAnalyticsModal`:
- Period filter: All Time, This Year, Previous Year, This Month, Last 3 Months
- Sort by Total Spend, Visit Count, or Average Spend
- **Include Fixed Expenses** toggle
- Drill-down into merchant details and trends (`MerchantDetailView`)

See [Merchant Analytics](./MERCHANT_ANALYTICS.md).

### 5. Activity Insights (📈)

`ActivityInsightsView` — derived from the activity log for the selected month:
- **Entry Velocity**: activity-log event count this month vs. last month
- **Activity by Type**: event counts per entity type
- **Day-of-Week Activity**: bar chart of activity by weekday
- **Recent Changes**: last 10 activity events

### 6. Trends (📊)

`TrendsView`:
- **Data Quality** score and months of data (completed months only)
- **End-of-Month Prediction**: predicted total, confidence level, current spent, days remaining
- **Spending History**: 6-month bar list
- **Recurring Patterns**: top 10 detected patterns (merchant, frequency, average amount, occurrences)

Sections are hidden individually when there is insufficient data; if none are available, a "Not enough data" message is shown.

## Backend Services

| Service | Purpose |
|---------|---------|
| `monthlySummaryService.js` | Monthly Summary tab |
| `periodSummaryService.js` | Spending and Cash Flow tabs |
| `activityInsightsService.js` | Activity Insights tab |
| `trendsService.js` | Trends tab (uses `predictionService` and `spendingPatternsService`) |
| `merchantAnalyticsService.js` | Merchants tab |
| `spendingPatternsService.js` | Recurring patterns, day-of-week, seasonal analysis, data sufficiency |
| `predictionService.js` | Month-end forecasting with confidence levels |

## API Endpoints

Used by the hub:
- `GET /api/analytics/monthly-summary/:year/:month`
- `GET /api/analytics/period-summary?start=YYYY-MM&end=YYYY-MM` — max range 120 months; returns `totals` (`income`, `expenses`, `fixedExpenses`, `net`, `savingsRate`, `averageMonthlyExpenses`, `transactionCount`), `expensesByCategory`, `incomeByCategory`
- `GET /api/analytics/activity-insights/:year/:month`
- `GET /api/analytics/trends/:year/:month`
- `GET /api/analytics/merchants` (plus `/merchants/:name`, `/merchants/:name/trend`, `/merchants/:name/expenses`)

Also available (not called directly by the hub UI): `GET /api/analytics/data-sufficiency`, `/patterns`, `/patterns/day-of-week`, `/seasonal`, `/predictions/:year/:month`, `/predictions/:year/:month/comparison`. Anomaly endpoints are documented in [Anomaly Detection](./ANOMALY_DETECTION.md).

---

**Last Updated**: 2026-10-04

