# Fixed Expense Loan Linkage

**Feature Version:** 4.10.0  
**Last Updated:** February 9, 2026  
**Status:** Active

## Overview

The Fixed Expense Loan Linkage feature enables linking fixed expenses to loan payments, providing automatic payment logging and upcoming payment reminders. Users can associate recurring fixed expenses (like mortgage payments or car loan payments) with their corresponding loans, allowing the system to automatically track when payments are due and optionally log them when the due date arrives.

## Problem Statement

Users managing loans and fixed expenses faced several challenges:
- Manual entry of loan payments each month (duplicate work)
- No reminders for upcoming loan payments
- Difficulty tracking which fixed expenses correspond to which loans
- Risk of missing payment deadlines

## Solution

The system now allows users to:
1. Specify payment due dates for fixed expenses
2. Link fixed expenses to loans
3. Receive reminders for upcoming loan payments
4. Optionally auto-log loan payments from fixed expenses

This bridges the gap between fixed expense tracking and loan payment management.

## Key Features

### 1. Payment Due Dates

Fixed expenses can now have an optional `payment_due_day` (1-31):
- Specifies when the payment is due each month
- Used to calculate days until due
- Triggers reminders when payment is approaching

### 2. Loan Linkage

Fixed expenses can be linked to loans via `linked_loan_id`:
- Links to any active loan (loan, mortgage, or line of credit)
- Dropdown shows only active loans (not paid off)
- Linkage persists even if loan is paid off (with indicator)
- Carries forward when copying fixed expenses to new month

### 3. Loan Payment Reminders

Reminders appear when:
- Linked fixed expense has payment due within 7 days
- Payment is overdue (past due date this month)
- No payment has been logged for current month

Reminders show:
- Loan name
- Payment amount
- Days until due (or "overdue")
- Option to auto-log payment

### 4. Auto-Log Loan Payments

When a linked fixed expense reaches its due date:
- System offers to create loan payment entry
- Uses fixed expense amount as payment amount
- Uses due date as payment date
- Adds note indicating auto-logged from fixed expense
- User can confirm or dismiss

## User Interface

### Fixed Expenses Modal

**New Fields:**
1. **Payment Due Day** (optional)
   - Input field accepting 1-31
   - Label: "Payment Due Day"
   - Help text: "Day of month when payment is due"
   - Validation: Must be between 1 and 31

2. **Linked Loan** (optional)
   - Dropdown showing active loans
   - Label: "Link to Loan"
   - Shows loan name and type
   - Can be cleared to unlink

**Display:**
- Fixed expense list shows loan indicator for linked expenses
- Shows "Loan Paid Off" indicator if linked loan is paid off
- Shows due day in expense list

### Loan Payment Reminders

**Reminder Banner:**
```
🏦 Upcoming Loan Payments

Mortgage Payment - $2,500.00
Due in 3 days (Feb 12)
[Auto-Log Payment] [Dismiss]

Car Loan Payment - $450.00
Due in 5 days (Feb 14)
[Auto-Log Payment] [Dismiss]
```

**Overdue:**
```
⚠️ Overdue Loan Payments

Mortgage Payment - $2,500.00
Overdue by 2 days
[Log Payment Now] [Dismiss]
```

### Auto-Log Prompt

When clicking "Auto-Log Payment":
```
Log Loan Payment?

Loan: Mortgage
Amount: $2,500.00
Date: February 12, 2026

This will create a loan payment entry and update the loan balance.

[Confirm] [Cancel]
```

## Database Schema

### fixed_expenses Table

```sql
ALTER TABLE fixed_expenses ADD COLUMN payment_due_day INTEGER;
ALTER TABLE fixed_expenses ADD COLUMN linked_loan_id INTEGER;

ALTER TABLE fixed_expenses 
ADD CONSTRAINT fk_fixed_expense_loan 
FOREIGN KEY (linked_loan_id) REFERENCES loans(id);
```

**Fields:**
- `payment_due_day` (INTEGER, nullable): Day of month when payment is due (1-31)
- `linked_loan_id` (INTEGER, nullable): Foreign key to loans table

## API Endpoints

### Create/Update Fixed Expense

**Request:**
```json
{
  "name": "Mortgage Payment",
  "amount": 2500.00,
  "category": "Housing",
  "payment_type": "Debit",
  "payment_due_day": 12,
  "linked_loan_id": 5
}
```

**Validation:**
- `payment_due_day` must be between 1 and 31 (if provided)
- `linked_loan_id` must reference an existing loan (if provided)
- Both fields are optional

