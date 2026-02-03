# Requirements Document

## Introduction

This feature enhances credit card management by automatically calculating statement balances based on billing cycles and providing smart payment alerts. The system will track what amount is actually due from the previous billing cycle, enabling intelligent alert suppression when statements are paid in full while still showing the required payment amount when due.

Currently, credit card payment alerts check `current_balance` to determine if a payment reminder should be shown. However, `current_balance` includes transactions from the current billing cycle that aren't due yet. This means alerts show even when the statement has been paid in full (because new charges exist), and there's no way to distinguish between "paid the statement" vs "made a partial payment".

The solution involves:
1. Making billing cycle dates mandatory for credit cards
2. Automatically calculating statement balance based on expenses within the billing cycle
3. Smart alert suppression when statement balance is paid
4. Enhanced reminders showing the required payment amount (similar to loan balance reminders)

## Glossary

- **Statement_Balance**: The calculated amount due from the previous billing cycle. This is the sum of all expenses posted during the previous billing cycle minus any payments made toward that statement.
- **Current_Balance**: The total outstanding balance on the credit card, including both statement charges and new charges from the current billing cycle.
- **Payment_Method**: A database entity representing a payment method (cash, cheque, debit, or credit card).
- **Credit_Card**: A payment method of type 'credit_card' with additional fields for credit limit, balance tracking, and billing cycle information.
- **Reminder_Service**: The backend service responsible for determining which reminders to show users, including credit card payment reminders.
- **Payment_Due_Day**: The day of the month when the credit card payment is due.
- **Billing_Cycle**: The period between credit card statements, defined by the statement closing day. For example, if billing_cycle_day is 15, the cycle runs from the 16th of the previous month to the 15th of the current month.
- **Billing_Cycle_Day**: The day of the month when the billing cycle closes (statement date).
- **Statement_Period**: The date range for a specific billing cycle, calculated from billing_cycle_day.
- **Statement_Paid_Amount**: The total payments made toward a specific statement period.

## Requirements

### Requirement 1: Mandatory Billing Cycle Configuration

**User Story:** As a user, I want billing cycle information to be required for credit cards, so that the system can accurately calculate my statement balance.

#### Acceptance Criteria

1. WHEN creating a credit card payment method, THE Payment_Method_Service SHALL require `billing_cycle_day` to be provided
2. WHEN creating a credit card payment method, THE Payment_Method_Service SHALL require `payment_due_day` to be provided
3. THE Payment_Method_Service SHALL validate that `billing_cycle_day` is between 1 and 31
4. THE Payment_Method_Service SHALL validate that `payment_due_day` is between 1 and 31
5. IF `billing_cycle_day` or `payment_due_day` is missing for a credit card, THEN THE Payment_Method_Service SHALL reject the creation with an appropriate error message
6. WHEN updating a credit card payment method, THE Payment_Method_Service SHALL not allow `billing_cycle_day` or `payment_due_day` to be set to null

### Requirement 2: Database Schema Extension

**User Story:** As a system administrator, I want the database to support statement balance tracking, so that the application can calculate and store statement information.

#### Acceptance Criteria

1. THE Database_Migration SHALL add a `billing_cycle_day` column to the `payment_methods` table with type INTEGER (nullable for backward compatibility with existing cards)
2. THE Database_Migration SHALL migrate existing credit cards by copying `billing_cycle_end` to `billing_cycle_day` where `billing_cycle_end` is set
3. WHEN the migration runs on an existing database, THE Database_Migration SHALL preserve all existing payment method data
4. THE Database_Migration SHALL be idempotent, meaning running it multiple times produces the same result
5. THE Database_Migration SHALL retain the existing `billing_cycle_start` and `billing_cycle_end` columns for backward compatibility

### Requirement 3: Automatic Statement Balance Calculation

**User Story:** As a user, I want the system to automatically calculate my statement balance based on my expenses, so that I don't have to manually enter it each month.

#### Acceptance Criteria

