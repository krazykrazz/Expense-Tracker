# Design Document

## Overview

The Budget Tracking & Alerts feature enables users to set monthly spending limits for expense categories and receive real-time visual feedback on their budget progress. The system calculates budget utilization as expenses are added, modified, or deleted, and provides color-coded progress bars with alert indicators at key thresholds (80%, 90%, 100%).

**Automatic Budget Carry-Forward**: When a user accesses a month with no existing budgets, the system automatically copies budget limits from the previous month. This provides seamless continuity while allowing users to modify budgets as needed. Users can also manually copy budgets from any previous month for additional flexibility.

This feature integrates with the existing expense tracking system and provides both current-month budget monitoring and historical budget performance analysis.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
├─────────────────────────────────────────────────────────────┤
│  BudgetManagementModal  │  BudgetProgressBar  │  BudgetCard │
│  BudgetHistoryView      │  BudgetSummaryPanel │             │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ API Calls
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                      Backend API                             │
├─────────────────────────────────────────────────────────────┤
│  budgetController  →  budgetService  →  budgetRepository    │
│                                                              │
│  Integration with expenseService for real-time updates      │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ Database Queries
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                       Database                               │
├─────────────────────────────────────────────────────────────┤
│  budgets table                                               │
│  expenses table (existing)                                   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Budget Retrieval with Auto-Carry-Forward**: 
   - Frontend requests budgets for month → budgetService.getBudgets(year, month)
   - If no budgets exist → budgetService automatically copies from previous month
   - Returns budgets (either existing or newly carried forward)

2. **Budget Creation/Update**: User → BudgetManagementModal → budgetController → budgetService → budgetRepository → Database

3. **Budget Progress Calculation**: expenseService triggers → budgetService.calculateProgress() → returns progress data

4. **Real-time Updates**: Expense CRUD operation → budgetService.recalculateBudgets() → Frontend receives updated progress

5. **Historical Analysis**: BudgetHistoryView → budgetController.getHistory() → budgetService aggregates data → returns comparison

6. **Manual Budget Copy**: User initiates copy → budgetController.copyBudgets() → budgetService validates and copies → returns confirmation

## Components and Interfaces

### Frontend Components

#### BudgetManagementModal
Modal interface for creating, editing, and deleting budget limits.

**Props**:
- `year`: number - Current year
- `month`: number - Current month (1-12)
- `onClose`: () => void - Close modal callback
- `onBudgetUpdated`: () => void - Callback after budget changes

**State**:
- `budgets`: Budget[] - Current budget limits
- `editingCategory`: string | null - Category being edited
- `loading`: boolean - Loading state
- `error`: string | null - Error message

**Key Methods**:
- `handleSaveBudget(category, amount)` - Save or update budget limit
- `handleDeleteBudget(category)` - Remove budget limit
- `handleCopyFromMonth(sourceMonth)` - Copy budgets from another month

#### BudgetProgressBar
Visual progress bar component showing budget utilization.

**Props**:
- `category`: string - Expense category
- `budgetLimit`: number - Budget limit amount
- `spent`: number - Amount spent
- `showAlert`: boolean - Whether to show alert indicator

**Computed**:
- `progress`: number - Percentage (spent / limit * 100)
- `status`: 'safe' | 'warning' | 'danger' | 'critical' - Budget status
- `remaining`: number - Amount remaining (limit - spent)

**Styling**:
- Green: progress < 80%
- Yellow: progress >= 80% && progress < 90%
- Orange: progress >= 90% && progress < 100%
- Red: progress >= 100%

#### BudgetCard
Summary card showing budget status for a single category.

**Props**:
- `category`: string
- `budgetLimit`: number
- `spent`: number
- `previousMonthSpent`: number | null - For trend comparison

**Displays**:
- Category name
- Budget limit
- Amount spent
- Remaining/overage
- Progress bar
- Trend indicator (if previous month data available)

#### BudgetSummaryPanel
Overall budget summary showing totals across all categories.

**Props**:
- `year`: number
- `month`: number

