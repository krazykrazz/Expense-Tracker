# Merchant Analytics Feature

## Overview

Merchant Analytics provides insights into spending by merchant (the expense `place` field): top spending locations, visit frequency, average spend per visit, and monthly trends. Fixed expenses (grouped by their `name`) can optionally be included for a combined view of variable and recurring costs.

## Key Features

### 🏪 Merchant Rankings
- **Top Merchants List**: View merchants ranked by total spending, visit frequency, or average spend per visit
- **Flexible Sorting**: Toggle between three sorting options to analyze spending from different perspectives
- **Spending Statistics**: See total amount spent, number of visits (distinct expense dates), average spend per visit, and percentage of total expenses
- **Time Period Filtering**: Analyze data for All Time, This Year (default), Previous Year, This Month, or Last 3 Months
- **Fixed Expenses Integration**: Optional "Include Fixed Expenses" checkbox to combine variable and recurring expenses for comprehensive analysis

### 📊 Detailed Analytics
- **Merchant Detail View**: Click any merchant to see comprehensive statistics and breakdowns
- **Category Analysis**: View expense category breakdown showing what types of purchases are made at each merchant
- **Payment Method Insights**: See which payment methods are used most frequently at each location
- **Visit Patterns**: Track average days between visits to understand shopping frequency habits
- **Date Range Tracking**: View first and last visit dates for complete shopping history

### 📈 Trend Analysis
- **Monthly Spending Charts**: Chart of spending over the last 12 months (ending with the current month)
- **Month-over-Month Changes**: Percentage change indicators showing spending trend direction
- **Gap Filling**: Charts display zero values for months with no spending to maintain timeline continuity
- **Trend Visualization**: Clear visual representation of spending increases, decreases, and patterns

### 🔍 Drill-Down Capabilities
- **View All Expenses**: Clicking "📋 View All Expenses" in the detail view closes the Analytics Hub and sets the expense list search text to the merchant name

## User Interface

### Main Navigation Access
- **Entry Point**: Click the "📈 Analytics" button in the month selector, then select the "🏪 Merchants" tab of the Analytics Hub
- **Component**: `MerchantAnalyticsModal` is rendered embedded inside `AnalyticsHubModal`

### Merchant List View
- **Ranking Display**: Merchants listed in descending order based on selected sort criteria
- **Key Metrics**: Each merchant shows total spend, visit count, average spend, and percentage
- **Visual Indicators**: Clear typography and spacing for easy scanning of merchant data
- **Sort Toggle**: Switch between Total Spend, Visit Count, and Average Spend
- **Fixed Expenses Toggle**: "Include Fixed Expenses" checkbox

### Merchant Detail View
- **Spending Summary**: Total Spent, Total Visits, Average per Visit, % of Total Expenses, First/Last Visit, Avg Days Between Visits, Primary Payment Method
- **Monthly Spending Trend**: Chart of monthly spending with change indicators
- **Category Breakdown**: Expense category distribution
- **Payment Method Breakdown**: Payment method usage

## Technical Implementation

### Backend Architecture
- **Routes**: `backend/routes/merchantAnalyticsRoutes.js` (mounted at `/api`)
- **Controller**: `merchantAnalyticsController.js` validates query parameters
- **Service**: `merchantAnalyticsService.js` computes date ranges, percentages, breakdowns and trend gap filling
- **Repository**: `expenseRepository.js` (`getMerchantAnalytics`, `getCombinedMerchantAnalytics`, `getMerchantExpenses`, `getMerchantTrend`); merchant names are matched case-insensitively

### API Endpoints

#### Get Top Merchants
```
GET /api/analytics/merchants
Query Parameters:
- period: 'all' | 'year' | 'previousYear' | 'month' | '3months' (default: 'year')
- sortBy: 'total' | 'visits' | 'average' (default: 'total')
- includeFixedExpenses: 'true' | 'false' (default: 'false')
- year, month: optional reference year/month for 'year', 'previousYear' and 'month' (defaults to today)
```

