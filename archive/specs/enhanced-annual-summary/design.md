# Design Document: Enhanced Annual Summary

## Overview

This enhancement improves the annual summary view by adding income tracking, separating fixed and variable expenses, calculating net income, and replacing the simple bar chart with a stacked bar chart that visualizes the composition of expenses. The changes provide users with a more comprehensive financial overview and better insights into their spending patterns.

## Architecture

### Component Structure

```
AnnualSummary (Modified)
├── Summary Cards Section
│   ├── Total Expenses Card (Modified - shows fixed + variable breakdown)
│   ├── Total Income Card (New)
│   ├── Net Income Card (New)
│   └── Existing cards (Average Monthly, Highest/Lowest Month)
├── Monthly Breakdown Section (Modified)
│   └── Stacked Bar Chart (New - replaces simple bars)
├── By Category Section (Existing)
├── By Payment Method Section (Existing)
└── Tax Deductible Section (Existing)
```

### Data Flow

1. **Frontend Request**: AnnualSummary requests enhanced summary data for the year
2. **Backend Processing**: 
   - Aggregates variable expenses from `expenses` table
   - Aggregates fixed expenses from `fixed_expenses` table
   - Aggregates income from `income_sources` table
   - Calculates monthly breakdowns with fixed/variable split
3. **Frontend Rendering**: 
   - Displays new cards with calculated totals
   - Renders stacked bar chart with fixed (bottom) and variable (top) segments

## Components and Interfaces

### Backend API Enhancement

**Endpoint**: `GET /api/expenses/annual-summary`

**Query Parameters**:
- `year` (required): Year for the summary

**Enhanced Response Structure**:
```javascript
{
  // Existing fields
  totalExpenses: number,
  averageMonthly: number,
  highestMonth: { month: number, total: number },
  lowestMonth: { month: number, total: number },
  byCategory: { [category: string]: number },
  byMethod: { [method: string]: number },
  
  // New fields
  totalFixedExpenses: number,
  totalVariableExpenses: number,
  totalIncome: number,
  netIncome: number,  // totalIncome - totalExpenses
  
  monthlyTotals: [
    {
      month: number,  // 1-12
      total: number,
      fixedExpenses: number,    // NEW
      variableExpenses: number, // NEW
      income: number            // NEW
    }
  ]
}
```

### Frontend Component Changes

#### New Summary Cards

**Total Expenses Card (Modified)**:
```jsx
<div className="summary-card">
  <h3>Total Expenses</h3>
  <div className="big-number">${formatAmount(totalExpenses)}</div>
  <div className="expense-breakdown">
    <span className="fixed-label">Fixed: ${formatAmount(totalFixedExpenses)}</span>
    <span className="separator">+</span>
    <span className="variable-label">Variable: ${formatAmount(totalVariableExpenses)}</span>
  </div>
</div>
```

**Total Income Card (New)**:
```jsx
<div className="summary-card income-card">
  <h3>Total Income</h3>
  <div className="big-number positive">${formatAmount(totalIncome)}</div>
  <div className="sub-text">From all sources</div>
</div>
```

**Net Income Card (New)**:
```jsx
<div className="summary-card net-income-card">
  <h3>Net Income</h3>
  <div className={`big-number ${netIncome >= 0 ? 'positive' : 'negative'}`}>
    ${formatAmount(Math.abs(netIncome))}
  </div>
  <div className="sub-text">
    {netIncome >= 0 ? 'Surplus' : 'Deficit'}
  </div>
</div>
```

#### Stacked Bar Chart

**Implementation Approach**: Use native HTML/CSS for simplicity (no chart library needed)

**Structure**:
```jsx
<div className="monthly-chart stacked">
  <div className="chart-legend">
    <div className="legend-item">
      <div className="legend-color fixed-color"></div>
      <span>Fixed Expenses</span>
    </div>
    <div className="legend-item">
      <div className="legend-color variable-color"></div>
      <span>Variable Expenses</span>
    </div>
  </div>
  
  {monthlyTotals.map((month) => (
    <div key={month.month} className="month-bar-container">
      <div className="month-label">{getMonthName(month.month)}</div>
      <div className="bar-wrapper stacked-bar-wrapper">
        <div className="stacked-bar">
          {/* Fixed expenses (bottom) */}
          <div 
            className="bar-segment fixed-segment"
            style={{ height: `${(month.fixedExpenses / maxMonthTotal) * 100}%` }}
            title={`Fixed: $${formatAmount(month.fixedExpenses)}`}
          >
            {month.fixedExpenses > 0 && (
              <span className="segment-value">${formatAmount(month.fixedExpenses)}</span>
            )}
          </div>
          
          {/* Variable expenses (top) */}
          <div 
            className="bar-segment variable-segment"
            style={{ height: `${(month.variableExpenses / maxMonthTotal) * 100}%` }}
            title={`Variable: $${formatAmount(month.variableExpenses)}`}
          >
            {month.variableExpenses > 0 && (
              <span className="segment-value">${formatAmount(month.variableExpenses)}</span>
            )}
          </div>
        </div>
        
        {/* Total label below bar */}
        <div className="bar-total">${formatAmount(month.total)}</div>
      </div>
    </div>
  ))}
</div>
```

