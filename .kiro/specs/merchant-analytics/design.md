# Design Document: Merchant Analytics

## Overview

The Merchant Analytics feature provides users with insights into their spending patterns by merchant (place). It aggregates expense data to show top spending locations, visit frequency, average spend per merchant, and spending trends over time. The feature is accessible from the main navigation and provides drill-down capabilities to view individual expenses at each merchant.

## Architecture

The feature follows the existing layered architecture pattern:

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ MerchantAnalytics│  │ MerchantDetail  │                   │
│  │     Modal       │  │     View        │                   │
│  └────────┬────────┘  └────────┬────────┘                   │
│           │                    │                             │
│  ┌────────▼────────────────────▼────────┐                   │
│  │         merchantAnalyticsApi.js       │                   │
│  └────────────────────┬─────────────────┘                   │
└───────────────────────┼─────────────────────────────────────┘
                        │ HTTP/REST
┌───────────────────────┼─────────────────────────────────────┐
│                    Backend (Node.js)                         │
│  ┌────────────────────▼─────────────────┐                   │
│  │      merchantAnalyticsController.js   │                   │
│  └────────────────────┬─────────────────┘                   │
│  ┌────────────────────▼─────────────────┐                   │
│  │      merchantAnalyticsService.js      │                   │
│  └────────────────────┬─────────────────┘                   │
│  ┌────────────────────▼─────────────────┐                   │
│  │         expenseRepository.js          │                   │
│  │    (extended with analytics queries)  │                   │
│  └──────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Backend Components

#### 1. MerchantAnalyticsService (`backend/services/merchantAnalyticsService.js`)

Responsible for aggregating expense data into merchant-level analytics.

```javascript
class MerchantAnalyticsService {
  /**
   * Get top merchants by total spending
   * @param {Object} filters - { period: 'all'|'year'|'month'|'3months', year?, month? }
   * @param {string} sortBy - 'total'|'visits'|'average'
   * @returns {Promise<Array<MerchantSummary>>}
   */
  async getTopMerchants(filters, sortBy = 'total');

  /**
   * Get detailed statistics for a specific merchant
   * @param {string} merchantName - The merchant/place name
   * @param {Object} filters - Time period filters
   * @returns {Promise<MerchantDetail>}
   */
  async getMerchantDetails(merchantName, filters);

  /**
   * Get monthly spending trend for a merchant
   * @param {string} merchantName - The merchant/place name
   * @param {number} months - Number of months to include (default 12)
   * @returns {Promise<Array<MonthlyTrend>>}
   */
  async getMerchantTrend(merchantName, months = 12);

  /**
   * Get all expenses for a specific merchant
   * @param {string} merchantName - The merchant/place name
   * @param {Object} filters - Time period filters
   * @returns {Promise<Array<Expense>>}
   */
  async getMerchantExpenses(merchantName, filters);
}
```

#### 2. MerchantAnalyticsController (`backend/controllers/merchantAnalyticsController.js`)

Handles HTTP requests for merchant analytics endpoints.

```javascript
// GET /api/analytics/merchants
// Query params: period, sortBy
// Returns: Array of MerchantSummary

// GET /api/analytics/merchants/:name
// Query params: period
// Returns: MerchantDetail

// GET /api/analytics/merchants/:name/trend
// Query params: months
// Returns: Array of MonthlyTrend

// GET /api/analytics/merchants/:name/expenses
// Query params: period
// Returns: Array of Expense
```

### Frontend Components

#### 1. MerchantAnalyticsModal (`frontend/src/components/MerchantAnalyticsModal.jsx`)

Main modal component displaying merchant analytics dashboard.

```jsx
// Props
{
  isOpen: boolean,
  onClose: () => void
}

// State
{
  merchants: MerchantSummary[],
  selectedMerchant: string | null,
  period: 'all' | 'year' | 'month' | '3months',
  sortBy: 'total' | 'visits' | 'average',
  loading: boolean
}
```

#### 2. MerchantDetailView (`frontend/src/components/MerchantDetailView.jsx`)

Detailed view for a single merchant with statistics and trend chart.

```jsx
// Props
{
  merchantName: string,
  period: string,
  onBack: () => void,
  onViewExpenses: (merchantName: string) => void
}
```

#### 3. merchantAnalyticsApi (`frontend/src/services/merchantAnalyticsApi.js`)

API client for merchant analytics endpoints.

```javascript
export const getTopMerchants = async (period, sortBy) => { ... };
export const getMerchantDetails = async (name, period) => { ... };
export const getMerchantTrend = async (name, months) => { ... };
export const getMerchantExpenses = async (name, period) => { ... };
```

## Data Models

### MerchantSummary

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

### MerchantDetail

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

### MonthlyTrend

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