**Displays**:
- Total budgeted amount
- Total spent amount
- Overall remaining/overage
- Overall progress percentage
- Number of budgets on track / total budgets
- Quick access to budget management

#### BudgetHistoryView
Historical budget performance analysis.

**Props**:
- `year`: number
- `month`: number
- `periodMonths`: 3 | 6 | 12 - Number of months to display

**Displays**:
- Table of budget vs actual for each category over time
- Success rate (% of months budget was met)
- Average spending per category
- Trend charts

### Backend API Endpoints

#### GET /api/budgets
Get all budgets for a specific month.

**Query Parameters**:
- `year`: number (required)
- `month`: number (required)

**Response**:
```json
{
  "budgets": [
    {
      "id": 1,
      "year": 2025,
      "month": 11,
      "category": "Food",
      "limit": 500.00,
      "spent": 342.50,
      "progress": 68.5,
      "remaining": 157.50,
      "status": "safe"
    }
  ]
}
```

#### POST /api/budgets
Create a new budget limit.

**Request Body**:
```json
{
  "year": 2025,
  "month": 11,
  "category": "Food",
  "limit": 500.00
}
```

**Response**:
```json
{
  "id": 1,
  "year": 2025,
  "month": 11,
  "category": "Food",
  "limit": 500.00,
  "created_at": "2025-11-19T10:00:00Z"
}
```

#### PUT /api/budgets/:id
Update an existing budget limit.

**Request Body**:
```json
{
  "limit": 600.00
}
```

**Response**: Updated budget object

#### DELETE /api/budgets/:id
Delete a budget limit.

**Response**: 204 No Content

#### GET /api/budgets/summary
Get overall budget summary for a month.

**Query Parameters**:
- `year`: number (required)
- `month`: number (required)

**Response**:
```json
{
  "totalBudgeted": 1500.00,
  "totalSpent": 1234.56,
  "remaining": 265.44,
  "progress": 82.3,
  "budgetsOnTrack": 2,
  "totalBudgets": 3,
  "categories": [...]
}
```

#### GET /api/budgets/history
Get historical budget performance.

**Query Parameters**:
- `year`: number (required)
- `month`: number (required)
- `months`: 3 | 6 | 12 (default: 6)

**Response**:
```json
{
  "period": {
    "start": "2025-06-01",
    "end": "2025-11-30",
    "months": 6
  },
  "categories": {
    "Food": {
      "history": [
        {
          "year": 2025,
          "month": 11,
          "budgeted": 500.00,
          "spent": 450.00,
          "met": true
        }
      ],
      "successRate": 83.3,
      "averageSpent": 475.00
    }
  }
}
```

#### POST /api/budgets/copy
Copy budgets from one month to another.

**Request Body**:
```json
{
  "sourceYear": 2025,
  "sourceMonth": 10,
  "targetYear": 2025,
  "targetMonth": 11,
  "overwrite": false
}
```

**Response**:
```json
{
  "copied": 3,
  "skipped": 0,
  "overwritten": 0
}
```

## Data Models

### Budget Table Schema

```sql
CREATE TABLE budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  category TEXT NOT NULL,
  limit REAL NOT NULL CHECK(limit > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(year, month, category),
  CHECK(month >= 1 AND month <= 12),
  CHECK(category IN ('Food', 'Gas', 'Other'))
);

CREATE INDEX idx_budgets_period ON budgets(year, month);
CREATE INDEX idx_budgets_category ON budgets(category);
```

### Budget Model (TypeScript Interface)

```typescript
interface Budget {
  id: number;
  year: number;
  month: number;
  category: 'Food' | 'Gas' | 'Other';
  limit: number;
  created_at: string;
  updated_at: string;
}

interface BudgetProgress {
  budget: Budget;
  spent: number;
  progress: number;
  remaining: number;
  status: 'safe' | 'warning' | 'danger' | 'critical';
}

interface BudgetSummary {
  totalBudgeted: number;
  totalSpent: number;
  remaining: number;
  progress: number;
  budgetsOnTrack: number;
  totalBudgets: number;
  categories: BudgetProgress[];
}
```

### Budget Status Calculation

