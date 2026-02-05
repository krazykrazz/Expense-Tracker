# Design Document: Fixed Expense Loan Linkage

## Overview

This feature extends the fixed expenses system to support loan payment tracking by adding optional due dates and loan linkages. When a fixed expense is linked to a loan, the system can provide payment reminders and offer to auto-log loan payments when due dates arrive.

The design follows the existing patterns established by the credit card reminder system, reusing the `calculateDaysUntilDue` method from `reminderService.js` and extending the reminder status API to include loan payment reminders.

## Architecture

The system extends three main areas:
1. Fixed expense data model with new optional fields
2. Reminder service with loan payment reminder logic
3. Frontend UI for configuration and alerts

### Component Interaction Flow

1. User sets optional payment_due_day and linked_loan_id via FixedExpensesModal
2. On app load, ReminderService queries linked fixed expenses with due dates
3. LoanPaymentReminderBanner shows upcoming/overdue loan payments
4. When user confirms auto-log, LoanPaymentService creates loan_payment entry

## Components and Interfaces

### Backend Components

#### FixedExpenseRepository (Extended)

- getFixedExpensesWithLoans(year, month): Returns fixed expenses with joined loan details
- getLinkedFixedExpensesWithDueDates(): Returns linked expenses for reminder calculation
- createFixedExpense(fixedExpense): Extended to include payment_due_day, linked_loan_id
- updateFixedExpense(id, updates): Extended to include payment_due_day, linked_loan_id

#### ReminderService (Extended)

- getLoanPaymentReminders(referenceDate): Returns loan payment reminder status
- Uses existing calculateDaysUntilDue method for consistency with credit card reminders

#### AutoPaymentLoggerService (New)

- createPaymentFromFixedExpense(fixedExpense, paymentDate): Creates loan_payment entry
- getPendingAutoLogSuggestions(year, month): Returns expenses eligible for auto-logging

### Frontend Components

#### FixedExpensesModal (Extended)

New form fields:
- payment_due_day: Number input (1-31), optional
- linked_loan_id: Dropdown of active loans, optional

Display enhancements:
- Show due day in expense list when configured
- Show loan indicator for linked expenses
- Show "Loan Paid Off" badge if linked loan is paid off

#### LoanPaymentReminderBanner (New)

Similar to CreditCardReminderBanner but for loan payments:
- Shows loan name, payment amount, days until due
- Distinct visual style (different color scheme)
- Click navigates to loan detail view

## Data Models

### Database Schema Changes

New columns for fixed_expenses table:
- payment_due_day: INTEGER (1-31), nullable
- linked_loan_id: INTEGER, FK to loans(id), ON DELETE SET NULL

Indexes for efficient queries:
- idx_fixed_expenses_linked_loan on linked_loan_id WHERE NOT NULL
- idx_fixed_expenses_due_day on payment_due_day WHERE NOT NULL

### Key Interfaces

FixedExpense (extended):
- payment_due_day: number | null (1-31)
- linked_loan_id: number | null (FK to loans)

LoanPaymentReminder:
- fixedExpenseId, fixedExpenseName, amount
- paymentDueDay, daysUntilDue
- loanId, loanName, loanType
- isOverdue, isDueSoon, hasPaymentThisMonth

### API Extensions

GET /api/fixed-expenses/:year/:month - Extended to include loan details
GET /api/reminders/status/:year/:month - Extended with loanPaymentReminders
POST /api/loans/:loanId/loan-payments/auto-log - New endpoint for auto-logging



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Fixed Expense Round-Trip with New Fields

*For any* fixed expense with valid payment_due_day (1-31 or null) and linked_loan_id (valid loan ID or null), creating the expense and then retrieving it should return the same payment_due_day and linked_loan_id values.

**Validates: Requirements 1.4, 2.3, 2.4**

### Property 2: Payment Due Day Validation

*For any* payment_due_day value outside the range 1-31 (including 0, negative numbers, and values > 31), the validation function should reject the input and return an error.

**Validates: Requirements 1.2**

### Property 3: Active Loans Filter

*For any* set of loans with various is_paid_off states, the loan dropdown query should return only loans where is_paid_off = 0, and the count of returned loans should equal the count of active loans in the input set.

**Validates: Requirements 2.2**

### Property 4: Loan Linkage Preservation on Paid-Off

*For any* fixed expense linked to a loan, when that loan is marked as paid off (is_paid_off = 1), the fixed expense's linked_loan_id should remain unchanged and the joined query should return is_paid_off = true.

**Validates: Requirements 2.6**

### Property 5: Reminder Inclusion Based on Days Until Due

