# Design Document: Net Worth Card

## Overview

This feature adds a Net Worth card to the annual summary that calculates the user's financial position by subtracting total loan debt from total investment value. The card displays year-end values and provides a clear breakdown of assets and liabilities.

## Architecture

### Component Structure

**Annual Summary:**
```
AnnualSummary (Modified)
├── Summary Cards Section
│   ├── Total Income Card (Existing)
│   ├── Fixed Expenses Card (Existing)
│   ├── Variable Expenses Card (Existing)
│   ├── Balance Card (Existing)
│   ├── Net Worth Card (New) ← Added here
│   ├── Average Monthly Card (Existing)
│   ├── Highest Month Card (Existing)
│   └── Lowest Month Card (Existing)
└── Other sections (Existing)
```

**Monthly Summary:**
```
SummaryPanel (Modified)
├── Summary Cards Grid
│   ├── Monthly Income Card (Existing)
│   ├── Fixed Expenses Card (Existing)
│   ├── Variable Expenses Card (Existing)
│   ├── Balance Card (Existing)
│   ├── Weekly Breakdown (Existing)
│   ├── Payment Methods (Existing)
│   ├── Expense Types (Existing)
│   ├── Outstanding Debt Card (Existing)
│   ├── Total Investments Card (Existing)
│   └── Net Worth Card (New) ← Added here
```

### Data Flow

1. **Frontend Request**: AnnualSummary requests net worth data for the year
2. **Backend Processing**:
   - Query investment_values table for year-end investment values
   - Query loan_balances table for year-end loan balances
   - Calculate total assets (sum of all investment values)
   - Calculate total liabilities (sum of all loan balances)
   - Calculate net worth (assets - liabilities)
3. **Frontend Rendering**:
   - Display net worth card with calculated value
   - Show assets and liabilities breakdown
   - Apply color coding based on positive/negative value

## Components and Interfaces

### Backend API Enhancement

**New Endpoint**: `GET /api/net-worth/annual`

**Query Parameters**:
- `year` (required): Year for the net worth calculation

**Response Structure**:
```javascript
{
  year: number,
  netWorth: number,           // totalAssets - totalLiabilities
  totalAssets: number,        // Sum of all investment values at year-end
  totalLiabilities: number,   // Sum of all loan balances at year-end
  assetDetails: [
    {
      investment_id: number,
      investment_name: string,
      value: number,
      month: number  // Month of the value (ideally 12 for December)
    }
  ],
  liabilityDetails: [
    {
      loan_id: number,
      loan_name: string,
      balance: number,
      month: number  // Month of the balance (ideally 12 for December)
    }
  ]
}
```

### Alternative: Enhance Existing Annual Summary Endpoint

Instead of creating a new endpoint, we can enhance the existing `/api/expenses/annual-summary` endpoint to include net worth data:

**Enhanced Response Structure**:
```javascript
{
  // Existing fields
  totalExpenses: number,
  totalFixedExpenses: number,
  totalVariableExpenses: number,
  totalIncome: number,
  netIncome: number,
  // ... other existing fields
  
  // New fields
  netWorth: number,
  totalAssets: number,
  totalLiabilities: number
}
```

This approach is simpler and avoids an additional API call.

### Frontend Component Changes

#### Net Worth Card (New)

```jsx
<div className="summary-card net-worth-card">
  <h3>Net Worth</h3>
  <div className={`big-number ${netWorth >= 0 ? 'positive' : 'negative'}`}>
    ${formatAmount(Math.abs(netWorth))}
  </div>
  <div className="net-worth-breakdown">
    <span className="assets-label">Assets: ${formatAmount(totalAssets)}</span>
    <span className="separator">-</span>
    <span className="liabilities-label">Liabilities: ${formatAmount(totalLiabilities)}</span>
  </div>
  <div className="sub-text">Year-end position</div>
</div>
```

## Data Models

### Net Worth Calculation

