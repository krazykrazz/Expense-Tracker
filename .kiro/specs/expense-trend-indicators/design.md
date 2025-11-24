# Design Document: Expense Trend Indicators

## Overview

This feature adds visual trend indicators to the Monthly Summary view, showing month-over-month changes for weekly breakdowns, expense types, and payment methods. The indicators use color-coded arrows (green for decreasing, red for increasing) to provide quick visual feedback on spending patterns.

The implementation follows a frontend-focused approach with minimal backend changes. The backend will be enhanced to return previous month's data alongside current month data, while the frontend will handle the comparison logic and rendering of trend indicators.

## Architecture

### Component Structure

```
SummaryPanel (Modified)
├── Fetches current + previous month data
├── Calculates trends for each metric
└── Renders TrendIndicator components

TrendIndicator (New)
└── Displays arrow icon with tooltip
```

### Data Flow

1. **Frontend Request**: SummaryPanel requests summary data for both current and previous month
2. **Backend Response**: Returns two summary objects (current and previous)
3. **Trend Calculation**: Frontend calculates percentage changes
4. **Rendering**: TrendIndicator components display appropriate arrows

## Components and Interfaces

### Backend API Enhancement

**Endpoint**: `GET /api/expenses/summary`

**Query Parameters**:
- `year` (required): Current year
- `month` (required): Current month
- `includePrevious` (optional): Boolean flag to include previous month data

**Response Structure**:
```javascript
{
  current: {
    total: number,
    weeklyTotals: { week1-5: number },
    typeTotals: { [category: string]: number }, // All 14 expense categories
    methodTotals: { Cash, Debit, Credit, etc.: number },
    // ... existing fields
  },
  previous: {
    // Same structure as current
  } | null  // null if no previous month or includePrevious=false
}
```

### Frontend Components

#### TrendIndicator Component

**Props**:
```javascript
{
  currentValue: number,
  previousValue: number,
  threshold: number = 0.01  // 1% minimum change
}
```

**Behavior**:
- Calculates percentage change: `(current - previous) / previous`
- Returns null if change < threshold
- Returns arrow icon with appropriate color and direction
- Displays tooltip on hover with percentage

**Rendering**:
```jsx
// Up trend (red)
<span className="trend-indicator trend-up" title="+15.3%">
  ▲
</span>

// Down trend (green)
<span className="trend-indicator trend-down" title="-8.7%">
  ▼
</span>

// No trend (< 1% change or no previous data)
null
```

### Utility Functions

#### `calculateTrend(current, previous, threshold = 0.01)`

Calculates trend direction and percentage change.

**Returns**:
```javascript
{
  direction: 'up' | 'down' | 'none',
  percentChange: number,
  displayText: string  // e.g., "+15.3%" or "-8.7%"
} | null
```

**Logic**:
- If `previous === 0` or `previous === null`: return null
- If `Math.abs((current - previous) / previous) < threshold`: return null
- Otherwise: calculate and return trend object

## Data Models

### Summary Data Structure (Enhanced)

