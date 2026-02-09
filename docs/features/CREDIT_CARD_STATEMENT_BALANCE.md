# Credit Card Statement Balance Calculation

**Feature Version:** 4.9.0  
**Last Updated:** February 9, 2026  
**Status:** Active

## Overview

The Credit Card Statement Balance feature automatically calculates the amount due from the previous billing cycle and provides smart payment alerts. This enables the system to distinguish between "statement paid in full" and "partial payment made", suppressing alerts when statements are paid while still showing required payment amounts when due.

## Problem Statement

Before this feature, credit card payment alerts checked `current_balance` to determine if a reminder should be shown. This caused issues:
- Alerts showed even when the statement was paid in full (because new charges existed)
- No way to distinguish between "paid the statement" vs "made a partial payment"
- Users couldn't see how much they actually owed from the previous statement
- Current balance included charges from the current cycle that aren't due yet

## Solution

The system now:
1. Requires billing cycle configuration for credit cards
2. Automatically calculates statement balance based on expenses within the billing cycle
3. Suppresses alerts when statement balance is paid
4. Shows required payment amount in reminders (similar to loan balance reminders)

## Key Concepts

### Statement Balance vs Current Balance

**Statement Balance:**
- Amount due from the previous billing cycle
- Sum of expenses posted during the previous cycle
- Minus any payments made toward that statement
- This is what you need to pay to avoid interest

**Current Balance:**
- Total outstanding balance on the credit card
- Includes both statement charges AND new charges from current cycle
- Used for utilization tracking
- May be higher than statement balance

### Billing Cycle

The period between credit card statements, defined by the statement closing day.

**Example:** If `billing_cycle_day` is 15:
- Previous cycle: 16th of two months ago to 15th of previous month
- Current cycle: 16th of previous month to 15th of current month
- Payment due: Typically 21-25 days after statement closes

## Key Features

### 1. Mandatory Billing Cycle Configuration

Credit cards now require:
- `billing_cycle_day` (1-31): Day of month when statement closes
- `payment_due_day` (1-31): Day of month when payment is due

### 2. Automatic Statement Balance Calculation

The system calculates statement balance as:
```
Statement Balance = 
  (Sum of expenses in previous billing cycle) 
  - (Payments made since statement date)
  - (Floor at zero for overpayments)
```

### 3. Smart Payment Alerts

**Alert Logic:**
- If statement balance > 0 AND due date within 7 days → Show reminder with amount
- If statement balance ≤ 0 → Suppress reminder (statement paid)
- If no billing cycle configured → Fall back to current_balance (backward compatibility)

### 4. Enhanced Reminder Display

Reminders now show:
- Required payment amount (statement balance)
- Payment due date
- Credit card name
- Urgency indicator (overdue, due soon, paid)

## User Interface

### Payment Method Form

When creating/editing a credit card:
1. Billing Cycle Day field (required)
   - Label: "Statement Closing Day"
   - Help text: "The day your statement closes each month (1-31)"
   - Validation: Must be between 1 and 31
2. Payment Due Day field (required)
   - Label: "Payment Due Day"
   - Help text: "The day your payment is due each month (1-31)"
   - Validation: Must be between 1 and 31

### Credit Card Detail View

Displays:
- **Statement Balance**: Amount due from previous cycle
- **Current Balance**: Total outstanding balance
- **Statement Status**: "Paid" or amount remaining
- **Billing Cycle Dates**: Current statement period
- **Payment Due Date**: When payment is due

**Example Display:**
```
Statement Balance: $450.00 (Due Feb 20)
Current Balance: $650.00
Status: $450.00 due in 5 days

Current Billing Cycle: Jan 16 - Feb 15
```

### Payment Reminders

**When Statement Unpaid:**
```
💳 CIBC MC Payment Due
$450.00 due in 5 days (Feb 20)
[Pay Now] [View Details]
```

**When Statement Paid:**
```
✓ CIBC MC Statement Paid
Current balance: $200.00 (new charges)
```

## Database Schema

### payment_methods Table

```sql
ALTER TABLE payment_methods ADD COLUMN billing_cycle_day INTEGER;

-- Migration: Copy billing_cycle_end to billing_cycle_day for existing cards
UPDATE payment_methods 
SET billing_cycle_day = billing_cycle_end 
WHERE type = 'credit_card' AND billing_cycle_end IS NOT NULL;
```

**Fields:**
- `billing_cycle_day` (INTEGER, nullable): Day of month when statement closes
- Retains `billing_cycle_start` and `billing_cycle_end` for backward compatibility

## API Endpoints

### Create/Update Payment Method

**Request (Credit Card):**
```json
{
  "type": "credit_card",
  "display_name": "CIBC MC",
  "full_name": "CIBC Mastercard",
  "credit_limit": 5000.00,
  "billing_cycle_day": 15,
  "payment_due_day": 10
}
```

**Validation:**
- `billing_cycle_day` required for credit cards (1-31)
- `payment_due_day` required for credit cards (1-31)
- Cannot set to null once configured

### Get Payment Method with Statement Balance

**Response:**
```json
{
  "id": 4,
  "type": "credit_card",
  "display_name": "CIBC MC",
  "current_balance": 650.00,
  "statement_balance": 450.00,
  "billing_cycle_day": 15,
  "payment_due_day": 10,
  "days_until_due": 5,
  "statement_paid": false
}
```

### Get Credit Card Reminders

**Response:**
```json
{
  "creditCardReminders": [
    {
      "paymentMethodId": 4,
      "displayName": "CIBC MC",
      "statementBalance": 450.00,
      "currentBalance": 650.00,
      "daysUntilDue": 5,
      "paymentDueDate": "2026-02-20",
      "isOverdue": false
    }
  ]
}
```