```typescript
function calculateBudgetStatus(progress: number): BudgetStatus {
  if (progress >= 100) return 'critical';
  if (progress >= 90) return 'danger';
  if (progress >= 80) return 'warning';
  return 'safe';
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Budget storage round-trip
*For any* valid budget (with category, year, month, and positive limit), storing it then retrieving it should return an equivalent budget with the same values
**Validates: Requirements 1.2**

### Property 2: Budget update replaces old value
*For any* existing budget, updating it with a new limit should result in the new limit being stored and the old limit no longer being retrievable
**Validates: Requirements 1.3**

### Property 3: Budget deletion removes data
*For any* existing budget, deleting it should result in that budget no longer being retrievable from the system
**Validates: Requirements 1.4**

### Property 4: Positive limit validation
*For any* number, the system should accept it as a budget limit if and only if it is positive and greater than zero
**Validates: Requirements 1.5**

### Property 5: Progress calculation accuracy
*For any* budget limit and spent amount, the calculated progress percentage should equal (spent / limit) × 100
**Validates: Requirements 2.2**

### Property 6: Color coding correctness
*For any* progress percentage, the assigned color/status should match the defined thresholds (green < 80%, yellow 80-89%, orange 90-99%, red >= 100%)
**Validates: Requirements 2.3**

### Property 7: Budget progress updates with expenses
*For any* budget, adding an expense in that category should increase the spent amount by the expense amount
**Validates: Requirements 2.4, 8.2**

### Property 8: Remaining budget calculation
*For any* budget limit and spent amount, the remaining amount should equal (limit - spent), which can be negative for overspending
**Validates: Requirements 3.4**

### Property 9: Automatic carry-forward preserves data
*For any* month with no existing budgets, retrieving budgets for that month should return budgets with identical category and limit values from the previous month
**Validates: Requirements 5.1, 5.2**

### Property 10: Budget copy preserves data
*For any* set of budgets in a source month, manually copying them to a target month should result in budgets with identical category and limit values in the target month
**Validates: Requirements 5A.2, 5A.5**

### Property 11: Copy operation count accuracy
*For any* budget copy operation, the number of budgets reported as copied should equal the number of budgets that exist in the source month
**Validates: Requirements 5A.4**

### Property 12: Total budget sum accuracy
*For any* set of budgets, the total budgeted amount should equal the sum of all individual budget limits
**Validates: Requirements 6.1**

### Property 13: Overall progress calculation
*For any* set of budgets with spending, the overall progress should equal (total spent / total budgeted) × 100
**Validates: Requirements 6.4**

### Property 14: Non-budgeted category exclusion
*For any* expense in a category without a budget, that expense's amount should not be included in the total spent calculation for overall budget progress
**Validates: Requirements 6.5**

### Property 15: Backup round-trip
*For any* set of budgets, backing up then restoring should result in budgets with identical values
**Validates: Requirements 7.2, 7.3**

### Property 16: Budget persistence immediacy
*For any* budget creation or modification, querying for that budget immediately after the operation should return the updated value
**Validates: Requirements 7.1**

### Property 17: Month filtering accuracy
*For any* budget calculation, only expenses from the same year and month as the budget should be included in the spent amount
**Validates: Requirements 8.1**

### Property 18: Expense modification updates budget
*For any* expense modification that changes category or amount, the budget progress for affected categories should reflect the change
**Validates: Requirements 8.3**

### Property 19: Date change updates multiple months
*For any* expense with its date changed from one month to another, both the old month's budget and new month's budget should be updated correctly
**Validates: Requirements 8.4**

## Error Handling

### Validation Errors

**Invalid Budget Amount**:
- Error Code: `INVALID_BUDGET_AMOUNT`
- HTTP Status: 400
- Message: "Budget limit must be a positive number greater than zero"
- Trigger: User attempts to set budget <= 0

**Invalid Category**:
- Error Code: `INVALID_CATEGORY`
- HTTP Status: 400
- Message: "Budget can only be set for Food, Gas, or Other categories"
- Trigger: User attempts to set budget for Tax-Medical or Tax-Donation

**Invalid Date**:
- Error Code: `INVALID_DATE`
- HTTP Status: 400
- Message: "Invalid year or month specified"
- Trigger: Month < 1 or > 12, or year is unreasonable

### Database Errors

**Duplicate Budget**:
- Error Code: `DUPLICATE_BUDGET`
- HTTP Status: 409
- Message: "A budget already exists for this category and month"
- Trigger: UNIQUE constraint violation
- Resolution: Use PUT to update existing budget

**Budget Not Found**:
- Error Code: `BUDGET_NOT_FOUND`
- HTTP Status: 404
- Message: "Budget not found"
- Trigger: Attempting to update/delete non-existent budget

### Business Logic Errors

**Copy Source Empty**:
- Error Code: `NO_BUDGETS_TO_COPY`
- HTTP Status: 400
- Message: "No budgets found in source month"
- Trigger: Attempting to copy from month with no budgets

**Copy Target Conflict**:
- Error Code: `COPY_CONFLICT`
- HTTP Status: 409
- Message: "Target month already has budgets. Set overwrite=true to replace."
- Trigger: Copying to month with existing budgets without overwrite flag

### Error Response Format

```json
{
  "error": {
    "code": "INVALID_BUDGET_AMOUNT",
    "message": "Budget limit must be a positive number greater than zero",
    "details": {
      "field": "limit",
      "value": -100,
      "constraint": "must be > 0"
    }
  }
}
```

## Testing Strategy

### Unit Testing

**Budget Service Tests**:
- Budget CRUD operations
- Progress calculation logic
- Status determination
- Budget copy functionality
- Validation logic

**Budget Repository Tests**:
- Database queries
- Constraint enforcement
- Index usage
- Transaction handling

**Budget Controller Tests**:
- Request validation
- Response formatting
- Error handling
- Authentication/authorization (if applicable)

### Property-Based Testing

The system will use **fast-check** library for property-based testing with a minimum of 100 iterations per property.

**Test Configuration**:
```javascript
import fc from 'fast-check';

