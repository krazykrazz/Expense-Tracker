# Design Document: Monthly Data Reminders

## Overview

The monthly data reminders feature adds visual notification banners to the monthly summary panel that prompt users to update their investment values and loan balances for the current month. This ensures users maintain accurate financial records and net worth calculations.

## Architecture

The feature follows the existing application architecture:

**Frontend Components:**
- `DataReminderBanner` - Reusable banner component for displaying reminders
- `SummaryPanel` - Enhanced to check for missing data and display reminder banners

**Backend API:**
- New endpoint: `GET /api/reminders/status/:year/:month` - Returns status of investment and loan data for a given month

**Data Flow:**
1. SummaryPanel loads for current month
2. Frontend calls reminder status API
3. Backend checks for missing investment values and loan balances
4. Frontend displays appropriate reminder banners
5. User clicks banner to open relevant modal
6. User can dismiss banner (stored in session state)

## Components and Interfaces

### Frontend Component: DataReminderBanner

**Props:**
```typescript
interface DataReminderBannerProps {
  type: 'investment' | 'loan';
  count: number;
  monthName: string;
  onDismiss: () => void;
  onClick: () => void;
}
```

**Behavior:**
- Displays icon, message, and count
- Clickable to open relevant modal
- Dismissible with X button
- Uses subtle warning colors (light yellow/orange background)

### Frontend Enhancement: SummaryPanel

**New State:**
```typescript
const [reminderStatus, setReminderStatus] = useState({
  missingInvestments: 0,
  missingLoans: 0,
  hasActiveInvestments: false,
  hasActiveLoans: false
});

const [dismissedReminders, setDismissedReminders] = useState({
  investments: false,
  loans: false
});
```

**New Functions:**
- `fetchReminderStatus()` - Fetches reminder data from API
- `handleDismissInvestmentReminder()` - Dismisses investment reminder for session
- `handleDismissLoanReminder()` - Dismisses loan reminder for session
- `handleInvestmentReminderClick()` - Opens investments modal
- `handleLoanReminderClick()` - Opens loans modal

### Backend API Endpoint

**Route:** `GET /api/reminders/status/:year/:month`

**Response:**
```json
{
  "missingInvestments": 2,
  "missingLoans": 1,
  "hasActiveInvestments": true,
  "hasActiveLoans": true,
  "investments": [
    { "id": 1, "name": "TFSA", "hasValue": false },
    { "id": 2, "name": "RRSP", "hasValue": true }
  ],
  "loans": [
    { "id": 1, "name": "Mortgage", "hasBalance": false }
  ]
}
```

**Logic:**
1. Query all active investments (not deleted)
2. Check which investments have values for the specified month
3. Query all active loans (is_paid_off = 0)
4. Check which loans have balances for the specified month
5. Return counts and details

## Data Models

No new database tables required. Uses existing:
- `investments` table
- `investment_values` table
- `loans` table
- `loan_balances` table

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Acceptance Criteria Testing Prework

1.1 WHEN the user views the monthly summary panel AND investment values for the current month have not been entered THEN the System SHALL display a reminder banner prompting the user to update investment values
  Thoughts: This is about what should happen across all cases where data is missing. We can test by creating random investments, checking if values exist for a month, and verifying the reminder appears when expected.
  Testable: yes - property

1.2 WHEN the user has entered investment values for all active investments for the current month THEN the System SHALL not display the investment reminder banner
  Thoughts: This is the inverse of 1.1 - when all data is present, no reminder should show. This is testable across all scenarios.
  Testable: yes - property

1.3 WHEN the user clicks the reminder banner THEN the System SHALL open the Investments modal
  Thoughts: This is a UI interaction test. We can verify that clicking triggers the modal open function.
  Testable: yes - example

1.4 WHEN there are no active investments THEN the System SHALL not display the investment reminder banner
  Thoughts: This is an edge case - when the count is zero, no reminder should appear.
  Testable: edge-case

2.1 WHEN the user views the monthly summary panel AND loan balances for the current month have not been entered THEN the System SHALL display a reminder banner prompting the user to update loan balances
  Thoughts: Same pattern as 1.1 but for loans. Testable across all cases with missing loan data.
  Testable: yes - property

2.2 WHEN the user has entered loan balances for all active loans for the current month THEN the System SHALL not display the loan reminder banner
  Thoughts: Inverse of 2.1 - no reminder when all data is present.
  Testable: yes - property

2.3 WHEN the user clicks the reminder banner THEN the System SHALL open the Loans modal
  Thoughts: UI interaction test for loans modal.
  Testable: yes - example

2.4 WHEN there are no active loans THEN the System SHALL not display the loan reminder banner
  Thoughts: Edge case - zero loans means no reminder.
  Testable: edge-case

3.1 WHEN a reminder banner is displayed THEN the System SHALL use a subtle color scheme that stands out without being alarming
  Thoughts: This is about visual design and aesthetics, not a computable property.
  Testable: no