```javascript
// Backend calculation logic
async function calculateNetWorth(year) {
  // Get year-end investment values (prefer December, fallback to latest month)
  const investments = await getYearEndInvestmentValues(year);
  const totalAssets = investments.reduce((sum, inv) => sum + inv.value, 0);
  
  // Get year-end loan balances (prefer December, fallback to latest month)
  const loans = await getYearEndLoanBalances(year);
  const totalLiabilities = loans.reduce((sum, loan) => sum + loan.balance, 0);
  
  // Calculate net worth
  const netWorth = totalAssets - totalLiabilities;
  
  return {
    netWorth,
    totalAssets,
    totalLiabilities
  };
}

// Helper: Get year-end investment values
async function getYearEndInvestmentValues(year) {
  // Try to get December values first
  let values = await db.all(`
    SELECT iv.*, i.name as investment_name
    FROM investment_values iv
    JOIN investments i ON iv.investment_id = i.id
    WHERE iv.year = ? AND iv.month = 12
  `, [year]);
  
  // If no December data, get the most recent value for each investment in that year
  if (values.length === 0) {
    values = await db.all(`
      SELECT iv.*, i.name as investment_name
      FROM investment_values iv
      JOIN investments i ON iv.investment_id = i.id
      WHERE iv.year = ?
      AND (iv.year, iv.month, iv.investment_id) IN (
        SELECT year, MAX(month), investment_id
        FROM investment_values
        WHERE year = ?
        GROUP BY investment_id
      )
    `, [year, year]);
  }
  
  return values;
}

// Helper: Get year-end loan balances
async function getYearEndLoanBalances(year) {
  // Try to get December balances first
  let balances = await db.all(`
    SELECT lb.*, l.name as loan_name
    FROM loan_balances lb
    JOIN loans l ON lb.loan_id = l.id
    WHERE lb.year = ? AND lb.month = 12
    AND l.is_paid_off = 0
  `, [year]);
  
  // If no December data, get the most recent balance for each loan in that year
  if (balances.length === 0) {
    balances = await db.all(`
      SELECT lb.*, l.name as loan_name
      FROM loan_balances lb
      JOIN loans l ON lb.loan_id = l.id
      WHERE lb.year = ?
      AND l.is_paid_off = 0
      AND (lb.year, lb.month, lb.loan_id) IN (
        SELECT year, MAX(month), loan_id
        FROM loan_balances
        WHERE year = ?
        GROUP BY loan_id
      )
    `, [year, year]);
  }
  
  return balances;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Net worth calculation correctness

*For any* year's net worth data, the net worth should equal total assets minus total liabilities.

**Validates: Requirements 1.2**

### Property 2: Non-negative assets and liabilities

*For any* year's net worth data, both total assets and total liabilities should be non-negative values.

**Validates: Requirements 2.4, 2.5**

### Property 3: Color coding correctness

*For any* net worth value, if the value is positive or zero it should be displayed in green, and if negative in red.

**Validates: Requirements 1.4, 1.5**

### Property 4: Year-end value selection

*For any* investment or loan, if December data exists for the year, it should be used; otherwise, the most recent month's data from that year should be used.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 5: Monthly net worth calculation correctness

*For any* month's net worth data, the net worth should equal total investment value minus total loan debt for that specific month.

**Validates: Requirements 5.2, 5.3**

## Error Handling

### Missing Data Scenarios

**No Investment Data**:
- Display total assets as $0
- Net worth = 0 - totalLiabilities (will be negative if loans exist)

**No Loan Data**:
- Display total liabilities as $0
- Net worth = totalAssets - 0 (will equal totalAssets)

**No Data for Year**:
- Display net worth as $0
- Display assets as $0
- Display liabilities as $0
- Show "No data available" message

### API Errors

**Backend Failure**:
- Display existing error handling UI
- Log error to console
- Show user-friendly message
- Net worth card shows "N/A" or error state

## Testing Strategy

### Unit Testing

**Framework**: Vitest (existing framework)

**Test Coverage**:

1. **Backend Service Tests**:
   - Correct calculation of net worth
   - Correct aggregation of investment values
   - Correct aggregation of loan balances
   - Year-end value selection logic (December preference)
   - Fallback to latest month when December data missing
   - Handling of missing data (no investments, no loans)
   - Exclusion of paid-off loans

2. **Frontend Component Tests**:
   - Correct rendering of net worth card
   - Correct color coding for positive/negative values
   - Assets and liabilities breakdown display
   - Responsive layout
   - Formatting of monetary values

3. **Integration Tests**:
   - End-to-end data flow from API to UI
   - Correct data transformation
   - Card updates when year changes

### Property-Based Testing

**Framework**: fast-check

**Configuration**: Minimum 100 iterations per property test

**Property Tests**:

1. **Net Worth Calculation**:
   - Generate random asset and liability data
   - Verify netWorth = totalAssets - totalLiabilities
   - **Tag**: `// Feature: net-worth-card, Property 1: Net worth calculation correctness`

2. **Non-Negative Values**:
   - Generate random financial data
   - Verify totalAssets >= 0 and totalLiabilities >= 0
   - **Tag**: `// Feature: net-worth-card, Property 2: Non-negative assets and liabilities`

3. **Color Coding**:
   - Generate random net worth values
   - Verify positive/zero values use green, negative values use red
   - **Tag**: `// Feature: net-worth-card, Property 3: Color coding correctness`

## Implementation Notes

### CSS Styling

**Color Scheme**:
- Positive Net Worth: `#22c55e` (green) - matches existing positive styling
- Negative Net Worth: `#ef4444` (red) - matches existing negative styling
- Assets: `#3b82f6` (blue)
- Liabilities: `#ef4444` (red)

**Net Worth Card CSS**:
```css
.net-worth-card {
  /* Use existing summary-card styles */
}

.net-worth-breakdown {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 0.9rem;
  margin-top: 8px;
  color: #64748b;
}

.assets-label {
  color: #3b82f6;
  font-weight: 500;
}

.liabilities-label {
  color: #ef4444;
  font-weight: 500;
}

.separator {
  color: #94a3b8;
}
```

### Performance Considerations

- Calculations performed once on backend
- Frontend only handles rendering
- No complex client-side aggregations
- Data fetched as part of existing annual summary call (no additional API request)

### Accessibility

- Use `aria-label` on card elements
- Ensure color is not the only indicator (use labels and text)
- Screen reader friendly value formatting

## Future Enhancements

1. **Net Worth Trend**: Show year-over-year change in net worth
2. **Monthly Net Worth Chart**: Display net worth progression throughout the year
3. **Asset Allocation**: Show breakdown of investment types
4. **Debt-to-Asset Ratio**: Calculate and display financial health metrics
5. **Goal Tracking**: Set and track net worth goals
