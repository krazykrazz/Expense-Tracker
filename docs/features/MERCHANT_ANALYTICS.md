# Merchant Analytics Feature

**Version**: 4.9.0  
**Release Date**: December 20, 2025  
**Spec**: `.kiro/specs/merchant-analytics/`

## Overview

The Merchant Analytics feature provides comprehensive insights into spending patterns by merchant (place), helping users understand where their money goes and identify opportunities for savings. This feature analyzes expense data to show top spending locations, visit frequency, average spend per merchant, and spending trends over time. **New in v4.9.0**: Optional integration with fixed expenses to provide complete spending analysis including recurring costs like rent, utilities, and subscriptions.

## Key Features

### 🏪 Merchant Rankings
- **Top Merchants List**: View merchants ranked by total spending, visit frequency, or average spend per visit
- **Flexible Sorting**: Toggle between three sorting options to analyze spending from different perspectives
- **Spending Statistics**: See total amount spent, number of visits, average spend per visit, and percentage of total expenses
- **Time Period Filtering**: Analyze data for All Time, This Year, Previous Year, This Month, or Last 3 Months
- **Fixed Expenses Integration**: Optional "Include Fixed Expenses" checkbox to combine variable and recurring expenses for comprehensive analysis

### 📊 Detailed Analytics
- **Merchant Detail View**: Click any merchant to see comprehensive statistics and breakdowns
- **Category Analysis**: View expense category breakdown showing what types of purchases are made at each merchant
- **Payment Method Insights**: See which payment methods are used most frequently at each location
- **Visit Patterns**: Track average days between visits to understand shopping frequency habits
- **Date Range Tracking**: View first and last visit dates for complete shopping history

### 📈 Trend Analysis
- **Monthly Spending Charts**: Line graphs showing spending patterns over the last 12 months
- **Month-over-Month Changes**: Percentage change indicators showing spending trend direction
- **Gap Filling**: Charts display zero values for months with no spending to maintain timeline continuity
- **Trend Visualization**: Clear visual representation of spending increases, decreases, and patterns

### 🔍 Drill-Down Capabilities
- **Expense List Integration**: Click "View All Expenses" to see complete transaction history for any merchant
- **Filtered Views**: Expense list automatically filters to show only transactions from the selected merchant
- **Navigation Flow**: Seamless navigation between analytics view and detailed expense records

## User Interface

### Main Navigation Access
- **Entry Point**: Click the "📈 Analytics" button in the main navigation area, then select the "Merchants" tab
- **Analytics Hub Integration**: Merchant Analytics is now part of the unified Analytics Hub (v4.17.0+), alongside Spending Patterns, Predictions, Seasonal Analysis, and Anomaly Detection
- **Modal Interface**: Analytics open in a full-screen modal overlay for focused analysis
- **Responsive Design**: Optimized for both desktop and mobile viewing

### Merchant List View
- **Ranking Display**: Merchants listed in descending order based on selected sort criteria
- **Key Metrics**: Each merchant shows total spend, visit count, average spend, and percentage
- **Visual Indicators**: Clear typography and spacing for easy scanning of merchant data
- **Sort Toggle**: Easy switching between total spend, visits, and average spend sorting
- **Fixed Expenses Toggle**: "Include Fixed Expenses" checkbox with visual indicator when enabled

### Merchant Detail View
- **Statistics Cards**: Key metrics displayed in organized card layout
- **Category Breakdown**: Pie chart or list showing expense category distribution
- **Payment Methods**: Visual breakdown of payment method usage patterns
- **Trend Chart**: Line graph showing monthly spending over time with change indicators

## Technical Implementation

### Backend Architecture
- **Service Layer**: `merchantAnalyticsService.js` handles all business logic and data aggregation
- **Controller Layer**: `merchantAnalyticsController.js` manages HTTP requests and responses
- **Repository Layer**: Extended `expenseRepository.js` with analytics-specific query methods
- **API Endpoints**: RESTful endpoints under `/api/analytics/merchants` namespace

### API Endpoints

#### Get Top Merchants
```
GET /api/analytics/merchants
Query Parameters:
- period: 'all' | 'year' | 'previousYear' | 'month' | '3months'
- sortBy: 'total' | 'visits' | 'average'
- includeFixedExpenses: 'true' | 'false' (default: 'false')
```

#### Get Merchant Details
```
GET /api/analytics/merchants/:name
Query Parameters:
- period: 'all' | 'year' | 'previousYear' | 'month' | '3months'
- includeFixedExpenses: 'true' | 'false' (default: 'false')
```

#### Get Merchant Trend
```
GET /api/analytics/merchants/:name/trend
Query Parameters:
- months: number (default 12)
- includeFixedExpenses: 'true' | 'false' (default: 'false')
```

#### Get Merchant Expenses
```
GET /api/analytics/merchants/:name/expenses
Query Parameters:
- period: 'all' | 'year' | 'previousYear' | 'month' | '3months'
- includeFixedExpenses: 'true' | 'false' (default: 'false')
```

