# Design Document: Insurance Claim Reminders

## Overview

This design extends the existing reminder system to include alerts for medical expenses with insurance claims that have been "In Progress" for an extended period. Additionally, it standardizes the budget alert system to use the same compact reminder banner pattern as other reminders.

The implementation follows the established patterns in `reminderService.js` and the reminder banner components, ensuring consistency across all alert types.

## Architecture

```mermaid
graph TB
    subgraph Backend
        RS[reminderService.js] --> RR[reminderRepository.js]
        RS --> ER[expenseRepository.js]
        RR --> DB[(SQLite Database)]
        ER --> DB
    end
    
    subgraph Frontend
        SP[SummaryPanel.jsx] --> ICRB[InsuranceClaimReminderBanner.jsx]
        SP --> BRAB[BudgetReminderBanner.jsx]
        SP --> API[/api/reminders/status]
    end
    
    API --> RS
```

## Components and Interfaces

### Backend Components

#### 1. ReminderService Extension

Extend `backend/services/reminderService.js` with a new method:

```javascript
/**
 * Get insurance claim reminders
 * Returns medical expenses with claim_status = 'in_progress' that exceed the threshold
 * @param {number} thresholdDays - Days after which to show reminder (default: 30)
 * @param {Date} referenceDate - Reference date for calculations (default: today)
 * @returns {Promise<Object>} Insurance claim reminder status
 */
async getInsuranceClaimReminders(thresholdDays = 30, referenceDate = new Date())
```

#### 2. ReminderRepository Extension

Add new method to `backend/repositories/reminderRepository.js`:

```javascript
/**
 * Get medical expenses with in-progress insurance claims
 * @returns {Promise<Array>} Array of expenses with pending claims
 */
async getMedicalExpensesWithPendingClaims()
```

#### 3. API Response Structure

The `getReminderStatus()` response will include a new `insuranceClaimReminders` object:

```javascript
{
  // ... existing fields ...
  insuranceClaimReminders: {
    pendingCount: number,
    hasPendingClaims: boolean,
    pendingClaims: [
      {
        expenseId: number,
        place: string,
        amount: number,
        originalCost: number,
        date: string,
        daysPending: number,
        personNames: string[] | null  // Associated people if any
      }
    ]
  }
}
```

### Frontend Components

#### 1. InsuranceClaimReminderBanner

New component following the existing reminder banner pattern:

```javascript
// frontend/src/components/InsuranceClaimReminderBanner.jsx
const InsuranceClaimReminderBanner = ({ 
  claims,           // Array of pending claims
  onDismiss,        // Dismiss handler
  onClick           // Navigate to Tax Deductible view
}) => { ... }
```

#### 2. BudgetReminderBanner (Refactored)

Refactor `BudgetAlertBanner` to follow the reminder banner pattern:

```javascript
// frontend/src/components/BudgetReminderBanner.jsx
const BudgetReminderBanner = ({ 
  alerts,           // Array of budget alerts
  onDismiss,        // Dismiss handler
  onClick           // Navigate to filtered expense view
}) => { ... }
```

### Component Hierarchy

The UI will be restructured to separate notifications from the Monthly Summary:

```
SummaryPanel
├── NotificationsSection (NEW - dedicated section for all alerts)
│   ├── CreditCardReminderBanner (overdue)
│   ├── CreditCardReminderBanner (due soon)
│   ├── BillingCycleReminderBanner
│   ├── LoanPaymentReminderBanner (overdue)
│   ├── LoanPaymentReminderBanner (due soon)
│   ├── InsuranceClaimReminderBanner (NEW)
│   ├── BudgetReminderBanner (REFACTORED)
│   ├── DataReminderBanner (investments)
│   └── DataReminderBanner (loans)
│
└── MonthlySummarySection (existing summary cards and data)
    ├── Summary Cards Grid
    ├── Weekly Breakdown
    └── etc.
```

