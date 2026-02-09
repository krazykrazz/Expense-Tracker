# Credit Card Posted Date Support

**Feature Version:** 4.8.0  
**Last Updated:** February 9, 2026  
**Status:** Active

## Overview

The Credit Card Posted Date feature allows users to distinguish between transaction date and posted date for credit card expenses. This is essential for users who pre-log future expenses and need accurate credit card balance calculations that reflect when expenses actually post to their credit card statement, not just when the transaction occurred.

## Problem Statement

Users who pre-log expenses (entering them before they occur) faced inaccurate credit card balances because the system counted all expenses immediately, even if they hadn't posted to the credit card yet. This made it difficult to:
- Track actual current credit card balance
- Reconcile with credit card statements
- Understand which transactions are pending vs. posted

## Solution

The system now supports an optional `posted_date` field for credit card expenses:
- **Transaction Date**: When the purchase occurred (existing `date` field)
- **Posted Date**: When the expense posts to the credit card statement (new `posted_date` field)

Credit card balance calculations use the posted date to determine which expenses should be included in the current balance.

## Key Features

### 1. Optional Posted Date Field

- Appears only when a credit card payment method is selected
- Can be left empty (defaults to using transaction date)
- Can be set to NULL to indicate a pending transaction
- Must be on or after the transaction date

### 2. Smart Balance Calculation

The system uses `COALESCE(posted_date, date)` to determine the effective posting date:
- If `posted_date` is set, use it for balance calculations
- If `posted_date` is NULL and transaction date is past/current, include in balance
- If `posted_date` is NULL and transaction date is future, exclude from balance

### 3. Backward Compatibility

- Existing expenses work without modification
- NULL posted_date means "use transaction date"
- Non-credit card expenses ignore the posted_date field
- All other views (expense lists, reports, budgets) continue using transaction date

## User Interface

### Expense Form

When a credit card payment method is selected:
1. Posted Date field appears below the transaction date
2. Placeholder text shows "Uses transaction date" when empty
3. Field can be cleared to indicate pending transaction
4. Validation ensures posted date ≥ transaction date

### Credit Card Detail View

- Balance calculations reflect only posted transactions
- Pending transactions (NULL posted_date with future date) are excluded
- Current balance accurately matches credit card statement

## Database Schema

### expenses Table

```sql
ALTER TABLE expenses ADD COLUMN posted_date TEXT;
CREATE INDEX idx_expenses_posted_date ON expenses(posted_date);
```

**Fields:**
- `posted_date` (TEXT, nullable): The date when the expense posted to the credit card statement
- Uses TEXT type for consistency with existing date fields
- NULL indicates "use transaction date for balance calculations"

## API Endpoints

### Create/Update Expense

**Request:**
```json
{
  "date": "2026-02-15",
  "place": "Amazon",
  "amount": 50.00,
  "type": "Shopping",
  "method": "CIBC MC",
  "posted_date": "2026-02-17"  // Optional
}
```

**Validation:**
- `posted_date` must be NULL or valid YYYY-MM-DD format
- `posted_date` must be >= `date`
- Error if `posted_date` < `date`: "Posted date cannot be before transaction date"

### Get Expense

**Response:**
```json
{
  "id": 123,
  "date": "2026-02-15",
  "place": "Amazon",
  "amount": 50.00,
  "type": "Shopping",
  "method": "CIBC MC",
  "posted_date": "2026-02-17"
}
```

## Use Cases

### Use Case 1: Pre-logging Future Expenses

**Scenario:** User knows they'll make a purchase tomorrow but it won't post for 2 days.

**Steps:**
1. Create expense with date = tomorrow
2. Set posted_date = 2 days from now
3. Credit card balance doesn't change until posted_date arrives

**Result:** Accurate balance tracking for planned expenses.

### Use Case 2: Pending Transactions

**Scenario:** User made a purchase that hasn't posted yet.

**Steps:**
1. Create expense with date = today
2. Leave posted_date empty (NULL)
3. Transaction appears in expense list but not in credit card balance

**Result:** User can track pending transactions separately from posted balance.

### Use Case 3: Immediate Posting

**Scenario:** User makes a purchase that posts immediately.

**Steps:**
1. Create expense with date = today
2. Leave posted_date empty (defaults to transaction date)
3. Transaction immediately affects credit card balance

**Result:** Standard expense entry workflow unchanged.

## Technical Implementation

### Balance Calculation Logic

```javascript
// Effective posting date for balance calculations
const effectiveDate = expense.posted_date || expense.date;

// Only include if posted on or before today
if (effectiveDate <= today) {
  balance += expense.amount;
}
```

### Service Layer

**expenseService.js:**
- Validates posted_date format and relationship to transaction date
- Passes posted_date to repository layer

**paymentMethodService.js:**
- Uses `COALESCE(posted_date, date)` in balance queries
- Filters by effective date <= current date

### Repository Layer

**expenseRepository.js:**
```sql
SELECT SUM(amount) as balance
FROM expenses
WHERE payment_method_id = ?
  AND COALESCE(posted_date, date) <= date('now')
```

## Migration

### Database Migration

```javascript
// Migration adds column without modifying existing data
db.run(`ALTER TABLE expenses ADD COLUMN posted_date TEXT`);
db.run(`CREATE INDEX idx_expenses_posted_date ON expenses(posted_date)`);
```

**Impact:**
- Existing expenses have NULL posted_date
- NULL is treated as "use transaction date"
- No data migration required
- Backward compatible

## Testing

### Property-Based Tests

**expenseService.postedDate.pbt.test.js:**
- Posted date validation properties
- Balance calculation correctness
- Effective date determination

**expenseService.postedDateValidation.pbt.test.js:**
- Date relationship validation
- Format validation
- Error message correctness

### Integration Tests

**expenseController.postedDate.test.js:**
- API endpoint validation
- Error handling
- Response format

## Best Practices

### For Users

1. **Leave empty for immediate posting**: Most expenses post quickly, so leaving posted_date empty is fine
2. **Use for pre-logging**: Set posted_date when entering future expenses
3. **Track pending transactions**: Leave posted_date NULL for pending transactions
4. **Update when posted**: Update posted_date once you see the transaction on your statement

### For Developers

1. **Always use COALESCE**: Use `COALESCE(posted_date, date)` for balance calculations
2. **Validate relationships**: Ensure posted_date >= date
3. **Maintain backward compatibility**: NULL posted_date must work correctly
4. **Index performance**: Use the posted_date index for efficient queries

## Related Features

- [Configurable Payment Methods](./CONFIGURABLE_PAYMENT_METHODS.md) - Credit card management
- [Credit Card Billing Cycles](./CREDIT_CARD_BILLING_CYCLES.md) - Statement tracking
- [Credit Card Statement Balance](./CREDIT_CARD_STATEMENT_BALANCE.md) - Statement balance calculation

## Future Enhancements

- Bulk update posted dates from statement imports
- Automatic posted date estimation based on historical patterns
- Visual indicators for pending vs. posted transactions in expense list
- Posted date filtering in expense list

---

**Documentation Version:** 1.0  
**Feature Status:** Production Ready  
**Spec Location:** `archive/specs/credit-card-posted-date/`
