# Design Document

## Overview

This feature adds a dedicated Tax Deductible Expenses section to the Annual Summary view, allowing users to review all medical and donation expenses for tax preparation. The implementation extends the existing annual summary functionality by adding a new API endpoint for tax-deductible data and a new UI section within the AnnualSummary component.

The design leverages the existing expense type system where 'Tax - Medical' and 'Tax - Donation' types identify tax-deductible expenses. The solution follows the established patterns in the codebase for data fetching, service layer logic, and component structure.

## Architecture

### System Components

```
Frontend (React)
├── AnnualSummary Component (modified)
│   └── TaxDeductibleSection (new inline section)
│
Backend (Node.js/Express)
├── expenseController (modified)
│   └── getTaxDeductibleSummary() - new endpoint
├── expenseService (modified)
│   └── getTaxDeductibleSummary() - new method
└── expenseRepository (modified)
    └── getTaxDeductibleExpenses() - new method
```

### Data Flow

1. User views Annual Summary for a specific year
2. Frontend makes parallel API calls:
   - Existing: `/api/expenses/annual-summary?year=2024`
   - New: `/api/expenses/tax-deductible?year=2024`
3. Backend queries expenses table filtering by tax types
4. Service layer aggregates and calculates totals
5. Frontend renders tax deductible section with summary cards and detailed lists

## Components and Interfaces

### Backend API

#### New Endpoint: GET /api/expenses/tax-deductible

**Query Parameters:**
- `year` (required): The year to retrieve tax-deductible expenses for

**Response Format:**
```json
{
  "year": 2024,
  "totalDeductible": 5250.00,
  "medicalTotal": 3500.00,
  "donationTotal": 1750.00,
  "monthlyBreakdown": [
    { "month": 1, "total": 450.00 },
    { "month": 2, "total": 320.00 }
  ],
  "expenses": {
    "medical": [
      {
        "id": 123,
        "date": "2024-03-15",
        "place": "City Hospital",
        "amount": 250.00,
        "notes": "Annual checkup"
      }
    ],
    "donations": [
      {
        "id": 456,
        "date": "2024-12-20",
        "place": "Local Charity",
        "amount": 100.00,
        "notes": "Year-end donation"
      }
    ]
  }
}
```

**Error Responses:**
- 400: Missing year parameter
- 500: Server error

### Backend Service Layer

#### ExpenseService.getTaxDeductibleSummary(year)

**Purpose:** Orchestrate retrieval and aggregation of tax-deductible expense data

**Logic:**
1. Validate year parameter
2. Call repository to fetch tax-deductible expenses
3. Separate expenses into medical and donations arrays
4. Calculate totals for each category
5. Generate monthly breakdown by grouping expenses by month
6. Return structured summary object

### Backend Repository Layer

#### ExpenseRepository.getTaxDeductibleExpenses(year)

**Purpose:** Query database for tax-deductible expenses

**SQL Query:**
```sql
SELECT id, date, place, amount, notes, type
FROM expenses
WHERE strftime('%Y', date) = ?
  AND type IN ('Tax - Medical', 'Tax - Donation')
ORDER BY date ASC
```

**Returns:** Array of expense objects

### Frontend Component

#### AnnualSummary Component Modifications

**New State:**
```javascript
const [taxDeductible, setTaxDeductible] = useState(null);
const [taxLoading, setTaxLoading] = useState(true);
```

**New Data Fetching:**
```javascript
const fetchTaxDeductibleData = async () => {
  setTaxLoading(true);
  try {
    const response = await fetch(`/api/expenses/tax-deductible?year=${year}`);
    if (!response.ok) throw new Error('Failed to fetch tax data');
    const data = await response.json();
    setTaxDeductible(data);
  } catch (err) {
    console.error('Error fetching tax deductible data:', err);
  } finally {
    setTaxLoading(false);
  }
};
```

**New UI Section Structure:**
```
<div className="summary-section tax-deductible-section">
  <h3>💰 Tax Deductible Expenses</h3>
  
  <!-- Summary Cards -->
  <div className="tax-summary-cards">
    <div className="tax-card">Total Deductible</div>
    <div className="tax-card">Medical</div>
    <div className="tax-card">Donations</div>
  </div>
  
  <!-- Monthly Breakdown -->
  <div className="tax-monthly-breakdown">
    <!-- Bar chart similar to existing monthly breakdown -->
  </div>
  
  <!-- Detailed Lists -->
  <div className="tax-details">
    <div className="tax-category">
      <h4>🏥 Medical Expenses</h4>
      <!-- List of medical expenses -->
    </div>
    <div className="tax-category">
      <h4>❤️ Donations</h4>
      <!-- List of donation expenses -->
    </div>
  </div>
</div>
```

## Data Models

### Tax Deductible Summary (Response Object)

