# Requirements Document

## Introduction

This feature enables linking fixed expenses to loan payments, creating an automated workflow for tracking recurring loan payments. Users can associate a fixed expense (e.g., "Car Loan Payment") with a specific loan, set a payment due date, and have the system automatically create loan payment entries when due. The feature also provides upcoming payment alerts similar to existing credit card payment reminders, helping users stay on top of their loan obligations.

## Glossary

- **Fixed_Expense_Loan_Linker**: The system component responsible for managing the association between fixed expenses and loans
- **Payment_Due_Day**: The day of the month (1-31) when a fixed expense payment is due
- **Linked_Loan**: A loan that has been associated with a fixed expense for automated payment tracking
- **Loan_Payment_Reminder**: An alert shown to users when a linked loan payment is approaching its due date
- **Auto_Payment_Creator**: The component that creates loan payment entries when a linked fixed expense's due date arrives
- **Amount_Synchronizer**: The component that keeps the fixed expense amount in sync with the linked loan's payment amount

## Requirements

### Requirement 1: Payment Due Date for Fixed Expenses

**User Story:** As a user, I want to set a payment due date on my fixed expenses, so that I can track when each payment is due during the month.

#### Acceptance Criteria

1. WHEN a user creates or edits a fixed expense, THE Fixed_Expense_Loan_Linker SHALL allow setting an optional payment_due_day (1-31)
2. WHEN a payment_due_day is set, THE Fixed_Expense_Loan_Linker SHALL validate that the value is between 1 and 31
3. WHEN a payment_due_day is not provided, THE Fixed_Expense_Loan_Linker SHALL store null and not display due date information
4. THE Fixed_Expense_Loan_Linker SHALL display the payment due day in the fixed expenses list when set
5. WHEN the payment_due_day exceeds the number of days in a month, THE Fixed_Expense_Loan_Linker SHALL treat it as the last day of that month

### Requirement 2: Loan Linkage for Fixed Expenses

**User Story:** As a user, I want to link a fixed expense to one of my loans, so that I can automate payment tracking for that loan.

#### Acceptance Criteria

1. WHEN a user creates or edits a fixed expense, THE Fixed_Expense_Loan_Linker SHALL allow selecting an optional loan to link
2. THE Fixed_Expense_Loan_Linker SHALL only display loans with loan_type 'loan' or 'mortgage' as linkable options (not lines of credit)
3. WHEN a loan is linked, THE Fixed_Expense_Loan_Linker SHALL store the linked_loan_id as a foreign key reference
4. WHEN a user unlinks a loan, THE Fixed_Expense_Loan_Linker SHALL set linked_loan_id to null
5. IF a linked loan is deleted, THEN THE Fixed_Expense_Loan_Linker SHALL set the linked_loan_id to null (not cascade delete the fixed expense)
6. THE Fixed_Expense_Loan_Linker SHALL prevent linking the same loan to multiple fixed expenses in the same month

### Requirement 3: Loan Payment Reminders

**User Story:** As a user, I want to see upcoming loan payment alerts, so that I don't miss my loan payment due dates.

#### Acceptance Criteria

1. WHEN a linked fixed expense has a payment_due_day within 7 days, THE Loan_Payment_Reminder SHALL display an upcoming payment alert
2. THE Loan_Payment_Reminder SHALL show the fixed expense name, linked loan name, amount, and days until due
3. WHEN the payment_due_day has passed for the current month, THE Loan_Payment_Reminder SHALL show an overdue alert
4. THE Loan_Payment_Reminder SHALL integrate with the existing reminder service infrastructure
5. WHEN a loan payment has already been recorded for the current month, THE Loan_Payment_Reminder SHALL suppress the alert

### Requirement 4: Automatic Loan Payment Creation

**User Story:** As a user, I want the system to help me create loan payment entries when my fixed expense is due, so that I don't have to manually enter each payment.

#### Acceptance Criteria

1. WHEN a linked fixed expense's due date arrives, THE Auto_Payment_Creator SHALL prompt the user to confirm creating a loan payment
2. WHEN the user confirms, THE Auto_Payment_Creator SHALL create a loan payment entry with the fixed expense amount and current date
3. THE Auto_Payment_Creator SHALL allow the user to modify the payment amount before confirming
4. THE Auto_Payment_Creator SHALL allow the user to skip creating the payment
5. IF a loan payment already exists for the current month, THEN THE Auto_Payment_Creator SHALL not prompt for duplicate payment creation

