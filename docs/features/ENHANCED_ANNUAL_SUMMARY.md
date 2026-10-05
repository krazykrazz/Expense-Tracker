# Enhanced Annual Summary

## Overview

The Annual Summary is a yearly financial overview opened from the "📊 Annual Summary" button in the month selector. It shows summary cards, a year-over-year comparison, income by category, and monthly charts for the selected year.

## Features

### Summary Cards

Up to 13 cards in a 4-column grid:

1. **Total Income** - Sum of all income for the year
2. **Fixed Expenses** - Total fixed (monthly recurring) costs
3. **Variable Expenses** - Total day-to-day spending
4. **Balance** - Income minus expenses, labelled Surplus / Deficit / Break Even
5. **Net Worth** - Year-end investments minus loan balances, with an Assets / Liabilities breakdown
6. **Average Monthly** - Total expenses ÷ months that have expenses
7. **Highest Month** - Month with the highest expenses (N/A if none)
8. **Lowest Month** - Month with the lowest non-zero expenses (N/A if none)
9. **Savings Rate** - Balance ÷ income (N/A when no income)
10. **Transactions** - Count of the year's (variable) expenses, with average amount
11. **Top Category** - Highest spending category with amount and % of total expenses (hidden when there are no category totals)
12. **Daily Spend** - Variable expenses ÷ days elapsed this year (current year) or 365 (other years)
13. **Tax Deductible** - `Tax - Medical` + `Tax - Donation` totals

### Year-over-Year (YoY) Comparison

Collapsible section (expanded by default), shown only when the previous year has income or expenses:

- **Income** and **Expenses**: previous → current, % change and absolute difference (a decrease in expenses is shown as positive)
- **Savings Rate**: percentage-point change
- **Net Worth**: absolute change

For the **current year** the comparison is year-to-date: both years are summed for January through the current month, the header reads "YTD Comparison" and a badge shows the range (e.g. "Jan-Oct"). Other years compare all 12 months.

### Income by Category

Shown when income category data exists: one card per category returned by the API (icons: Salary 💼, Government 🏛️, Gifts 🎁, Other 💰) with total and % of total income.

### Monthly Breakdown Chart

Horizontal bars per month:
- Expenses bar stacked as **Fixed** and **Variable** segments
- **Income** bar below (when income > 0)

Bars scale to the larger of the highest monthly expense total and the highest monthly income.

### Monthly Net Balance Graph

SVG line graph of monthly income minus expenses, with surplus/deficit colouring, a zero line, and month labels with values.

### Collapsible Sections

- **By Category** and **By Payment Method** expense breakdowns (collapsed by default)

## Technical Details

### API Endpoints

```
GET /api/expenses/annual-summary?year={year}
GET /api/income/annual/{year}/by-category
```

`annual-summary` returns:
- `year`, `totalExpenses`, `totalFixedExpenses`, `totalVariableExpenses`, `totalIncome`, `netIncome`
- `netWorth`, `totalAssets`, `totalLiabilities`
- `averageMonthly`, `highestMonth`, `lowestMonth`
- `transactionCount`
- `monthlyTotals` - 12 entries of `{ month, total, fixedExpenses, variableExpenses, income }`
- `byCategory`, `byMethod` - expense totals keyed by category / method

Built by `getAnnualSummary` in `backend/services/expenseAggregationService.js`.

### Frontend Component

`frontend/src/components/financial/AnnualSummary.jsx`

- Fetches the selected and previous year's summaries in parallel (previous year is optional), then income by category
- Derived values (`chartData`, `netBalanceData`, `topCategory`, `yoyComparison`) are memoized

### CSS

`frontend/src/components/financial/AnnualSummary.css`

- `.summary-grid` - 4 columns (2 at ≤ 768px)
- `.yoy-grid` - 2 columns (1 at ≤ 640px)
- `.income-category-grid` - 4 columns (1 at ≤ 768px)
- `.collapsible-section` - expand/collapse sections

---

**Last Updated**: 2026-10-04