#### Get Merchant Details
```
GET /api/analytics/merchants/:name
Query Parameters:
- period: 'all' | 'year' | 'previousYear' | 'month' | '3months' (default: 'year')
- includeFixedExpenses: 'true' | 'false' (default: 'false')
- year, month: optional
```

#### Get Merchant Trend
```
GET /api/analytics/merchants/:name/trend
Query Parameters:
- months: number 1-60 (default 12)
- includeFixedExpenses: 'true' | 'false' (default: 'false')
```

#### Get Merchant Expenses
```
GET /api/analytics/merchants/:name/expenses
Query Parameters:
- period: 'all' | 'year' | 'previousYear' | 'month' | '3months' (default: 'year')
- includeFixedExpenses: 'true' | 'false' (default: 'false')
- year, month: optional
```

### Frontend Architecture
- **Components**: `frontend/src/components/analytics/MerchantAnalyticsModal.jsx` and `MerchantDetailView.jsx`
- **API Client**: `frontend/src/services/merchantAnalyticsApi.js`

### Data Models

#### MerchantSummary
```typescript
interface MerchantSummary {
  name: string;              // Merchant/place name
  totalSpend: number;        // Total amount spent
  visitCount: number;        // Number of distinct expense dates (fixed expenses: entries)
  averageSpend: number;      // totalSpend / visitCount
  percentOfTotal: number;    // Percentage of all merchant spending in the period
  firstVisit: string;        // Date of first expense
  lastVisit: string;         // Date of most recent expense
}
```

#### MerchantDetail
```typescript
interface MerchantDetail {
  name: string;
  totalSpend: number;
  visitCount: number;
  averageSpend: number;
  percentOfTotal: number;
  firstVisit: string;        // Date of first expense
  lastVisit: string;         // Date of most recent expense
  avgDaysBetweenVisits: number | null;  // (lastVisit - firstVisit) / (visitCount - 1); null if only 1 visit
  primaryCategory: string;              // most frequent (by count)
  primaryPaymentMethod: string;         // most frequent (by count)
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    count: number;
    percentage: number;
  }>;
  paymentMethodBreakdown: Array<{
    method: string;
    amount: number;
    count: number;
  }>;
}
```

#### MonthlyTrend
```typescript
interface MonthlyTrend {
  year: number;
  month: number;
  monthName: string;         // e.g., "Jan 2025"
  amount: number;            // Total spend that month
  visitCount: number;        // Number of visits that month
  changePercent: number | null;  // Month-over-month change (null for first month; 100 when previous month was 0)
}
```

## Usage Examples

### Analyzing Top Spending Locations
1. Open "📈 Analytics" and select the "🏪 Merchants" tab
2. View the default list sorted by total spending
3. Use the period filter to focus on "This Year", "Previous Year", or "This Month"
4. **Optional**: Check "Include Fixed Expenses" to see total spending including recurring costs
5. Identify your highest-spending merchants

### Understanding Complete Spending Patterns
1. Enable "Include Fixed Expenses" checkbox for comprehensive analysis
2. Compare variable vs. total spending (with fixed expenses) to understand full financial picture
3. Identify merchants where you have both variable and fixed expenses (e.g., utilities, rent)
4. Use combined view for accurate budget planning and spending analysis

### Understanding Shopping Habits
1. Change sort to "Visit Count" to see most frequently visited places
2. Click on a merchant to view detailed statistics
3. Check "Average days between visits" to understand shopping frequency
4. Review category breakdown to see what you typically buy there

### Tracking Spending Trends
1. In merchant detail view, examine the monthly trend chart
2. Look for patterns: increasing, decreasing, or seasonal spending
3. Note month-over-month change percentages
4. Identify months with unusual spending patterns

### Expense Investigation
1. From any merchant detail view, click "📋 View All Expenses"
2. The expense list is searched for the merchant name

## Troubleshooting

### Common Issues
- **No Data**: Ensure expenses have been entered with place names
- **Split Merchants**: Names are grouped case-insensitively for details, but spelling variants appear separately; use [Place Name Standardization](PLACE_NAME_STANDARDIZATION.md) to merge them
- **Incorrect Trends**: Verify date ranges and ensure sufficient historical data

**Last Reviewed:** October 4, 2026

