# Requirements Document

## Introduction

This feature enables linking fixed expenses to loan payments, providing automatic payment logging and upcoming payment reminders. Users can associate recurring fixed expenses (like mortgage payments or car loan payments) with their corresponding loans, allowing the system to automatically track when payments are due and optionally log them when the due date arrives. This integration bridges the gap between fixed expense tracking and loan payment management.

## Glossary

- **Fixed_Expense**: A recurring monthly expense entry with name, amount, category, and payment type
- **Loan**: A debt instrument in the loans table (type: 'loan', 'mortgage', or 'line_of_credit')
- **Linked_Fixed_Expense**: A fixed expense that has an associated loan via linked_loan_id
- **Payment_Due_Day**: The day of the month (1-31) when a fixed expense payment is due
- **Loan_Payment_Reminder**: A notification shown when a linked fixed expense payment is due within 7 days
- **Auto_Payment_Logger**: The component that creates loan payment entries from linked fixed expenses
- **Reminder_Service**: The existing service that calculates days until due and manages payment reminders

## Requirements

### Requirement 1: Fixed Expense Due Date

**User Story:** As a user, I want to specify when my fixed expenses are due each month, so that I can track payment deadlines.

#### Acceptance Criteria

1. WHEN a user creates or edits a fixed expense, THE Fixed_Expense form SHALL display an optional payment_due_day field accepting values 1-31
2. WHEN a user enters a payment_due_day outside the range 1-31, THE Fixed_Expense form SHALL display a validation error
3. WHEN a user leaves payment_due_day empty, THE Fixed_Expense form SHALL accept the entry without a due date
4. THE Fixed_Expense repository SHALL store payment_due_day as a nullable integer column
5. WHEN displaying fixed expenses, THE Fixed_Expense list SHALL show the due day for expenses that have one configured

### Requirement 2: Loan Linkage

**User Story:** As a user, I want to link my fixed expenses to loans, so that the system knows which loan a payment applies to.

#### Acceptance Criteria

1. WHEN a user creates or edits a fixed expense, THE Fixed_Expense form SHALL display an optional loan selection dropdown
2. THE Fixed_Expense form SHALL only show active loans (is_paid_off = 0) in the loan selection dropdown
3. WHEN a user selects a loan, THE Fixed_Expense form SHALL store the linked_loan_id foreign key
4. WHEN a user clears the loan selection, THE Fixed_Expense form SHALL set linked_loan_id to null
5. WHEN displaying fixed expenses, THE Fixed_Expense list SHALL show a loan indicator for linked expenses
6. IF a linked loan is marked as paid off, THEN THE Fixed_Expense SHALL retain the linkage but display a "Loan Paid Off" indicator

### Requirement 3: Loan Payment Reminders

**User Story:** As a user, I want to see reminders for upcoming loan payments, so that I don't miss payment deadlines.

#### Acceptance Criteria

1. WHEN a linked fixed expense has a payment_due_day within 7 days, THE Reminder_Service SHALL include it in loan payment reminders
2. WHEN a linked fixed expense payment is overdue (past due date this month), THE Reminder_Service SHALL flag it as overdue
3. THE Reminder_Service SHALL display the loan name, payment amount, and days until due for each reminder
4. WHEN a loan payment has already been logged for the current month, THE Reminder_Service SHALL suppress the reminder for that expense
5. THE Reminder_Service SHALL use the existing calculateDaysUntilDue method for consistency with credit card reminders

### Requirement 4: Auto-Log Loan Payments

**User Story:** As a user, I want the option to automatically log loan payments when they're due, so that I don't have to manually enter each payment.

#### Acceptance Criteria

1. WHEN a linked fixed expense reaches its due date and no payment exists for that month, THE Auto_Payment_Logger SHALL offer to create a loan payment entry
2. THE Auto_Payment_Logger SHALL use the fixed expense amount as the payment amount
3. THE Auto_Payment_Logger SHALL use the due date (year-month-due_day) as the payment date
4. WHEN the user confirms auto-logging, THE Auto_Payment_Logger SHALL create the loan payment entry
5. WHEN the user dismisses the auto-log prompt, THE Auto_Payment_Logger SHALL not create a payment and not prompt again until next month
6. THE Auto_Payment_Logger SHALL add a note indicating the payment was auto-logged from a fixed expense

### Requirement 5: UI Integration

**User Story:** As a user, I want to see loan payment reminders in the same location as other reminders, so that I have a unified view of upcoming payments.

#### Acceptance Criteria

1. WHEN loan payment reminders exist, THE Reminder_Banner SHALL display them alongside credit card reminders
2. THE Reminder_Banner SHALL show a distinct visual style for loan payment reminders vs credit card reminders
3. WHEN a user clicks on a loan payment reminder, THE Reminder_Banner SHALL navigate to the loan detail view
4. THE Reminder_Banner SHALL show the count of upcoming loan payments in the reminder badge
5. WHEN no loan payment reminders exist, THE Reminder_Banner SHALL not display the loan payment section

### Requirement 6: Data Migration

**User Story:** As a user with existing fixed expenses, I want my data to remain intact when this feature is added, so that I don't lose any information.

#### Acceptance Criteria

1. THE database migration SHALL add payment_due_day and linked_loan_id columns as nullable fields
2. THE database migration SHALL set default values to null for existing fixed expense records
3. WHEN the migration runs, THE database migration SHALL not modify any existing fixed expense data
4. THE Fixed_Expense API SHALL maintain backward compatibility with clients not sending the new fields

### Requirement 7: Carry-Forward Behavior

**User Story:** As a user, I want my loan linkages and due dates to carry forward when I copy fixed expenses to a new month, so that I don't have to re-configure them.

#### Acceptance Criteria

1. WHEN fixed expenses are copied to a new month, THE Fixed_Expense copy function SHALL include payment_due_day in the copied data
2. WHEN fixed expenses are copied to a new month, THE Fixed_Expense copy function SHALL include linked_loan_id in the copied data
3. IF a linked loan has been paid off, THEN THE Fixed_Expense copy function SHALL still copy the linkage but the UI SHALL indicate the loan is paid off