### DateFilter

```typescript
type Period = 'all' | 'year' | 'month' | '3months';

interface DateFilter {
  period: Period;
  startDate?: string;  // Calculated based on period
  endDate?: string;    // Calculated based on period
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Merchant ranking by total spend is correctly sorted
*For any* set of expenses across multiple merchants, when sorted by total spend, the resulting list SHALL be in descending order where each merchant's total is greater than or equal to the next merchant's total.
**Validates: Requirements 1.1**

### Property 2: Merchant statistics are correctly calculated
*For any* merchant with expenses, the calculated statistics SHALL satisfy:
- totalSpend equals the sum of all expense amounts at that merchant
- visitCount equals the count of expense entries at that merchant
- averageSpend equals totalSpend divided by visitCount
- percentOfTotal equals (merchant totalSpend / all expenses totalSpend) * 100
- categoryBreakdown amounts sum to totalSpend
**Validates: Requirements 1.2, 2.1, 2.3**

### Property 3: Date range filtering includes only expenses within the period
*For any* date filter (year, month, 3months, all), the returned merchant data SHALL only include expenses where the expense date falls within the specified date range.
**Validates: Requirements 1.3, 4.2, 4.3, 4.4, 4.5**

### Property 4: First and last visit dates are correctly identified
*For any* merchant with expenses, the firstVisit date SHALL be the minimum expense date and lastVisit SHALL be the maximum expense date for that merchant.
**Validates: Requirements 2.2**

### Property 5: Primary category and payment method are most frequent
*For any* merchant with expenses, the primaryCategory SHALL be the category with the highest count of expenses, and primaryPaymentMethod SHALL be the payment method with the highest count.
**Validates: Requirements 2.4**

### Property 6: Visit frequency sorting is correct
*For any* set of merchants, when sorted by visit frequency, the resulting list SHALL be in descending order where each merchant's visitCount is greater than or equal to the next merchant's visitCount.
**Validates: Requirements 3.1**

### Property 7: Average days between visits is correctly calculated
*For any* merchant with more than one visit, avgDaysBetweenVisits SHALL equal the total days between first and last visit divided by (visitCount - 1).
**Validates: Requirements 3.2**

### Property 8: Trend data covers correct time range with gap filling
*For any* merchant trend request for N months, the returned data SHALL contain exactly N entries (or fewer if merchant history is shorter), with zero values for months with no expenses.
**Validates: Requirements 5.2, 5.3**

### Property 9: Month-over-month change percentage is correctly calculated
*For any* two consecutive months in trend data where the previous month has non-zero spend, changePercent SHALL equal ((currentMonth - previousMonth) / previousMonth) * 100.
**Validates: Requirements 5.4**

### Property 10: Merchant expense filter returns only matching expenses
*For any* merchant name, the filtered expense list SHALL contain only expenses where the place field matches the merchant name (case-insensitive).
**Validates: Requirements 7.2**

## Error Handling

### Backend Errors

| Error Condition | HTTP Status | Response |
|----------------|-------------|----------|
| Invalid period parameter | 400 | `{ error: "Invalid period. Must be 'all', 'year', 'month', or '3months'" }` |
| Merchant not found | 404 | `{ error: "Merchant not found" }` |
| Database error | 500 | `{ error: "Internal server error" }` |

### Frontend Error Handling

- Display user-friendly error messages in the UI
- Show empty state when no merchants exist
- Handle loading states with spinner/skeleton
- Graceful degradation if API is unavailable

## Testing Strategy

### Property-Based Testing Library

Use `fast-check` for JavaScript property-based testing.

### Unit Tests

- Test date filter calculation functions
- Test percentage calculation edge cases (division by zero)
- Test sorting functions
- Test API response formatting

### Property-Based Tests

Each correctness property will be implemented as a property-based test:

1. **Property 1**: Generate random expenses, verify sort order
2. **Property 2**: Generate random expenses for a merchant, verify all calculations
3. **Property 3**: Generate expenses across date ranges, verify filtering
4. **Property 4**: Generate expenses with various dates, verify min/max
5. **Property 5**: Generate expenses with various categories/methods, verify mode calculation
6. **Property 6**: Generate random merchants, verify visit count sort order
7. **Property 7**: Generate expenses with known dates, verify average days calculation
8. **Property 8**: Generate trend data, verify gap filling and count
9. **Property 9**: Generate consecutive month data, verify percentage calculation
10. **Property 10**: Generate expenses, verify merchant filter

### Test Configuration

- Minimum 100 iterations per property test
- Each test tagged with: `**Feature: merchant-analytics, Property {N}: {description}**`

### Integration Tests

- Test full API flow from request to response
- Test navigation and modal opening
- Test filter changes and data refresh
