# Insurance Claim Reminders Feature

## Overview

The Insurance Claim Reminders feature provides visual notification banners that alert users when medical expense insurance claims have been "In Progress" for an extended period. This helps users follow up with their insurance providers and ensures claims don't get forgotten.

## Purpose

Medical expense insurance claims can take weeks or months to process. Users often forget to follow up on pending claims, leading to:
- Delayed reimbursements
- Missed claim deadlines
- Lost money from forgotten claims
- Incomplete financial records

The reminder system solves this by proactively notifying users when claims have been pending beyond a configurable threshold (default: 30 days).

## Features

### Insurance Claim Reminder Banner
- Displays when medical expenses have insurance claims pending for more than 30 days
- Shows the expense place/description, amount, and days pending
- Green/teal color scheme to distinguish from other reminder types
- Clickable banner navigates to Tax Deductible view with "In Progress" filter
- Dismissible for the current session

### Multi-Claim Summary
- When multiple claims are pending, displays a summary count
- Shows "X insurance claims pending" with expandable details
- Individual claim details include place, amount, and days pending

### Dedicated Notifications Section
- All reminder banners are now grouped under a "Notifications" header
- Shows a count badge with total active notifications
- Collapsible section to minimize visual clutter
- Only renders when there are active notifications
- Visually separated from the Monthly Summary data

### Standardized Budget Alerts
- Budget alerts now use the same compact reminder banner pattern
- Orange/amber color scheme for budget warnings
- Single-click navigation to filtered expense view
- Consistent behavior with other reminder banners

## User Experience

### When Reminders Appear
Insurance claim reminders appear when:
1. There are medical expenses with `insurance_eligible = true`
2. The claim status is "In Progress"
3. The expense date is more than 30 days ago

### When Reminders Don't Appear
Reminders are hidden when:
- No medical expenses have pending insurance claims
- All pending claims are less than 30 days old
- The user has dismissed the reminder (session only)
- Claim status is "Not Claimed", "Paid", or "Denied"

### Interaction
Users can:
1. **Click the banner** - Opens Tax Deductible view filtered to "In Progress" claims
2. **Dismiss the banner** - Hides the reminder for the current session
3. **Collapse notifications** - Minimizes the notifications section while keeping the badge visible

### Session Behavior
- Dismissals are stored in React state (session only)
- Reminders reappear on page refresh if claims are still pending
- This ensures users are consistently reminded without being annoying

## Technical Implementation

### Backend API
**Endpoint:** `GET /api/reminders/status/:year/:month`

**Response includes:**
```json
{
  "insuranceClaimReminders": {
    "pendingCount": 2,
    "hasPendingClaims": true,
    "pendingClaims": [
      {
        "expenseId": 123,
        "place": "Dr. Smith",
        "amount": 150.00,
        "originalCost": 200.00,
        "date": "2025-12-15",
        "daysPending": 45,
        "personNames": ["John", "Jane"]
      }
    ]
  }
}
```

### Frontend Components

**InsuranceClaimReminderBanner Component:**
- Displays pending insurance claim reminders
- Props: claims, onDismiss, onClick
- Handles single and multi-claim display modes
- Green/teal color scheme

**NotificationsSection Component:**
- Wrapper for all reminder banners
- Shows "Notifications" header with count badge
- Collapsible functionality
- Only renders when notifications exist

**BudgetReminderBanner Component:**
- Refactored from BudgetAlertBanner
- Follows unified reminder banner pattern
- Orange/amber color scheme
- Single-click navigation to category expenses

### Data Flow
1. SummaryPanel loads for current month
2. Frontend calls `/api/reminders/status/:year/:month`
3. Backend queries medical expenses with pending claims
4. Backend calculates days pending for each claim
5. Frontend displays reminder banner if claims exceed threshold
6. User clicks banner to navigate to Tax Deductible view

### Database Query
```sql
SELECT 
  e.id, e.date, e.place, e.amount, e.original_cost,
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

## Benefits

### For Users
- Never forget to follow up on insurance claims
- Track how long claims have been pending
- Quick access to pending claims view
- Maintain accurate reimbursement records

### For Financial Tracking
- Ensures insurance reimbursements are collected
- Improves accuracy of out-of-pocket medical expense tracking
- Supports better tax documentation
- Reduces lost money from forgotten claims

## Configuration

### Default Threshold
The default reminder threshold is 30 days. Claims pending longer than this will trigger reminders.

### Customization
The threshold can be customized via the API:
```javascript
getInsuranceClaimReminders(thresholdDays = 30)
```

## Visual Design

### Color Scheme
- **Insurance Claims**: Green/teal (#10b981, #d1fae5)
- **Budget Alerts**: Orange/amber (#f59e0b, #fef3c7)
- **Credit Card Reminders**: Yellow/red (existing)
- **Loan Reminders**: Blue/purple (existing)

### Banner Layout
```
┌─────────────────────────────────────────────────────────────┐
│ 🏥 2 insurance claims pending over 30 days                × │
│    Click to view pending claims                             │
└─────────────────────────────────────────────────────────────┘
```

### Notifications Section
```
┌─────────────────────────────────────────────────────────────┐
│ 🔔 Notifications (5)                                    ▼   │
├─────────────────────────────────────────────────────────────┤
│ [Credit Card Reminder Banner]                               │
│ [Loan Payment Reminder Banner]                              │
│ [Insurance Claim Reminder Banner]                           │
│ [Budget Alert Banner]                                       │
│ [Data Reminder Banner]                                      │
└─────────────────────────────────────────────────────────────┘
```

## Related Features

- [Medical Insurance Tracking](./MEDICAL_INSURANCE_TRACKING.md)
- [Medical Expense People Tracking](./MEDICAL_EXPENSE_PEOPLE_TRACKING.md)
- [Tax Deductible Invoices](./TAX_DEDUCTIBLE_INVOICES.md)
- [Budget Alert Notifications](./BUDGET_ALERT_NOTIFICATIONS.md)
- [Monthly Data Reminders](./MONTHLY_DATA_REMINDERS.md)

## Version History

- **v4.13.0** - Initial release of Insurance Claim Reminders feature
  - Added insurance claim reminder banner
  - Created dedicated Notifications section
  - Standardized budget alerts to reminder banner pattern
  - Deprecated BudgetAlertBanner in favor of BudgetReminderBanner
