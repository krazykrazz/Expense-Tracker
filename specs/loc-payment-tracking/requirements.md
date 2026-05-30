# Requirements Document

## Introduction

Line of Credit (LOC) Payment Tracking — Phase 2. This feature adds supplementary payment tracking to lines of credit alongside the existing balance history. Balance snapshots remain the source of truth for LOC balances (since draws can increase the balance), while payments provide an informational record of what the user has been putting toward the LOC each month. This also re-enables the Phase 1 suppressed functionality: LOC linkage to fixed expenses, payment reminders, and auto-log prompts.

## Glossary

- **LOC**: A line of credit — a loan with `loan_type = 'line_of_credit'` in the `loans` table. Unlike traditional loans, the balance can increase via draws.
- **Payment_Tracking_System**: The existing `loanPaymentService`, `loanPaymentRepository`, and `loanPaymentController` that handle payment CRUD for loans and mortgages via the `loan_payments` table.
- **Balance_History**: The existing balance snapshot system (`loan_balances` table) that records manual balance entries per month. This is the source of truth for LOC balances.
- **LOC_Detail_View**: The section of `LoanDetailView.jsx` that renders when `loan_type === 'line_of_credit'`, currently showing only balance history.
- **Fixed_Expense_Linkage_System**: The system that links fixed expenses to loans via `linked_loan_id`, providing payment reminders and auto-log prompts.
- **Reminder_Service**: The `reminderService.js` that generates loan payment reminders for linked fixed expenses.
- **Auto_Payment_Logger**: The `autoPaymentLoggerService.js` that suggests and creates auto-logged payments from linked fixed expenses.

## Requirements

### Requirement 1: Allow LOC Payment Recording

**User Story:** As a user with a line of credit, I want to record payments I make toward my LOC, so that I can see a history of what I've been paying each month.

#### Acceptance Criteria

1. WHEN a user submits a payment for a loan with `loan_type = 'line_of_credit'`, THE Payment_Tracking_System SHALL accept and store the payment in the `loan_payments` table.
2. THE Payment_Tracking_System SHALL apply the same validation rules to LOC payments as to loan payments: amount must be positive, date must be in YYYY-MM-DD format, and date must not be in the future.
3. WHEN a user requests the payment list for an LOC, THE Payment_Tracking_System SHALL return all payments in reverse chronological order.
4. WHEN a user updates or deletes an LOC payment, THE Payment_Tracking_System SHALL process the change using the same logic as for loan payments.
5. THE Payment_Tracking_System SHALL log activity events for LOC payment creation, update, and deletion using the same event types as loan payments.

### Requirement 2: LOC Balance Remains Independent of Payments

**User Story:** As a user, I want my LOC balance to stay based on manual balance snapshots, so that draws and irregular activity are accurately reflected.

#### Acceptance Criteria

1. THE Balance_History SHALL remain the sole source of truth for LOC current balance — the balance calculation for LOCs SHALL NOT subtract payments from the initial balance.
2. WHEN a payment is recorded for an LOC, THE Payment_Tracking_System SHALL NOT create or modify any balance snapshot in the `loan_balances` table.
3. THE LOC_Detail_View SHALL display the current balance from the most recent balance snapshot, not from a payment-derived calculation.

### Requirement 3: Display Payment History in LOC Detail View

**User Story:** As a user, I want to see my LOC payment history alongside the balance history, so that I have a complete picture of my LOC activity.

#### Acceptance Criteria

1. WHEN a user opens the detail view for an LOC, THE LOC_Detail_View SHALL display a payment history section using the existing `LoanPaymentHistory` component.
2. THE LOC_Detail_View SHALL display a payment entry form using the existing `LoanPaymentForm` component.
3. THE LOC_Detail_View SHALL continue to display the balance history section for manual balance snapshots.
4. THE LOC_Detail_View SHALL NOT display a "running balance" column in the LOC payment history, since payments do not drive the balance.
5. THE LOC_Detail_View SHALL display a summary showing total payments and payment count for the LOC.

### Requirement 4: Re-enable LOC Fixed Expense Linkage

**User Story:** As a user, I want to link my LOC monthly payment as a fixed expense, so that I get reminders and can auto-log payments.

#### Acceptance Criteria

1. WHEN a user views the fixed expense loan linkage dropdown, THE Fixed_Expense_Linkage_System SHALL include active LOCs in the list of available loans.
2. WHEN a fixed expense is linked to an LOC, THE Fixed_Expense_Linkage_System SHALL store the linkage using the existing `linked_loan_id` column.

### Requirement 5: Re-enable LOC Payment Reminders

**User Story:** As a user with an LOC linked to a fixed expense, I want to receive payment reminders, so that I don't miss my monthly LOC payment.

#### Acceptance Criteria

1. WHEN a fixed expense linked to an LOC has a due date within 7 days or is overdue, THE Reminder_Service SHALL include the LOC in the loan payment reminders.
2. WHEN a payment has already been recorded for the LOC in the current month, THE Reminder_Service SHALL suppress the reminder for that LOC.

### Requirement 6: Re-enable LOC Auto-Log Prompts

**User Story:** As a user with an LOC linked to a fixed expense, I want to auto-log my LOC payment from the reminder, so that I can quickly record my monthly payment.

#### Acceptance Criteria

1. WHEN a user triggers auto-log for an LOC-linked fixed expense, THE Auto_Payment_Logger SHALL create a payment in the `loan_payments` table for the LOC.
2. THE Auto_Payment_Logger SHALL include LOC-linked fixed expenses in the list of eligible auto-log suggestions when the due date has passed and no payment exists for the current month.