### Requirement 5: Amount Synchronization

**User Story:** As a user, I want my fixed expense amount to stay in sync with my loan's payment amount, so that I don't have to update both places.

#### Acceptance Criteria

1. WHEN a loan is linked to a fixed expense, THE Amount_Synchronizer SHALL offer to update the fixed expense amount to match the loan's suggested payment
2. WHEN a mortgage is linked, THE Amount_Synchronizer SHALL use the mortgage's monthly_payment field as the suggested amount
3. WHEN a regular loan is linked, THE Amount_Synchronizer SHALL use the average of previous payments as the suggested amount
4. THE Amount_Synchronizer SHALL allow the user to keep the current fixed expense amount instead of syncing
5. WHEN the fixed expense amount differs from the loan's suggested payment, THE Amount_Synchronizer SHALL display a warning indicator

### Requirement 6: Linked Loan Information Display

**User Story:** As a user, I want to see my linked loan's details when viewing a fixed expense, so that I can understand my loan status at a glance.

#### Acceptance Criteria

1. WHEN viewing a fixed expense linked to a loan, THE Fixed_Expense_Loan_Linker SHALL display the loan's current balance
2. WHEN viewing a fixed expense linked to a loan, THE Fixed_Expense_Loan_Linker SHALL display the total payments made
3. WHEN viewing a fixed expense linked to a loan, THE Fixed_Expense_Loan_Linker SHALL display the loan's interest rate (if available)
4. THE Fixed_Expense_Loan_Linker SHALL provide a quick link to view the full loan details
5. WHEN the linked loan is paid off, THE Fixed_Expense_Loan_Linker SHALL display a "Paid Off" indicator

### Requirement 7: Fixed Expense Carry Forward with Loan Linkage

**User Story:** As a user, I want my loan-linked fixed expenses to carry forward to new months with their linkage intact, so that I don't have to re-link each month.

#### Acceptance Criteria

1. WHEN carrying forward fixed expenses, THE Fixed_Expense_Loan_Linker SHALL preserve the linked_loan_id
2. WHEN carrying forward fixed expenses, THE Fixed_Expense_Loan_Linker SHALL preserve the payment_due_day
3. IF the linked loan has been paid off, THEN THE Fixed_Expense_Loan_Linker SHALL warn the user during carry forward
4. THE Fixed_Expense_Loan_Linker SHALL allow the user to unlink paid-off loans during carry forward

### Requirement 8: Payment Type Restrictions for Fixed Expenses

**User Story:** As a user, I want the system to prevent using credit cards for fixed expenses, so that fixed recurring costs are tracked with appropriate payment methods.

#### Acceptance Criteria

1. WHEN a user creates a fixed expense, THE Fixed_Expense_Loan_Linker SHALL only allow non-credit-card payment types (Cash, Debit, Cheque)
2. WHEN a user edits a fixed expense, THE Fixed_Expense_Loan_Linker SHALL only allow non-credit-card payment types (Cash, Debit, Cheque)
3. THE Fixed_Expense_Loan_Linker SHALL filter out credit card options from the payment type dropdown in the fixed expenses form
4. IF an existing fixed expense has a credit card payment type, THEN THE Fixed_Expense_Loan_Linker SHALL allow viewing but require changing to a non-credit-card type when editing

### Requirement 9: Backward Compatibility with Existing Fixed Expenses

**User Story:** As a user with existing fixed expenses, I want my historical data to remain intact and functional after this feature is added.

#### Acceptance Criteria

1. THE Fixed_Expense_Loan_Linker SHALL treat existing fixed expenses without payment_due_day as having no due date (null)
2. THE Fixed_Expense_Loan_Linker SHALL treat existing fixed expenses without linked_loan_id as unlinked
3. WHEN displaying existing fixed expenses, THE Fixed_Expense_Loan_Linker SHALL show them normally without requiring migration
4. THE Fixed_Expense_Loan_Linker SHALL allow users to add payment_due_day and linked_loan_id to existing fixed expenses through the edit interface
5. THE Fixed_Expense_Loan_Linker SHALL not modify or delete any existing fixed expense data during schema migration