### NotificationsSection Component

New wrapper component that:
- Groups all reminder banners under a "Notifications" header
- Shows a count badge when there are active notifications
- Can be collapsed/expanded by the user
- Maintains visual separation from the Monthly Summary data

```javascript
// frontend/src/components/NotificationsSection.jsx
const NotificationsSection = ({ children, notificationCount }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  
  if (notificationCount === 0) return null;
  
  return (
    <div className="notifications-section">
      <div className="notifications-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="notifications-icon">🔔</span>
        <span className="notifications-title">Notifications</span>
        <span className="notifications-badge">{notificationCount}</span>
        <span className="notifications-toggle">{isExpanded ? '▼' : '▶'}</span>
      </div>
      {isExpanded && (
        <div className="notifications-content">
          {children}
        </div>
      )}
    </div>
  );
};
```

## Data Models

### Existing Expense Table Fields Used

```sql
-- From expenses table
id              INTEGER PRIMARY KEY
date            TEXT NOT NULL
place           TEXT
amount          REAL NOT NULL
type            TEXT NOT NULL  -- 'Tax - Medical' for medical expenses
insurance_eligible INTEGER DEFAULT 0
claim_status    TEXT  -- 'not_claimed', 'in_progress', 'paid', 'denied'
original_cost   REAL
```

### Query for Pending Claims

```sql
SELECT 
  e.id,
  e.date,
  e.place,
  e.amount,
  e.original_cost,
  julianday('now') - julianday(e.date) as days_pending,
  GROUP_CONCAT(p.name, ', ') as person_names
FROM expenses e
LEFT JOIN expense_people ep ON e.id = ep.expense_id
LEFT JOIN people p ON ep.person_id = p.id
WHERE e.type = 'Tax - Medical'
  AND e.insurance_eligible = 1
  AND e.claim_status = 'in_progress'
GROUP BY e.id
ORDER BY days_pending DESC
```

### Reminder State Structure