3.2 WHEN multiple reminders are needed THEN the System SHALL display them as separate banners stacked vertically
  Thoughts: This tests that when both investment and loan reminders are needed, both appear. Testable by creating scenarios with both types of missing data.
  Testable: yes - example

3.3 WHEN the user dismisses a reminder banner THEN the System SHALL hide the banner for the current session only
  Thoughts: This tests session state management. We can verify dismissal hides the banner and it reappears on new session.
  Testable: yes - example

3.4 WHEN the user starts a new session AND data is still missing THEN the System SHALL display the reminder banner again
  Thoughts: This tests persistence behavior - reminders should reappear if data is still missing.
  Testable: yes - example

4.1 WHEN the investment reminder is displayed THEN the System SHALL show the count of investments that need values entered
  Thoughts: This tests that the count displayed matches the actual number of missing values. Testable across all scenarios.
  Testable: yes - property

4.2 WHEN the loan reminder is displayed THEN the System SHALL show the count of loans that need balances entered
  Thoughts: Same as 4.1 but for loans.
  Testable: yes - property

4.3 WHEN the reminder banner is displayed THEN the System SHALL include the current month name in the message
  Thoughts: This tests that the month name is correctly displayed. Testable across all months.
  Testable: yes - property

### Property Reflection

Reviewing for redundancy:
- Properties 1.1 and 1.2 are inverses but both provide value (testing positive and negative cases)
- Properties 2.1 and 2.2 are inverses but both provide value
- Properties 4.1, 4.2, and 4.3 all test different aspects of the display and should remain separate
- No redundancy found - all properties provide unique validation

### Correctness Properties

Property 1: Missing investment data triggers reminder
*For any* set of active investments and month, when at least one investment is missing a value for that month, the reminder status should indicate missing investments with the correct count
**Validates: Requirements 1.1, 4.1**

Property 2: Complete investment data suppresses reminder
*For any* set of active investments and month, when all investments have values for that month, the reminder status should indicate zero missing investments
**Validates: Requirements 1.2**

Property 3: Missing loan data triggers reminder
*For any* set of active loans and month, when at least one loan is missing a balance for that month, the reminder status should indicate missing loans with the correct count
**Validates: Requirements 2.1, 4.2**

Property 4: Complete loan data suppresses reminder
*For any* set of active loans and month, when all loans have balances for that month, the reminder status should indicate zero missing loans
**Validates: Requirements 2.2**

Property 5: Month name accuracy
*For any* valid month number (1-12), the displayed month name in the reminder should match the correct month name
**Validates: Requirements 4.3**

Property 6: Count accuracy for investments
*For any* set of investments and month, the count of missing investment values should equal the number of active investments without values for that month
**Validates: Requirements 4.1**

Property 7: Count accuracy for loans
*For any* set of loans and month, the count of missing loan balances should equal the number of active loans without balances for that month
**Validates: Requirements 4.2**

## Error Handling

- API errors fetching reminder status: Display generic error message, don't show reminders
- Network timeout: Fail silently, don't block summary panel loading
- Invalid month/year: Return empty reminder status (no reminders)
- Database errors: Log error, return empty status

## Testing Strategy

### Unit Tests
- Test DataReminderBanner component rendering
- Test dismiss functionality
- Test click handlers
- Test API endpoint with various data scenarios
- Test edge cases (no investments, no loans, all data present)

### Property-Based Tests
- Property 1: Missing investment data triggers reminder (100+ iterations)
- Property 2: Complete investment data suppresses reminder (100+ iterations)
- Property 3: Missing loan data triggers reminder (100+ iterations)
- Property 4: Complete loan data suppresses reminder (100+ iterations)
- Property 5: Month name accuracy (12 iterations, one per month)
- Property 6: Count accuracy for investments (100+ iterations)
- Property 7: Count accuracy for loans (100+ iterations)

Each property-based test will:
- Generate random sets of investments/loans
- Generate random months
- Verify the reminder logic behaves correctly
- Run minimum 100 iterations using fast-check library
- Be tagged with: `**Feature: monthly-data-reminders, Property X: [property text]**`

### Integration Tests
- Test full flow: missing data → reminder appears → click → modal opens
- Test dismissal persists within session
- Test reminder reappears on new session if data still missing
- Test multiple reminders display correctly

## UI/UX Considerations

**Banner Design:**
- Light yellow/orange background (#FFF4E6)
- Orange border (#FFB84D)
- Icon: 💡 for investments, 💳 for loans
- Clear, concise message
- Dismiss button (X) on right side
- Clickable entire banner area
- Smooth fade-in animation

**Placement:**
- Display at top of SummaryPanel, below month selector
- Stack multiple banners vertically with 8px gap
- Full width of summary panel

**Message Format:**
- Investments: "💡 Update {count} investment value{s} for {Month}"
- Loans: "💳 Update {count} loan balance{s} for {Month}"

## Performance Considerations

- Reminder status API call only made for current month view
- Results cached in component state
- Dismissal state stored in React state (session only)
- No database writes for dismissals
- Lightweight queries using existing indexes