**Response:**
```json
{
  "id": 10,
  "name": "Mortgage Payment",
  "amount": 2500.00,
  "category": "Housing",
  "payment_type": "Debit",
  "payment_due_day": 12,
  "linked_loan_id": 5,
  "loan_name": "Mortgage",
  "loan_paid_off": false
}
```

### Get Loan Payment Reminders

**Endpoint:** `GET /api/reminders/loan-payments`

**Response:**
```json
{
  "loanPaymentReminders": [
    {
      "fixedExpenseId": 10,
      "loanId": 5,
      "loanName": "Mortgage",
      "amount": 2500.00,
      "daysUntilDue": 3,
      "dueDate": "2026-02-12",
      "isOverdue": false,
      "paymentLoggedThisMonth": false
    }
  ]
}
```

### Auto-Log Loan Payment

**Endpoint:** `POST /api/loan-payments/auto-log`

**Request:**
```json
{
  "fixedExpenseId": 10,
  "loanId": 5,
  "amount": 2500.00,
  "paymentDate": "2026-02-12"
}
```

**Response:**
```json
{
  "loanPayment": {
    "id": 45,
    "loan_id": 5,
    "amount": 2500.00,
    "payment_date": "2026-02-12",
    "notes": "Auto-logged from fixed expense: Mortgage Payment",
    "created_at": "2026-02-12T10:00:00Z"
  },
  "newBalance": 247500.00
}
```

## Technical Implementation

### Reminder Service

**reminderService.js:**

```javascript
async getLoanPaymentReminders() {
  // Get fixed expenses with loan linkage and due dates
  const linkedExpenses = await this.getLinkedFixedExpenses();
  
  return linkedExpenses
    .map(expense => {
      const daysUntilDue = this.calculateDaysUntilDue(expense.payment_due_day);
      
      // Check if payment already logged this month
      const paymentLogged = this.hasPaymentThisMonth(
        expense.linked_loan_id,
        new Date().getMonth(),
        new Date().getFullYear()
      );
      
      // Show reminder if due within 7 days and not yet paid
      if ((daysUntilDue <= 7 || daysUntilDue < 0) && !paymentLogged) {
        return {
          fixedExpenseId: expense.id,
          loanId: expense.linked_loan_id,
          loanName: expense.loan_name,
          amount: expense.amount,
          daysUntilDue,
          isOverdue: daysUntilDue < 0,
          paymentLoggedThisMonth: false
        };
      }
      
      return null;
    })
    .filter(reminder => reminder !== null);
}
```

### Auto Payment Logger Service

**autoPaymentLoggerService.js:**

```javascript
async autoLogPayment(fixedExpenseId, loanId, amount, paymentDate) {
  // Validate eligibility
  const fixedExpense = await this.getFixedExpense(fixedExpenseId);
  if (fixedExpense.linked_loan_id !== loanId) {
    throw new Error('Fixed expense not linked to this loan');
  }
  
  // Check if payment already exists for this month
  const existingPayment = await this.getPaymentForMonth(
    loanId,
    paymentDate.getMonth(),
    paymentDate.getFullYear()
  );
  
  if (existingPayment) {
    throw new Error('Payment already logged for this month');
  }
  
  // Create loan payment
  const payment = await loanPaymentService.createPayment({
    loan_id: loanId,
    amount,
    payment_date: paymentDate,
    notes: `Auto-logged from fixed expense: ${fixedExpense.name}`
  });
  
  return payment;
}
```

### Fixed Expense Repository

**fixedExpenseRepository.js:**

```javascript
async getLinkedFixedExpenses() {
  return db.all(`
    SELECT 
      fe.*,
      l.name as loan_name,
      l.is_paid_off as loan_paid_off
    FROM fixed_expenses fe
    LEFT JOIN loans l ON fe.linked_loan_id = l.id
    WHERE fe.linked_loan_id IS NOT NULL
      AND fe.payment_due_day IS NOT NULL
    ORDER BY fe.payment_due_day ASC
  `);
}
```

## Use Cases

### Use Case 1: Link Mortgage to Fixed Expense

**Scenario:** User wants to track mortgage payments and receive reminders.

**Steps:**
1. Create/edit fixed expense "Mortgage Payment"
2. Set amount to $2,500
3. Set payment_due_day to 12
4. Select "Mortgage" from loan dropdown
5. Save fixed expense

**Result:**
- Fixed expense linked to mortgage loan
- Reminder appears 7 days before due date
- Option to auto-log payment when due