const budgetArbitrary = fc.record({
  year: fc.integer({ min: 2020, max: 2030 }),
  month: fc.integer({ min: 1, max: 12 }),
  category: fc.constantFrom('Food', 'Gas', 'Other'),
  limit: fc.float({ min: 0.01, max: 10000, noNaN: true })
});
```

**Property Test Examples**:

```javascript
// Property 1: Budget storage round-trip
test('Budget storage round-trip', () => {
  fc.assert(
    fc.property(budgetArbitrary, async (budget) => {
      const saved = await budgetService.create(budget);
      const retrieved = await budgetService.getById(saved.id);
      
      expect(retrieved.year).toBe(budget.year);
      expect(retrieved.month).toBe(budget.month);
      expect(retrieved.category).toBe(budget.category);
      expect(retrieved.limit).toBeCloseTo(budget.limit, 2);
    }),
    { numRuns: 100 }
  );
});

// Property 5: Progress calculation accuracy
test('Progress calculation accuracy', () => {
  fc.assert(
    fc.property(
      fc.float({ min: 0.01, max: 10000 }), // limit
      fc.float({ min: 0, max: 15000 }),    // spent
      (limit, spent) => {
        const progress = budgetService.calculateProgress(spent, limit);
        const expected = (spent / limit) * 100;
        expect(progress).toBeCloseTo(expected, 2);
      }
    ),
    { numRuns: 100 }
  );
});
```

Each property-based test will be tagged with:
```javascript
/**
 * Feature: budget-tracking-alerts, Property 1: Budget storage round-trip
 * Validates: Requirements 1.2
 */