## Technical Implementation

### Statement Balance Service

**statementBalanceService.js:**

```javascript
calculateStatementBalance(paymentMethod, expenses, payments) {
  // Determine previous billing cycle dates
  const { startDate, endDate } = this.getPreviousCycle(
    paymentMethod.billing_cycle_day
  );
  
  // Sum expenses in previous cycle
  const cycleExpenses = expenses
    .filter(e => {
      const effectiveDate = e.posted_date || e.date;
      return effectiveDate >= startDate && effectiveDate <= endDate;
    })
    .reduce((sum, e) => sum + e.amount, 0);
  
  // Subtract payments made since statement date
  const cyclePayments = payments
    .filter(p => p.payment_date > endDate)
    .reduce((sum, p) => sum + p.amount, 0);
  
  // Floor at zero (no negative balances)
  return Math.max(0, cycleExpenses - cyclePayments);
}
```

### Reminder Service Integration

**reminderService.js:**

```javascript
async getCreditCardReminders() {
  const creditCards = await this.getCreditCardsWithBillingCycles();
  
  return creditCards
    .map(card => {
      const statementBalance = this.calculateStatementBalance(card);
      const daysUntilDue = this.calculateDaysUntilDue(card.payment_due_day);
      
      // Suppress if statement paid or not due soon
      if (statementBalance <= 0 || daysUntilDue > 7) {
        return null;
      }
      
      return {
        paymentMethodId: card.id,
        displayName: card.display_name,
        statementBalance,
        daysUntilDue,
        isOverdue: daysUntilDue < 0
      };
    })
    .filter(reminder => reminder !== null);
}
```

## Use Cases

### Use Case 1: Statement Paid in Full

**Scenario:** User pays entire statement balance before due date.

**Steps:**
1. Statement closes on Feb 15 with $450 balance
2. User makes $450 payment on Feb 18
3. User makes new purchases totaling $200

**Result:**
- Statement balance: $0 (paid)
- Current balance: $200 (new charges)
- No payment reminder shown
- Status shows "Statement Paid"

### Use Case 2: Partial Payment

**Scenario:** User makes partial payment toward statement.

**Steps:**
1. Statement closes on Feb 15 with $450 balance
2. User makes $200 payment on Feb 18
3. Payment due date is Feb 20

**Result:**
- Statement balance: $250 (remaining)
- Current balance: $250 + new charges
- Reminder shows "$250 due in 2 days"

### Use Case 3: New Charges During Grace Period

**Scenario:** User paid statement but made new purchases.

**Steps:**
1. Statement closes on Feb 15 with $450 balance
2. User pays $450 on Feb 18
3. User makes $300 in new purchases

**Result:**
- Statement balance: $0 (paid)
- Current balance: $300 (new charges)
- No reminder (statement paid)
- New charges will be on next statement

## Migration

### Database Migration

```javascript
// Add billing_cycle_day column
db.run(`ALTER TABLE payment_methods ADD COLUMN billing_cycle_day INTEGER`);

// Migrate existing credit cards
db.run(`
  UPDATE payment_methods 
  SET billing_cycle_day = billing_cycle_end 
  WHERE type = 'credit_card' AND billing_cycle_end IS NOT NULL
`);
```

**Impact:**
- Existing credit cards without billing cycles continue using current_balance
- Cards with billing_cycle_end get migrated to billing_cycle_day
- Backward compatible with old reminder logic

## Testing

### Property-Based Tests

**statementBalanceService.billingCycle.pbt.test.js:**
- Billing cycle date calculation
- Statement period determination
- Edge cases (month boundaries, leap years)

**statementBalanceService.expense.pbt.test.js:**
- Expense inclusion in statement
- Posted date vs transaction date handling
- Cycle boundary conditions

**statementBalanceService.payment.pbt.test.js:**
- Payment impact on statement balance
- Payment timing (before/after statement date)
- Overpayment scenarios

**statementBalanceService.floor.pbt.test.js:**
- Zero floor for negative balances
- Overpayment handling
- Balance never goes negative

### Integration Tests

**reminderService.alertSuppression.pbt.test.js:**
- Alert suppression when statement paid
- Alert display when balance remains
- Backward compatibility with no billing cycle

**reminderService.alertShow.pbt.test.js:**
- Alert display logic
- Required payment amount
- Days until due calculation

## Best Practices

### For Users

1. **Configure billing cycles**: Set up billing_cycle_day and payment_due_day for accurate tracking
2. **Pay statement balance**: Focus on paying the statement balance to avoid interest
3. **Monitor current balance**: Track current balance for utilization and spending awareness
4. **Review reminders**: Check reminders 7 days before due date

### For Developers

1. **Use statement balance for alerts**: Don't use current_balance for payment reminders
2. **Handle missing billing cycles**: Fall back gracefully for cards without cycles
3. **Floor at zero**: Statement balance should never be negative
4. **Use posted dates**: Prefer posted_date over date for accurate cycle assignment

## Related Features

- [Configurable Payment Methods](./CONFIGURABLE_PAYMENT_METHODS.md) - Credit card management
- [Credit Card Billing Cycles](./CREDIT_CARD_BILLING_CYCLES.md) - Billing cycle history
- [Credit Card Posted Date](./CREDIT_CARD_POSTED_DATE.md) - Posted date support

## Future Enhancements

- Statement balance history tracking
- Minimum payment calculation
- Interest charge estimation
- Statement PDF import and parsing
- Automatic payment scheduling

---

**Documentation Version:** 1.0  
**Feature Status:** Production Ready  
**Spec Location:** `archive/specs/credit-card-statement-balance/`
