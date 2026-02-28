# Loan Payment Tracking Feature

**Version**: 5.x  
**Status**: Completed  
**Spec**: `.kiro/specs/loan-payment-tracking/`, `.kiro/specs/fixed-expense-loan-linkage/`, and `.kiro/specs/mortgage-balance-interest-tracking/`

## Overview

Payment-based tracking system for loans and mortgages, replacing the balance-entry approach for traditional loans. The system stores individual payment records and calculates the current balance dynamically. For mortgages, the balance calculation incorporates interest accrual using the formula `balance × (rate / 100) / 12` per month, producing accurate balances that reflect real-world mortgage amortization. This approach is more intuitive for users who make regular payments and want to track their debt reduction progress.

Lines of credit continue to use balance-based tracking due to their variable usage patterns.

## Features

### Payment Tracking
- Record individual loan payments with date and optional notes
- View payment history in reverse chronological order
- Edit or delete payment entries
- Running balance calculation showing balance after each payment
- Payment suggestions based on loan type and history

### Balance Calculation
- Dynamic balance calculation: `current_balance = initial_balance - sum(payments)` (non-mortgage loans)
- Balance never goes negative (floored at zero)
- Total payments and payment count tracking
- Last payment date display

### Interest-Aware Balance Calculation (Mortgages)
- Mortgage balances use interest accrual: `(previous_balance + monthly_interest) - payment_amount`
- Monthly interest is calculated as `balance × (rate / 100) / 12`
- The system walks forward month-by-month from the most recent balance snapshot (anchor), accruing interest and subtracting payments
- If a balance snapshot exists, it becomes the anchor; otherwise the initial balance at the start date is used
- Interest rate is resolved from the most recent `loan_balances` entry with a non-null rate on or before each month
- If no interest rate is available, falls back to naive subtraction (`initial_balance - sum(payments)`)
- Shared interest calculation utility (`backend/utils/interestCalculation.js`) provides the canonical formula used by both the accrual engine and `MortgageInsightsService`

### Balance Override (Mortgages)
- When recording a mortgage payment, users can optionally provide an "Override Balance" value
- This creates a balance snapshot in the `loan_balances` table that becomes the new anchor for future calculations
- Useful for correcting drift between the app's calculated balance and the actual mortgage statement balance
- Override must be a non-negative number; negative values are rejected with a validation error
- A `balance_override_applied` activity log event is created with metadata including the override value, the calculated value that was replaced, and the mortgage name
- Override is silently ignored for non-mortgage loans

### Payment Suggestions
- **Mortgages**: Suggests the monthly_payment amount from loan settings
- **Traditional Loans**: Suggests average of previous payment amounts
- **No History**: Returns null with guidance message

### Migration Support
- Convert existing balance entries to payment entries
- Preview migration before executing
- Preserves original balance entries for reference
- Skips balance increases (only converts decreases to payments)

### Fixed Expense Loan Linkage
- Link fixed expenses to loans for payment tracking
- Optional payment due day (1-31) for reminder generation
- Loan payment reminders when due date approaches
- Auto-log payment suggestions when due date arrives

## Usage

### Recording a Loan Payment
1. Open Loans modal from the main interface
2. Click on a loan (not line of credit)
3. Navigate to "Payment History" section (non-mortgage loans)
4. Click "Add Payment"
5. Enter payment amount, date, and optional notes
6. For mortgages: optionally provide an "Override Balance" to correct drift from actual statement balance
7. Save - balance updates automatically

### Viewing Payment History
1. Open loan details
2. For non-mortgage loans, view "Payment History" section showing:
   - Payment date
   - Payment amount
   - Running balance after payment
   - Optional notes
3. Note: The LoanPaymentHistory component (individual payment list) is hidden for mortgages since mortgage payments are tracked via the balance calculation engine, not as individual editable entries

### Viewing Payment Amount History (Mortgages)
The "Payment Amount History" section (formerly "Payment Tracking") tracks when the recurring mortgage payment amount changes (e.g., after a rate renewal), NOT individual payments.
- Section heading: "Payment Amount History"
- Add button: "+ Add Payment Amount Change"
- Empty state: "No payment amount changes recorded yet"

### Using Payment Suggestions
1. When adding a payment, click "Use Suggested Amount"
2. For mortgages: Uses monthly payment from loan settings
3. For loans: Uses average of previous payments
4. Adjust amount if needed before saving

### Migrating Balance Entries
1. Open loan details
2. Click "Migrate Balance Entries" button
3. Review preview of what will be converted
4. Confirm migration
5. Payment entries created from balance decreases

### Linking Fixed Expenses to Loans
1. Open Fixed Expenses modal
2. Edit or create a fixed expense
3. Set "Payment Due Day" (1-31)
4. Select "Linked Loan" from dropdown (active loans only)
5. Save - reminders will appear when due date approaches

### Auto-Logging Payments
1. When a linked fixed expense is due, a reminder banner appears
2. Click "Log Payment" on the reminder
3. Confirm the payment details
4. Payment is automatically created for the linked loan

## API Endpoints

### Loan Payments
- `POST /api/loans/:loanId/payments` - Create a payment entry
- `GET /api/loans/:loanId/payments` - Get all payments for a loan
- `GET /api/loans/:loanId/payments/:id` - Get a specific payment
- `PUT /api/loans/:loanId/payments/:id` - Update a payment entry
- `DELETE /api/loans/:loanId/payments/:id` - Delete a payment entry

### Balance Calculation
- `GET /api/loans/:loanId/calculated-balance` - Get calculated balance

### Payment Suggestions
- `GET /api/loans/:loanId/payment-suggestion` - Get suggested payment amount

### Migration
- `POST /api/loans/:loanId/migrate-balances` - Convert balance entries to payments
- `GET /api/loans/:loanId/migrate-balances/preview` - Preview migration