```typescript
interface TaxDeductibleSummary {
  year: number;
  totalDeductible: number;
  medicalTotal: number;
  donationTotal: number;
  monthlyBreakdown: MonthlyTotal[];
  expenses: {
    medical: TaxExpense[];
    donations: TaxExpense[];
  };
}

interface MonthlyTotal {
  month: number;  // 1-12
  total: number;
}

interface TaxExpense {
  id: number;
  date: string;  // YYYY-MM-DD
  place: string;
  amount: number;
  notes: string;
}
```

### Database Schema (Existing)

The feature uses the existing `expenses` table:
- `type` field contains 'Tax - Medical' or 'Tax - Donation' for tax-deductible expenses
- No schema changes required

## Error Handling

### Backend Error Scenarios

1. **Missing Year Parameter**
   - Return 400 with error message: "Year query parameter is required"

2. **Invalid Year Format**
   - Return 400 with error message: "Year must be a valid number"

3. **Database Query Failure**
   - Log error to console
   - Return 500 with error message: "Failed to retrieve tax-deductible expenses"

### Frontend Error Scenarios

1. **API Request Failure**
   - Log error to console
   - Display message: "Unable to load tax deductible data"
   - Allow rest of annual summary to display normally

2. **No Tax Deductible Expenses**
   - Display message: "No tax-deductible expenses found for {year}"
   - Show empty state with helpful text

3. **Loading State**
   - Display loading spinner or skeleton UI
   - Prevent layout shift when data loads

## Testing Strategy

### Backend Testing

**Unit Tests for ExpenseService.getTaxDeductibleSummary:**
- Test with valid year parameter
- Test calculation of totals (medical, donations, overall)
- Test monthly breakdown aggregation
- Test with year containing no tax-deductible expenses
- Test with year containing only medical expenses
- Test with year containing only donations

**Unit Tests for ExpenseRepository.getTaxDeductibleExpenses:**
- Test SQL query returns correct expenses for given year
- Test filtering by tax types ('Tax - Medical', 'Tax - Donation')
- Test date ordering (chronological)
- Test with empty result set

**Integration Tests for GET /api/expenses/tax-deductible:**
- Test successful request with valid year
- Test 400 response when year parameter is missing
- Test 400 response when year is invalid
- Test response structure matches expected format
- Test with year containing mixed expense types

### Frontend Testing

**Component Tests for AnnualSummary:**
- Test tax deductible section renders when data is available
- Test loading state displays correctly
- Test error state displays correctly
- Test empty state when no tax-deductible expenses exist
- Test summary cards display correct totals
- Test expense lists render correctly
- Test monthly breakdown displays all 12 months

**Integration Tests:**
- Test data fetching on component mount
- Test data refetching when year prop changes
- Test concurrent loading of annual summary and tax data

### Manual Testing Checklist

- [ ] View annual summary for year with tax-deductible expenses
- [ ] View annual summary for year without tax-deductible expenses
- [ ] Verify totals match individual expense amounts
- [ ] Verify monthly breakdown sums correctly
- [ ] Test with year containing only medical expenses
- [ ] Test with year containing only donations
- [ ] Test with year containing both types
- [ ] Verify styling matches existing annual summary sections
- [ ] Test responsive layout on mobile devices
- [ ] Verify loading states display correctly
- [ ] Verify error handling when API fails

## Design Decisions and Rationales

### Decision 1: Inline Section vs Separate Component

**Choice:** Add tax deductible section inline within AnnualSummary component

**Rationale:**
- Keeps related annual data together in one view
- Avoids navigation complexity
- Allows users to see all annual information at once
- Follows existing pattern of multiple sections within AnnualSummary

### Decision 2: Separate API Endpoint

**Choice:** Create dedicated `/api/expenses/tax-deductible` endpoint

**Rationale:**
- Separates concerns and keeps endpoints focused
- Allows independent caching strategies
- Enables reuse if tax data is needed elsewhere
- Avoids bloating the existing annual-summary endpoint
- Provides flexibility for future tax-specific features

### Decision 3: Use Existing Type Field

**Choice:** Filter by expense type ('Tax - Medical', 'Tax - Donation') rather than tax_deductible column

**Rationale:**
- Types already exist and are in use
- More explicit and user-visible categorization
- Aligns with how users think about expenses
- tax_deductible column appears to be legacy/unused based on codebase review

### Decision 4: Monthly Breakdown Included

**Choice:** Include monthly breakdown in tax deductible view

**Rationale:**
- Helps users understand spending patterns
- Useful for tax planning throughout the year
- Consistent with existing annual summary features
- Minimal additional complexity

### Decision 5: Detailed Expense Lists

**Choice:** Show full expense details (date, place, amount, notes) in categorized lists

**Rationale:**
- Users need to verify individual expenses for tax purposes
- Provides audit trail for tax preparation
- Allows users to identify and correct any miscategorized expenses
- Essential for accurate tax filing

### Decision 6: Parallel Data Fetching

**Choice:** Fetch tax data concurrently with annual summary data

**Rationale:**
- Improves perceived performance
- Prevents sequential loading delays
- Allows independent error handling
- Follows React best practices for data fetching