```javascript
{
  current: {
    year: number,
    month: number,
    total: number,
    weeklyTotals: {
      week1: number,
      week2: number,
      week3: number,
      week4: number,
      week5: number
    },
    typeTotals: {
      'Housing': number,
      'Utilities': number,
      'Groceries': number,
      'Dining Out': number,
      'Insurance': number,
      'Gas': number,
      'Vehicle Maintenance': number,
      'Entertainment': number,
      'Subscriptions': number,
      'Recreation Activities': number,
      'Pet Care': number,
      'Other': number,
      'Tax - Medical': number,
      'Tax - Donation': number
    },
    methodTotals: {
      'Cash': number,
      'Debit': number,
      'Cheque': number,
      'CIBC MC': number,
      'PCF MC': number,
      'WS VISA': number,
      'VISA': number
    },
    monthlyGross: number,
    totalFixedExpenses: number,
    netBalance: number
  },
  previous: {
    // Same structure as current
  } | null
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Trend direction correctness for increases

*For any* two expense values where current > previous, the trend indicator should display an upward arrow with red styling.

**Validates: Requirements 1.2, 2.2, 3.2**

### Property 2: Trend direction correctness for decreases

*For any* two expense values where current < previous, the trend indicator should display a downward arrow with green styling.

**Validates: Requirements 1.3, 2.3, 3.3**

### Property 3: Threshold filtering

*For any* two expense values where the percentage change is less than 1%, no trend indicator should be displayed.

**Validates: Requirements 4.5**

### Property 4: Tooltip accuracy

*For any* displayed trend indicator, the tooltip text should accurately reflect the calculated percentage change between current and previous values.

**Validates: Requirements 4.4**

### Property 5: Trend indicators appear for all categories

*For any* summary data with previous month data available, trend indicators should appear next to weekly totals, expense type totals, and payment method totals.

**Validates: Requirements 1.1, 2.1, 3.1**

## Error Handling

### Missing Previous Month Data

**Scenario**: User views the first month of data or previous month has no expenses.

**Handling**:
- Backend returns `previous: null`
- Frontend skips trend calculation
- No trend indicators displayed
- No error messages shown (graceful degradation)

### API Errors

**Scenario**: Backend fails to fetch previous month data.

**Handling**:
- Log error to console
- Display current month data without trends
- Show subtle message: "Trend data unavailable"

### Invalid Data

**Scenario**: Previous month data contains null or undefined values.

**Handling**:
- Treat as zero for comparison purposes
- If current month has value and previous is zero/null, show upward trend
- If both are zero/null, show no trend

## Testing Strategy

### Unit Testing

**Framework**: Vitest (existing framework in the project)

**Test Coverage**:

1. **TrendIndicator Component**:
   - Renders upward arrow for positive changes
   - Renders downward arrow for negative changes
   - Renders nothing for changes below threshold
   - Renders nothing when previous value is null/zero
   - Displays correct tooltip text

2. **calculateTrend Utility**:
   - Returns correct direction for various value pairs
   - Handles edge cases (zero, null, undefined)
   - Applies threshold correctly
   - Formats percentage strings correctly

3. **SummaryPanel Integration**:
   - Fetches both current and previous month data
   - Passes correct props to TrendIndicator components
   - Handles missing previous data gracefully

### Property-Based Testing

**Framework**: fast-check (JavaScript property-based testing library)

**Configuration**: Each property test should run a minimum of 100 iterations.

**Test Tagging**: Each property-based test must include a comment with the format:
`// Feature: expense-trend-indicators, Property {number}: {property_text}`

**Property Tests**:

1. **Trend Direction Consistency**:
   - Generate random pairs of positive numbers
   - Verify that current > previous always produces 'up' direction
   - Verify that current < previous always produces 'down' direction
   - **Tag**: `// Feature: expense-trend-indicators, Property 1 & 2: Trend direction correctness`

2. **Threshold Filtering**:
   - Generate random pairs where percentage change < 1%
   - Verify no trend indicator is returned
   - **Tag**: `// Feature: expense-trend-indicators, Property 3: Threshold filtering`

3. **Tooltip Accuracy**:
   - Generate random pairs of positive numbers
   - Calculate expected percentage
   - Verify tooltip text matches expected format and value
   - **Tag**: `// Feature: expense-trend-indicators, Property 4: Tooltip accuracy`

4. **Presence of Indicators**:
   - Generate random summary data with previous month
   - Verify trend indicators exist for all weekly, type, and method categories
   - **Tag**: `// Feature: expense-trend-indicators, Property 5: Trend indicators appear for all categories`

## Implementation Notes

### CSS Styling

```css
.trend-indicator {
  display: inline-block;
  margin-left: 6px;
  font-size: 0.75em;
  cursor: help;
}

.trend-up {
  color: #e74c3c;
}

.trend-down {
  color: #27ae60;
}
```

### Performance Considerations

- Trend calculations are lightweight (simple arithmetic)
- No additional database queries required (reuse existing summary endpoint)
- Memoize trend calculations if performance issues arise

### Accessibility

- Use `aria-label` on trend indicators for screen readers
- Tooltip should be keyboard accessible
- Color is not the only indicator (arrow direction also conveys meaning)

## Future Enhancements

1. **Configurable Threshold**: Allow users to set their own threshold percentage
2. **Historical Trends**: Show trends over multiple months (3-month, 6-month averages)
3. **Trend Charts**: Add sparkline charts showing trend over time
4. **Anomaly Detection**: Highlight unusual spending patterns
5. **Trend Notifications**: Alert users when spending increases significantly