### Auto-Log
- `POST /api/loans/:loanId/loan-payments/auto-log` - Auto-log payment from fixed expense

### Reminders (Extended)
- `GET /api/reminders/status/:year/:month` - Now includes `loanPaymentReminders`

## Database Schema

### Loan Payments Table (New)
```sql
CREATE TABLE IF NOT EXISTS loan_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL,
  amount REAL NOT NULL CHECK(amount > 0),
  payment_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_loan_payments_loan_id ON loan_payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_date ON loan_payments(payment_date);
```

### Fixed Expenses Table (Extended)
```sql
-- New columns added to fixed_expenses table
payment_due_day INTEGER CHECK(payment_due_day >= 1 AND payment_due_day <= 31),
linked_loan_id INTEGER REFERENCES loans(id) ON DELETE SET NULL
```

## API Response Examples

### Create Payment
```json
POST /api/loans/1/payments
{
  "amount": 500.00,
  "payment_date": "2026-01-15",
  "notes": "Monthly payment"
}

Response:
{
  "id": 1,
  "loan_id": 1,
  "amount": 500.00,
  "payment_date": "2026-01-15",
  "notes": "Monthly payment",
  "created_at": "2026-01-15T10:30:00Z"
}
```

### Get Calculated Balance
```json
GET /api/loans/1/calculated-balance

Response (non-mortgage):
{
  "loanId": 1,
  "initialBalance": 10000.00,
  "totalPayments": 2500.00,
  "currentBalance": 7500.00,
  "paymentCount": 5,
  "lastPaymentDate": "2026-01-15"
}

Response (mortgage with interest accrual):
{
  "loanId": 1,
  "initialBalance": 200000.00,
  "totalPayments": 15000.00,
  "currentBalance": 192500.00,
  "totalInterestAccrued": 7500.00,
  "interestAware": true,
  "paymentCount": 10,
  "lastPaymentDate": "2026-02-15"
}
```

New fields for mortgages:
- `totalInterestAccrued`: Sum of all monthly interest applied across the calculation period
- `interestAware`: Boolean indicating interest accrual was used (false when no rate is available)

### Balance History

The `getBalanceHistory()` endpoint returns `interestAccrued` and `principalPaid` per entry for mortgages:

```json
GET /api/loans/1/balance-history

Response (mortgage entry):
{
  "id": 12,
  "date": "2025-01-15",
  "payment": 2500.00,
  "notes": "January payment",
  "runningBalance": 478500.25,
  "interestAccrued": 1950.50,
  "principalPaid": 549.50
}
```

### Get Payment Suggestion
```json
GET /api/loans/1/payment-suggestion

Response:
{
  "suggestedAmount": 500.00,
  "source": "monthly_payment",
  "confidence": "high",
  "message": "Based on your monthly payment setting"
}
```

### Loan Payment Reminders
```json
GET /api/reminders/status/2026/01

Response:
{
  "loanPaymentReminders": {
    "overdueCount": 1,
    "dueSoonCount": 2,
    "overduePayments": [...],
    "dueSoonPayments": [
      {
        "fixedExpenseId": 5,
        "fixedExpenseName": "Car Payment",
        "amount": 350.00,
        "paymentDueDay": 15,
        "daysUntilDue": 3,
        "loanId": 2,
        "loanName": "Car Loan",
        "loanType": "loan",
        "isOverdue": false,
        "isDueSoon": true,
        "hasPaymentThisMonth": false
      }
    ]
  }
}
```

## Components

### Frontend
- `LoanPaymentForm.jsx` - Payment entry form
- `LoanPaymentHistory.jsx` - Payment history list with running balances
- `MigrationUtility.jsx` - Balance-to-payment migration tool
- `PaymentBalanceChart.jsx` - Visual payment/balance chart
- `LoanPaymentReminderBanner.jsx` - Reminder banner for due payments
- `AutoLogPrompt.jsx` - Auto-log confirmation dialog

### Backend
- `loanPaymentService.js` - Payment CRUD, validation, and balance override processing
- `balanceCalculationService.js` - Dynamic balance calculation with interest accrual engine for mortgages
- `interestCalculation.js` - Shared utility for canonical monthly interest formula
- `paymentSuggestionService.js` - Payment amount suggestions
- `migrationService.js` - Balance-to-payment migration
- `autoPaymentLoggerService.js` - Auto-log payment creation (interest-aware for mortgages)
- `loanPaymentRepository.js` - Payment data access
- `reminderService.js` - Extended with loan payment reminders

## Loan Type Behavior

| Loan Type | Tracking Method | Payment Tracking | Balance Entries | Interest Accrual |
|-----------|-----------------|------------------|-----------------|------------------|
| Loan | Payment-based | ✅ Supported | Optional (legacy) | ❌ Naive subtraction |
| Mortgage | Payment-based | ✅ Supported (via balance engine) | Optional (legacy) | ✅ Interest-aware |
| Line of Credit | Balance-based | ❌ Not supported | Required | ❌ Not applicable |

Note: For mortgages, the `LoanPaymentHistory` component is hidden. Mortgage payments are tracked via the interest-aware balance calculation engine, and the `PaymentTrackingHistory` component (labeled "Payment Amount History") tracks payment amount changes over time.

## Benefits

- **Intuitive Tracking**: Record payments as they happen, like a checkbook
- **Automatic Calculation**: Balance updates automatically from payments
- **Payment History**: See complete payment history with running balances
- **Smart Suggestions**: Get payment amount suggestions based on history
- **Reminder Integration**: Get notified when loan payments are due
- **Auto-Log Convenience**: One-click payment logging from reminders
- **Migration Path**: Convert existing balance data to payment format

---

**Last Updated**: February 2026