*For any* linked fixed expense with a payment_due_day, if calculateDaysUntilDue returns a value between -∞ and 7 (inclusive) and no payment exists for the current month, the expense should be included in loan payment reminders. If days_until_due < 0, isOverdue should be true; if 0 ≤ days_until_due ≤ 7, isDueSoon should be true.

**Validates: Requirements 3.1, 3.2**

### Property 6: Reminder Content Completeness

*For any* loan payment reminder returned by getLoanPaymentReminders, the reminder object should contain non-null values for: fixedExpenseName, amount, paymentDueDay, daysUntilDue, loanId, and loanName.

**Validates: Requirements 3.3**

### Property 7: Reminder Suppression When Payment Exists

*For any* linked fixed expense where a loan_payment entry exists for the same loan_id in the current month, the reminder service should not include that expense in the reminders list (hasPaymentThisMonth = true, not in overduePayments or dueSoonPayments).

**Validates: Requirements 3.4**

### Property 8: Days Until Due Calculation Consistency

*For any* payment_due_day and reference_date, the result of calculateDaysUntilDue for loan payment reminders should equal the result when called for credit card reminders with the same inputs.

**Validates: Requirements 3.5**

### Property 9: Auto-Log Suggestion Eligibility

*For any* linked fixed expense where payment_due_day ≤ current day of month AND no loan_payment exists for the current month, getPendingAutoLogSuggestions should include that expense. If payment_due_day > current day OR payment exists, it should not be included.

**Validates: Requirements 4.1**

### Property 10: Auto-Logged Payment Attributes

*For any* fixed expense with linked_loan_id and amount, when createPaymentFromFixedExpense is called, the created loan_payment should have: loan_id equal to linked_loan_id, amount equal to fixed expense amount, payment_date equal to the provided date, and notes containing "Auto-logged from fixed expense".

**Validates: Requirements 4.2, 4.3, 4.4, 4.6**

### Property 11: Reminder Badge Count Accuracy

*For any* set of loan payment reminders, the count displayed in the reminder badge should equal the sum of overdueCount and dueSoonCount from the reminder status.

**Validates: Requirements 5.4**

### Property 12: Backward Compatibility

*For any* API request to create or update a fixed expense that omits payment_due_day and linked_loan_id fields, the operation should succeed and set those fields to null without affecting other fields.

**Validates: Requirements 6.3, 6.4**

### Property 13: Carry-Forward with New Fields

*For any* fixed expense with payment_due_day and/or linked_loan_id, when copyFixedExpenses is called to copy to a new month, the copied expense should have identical payment_due_day and linked_loan_id values as the source expense.

**Validates: Requirements 7.1, 7.2, 7.3**

## Error Handling

### Validation Errors

| Error Condition | Response | HTTP Status |
|-----------------|----------|-------------|
| payment_due_day < 1 or > 31 | "Payment due day must be between 1 and 31" | 400 |
| linked_loan_id references non-existent loan | "Invalid loan ID" | 400 |
| linked_loan_id references paid-off loan (on create) | Allow but warn in response | 200 |

### Database Errors

| Error Condition | Handling |
|-----------------|----------|
| Foreign key violation on linked_loan_id | Return 400 with "Invalid loan ID" |
| Migration failure | Rollback transaction, log error, throw |

### Edge Cases

- **Loan deleted after linkage**: ON DELETE SET NULL ensures linked_loan_id becomes null
- **Due day 29-31 in short months**: Use existing calculateDaysUntilDue logic that handles month-end
- **Multiple fixed expenses linked to same loan**: Each generates separate reminder

## Testing Strategy

### Unit Tests

Focus on specific examples and edge cases:
- Validation of boundary values (0, 1, 31, 32)
- Null handling for optional fields
- Loan dropdown filtering with mixed active/paid-off loans
- Reminder suppression when payment exists

### Property-Based Tests

Using fast-check library with minimum 100 iterations per property:

1. **Fixed expense round-trip** - Generate random valid fixed expenses with new fields
2. **Validation rejection** - Generate invalid payment_due_day values
3. **Active loans filter** - Generate random loan sets with various states
4. **Reminder inclusion** - Generate random dates and due days
5. **Auto-log attributes** - Generate random fixed expenses and verify payment creation
6. **Carry-forward** - Generate random fixed expenses and verify copy behavior

### Integration Tests

- End-to-end flow: Create linked fixed expense → Check reminders → Auto-log payment
- Migration test: Verify existing data unchanged after migration
- API backward compatibility: Test requests without new fields

### Test Configuration

```javascript
// Property test configuration
const PBT_ITERATIONS = 100;

// Tag format for property tests
// Feature: fixed-expense-loan-linkage, Property N: {property_text}
```
