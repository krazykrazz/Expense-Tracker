# Credit Card Billing Cycle History

**Version**: 5.4.0  
**Status**: Implemented  
**Spec**: `.kiro/specs/credit-card-billing-cycle-history/`, `.kiro/specs/unified-billing-cycles/`, `.kiro/specs/billing-cycle-automation/`, `.kiro/specs/credit-card-billing-fixes/`, `.kiro/specs/billing-cycle-payment-deduction/`

## Overview

The Credit Card Billing Cycle History feature provides comprehensive tracking of credit card billing cycles with automatic cycle generation, statement balance entry, trend analysis, and transaction counting. This replaces the simple statement balance calculation with a full historical view of billing cycles.

## Features

### Unified Billing Cycle List

The billing cycle list displays all cycles (both user-entered and auto-generated) in a single unified view:

- **Cycle Period**: Start and end dates for each billing cycle
- **Effective Balance**: Shows actual statement balance (if entered) or calculated balance
- **Balance Type Indicator**: "Actual" badge (green) for user-entered balances, "Calculated" badge (gray) for auto-generated
- **Transaction Count**: Number of expenses posted during the cycle
- **Trend Indicator**: Comparison to previous cycle (higher ↑, lower ↓, same ✓)
- **Optional Fields**: Minimum payment and notes when available
- **Due Date**: Derived from the payment method's `payment_due_day` (see Due Date Derivation below)
- **PDF Indicator**: Shows when a statement PDF is attached

### Scheduled Billing Cycle Auto-Generation

Billing cycle records are created automatically by a background scheduler, replacing the previous approach where cycles were generated on-demand when opening the credit card detail view.

**How It Works:**

- A `node-cron` background task runs inside the Express server process hourly at `:00 UTC`
- On each run, the scheduler reads the current business date (derived from the configured `BUSINESS_TIMEZONE` setting) and compares it to the last processed date stored in the application settings
- If the current business date is ahead of the last processed date, the scheduler processes each missing date sequentially (catching up after downtime)
- If the current business date equals the last processed date, the run is skipped (already current)
- For each date processed, the scheduler scans all active credit cards with a configured `billing_cycle_day` and creates auto-generated cycle records for any completed cycle periods without a corresponding record
- Auto-generated cycles have `is_user_entered = 0`, `actual_statement_balance = 0`, and a `calculated_statement_balance` derived from the previous cycle's balance, tracked expenses, and credit card payments in the cycle period
- The calculated balance formula is: `max(0, round(previousBalance + totalExpenses − totalPayments, 2))`
  - `previousBalance` is the effective balance from the immediately preceding billing cycle (actual if user-entered, calculated if auto-generated; zero if no previous cycle exists)
  - `totalExpenses` uses `COALESCE(original_cost, amount)` for expenses where `COALESCE(posted_date, date)` falls within the cycle dates (inclusive)
  - `totalPayments` is the sum of credit card payments where `payment_date` falls within the cycle dates (inclusive)
  - The result is floored at zero — balances never go negative

**Startup Behavior:**

- On server startup, an initial check runs after 60 seconds to catch any cycles missed during downtime
- The date-driven model automatically recovers from multi-day outages by processing each missed business date in order

**Configuration:**

The scheduler runs hourly at `:00 UTC` (fixed schedule — not configurable via environment variable). The business timezone used for date boundary calculations is configured through the application UI:

1. Open Settings → General → Business Timezone
2. Select your local timezone (default: `America/Toronto`)

| Setting | Where | Default | Description |
|---------|-------|---------|-------------|
| Business Timezone | Settings UI → General | `America/Toronto` | Timezone for billing cycle date boundaries |

Docker Compose example (no scheduler-specific env vars needed):
```yaml
services:
  expense-tracker:
    environment:
      - TZ=Etc/UTC
      - LOG_LEVEL=info
```

**Resilience:**

- An in-memory lock prevents concurrent execution of the scheduler
- If processing one credit card fails, the scheduler logs the error and continues with remaining cards
- A warning is logged if a scheduler run exceeds 30 seconds
- All scheduler activity is captured in the activity log for auditing

### Auto-Generation Notification

When the scheduler creates new billing cycle records, a notification alerts the user to review them:

- A banner appears in the Notifications section: "Auto-generated billing cycle created for {card name}"
- The notification displays the credit card name, cycle end date, and calculated balance
- Clicking the notification navigates to the credit card's billing cycle list for review
- The notification disappears once the user enters an actual statement balance (setting `actual_statement_balance > 0` or `is_user_entered = 1`)

This replaces the "needs entry" billing cycle reminder for auto-generated cycles — since the record already exists, the user is prompted to review and enter the real statement balance rather than being told a cycle needs to be created.

### Statement Balance Entry

Users can enter actual statement balances for any billing cycle:

- Click the pencil (✏️) icon on any cycle to enter/edit statement details
- Enter actual statement balance from your credit card statement
- Optionally add minimum payment and notes
- Upload statement PDF for record keeping
- Zero balance is supported for unused credit cards

### Trend Indicators

Visual indicators show spending trends compared to the previous cycle:

| Indicator | Color | Meaning |
|-----------|-------|---------|
| ↑ | Orange | Higher than previous cycle |
| ↓ | Blue | Lower than previous cycle |
| ✓ | Green | Same as previous cycle (within $0.01) |
| — | Gray | No previous cycle for comparison |

### Transaction Counting

Each billing cycle shows the count of transactions posted during that period:

- Counts expenses where `COALESCE(posted_date, date)` falls within the cycle
- Singular "transaction" for count of 1, plural "transactions" otherwise
- Helps identify spending activity levels per cycle

## User Interface

### Accessing Billing Cycles

1. Click "💳 Payment Methods" in the navigation
2. Click on a credit card to view details
3. Scroll to the "Billing Cycle History" section

### Action Buttons

All cycles display consistent pencil/trash action buttons:

- **Pencil (✏️)**: 
  - For actual cycles: Opens edit form to modify statement details
  - For calculated cycles: Opens form to enter statement balance
- **Trash (🗑️)**: 
  - For actual cycles: Deletes the billing cycle record (cannot be undone)
  - For calculated cycles: Deletes and regenerates with updated calculations

### Delete Confirmation

Clicking delete shows a confirmation dialog with:
- Cycle end date
- Current balance (actual or calculated)
- Warning about the action
- Delete and Cancel buttons

## Database Schema

### billing_cycle_history Table

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| payment_method_id | INTEGER | FK to payment_methods |
| cycle_start_date | TEXT | Start date of billing cycle |
| cycle_end_date | TEXT | End date of billing cycle |
| actual_statement_balance | REAL | User-entered statement balance (NULL if not entered) |
| calculated_statement_balance | REAL | System-calculated balance from expenses |
| minimum_payment | REAL | Minimum payment due (optional) |
| notes | TEXT | User notes (optional) |
| statement_pdf_path | TEXT | Path to uploaded statement PDF (optional) |
| is_user_entered | INTEGER | 1 if user-entered, 0 if auto-generated (default: 0) |
| created_at | TEXT | Record creation timestamp |
| updated_at | TEXT | Last update timestamp |

### Unique Constraint

`UNIQUE(payment_method_id, cycle_end_date)` - Only one record per cycle per card

## API Endpoints

### Get Unified Billing Cycles

**Endpoint:** `GET /api/billing-cycles/:paymentMethodId/unified`

Returns all billing cycles (actual and auto-generated) for a credit card.

**Response:**
```json
{
  "cycles": [
    {
      "id": 1,
      "payment_method_id": 4,
      "cycle_start_date": "2026-01-16",
      "cycle_end_date": "2026-02-15",
      "actual_statement_balance": 1234.56,
      "calculated_statement_balance": 1189.23,
      "effective_balance": 1234.56,
      "balance_type": "actual",
      "transaction_count": 23,
      "trend_indicator": {
        "type": "higher",
        "icon": "↑",
        "amount": 145.33,
        "cssClass": "trend-higher"
      },
      "minimum_payment": 25.00,
      "notes": "Statement received via email",
      "statement_pdf_path": "/statements/2026-02.pdf"
    }
  ]
}
```

### Create/Update Billing Cycle

**Endpoint:** `POST /api/billing-cycles`

Creates or updates a billing cycle record.