### Frontend Architecture
- **React Components**: `MerchantAnalyticsModal.jsx` and `MerchantDetailView.jsx`
- **API Client**: `merchantAnalyticsApi.js` handles all backend communication
- **State Management**: React hooks for local state management
- **Styling**: Dedicated CSS files for component-specific styling

### Data Models

#### MerchantSummary
```typescript
interface MerchantSummary {
  name: string;              // Merchant/place name
  totalSpend: number;        // Total amount spent
  visitCount: number;        // Number of expense entries
  averageSpend: number;      // totalSpend / visitCount
  percentOfTotal: number;    // Percentage of all expenses
  lastVisit: string;         // Date of most recent expense
  primaryCategory: string;   // Most common expense category
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
  avgDaysBetweenVisits: number | null;  // null if only 1 visit
  primaryCategory: string;
  primaryPaymentMethod: string;
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
  changePercent: number | null;  // Month-over-month change (null for first month)
}
```

## Quality Assurance

### Property-Based Testing
The feature includes comprehensive property-based testing with 10 correctness properties:

1. **Merchant ranking by total spend is correctly sorted**
2. **Merchant statistics are correctly calculated**
3. **Date range filtering includes only expenses within the period**
4. **First and last visit dates are correctly identified**
5. **Primary category and payment method are most frequent**
6. **Visit frequency sorting is correct**
7. **Average days between visits is correctly calculated**
8. **Trend data covers correct time range with gap filling**
9. **Month-over-month change percentage is correctly calculated**
10. **Merchant expense filter returns only matching expenses**

Each property is tested with 100+ iterations using the `fast-check` library to ensure correctness across a wide range of input scenarios.

### Integration Testing
- **Full API Flow**: Tests cover complete request-response cycles
- **Database Integration**: Tests verify correct data retrieval and aggregation
- **Error Handling**: Tests ensure graceful handling of edge cases and errors
- **Performance**: Tests validate response times for large datasets

## Usage Examples

### Analyzing Top Spending Locations
1. Click "🏪 Merchant Analytics" in the main navigation
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
1. Change sort to "Visits" to see most frequently visited places
2. Click on a merchant to view detailed statistics
3. Check "Average days between visits" to understand shopping frequency
4. Review category breakdown to see what you typically buy there

### Tracking Spending Trends
1. In merchant detail view, examine the monthly trend chart
2. Look for patterns: increasing, decreasing, or seasonal spending
3. Note month-over-month change percentages
4. Identify months with unusual spending patterns

### Expense Investigation
1. From any merchant detail view, click "View All Expenses"
2. Review the complete transaction history for that merchant
3. Verify expense details and identify any discrepancies
4. Use this for budgeting and spending analysis

## Benefits

### Financial Awareness
- **Complete Spending Visibility**: Clear view of where money is being spent, including both variable and recurring expenses
- **Pattern Recognition**: Identify recurring spending patterns and habits across all expense types
- **Budget Planning**: Use comprehensive insights to create more accurate budgets that account for all spending

### Decision Making
- **Total Cost Analysis**: Compare complete spending (variable + fixed) across similar merchants
- **Comprehensive Insights**: Understand full financial relationship with each merchant/service provider
- **Category Awareness**: See what types of purchases dominate at each location, including recurring services

### Savings Opportunities
- **High-Spend Identification**: Focus cost-cutting efforts on top merchants
- **Trend Analysis**: Spot increasing spending trends before they become problematic
- **Habit Modification**: Use visit frequency data to modify shopping habits

## Future Enhancements

### Potential Improvements
- **Merchant Grouping**: Group similar merchants (e.g., all grocery stores)
- **Budget Integration**: Set spending limits per merchant
- **Alerts**: Notifications when spending at a merchant exceeds thresholds
- **Comparison Tools**: Compare spending across time periods
- **Export Features**: Export merchant analytics to CSV or PDF

### Advanced Analytics
- **Seasonal Analysis**: Identify seasonal spending patterns
- **Predictive Analytics**: Forecast future spending based on trends
- **Anomaly Detection**: Alert on unusual spending patterns
- **Goal Tracking**: Set and track merchant-specific spending goals

## Troubleshooting

### Common Issues
- **No Data**: Ensure expenses have been entered with place names
- **Missing Merchants**: Check that place names are consistent (case-sensitive)
- **Incorrect Trends**: Verify date ranges and ensure sufficient historical data
- **Performance**: Large datasets may take longer to load; consider using period filters

### Data Quality
- **Place Name Consistency**: Use consistent naming for the same merchant
- **Date Accuracy**: Ensure expense dates are correct for accurate trend analysis
- **Category Consistency**: Consistent categorization improves analytics accuracy

## Support

For issues or questions about Merchant Analytics:
1. Check the main application documentation
2. Review the spec file at `.kiro/specs/merchant-analytics/`
3. Examine test files for expected behavior examples
4. Check the CHANGELOG.md for recent updates and fixes

---

**Last Updated**: December 20, 2025  
**Feature Status**: ✅ Complete and Deployed (v4.9.0 with Fixed Expenses Integration)