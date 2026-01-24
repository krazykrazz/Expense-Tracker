# Enhanced Annual Summary

## Overview

The Annual Summary provides a comprehensive yearly financial overview accessible via the "📊 Annual Summary" button in the month selector. It displays key financial metrics, year-over-year comparisons, income breakdowns, and visual charts to help users understand their annual financial performance.

## Features

### Summary Cards (4 per row)

The Annual Summary displays 13 summary cards in a 4-column grid:

1. **Total Income** - Sum of all income sources for the year (green card)
2. **Fixed Expenses** - Total monthly recurring costs
3. **Variable Expenses** - Total day-to-day spending
4. **Balance** - Net income (surplus/deficit) with color coding
5. **Net Worth** - Year-end position showing assets minus liabilities
6. **Average Monthly** - Average monthly expense amount
7. **Highest Month** - Month with highest expenses
8. **Lowest Month** - Month with lowest expenses
9. **Savings Rate** - Percentage of income saved (green/red/neutral)
10. **Transactions** - Count of variable expense transactions with average
11. **Top Category** - Highest spending category with amount and percentage
12. **Daily Spend** - Average daily variable spending
13. **Tax Deductible** - Combined Medical + Donation totals

### Year-over-Year (YoY) Comparison

A collapsible section comparing current year to previous year:

- **Income**: Shows previous → current with % change and absolute difference
- **Expenses**: Shows previous → current with % change (green if decreased)
- **Savings Rate**: Shows percentage point change
- **Net Worth**: Shows absolute change in net worth

#### YTD (Year-to-Date) Logic

For the **current year**, the comparison uses YTD logic:
- Only compares months 1 through the current month for both years
- Prevents misleading comparisons when future income is pre-logged
- Header shows "YTD Comparison" with a badge indicating the month range (e.g., "Jan-Jan")

For **past years**, the comparison uses full 12-month data.

### Income by Category

Visual breakdown of income sources displayed in a 4-column grid:
- **Salary** 💼
- **Government** 🏛️
- **Gifts** 🎁
- **Other** 💰

Each card shows the total amount and percentage of total income.

### Monthly Breakdown Chart

Horizontal bar chart showing:
- **Fixed Expenses** (blue segment)
- **Variable Expenses** (purple segment)
- **Income** (green bar below expenses)

All bars scale proportionally to the maximum value across all months.

### Monthly Net Balance Graph

SVG line graph showing:
- Monthly surplus (green) or deficit (red) throughout the year
- Zero line reference
- Month labels with exact values below

### Collapsible Sections

- **By Category**: Expense breakdown by category (collapsed by default)
- **By Payment Method**: Expense breakdown by payment method (collapsed by default)
- **YoY Comparison**: Year-over-year comparison (expanded by default)

## Technical Details

### API Endpoint

```
GET /api/expenses/annual-summary?year={year}
```

Returns:
- `totalIncome`, `totalExpenses`, `totalFixedExpenses`, `totalVariableExpenses`
- `netIncome`, `netWorth`, `totalAssets`, `totalLiabilities`
- `averageMonthly`, `highestMonth`, `lowestMonth`
- `transactionCount` - Count of variable expense transactions
- `monthlyTotals` - Array of monthly breakdowns
- `byCategory`, `byMethod` - Expense breakdowns

### Frontend Component

`frontend/src/components/AnnualSummary.jsx`

Key features:
- Fetches current and previous year data in parallel
- Uses `useMemo` for expensive calculations (chartData, netBalanceData, topCategory, yoyComparison)
- Responsive grid layout (4 columns → 2 columns on mobile)

### CSS

`frontend/src/components/AnnualSummary.css`

Key classes:
- `.summary-grid` - 4-column grid for summary cards
- `.yoy-grid` - 2-column grid for YoY comparison cards
- `.income-category-grid` - Fixed 4-column grid for income categories
- `.collapsible-section` - Sections with expand/collapse toggle

## Version History

- **v4.16.0**: Initial YoY comparison, Savings Rate, Transaction Count, Top Category cards, collapsible sections
- **v4.16.1**: YTD comparison logic for current year
- **v4.16.2**: Fixed YoY comparison layout (2 columns instead of 4)
- **v4.16.3**: Added Daily Spend and Tax Deductible cards
- **v4.16.4**: Fixed Income by Category to display all 4 categories on one row