**Request Body:**
```json
{
  "payment_method_id": 4,
  "cycle_start_date": "2026-01-16",
  "cycle_end_date": "2026-02-15",
  "actual_statement_balance": 1234.56,
  "minimum_payment": 25.00,
  "notes": "Statement received via email"
}
```

### Delete Billing Cycle

**Endpoint:** `DELETE /api/billing-cycles/:id`

Deletes a billing cycle record.

### Upload Statement PDF

**Endpoint:** `POST /api/billing-cycles/:id/statement`

Uploads a PDF statement for a billing cycle.

### Get Statement PDF

**Endpoint:** `GET /api/billing-cycles/:id/statement`

Downloads the statement PDF for a billing cycle.

## Effective Balance Logic

The system determines which balance to display using this logic:

1. If `actual_statement_balance` is set AND the cycle has been "entered" by the user:
   - User has entered minimum_payment, notes, OR
   - User has entered a non-zero actual_statement_balance
   - → Use `actual_statement_balance` (balance_type: "actual")

2. Otherwise:
   - → Use `calculated_statement_balance` (balance_type: "calculated")

This allows users to explicitly enter $0.00 for unused credit cards while still showing calculated balances for cycles that haven't been reviewed.

## Calculated Balance Formula

Auto-generated billing cycles compute the `calculated_statement_balance` using the following formula:

```
calculated_statement_balance = max(0, round(previousBalance + totalExpenses − totalPayments, 2))
```

Where:
- **previousBalance**: The effective balance from the immediately preceding billing cycle record. Uses `actual_statement_balance` if the previous cycle is user-entered (`is_user_entered = 1`), otherwise uses `calculated_statement_balance`. Zero if no previous cycle exists.
- **totalExpenses**: Sum of `COALESCE(original_cost, amount)` from the `expenses` table where `COALESCE(posted_date, date)` falls within the cycle period (inclusive of start and end dates).
- **totalPayments**: Sum of `amount` from the `credit_card_payments` table where `payment_date` falls within the cycle period (inclusive of start and end dates).

The formula is floored at zero — if payments exceed the sum of the previous balance and expenses, the calculated balance is set to zero rather than going negative.

This formula is used consistently across all three code paths that compute calculated balances:
1. **Scheduler auto-generation** (`billingCycleSchedulerService.processCard`) — background cron job
2. **History service auto-generation** (`billingCycleHistoryService.autoGenerateBillingCycles`) — on-demand generation
3. **Balance recalculation** (`billingCycleHistoryService.recalculateBalance`) — refreshes auto-generated cycle balances when viewed

All three paths call a shared `calculateCycleBalance()` method to ensure consistency. When the history service generates multiple missing cycles, they are processed in chronological order (oldest first) so each cycle's carry-forward balance is available from the preceding generated cycle.

## Due Date Derivation

The due date is no longer stored on billing cycle records. Instead, it is derived at display time from the payment method's `payment_due_day` field:

- **Due date** = `payment_due_day` of the month following `cycle_end_date`
- If `payment_due_day` exceeds the number of days in that month, it is clamped to the last day of the month

**Examples:**

| cycle_end_date | payment_due_day | Derived Due Date |
|----------------|-----------------|------------------|
| 2026-01-15     | 1               | 2026-02-01       |
| 2026-01-15     | 28              | 2026-02-28       |
| 2026-01-31     | 30              | 2026-02-28       |
| 2026-03-15     | 15              | 2026-04-15       |

This ensures a single source of truth — the `payment_due_day` on the payment method — rather than storing a redundant date on each billing cycle record.

## Migration

The migration automatically:

1. Creates the `billing_cycle_history` table
2. Migrates existing statement data from `credit_card_statements` table
3. Preserves all historical data

## Backward Compatibility

- Existing credit cards continue to work without changes
- Statement balance calculation remains available for cards without billing cycle history
- Payment reminders use billing cycle history when available, fall back to calculated balance

## Related Documentation

- [Configurable Payment Methods](./CONFIGURABLE_PAYMENT_METHODS.md) - Payment method management
- [API Documentation](../API_DOCUMENTATION.md) - Full API reference

---

**Last Updated:** February 9, 2026  
**Status:** Active
