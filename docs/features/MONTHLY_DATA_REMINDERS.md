# Monthly Data Reminders Feature

## Overview

The Monthly Data Reminders feature provides visual notification banners in the monthly summary panel that prompt users to update their investment values and loan balances for the current month. This ensures users maintain accurate financial records and net worth calculations.

## Purpose

Users often forget to update their investment values and loan balances each month, leading to:
- Inaccurate net worth calculations
- Incomplete financial tracking
- Missing data in historical reports

The reminder system solves this by proactively notifying users when data is missing for the current month.

## Features

### Investment Value Reminders
- Displays when one or more investments are missing values for the current month
- Shows the count of investments needing updates
- Includes the current month name in the message
- Clickable banner opens the Investments modal for quick data entry
- Dismissible for the current session

### Loan Balance Reminders
- Displays when one or more active loans are missing balances for the current month
- Shows the count of loans needing updates
- Includes the current month name in the message
- Clickable banner opens the Loans modal for quick data entry
- Dismissible for the current session

### Visual Design
- Subtle warning colors (light yellow/orange background)
- Clear icons (💡 for investments, 💳 for loans)
- Non-intrusive placement at the top of the summary panel
- Multiple reminders stack vertically when both types are needed
- Smooth fade-in animation

## User Experience

### When Reminders Appear
Reminders appear on the monthly summary panel when:
1. The user is viewing the current month
2. There are active investments without values for the current month, OR
3. There are active loans without balances for the current month

### When Reminders Don't Appear
Reminders are hidden when:
- All investment values are up to date for the current month
- All loan balances are up to date for the current month
- There are no active investments or loans
- The user has dismissed the reminder (session only)

### Interaction
Users can:
1. **Click the banner** - Opens the relevant modal (Investments or Loans) to add missing data
2. **Dismiss the banner** - Hides the reminder for the current session
3. **Ignore the banner** - Reminder persists until data is added or dismissed

### Session Behavior
- Dismissals are stored in React state (session only)
- Reminders reappear on page refresh if data is still missing
- This ensures users are consistently reminded without being annoying

## Technical Implementation

### Backend API
**Endpoint:** `GET /api/reminders/status/:year/:month`

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

### Frontend Components

**DataReminderBanner Component:**
- Reusable banner for displaying reminders
- Props: type, count, monthName, onDismiss, onClick
- Handles both investment and loan reminder types

**SummaryPanel Enhancement:**
- Fetches reminder status on component mount
- Displays appropriate banners based on API response
- Manages dismissal state
- Opens relevant modals when banners are clicked

### Data Flow
1. SummaryPanel loads for current month
2. Frontend calls `/api/reminders/status/:year/:month`
3. Backend checks for missing investment values and loan balances
4. Frontend displays appropriate reminder banners
5. User clicks banner to open relevant modal
6. User can dismiss banner (stored in session state)

## Benefits

### For Users
- Never forget to update monthly financial data
- Maintain accurate net worth calculations
- Complete historical tracking
- Quick access to data entry modals

### For Data Quality
- Ensures consistent monthly data entry
- Reduces gaps in financial records
- Improves accuracy of reports and summaries
- Supports better financial decision-making

## Configuration

No configuration required. The feature works automatically based on:
- Active investments (not deleted)
- Active loans (not paid off)
- Current month data completeness

## Future Enhancements

Potential improvements:
- Email/push notifications for reminders
- Configurable reminder preferences
- Reminder history tracking
- Snooze functionality
- Custom reminder messages

## Related Features

- [Investment Tracking](./INVESTMENT_TRACKING.md)
- [Loans & Lines of Credit](../README.md#loans--lines-of-credit)
- [Net Worth Tracking](../README.md#net-worth-tracking)

## Version History

- **v4.5.0** - Initial release of Monthly Data Reminders feature

