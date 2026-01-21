# Future Balance Bug Fix

## Issue Description

When a user added a future loan payment (balance entry for a future month), the monthly summary was displaying that future balance instead of the current balance for the selected month.

### Example Scenario

1. Loan has initial balance of $10,000 in January 2024
2. User adds balance entry for March 2024: $9,000
3. User adds balance entry for June 2024: $8,000 (future payment)
4. When viewing March 2024 summary, it showed $8,000 instead of $9,000

## Root Cause

The `getLoansForMonth()` method in `loanRepository.js` was using this SQL query:

```sql
SELECT 
  l.*,
  COALESCE(lb.remaining_balance, l.initial_balance) as currentBalance,
  COALESCE(lb.rate, 0) as currentRate
FROM loans l
LEFT JOIN (
  SELECT 
    loan_id,
    remaining_balance,
    rate,
    ROW_NUMBER() OVER (PARTITION BY loan_id ORDER BY year DESC, month DESC) as rn
  FROM loan_balances
) lb ON l.id = lb.loan_id AND lb.rn = 1
WHERE date(l.start_date) <= date(?)
```

The subquery was selecting the most recent balance entry (`ORDER BY year DESC, month DESC`) **without any date filtering**, so it would always pick the latest entry regardless of whether it was in the past or future.

## Solution

Updated the SQL query to filter balance entries to only include those up to and including the selected month:

```sql
SELECT 
  l.*,
  COALESCE(lb.remaining_balance, l.initial_balance) as currentBalance,
  COALESCE(lb.rate, 0) as currentRate
FROM loans l
LEFT JOIN (
  SELECT 
    loan_id,
    remaining_balance,
    rate,
    ROW_NUMBER() OVER (
      PARTITION BY loan_id 
      ORDER BY year DESC, month DESC
    ) as rn
  FROM loan_balances
  WHERE (year < ? OR (year = ? AND month <= ?))
) lb ON l.id = lb.loan_id AND lb.rn = 1
WHERE date(l.start_date) <= date(?)
```

The key change is the `WHERE` clause in the subquery:
```sql
WHERE (year < ? OR (year = ? AND month <= ?))
```

This ensures we only consider balance entries where:
- The year is before the selected year, OR
- The year matches AND the month is less than or equal to the selected month

## Testing

Created comprehensive tests in `testFutureBalanceBug.js` that verify:

1. ✓ January shows initial balance (no entries yet)
2. ✓ February shows February balance
3. ✓ March shows March balance (ignores future June entry)
4. ✓ April shows most recent past balance (March)
5. ✓ May shows most recent past balance (March)
6. ✓ June shows June balance when viewing June

All tests pass successfully.

## Impact

**Critical Fix** - This ensures users see accurate current balances in their monthly summaries, not future projections. Without this fix, users could be confused about their actual current debt levels.

## Files Modified

- `backend/repositories/loanRepository.js` - Updated `getLoansForMonth()` method
- `backend/scripts/testFutureBalanceBug.js` - New test file for this specific scenario
- `backend/scripts/testLoansIntegration.js` - Added future balance test cases

## Deployment Notes

This is a backend-only fix. No frontend changes required. The fix is backward compatible and will work with existing data.