### Use Case 2: Auto-Log Monthly Payment

**Scenario:** User receives reminder and wants to log payment quickly.

**Steps:**
1. Reminder shows "Mortgage Payment - $2,500 due in 3 days"
2. User clicks "Auto-Log Payment"
3. Confirms payment details
4. System creates loan payment entry

**Result:**
- Loan payment logged with correct amount and date
- Loan balance updated
- Reminder suppressed for current month
- Note added: "Auto-logged from fixed expense: Mortgage Payment"

### Use Case 3: Carry Forward to New Month

**Scenario:** User copies fixed expenses to new month.

**Steps:**
1. User clicks "Copy to Next Month" in fixed expenses
2. System copies all fixed expenses including linkages
3. New month's expenses retain payment_due_day and linked_loan_id

**Result:**
- Loan linkages preserved in new month
- Due dates carry forward
- Reminders continue working for new month

### Use Case 4: Loan Paid Off

**Scenario:** User pays off a loan that's linked to a fixed expense.

**Steps:**
1. User marks loan as paid off
2. Fixed expense retains linkage
3. UI shows "Loan Paid Off" indicator

**Result:**
- Historical linkage preserved
- No more reminders for that loan
- User can unlink or keep for records

## Migration

### Database Migration

```javascript
// Add new columns to fixed_expenses table
db.run(`ALTER TABLE fixed_expenses ADD COLUMN payment_due_day INTEGER`);
db.run(`ALTER TABLE fixed_expenses ADD COLUMN linked_loan_id INTEGER`);

// Add foreign key constraint
db.run(`
  CREATE TABLE fixed_expenses_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- ... existing columns ...
    payment_due_day INTEGER,
    linked_loan_id INTEGER,
    FOREIGN KEY (linked_loan_id) REFERENCES loans(id)
  )
`);

// Copy data and swap tables
db.run(`INSERT INTO fixed_expenses_new SELECT *, NULL, NULL FROM fixed_expenses`);
db.run(`DROP TABLE fixed_expenses`);
db.run(`ALTER TABLE fixed_expenses_new RENAME TO fixed_expenses`);
```

**Impact:**
- Existing fixed expenses have NULL for new fields
- No data loss or modification
- Backward compatible

## Testing

### Property-Based Tests

**fixedExpenseRepository.loanLinkage.pbt.test.js:**
- Loan linkage validation
- Active loan filtering
- Paid off loan handling

**autoPaymentLoggerService.eligibility.pbt.test.js:**
- Auto-log eligibility rules
- Duplicate payment prevention
- Month boundary handling

**autoPaymentLoggerService.attributes.pbt.test.js:**
- Payment amount correctness
- Payment date calculation
- Note generation

**reminderService.loanPayment.pbt.test.js:**
- Reminder timing (7 days before)
- Overdue detection
- Payment logged suppression

### Integration Tests

**fixedExpenseLoanLinkage.integration.test.js:**
- End-to-end linkage workflow
- Auto-log payment flow
- Reminder display and suppression

## Best Practices

### For Users

1. **Set due dates**: Always set payment_due_day for loan-related fixed expenses
2. **Link to loans**: Link fixed expenses to corresponding loans for automatic tracking
3. **Review reminders**: Check reminders 7 days before due date
4. **Use auto-log**: Use auto-log feature to save time on monthly payments
5. **Update when paid off**: Keep linkages even after loan is paid off for historical records

### For Developers

1. **Validate linkages**: Always verify loan exists and is active when linking
2. **Check for duplicates**: Prevent duplicate payments for the same month
3. **Handle paid off loans**: Display appropriate indicators for paid off loans
4. **Preserve linkages**: Don't delete linkages when loans are paid off
5. **Carry forward**: Include linkages when copying fixed expenses

## Related Features

- [Loan Payment Tracking](./LOAN_PAYMENT_TRACKING.md) - Loan payment management
- [Enhanced Fixed Expenses](./ENHANCED_FIXED_EXPENSES.md) - Fixed expense features
- [Monthly Data Reminders](./MONTHLY_DATA_REMINDERS.md) - Reminder system

## Future Enhancements

- Automatic payment scheduling (auto-log without confirmation)
- Payment history view from fixed expense
- Bulk linking of multiple fixed expenses to loans
- Payment amount adjustment suggestions based on loan balance
- Integration with bank account tracking

---

**Documentation Version:** 1.0  
**Feature Status:** Production Ready  
**Spec Location:** `archive/specs/fixed-expense-loan-linkage/`