```

### Integration Testing

**End-to-End Budget Flow**:
1. Create budget for Food category
2. Add expenses in Food category
3. Verify budget progress updates
4. Modify expense amount
5. Verify budget progress recalculates
6. Delete expense
7. Verify budget progress updates again

**Budget Copy Flow**:
1. Create budgets for month A
2. Copy to month B
3. Verify all budgets exist in month B
4. Verify month A budgets unchanged

**Historical Analysis Flow**:
1. Create budgets and expenses for multiple months
2. Request historical data
3. Verify calculations and aggregations

### Edge Cases

- Budget limit exactly equals spending (100% progress)
- Spending exceeds budget by large amount (>200%)
- Zero spending against budget
- Very small budget limits (< $1)
- Very large budget limits (> $10,000)
- Copying budgets to same month (should fail)
- Deleting budget with active spending
- Multiple budgets updated simultaneously

## Performance Considerations

### Database Optimization

**Indexes**:
- Composite index on (year, month) for fast period queries
- Index on category for category-specific queries
- Consider covering index for common query patterns

**Query Optimization**:
- Use JOIN to combine budget and expense data in single query
- Cache budget progress calculations for current month
- Batch budget recalculations when multiple expenses change

### Frontend Optimization

**Caching**:
- Cache budget data for current month in React state
- Invalidate cache only when budgets or expenses change
- Use React.memo for BudgetProgressBar to prevent unnecessary re-renders

**Lazy Loading**:
- Load historical data only when BudgetHistoryView is opened
- Paginate historical data for long time periods

### Real-time Updates

**Debouncing**:
- Debounce budget progress recalculations during rapid expense entry
- Batch multiple expense changes into single budget update

**Optimistic Updates**:
- Update UI immediately when expense is added
- Recalculate budget progress in background
- Rollback on error

## Security Considerations

### Input Validation

- Validate all budget amounts are positive numbers
- Validate category is one of allowed values
- Validate year/month are reasonable values
- Sanitize all user inputs to prevent SQL injection

### Authorization

- Users can only view/modify their own budgets
- Consider multi-user support in future (currently single-user app)

### Data Integrity

- Use database constraints to enforce business rules
- Use transactions for multi-step operations (copy, bulk updates)
- Validate foreign key relationships

## Future Enhancements

### Phase 2 Features (Not in Current Scope)

1. **Custom Categories**: Allow users to define custom expense categories beyond Food, Gas, Other
2. **Budget Templates**: Save budget configurations as templates for quick setup
3. **Budget Notifications**: Email or push notifications when thresholds are reached
4. **Budget Forecasting**: Predict end-of-month spending based on current trajectory
5. **Budget Goals**: Set long-term budget reduction goals with progress tracking
6. **Shared Budgets**: Support for household budgets with multiple users
7. **Budget Reports**: PDF export of budget performance reports
8. **Budget Rollover**: Automatically roll unused budget to next month

### Technical Debt

- Consider migrating to TypeScript for better type safety
- Add comprehensive error logging and monitoring
- Implement budget calculation caching layer
- Add database migration scripts for schema changes

## Migration Plan

### Database Migration

```sql
-- Migration: Add budgets table
-- Version: 3.7.0
-- Date: 2025-11-20

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  category TEXT NOT NULL,
  limit REAL NOT NULL CHECK(limit > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(year, month, category),
  CHECK(month >= 1 AND month <= 12),
  CHECK(category IN ('Food', 'Gas', 'Other'))
);

CREATE INDEX idx_budgets_period ON budgets(year, month);
CREATE INDEX idx_budgets_category ON budgets(category);

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_budgets_timestamp 
AFTER UPDATE ON budgets
BEGIN
  UPDATE budgets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

### Rollback Plan

```sql
-- Rollback: Remove budgets table
DROP TRIGGER IF EXISTS update_budgets_timestamp;
DROP INDEX IF EXISTS idx_budgets_category;
DROP INDEX IF EXISTS idx_budgets_period;
DROP TABLE IF EXISTS budgets;
```

### Data Migration

No data migration required as this is a new feature. Existing expense data remains unchanged.

## Deployment Checklist

- [ ] Database migration script tested
- [ ] Backend API endpoints implemented and tested
- [ ] Frontend components implemented and tested
- [ ] Property-based tests passing (100+ iterations each)
- [ ] Integration tests passing
- [ ] Error handling tested
- [ ] Performance tested with large datasets
- [ ] Documentation updated
- [ ] User guide created
- [ ] Backup/restore tested with budget data
- [ ] Version number updated (3.7.0)
- [ ] CHANGELOG.md updated