```javascript
// In SummaryPanel state
const [reminderStatus, setReminderStatus] = useState({
  // ... existing fields ...
  insuranceClaimReminders: {
    pendingCount: 0,
    hasPendingClaims: false,
    pendingClaims: []
  }
});

const [dismissedReminders, setDismissedReminders] = useState({
  // ... existing fields ...
  insuranceClaims: false,
  budgetAlerts: false  // NEW - for standardized budget alerts
});
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Query Filtering - Only In-Progress Medical Expenses

*For any* set of expenses in the database with varying types, insurance_eligible values, and claim_status values, calling `getMedicalExpensesWithPendingClaims()` SHALL return only expenses where type = 'Tax - Medical' AND insurance_eligible = 1 AND claim_status = 'in_progress'.

**Validates: Requirements 1.1**

### Property 2: Days Pending Calculation Accuracy

*For any* expense with a valid date, the `daysPending` calculation SHALL equal the number of days between the expense date and the reference date (rounded down to whole days).

**Validates: Requirements 1.2**

### Property 3: Threshold Filtering

*For any* set of pending claims and any threshold value T, calling `getInsuranceClaimReminders(T)` SHALL return only claims where daysPending > T.

**Validates: Requirements 1.3, 4.2, 4.3**

### Property 4: Count Invariant

*For any* result from `getInsuranceClaimReminders()`, the `pendingCount` field SHALL equal the length of the `pendingClaims` array.

**Validates: Requirements 1.4**

### Property 5: Banner Rendering with Required Content

*For any* non-empty array of pending claims, the InsuranceClaimReminderBanner SHALL render and the rendered output SHALL contain the place, amount, and daysPending for each claim.

**Validates: Requirements 2.1, 2.2**

### Property 6: Multi-Claim Summary Display

*For any* array of pending claims with length > 1, the InsuranceClaimReminderBanner SHALL display a summary count equal to the array length.

**Validates: Requirements 2.3**

### Property 7: Dismissal Hides Banner

*For any* InsuranceClaimReminderBanner that is dismissed, subsequent renders with the same claims SHALL not display the banner until the session ends.

**Validates: Requirements 2.5**

### Property 8: API Response Structure

*For any* call to `getReminderStatus()`, the response SHALL include an `insuranceClaimReminders` object with fields: pendingCount (number), hasPendingClaims (boolean), and pendingClaims (array).

**Validates: Requirements 5.2, 5.3**

### Property 9: Budget Alert Click Navigation

*For any* BudgetReminderBanner click event, the onClick handler SHALL be called with the category name of the clicked alert.

**Validates: Requirements 6.4**

### Property 10: Budget Alert Content Display

*For any* budget alert, the BudgetReminderBanner SHALL display the category name, spending percentage, and budget limit.

**Validates: Requirements 6.5**

### Property 11: Budget Alert Multi-Alert Summary

*For any* array of budget alerts with length > 1, the BudgetReminderBanner SHALL display a summary count equal to the array length.

**Validates: Requirements 6.6**

## Error Handling

### Backend Error Handling

1. **Database Query Errors**: Log error and return empty results with `hasPendingClaims: false`
2. **Invalid Date Calculations**: Skip expenses with invalid dates, log warning
3. **Missing Fields**: Handle null/undefined gracefully for optional fields (person_names, original_cost)

### Frontend Error Handling

1. **API Fetch Errors**: Gracefully degrade - don't show banner if API fails
2. **Missing Data**: Handle null/undefined claims array - render nothing
3. **Invalid Props**: Validate props and return null for invalid inputs

### Error Response Structure

```javascript
// On error, return safe defaults
{
  insuranceClaimReminders: {
    pendingCount: 0,
    hasPendingClaims: false,
    pendingClaims: [],
    error: 'Error message for logging'
  }
}
```

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests:

- **Unit tests**: Specific examples, edge cases, error conditions
- **Property tests**: Universal properties across all valid inputs

### Property-Based Testing Configuration

- **Library**: fast-check (already used in the project)
- **Minimum iterations**: 100 per property test
- **Tag format**: `Feature: insurance-claim-reminders, Property N: description`

### Test Categories

#### Backend Tests

1. **Repository Tests** (`reminderRepository.pbt.test.js`)
   - Property 1: Query filtering
   - Property 2: Days pending calculation

2. **Service Tests** (`reminderService.insuranceClaims.pbt.test.js`)
   - Property 3: Threshold filtering
   - Property 4: Count invariant
   - Property 8: API response structure

#### Frontend Tests

1. **Component Tests** (`InsuranceClaimReminderBanner.pbt.test.jsx`)
   - Property 5: Banner rendering with content
   - Property 6: Multi-claim summary
   - Property 7: Dismissal behavior

2. **Budget Banner Tests** (`BudgetReminderBanner.pbt.test.jsx`)
   - Property 9: Click navigation
   - Property 10: Content display
   - Property 11: Multi-alert summary

### Unit Test Coverage

- Edge case: No pending claims (empty array)
- Edge case: Single claim at exactly threshold days
- Edge case: Claim with no associated people
- Edge case: Claim with multiple associated people
- Error case: Database connection failure
- Error case: Invalid expense data

### Test Data Generators

```javascript
// Arbitrary for medical expense with insurance
const medicalExpenseArb = fc.record({
  id: fc.integer({ min: 1 }),
  date: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
  place: fc.string({ minLength: 1, maxLength: 100 }),
  amount: fc.float({ min: 0.01, max: 10000, noNaN: true }),
  original_cost: fc.float({ min: 0.01, max: 10000, noNaN: true }),
  type: fc.constant('Tax - Medical'),
  insurance_eligible: fc.constant(1),
  claim_status: fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied')
});

// Arbitrary for threshold days
const thresholdArb = fc.integer({ min: 1, max: 365 });
```
