# Insurance Claim Reminders Feature

## Overview

Shows a reminder banner in the Monthly Summary's **Notifications** section when medical expenses have insurance claims with status **In Progress**, so claims aren't forgotten.

## When Reminders Appear

A claim is a candidate when the expense has `type = 'Tax - Medical'`, `insurance_eligible = 1` and `claim_status = 'in_progress'`. Which candidates are shown depends on the selected month:

| Viewing | Claims shown |
|---------|--------------|
| A past (or future) month | All in-progress claims |
| The current month | Claims on expenses from earlier months (always), plus current-month expenses more than **7 days** old |

`daysPending` is the number of days since the expense date. Claims with status Not Claimed, Paid or Denied never appear.

## Banner

- 🏥 icon, green color scheme (`InsuranceClaimReminderBanner`)
- **Single claim**: "Insurance claim at {place} pending for {N} days", Original Cost (falls back to amount), days badge, urgency badge and "For: {people}" if people are assigned
- **Multiple claims**: "{N} insurance claims pending follow-up", Total Pending, and a per-claim list (place, amount, days, urgency icon)
- **Urgency**: 📋 Pending (< 60 days), ⏳ Extended (≥ 60), ⚠️ Long Pending (≥ 90)
- **Click / Enter / Space**: closes open overlays and applies the global expense-list insurance filter `in_progress`, showing all pending claims across all time
- **Dismiss (×)**: hides the banner in component state; it reappears on month change or page reload

## Notifications Section

All reminder banners in `SummaryPanel` are wrapped by `NotificationsSection` (🔔 "Notifications" header, count badge, collapsible, not rendered when the count is 0). See [Budget Alert Notifications](./BUDGET_ALERT_NOTIFICATIONS.md) and [Monthly Data Reminders](./MONTHLY_DATA_REMINDERS.md) for the other banners.

## Technical Implementation

### API

`GET /api/reminders/status/:year/:month` — the response includes:

```json
{
  "insuranceClaimReminders": {
    "pendingCount": 2,
    "hasPendingClaims": true,
    "isViewingCurrentMonth": true,
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

On error the service returns `pendingCount: 0`, `hasPendingClaims: false`, `pendingClaims: []`.

### Files

| File | Role |
|------|------|
| `backend/repositories/reminderRepository.js` | `getMedicalExpensesWithPendingClaims(referenceDate)` — joins `expense_people`/`people`, computes `days_pending` |
| `backend/services/reminderService.js` | `getInsuranceClaimReminders(year, month, referenceDate)` — month-based filtering (`CURRENT_MONTH_INSURANCE_CLAIM_THRESHOLD = 7`) |
| `frontend/src/components/notifications/InsuranceClaimReminderBanner.jsx` | Banner |
| `frontend/src/components/notifications/NotificationsSection.jsx` | Notifications wrapper |
| `frontend/src/components/financial/SummaryPanel.jsx` | Fetches status, dismissal state, dispatches `filterByInsuranceStatus` |
| `frontend/src/App.jsx` | Handles `filterByInsuranceStatus` → `setFilterInsurance` |

## Related Features

- [Medical Insurance Tracking](./MEDICAL_INSURANCE_TRACKING.md)
- [Medical Expense People Tracking](./MEDICAL_EXPENSE_PEOPLE_TRACKING.md)
- [Tax Deductible Invoices](./TAX_DEDUCTIBLE_INVOICES.md)

---

**Last Updated**: 2026-10-04