1. THE Statement_Balance_Service SHALL calculate statement balance as the sum of all expenses posted during the previous billing cycle
2. WHEN calculating statement balance, THE Statement_Balance_Service SHALL use `posted_date` if available, otherwise fall back to `date` for each expense
3. THE Statement_Balance_Service SHALL determine the previous billing cycle dates based on `billing_cycle_day` and the current date
4. FOR a billing_cycle_day of 15, THE Statement_Balance_Service SHALL calculate the previous cycle as the 16th of two months ago to the 15th of the previous month
5. THE Statement_Balance_Service SHALL subtract any payments made during the payment period from the calculated statement balance
6. THE Statement_Balance_Service SHALL return zero if the calculated balance is negative (overpayment scenario)

### Requirement 4: Payment Impact on Statement Balance

**User Story:** As a user, I want my payments to reduce my statement balance, so that I can track progress toward paying off what I owe.

#### Acceptance Criteria

1. WHEN a payment is recorded, THE Credit_Card_Payment_Service SHALL continue to reduce `current_balance` by the payment amount
2. THE Statement_Balance_Service SHALL recalculate statement balance on-demand, accounting for payments made since the statement date
3. WHEN calculating remaining statement balance, THE Statement_Balance_Service SHALL subtract payments made between the statement date and the due date
4. THE Statement_Balance_Service SHALL ensure calculated statement balance never goes below zero

### Requirement 5: Smart Payment Alert Logic

**User Story:** As a user, I want payment reminders to show me the required payment amount and be suppressed when I've paid my statement in full, so that I receive actionable and accurate alerts.

#### Acceptance Criteria

1. WHEN determining credit card reminders, THE Reminder_Service SHALL calculate the statement balance using the Statement_Balance_Service
2. IF calculated statement balance is greater than zero AND the due date is within 7 days, THEN THE Reminder_Service SHALL show a payment reminder with the required amount
3. IF calculated statement balance is zero or less, THEN THE Reminder_Service SHALL suppress the payment reminder
4. THE Reminder_Service SHALL include the required payment amount in the reminder (similar to loan balance reminders)
5. THE Reminder_Service SHALL continue to include `current_balance` in the response for utilization tracking purposes
6. WHEN a credit card has no billing cycle configured, THE Reminder_Service SHALL fall back to showing reminders based on `current_balance` (backward compatibility)

### Requirement 6: Frontend Billing Cycle Configuration

**User Story:** As a user, I want to configure my billing cycle when setting up a credit card, so that the system can calculate my statement balance correctly.

#### Acceptance Criteria

1. WHEN creating or editing a credit card payment method, THE Payment_Method_Form SHALL display a billing cycle day input field
2. THE Payment_Method_Form SHALL mark billing cycle day as required for credit cards
3. THE Payment_Method_Form SHALL mark payment due day as required for credit cards
4. THE Payment_Method_Form SHALL validate that billing cycle day is between 1 and 31
5. THE Payment_Method_Form SHALL provide helpful text explaining what billing cycle day means (e.g., "The day your statement closes each month")
6. WHEN the form is submitted, THE Payment_Method_Form SHALL send the billing cycle day to the backend API

### Requirement 7: Frontend Statement Balance Display

**User Story:** As a user, I want to see my calculated statement balance and payment status in the credit card detail view, so that I know how much I need to pay.

#### Acceptance Criteria

1. THE Credit_Card_Detail_View SHALL display the calculated statement balance alongside the current balance
2. WHEN statement balance is zero or less, THE Credit_Card_Detail_View SHALL show a "Statement Paid" indicator
3. WHEN statement balance is greater than zero, THE Credit_Card_Detail_View SHALL show the remaining amount due with the due date
4. THE Credit_Card_Detail_View SHALL clearly distinguish between statement balance (what's due now) and current balance (total owed)
5. THE Credit_Card_Detail_View SHALL show the billing cycle dates for the current statement

### Requirement 8: Enhanced Payment Reminders Display

**User Story:** As a user, I want to see the required payment amount in my credit card reminders, so that I know exactly how much to pay.

#### Acceptance Criteria

1. WHEN displaying credit card payment reminders, THE Reminder_UI SHALL show the required payment amount (statement balance)
2. THE Reminder_UI SHALL show the payment due date
3. THE Reminder_UI SHALL show the credit card name
4. THE Reminder_UI SHALL provide a visual indicator of urgency (overdue, due soon, paid)
5. WHEN the statement is paid in full, THE Reminder_UI SHALL show a "Paid" status instead of a payment reminder