## Data Models

### Enhanced Annual Summary Response

```javascript
{
  year: number,
  totalExpenses: number,
  totalFixedExpenses: number,
  totalVariableExpenses: number,
  totalIncome: number,
  netIncome: number,
  averageMonthly: number,
  highestMonth: {
    month: number,
    total: number
  },
  lowestMonth: {
    month: number,
    total: number
  },
  monthlyTotals: [
    {
      month: number,
      total: number,
      fixedExpenses: number,
      variableExpenses: number,
      income: number
    }
  ],
  byCategory: {
    [category: string]: number
  },
  byMethod: {
    [method: string]: number
  }
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Total expenses equals sum of fixed and variable

*For any* year's annual summary, the total expenses should equal the sum of total fixed expenses and total variable expenses.

**Validates: Requirements 1.1, 1.2**

### Property 2: Net income calculation correctness

*For any* year's annual summary, the net income should equal total income minus total expenses.

**Validates: Requirements 3.2**

### Property 3: Monthly totals consistency

*For any* month in the annual summary, the month's total should equal the sum of its fixed expenses and variable expenses.

**Validates: Requirements 4.2**

### Property 4: Color coding correctness

*For any* net income value, if the value is positive it should be displayed in green, if negative in red, and if zero in neutral color.

**Validates: Requirements 3.3, 3.4, 3.5**

### Property 5: Chart data completeness

*For any* annual summary, the stacked bar chart should display exactly 12 bars (one for each month).

**Validates: Requirements 4.1**

## Error Handling

### Missing Data Scenarios

**No Fixed Expenses**:
- Display fixed expenses as $0
- Show only variable segment in stacked bars
- Total expenses = variable expenses

**No Income Data**:
- Display total income as $0
- Net income will be negative (equal to -totalExpenses)
- Display appropriate deficit messaging

**No Expenses for a Month**:
- Display empty/zero-height bar
- Show $0.00 label
- Maintain month label visibility

### API Errors

**Backend Failure**:
- Display existing error handling UI
- Log error to console
- Show user-friendly message

## Testing Strategy

### Unit Testing

**Framework**: Vitest (existing framework)

**Test Coverage**:

1. **Backend Service Tests**:
   - Correct aggregation of fixed expenses
   - Correct aggregation of variable expenses
   - Correct aggregation of income
   - Net income calculation
   - Monthly breakdown calculations
   - Handling of missing data

2. **Frontend Component Tests**:
   - Correct rendering of new cards
   - Correct color coding for net income
   - Stacked bar chart rendering
   - Legend display
   - Tooltip functionality
   - Responsive layout

3. **Integration Tests**:
   - End-to-end data flow from API to UI
   - Correct data transformation
   - Chart updates when year changes

### Property-Based Testing

**Framework**: fast-check

**Configuration**: Minimum 100 iterations per property test

**Property Tests**:

1. **Total Expenses Consistency**:
   - Generate random expense data
   - Verify totalExpenses = totalFixedExpenses + totalVariableExpenses
   - **Tag**: `// Feature: enhanced-annual-summary, Property 1: Total expenses equals sum of fixed and variable`

2. **Net Income Calculation**:
   - Generate random income and expense data
   - Verify netIncome = totalIncome - totalExpenses
   - **Tag**: `// Feature: enhanced-annual-summary, Property 2: Net income calculation correctness`

3. **Monthly Totals Consistency**:
   - Generate random monthly data
   - Verify each month.total = month.fixedExpenses + month.variableExpenses
   - **Tag**: `// Feature: enhanced-annual-summary, Property 3: Monthly totals consistency`

## Implementation Notes

### CSS Styling

**Color Scheme**:
- Fixed Expenses: `#3b82f6` (blue)
- Variable Expenses: `#8b5cf6` (purple)
- Positive/Income: `#22c55e` (green)
- Negative/Deficit: `#ef4444` (red)
- Neutral: `#64748b` (gray)

**Stacked Bar Chart CSS**:
```css
.stacked-bar {
  display: flex;
  flex-direction: column-reverse; /* Stack from bottom up */
  height: 200px;
  width: 40px;
  background: #f1f5f9;
  border-radius: 4px;
  overflow: hidden;
}

.bar-segment {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: white;
  transition: opacity 0.2s;
}

.bar-segment:hover {
  opacity: 0.8;
}

.fixed-segment {
  background-color: #3b82f6;
}

.variable-segment {
  background-color: #8b5cf6;
}
```

### Performance Considerations

- Calculations are performed once on backend
- Frontend only handles rendering
- No complex client-side aggregations
- Stacked bars use CSS flexbox (performant)

### Accessibility

- Use `aria-label` on chart segments
- Ensure color is not the only indicator (use labels)
- Keyboard navigation for interactive elements
- Screen reader friendly tooltips

## Future Enhancements

1. **Interactive Chart**: Click on bar to drill down into month details
2. **Income Breakdown**: Show income sources in stacked format
3. **Comparison View**: Compare current year to previous year
4. **Export Functionality**: Download chart as image or PDF
5. **Customizable Colors**: Allow users to choose color scheme
6. **Animated Transitions**: Smooth animations when data changes
