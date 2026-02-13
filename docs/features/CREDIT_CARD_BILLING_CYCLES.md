# Credit Card Billing Cycle History

**Version**: 5.4.0  
**Status**: Implemented  
**Spec**: `.kiro/specs/credit-card-billing-cycle-history/`, `.kiro/specs/unified-billing-cycles/`, `.kiro/specs/billing-cycle-automation/`

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
- **Optional Fields**: Minimum payment, due date, and notes when available
- **PDF Indicator**: Shows when a statement PDF is attached

### Scheduled Billing Cycle Auto-Generation

Billing cycle records are created automatically by a background scheduler, replacing the previous approach where cycles were generated on-demand when opening the credit card detail view.

**How It Works:**

- A `node-cron` background task runs inside the Express server process on a configurable schedule (default: daily at 2:00 AM)
- On each run, the scheduler scans all active credit cards with a configured `billing_cycle_day`
- For any completed billing cycle period without a corresponding record, the scheduler creates an auto-generated cycle
- Auto-generated cycles have `is_user_entered = 0`, `actual_statement_balance = 0`, and a `calculated_statement_balance` derived from tracked expenses in the cycle period
- The calculated balance uses `COALESCE(original_cost, amount)` for expenses where `COALESCE(posted_date, date)` falls within the cycle dates (inclusive)

**Startup Behavior:**

- On server startup, an initial check runs after 60 seconds to catch any cycles missed during downtime
- This ensures no billing cycles are missed even if the server was offline when the cron job would have fired

**Configuration:**

The cron schedule is configurable via the `BILLING_CYCLE_CRON` environment variable:

| Variable | Default | Description |
|----------|---------|-------------|
| `BILLING_CYCLE_CRON` | `0 2 * * *` (daily at 2:00 AM) | Cron expression controlling how often the scheduler runs |

Docker Compose example:
```yaml
services:
  expense-tracker:
    environment:
      - BILLING_CYCLE_CRON=0 2 * * *
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
- Optionally add minimum payment, due date, and notes
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
| due_date | TEXT | Payment due date (optional) |
| notes | TEXT | User notes (optional) |
| statement_pdf_path | TEXT | Path to uploaded statement PDF (optional) |
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
      "due_date": "2026-03-01",
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
  "due_date": "2026-03-01",
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
   - User has entered minimum_payment, due_date, notes, OR
   - User has entered a non-zero actual_statement_balance
   - → Use `actual_statement_balance` (balance_type: "actual")

2. Otherwise:
   - → Use `calculated_statement_balance` (balance_type: "calculated")

This allows users to explicitly enter $0.00 for unused credit cards while still showing calculated balances for cycles that haven't been reviewed.

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

**Last Updated:** February 3, 2026  
**Status:** Active
