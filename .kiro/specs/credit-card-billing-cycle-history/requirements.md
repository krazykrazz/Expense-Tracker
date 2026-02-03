# Requirements Document

## Introduction

This feature enables users to record their actual statement balance from credit card statements each billing cycle, creating a historical record for reconciliation and tracking. The system currently calculates statement balance automatically based on billing cycle dates and tracked expenses, but this calculated value may not match the actual statement due to pending transactions, fees, interest, timing differences, or returns not captured in the app. This feature bridges that gap by allowing users to enter the actual statement balance, compare it with the calculated value, and maintain a historical record of billing cycles.

## Glossary

- **Billing_Cycle_History_Service**: The backend service responsible for managing billing cycle history records, including creation, retrieval, and comparison calculations.
- **Billing_Cycle_Repository**: The data access layer for the credit_card_billing_cycles table.
- **Statement_Balance_Service**: The existing service that calculates statement balance based on billing cycle dates and tracked expenses.
- **Reminder_Service**: The existing service that manages monthly data reminders for investments, loans, and credit card payments.
- **Credit_Card_Detail_View**: The frontend component that displays detailed credit card information including balance, payments, and statements.
- **Billing_Cycle_History_Form**: The frontend component for entering actual statement balance for a billing cycle.
- **Discrepancy**: The difference between the user-provided actual statement balance and the system-calculated statement balance.
- **Billing_Cycle_Day**: The day of the month when the credit card statement closes (existing field on payment_methods table).

## Requirements

### Requirement 1: Billing Cycle History Data Storage

**User Story:** As a user, I want my actual statement balances to be stored persistently, so that I can maintain a historical record of my credit card billing cycles.

#### Acceptance Criteria

1. THE Billing_Cycle_Repository SHALL store billing cycle records with payment_method_id, cycle_start_date, cycle_end_date, actual_statement_balance, calculated_statement_balance, minimum_payment, due_date, notes, created_at, and updated_at fields.
2. WHEN a billing cycle record is created, THE Billing_Cycle_Repository SHALL enforce a foreign key relationship to the payment_methods table.
3. WHEN a billing cycle record is created, THE Billing_Cycle_Repository SHALL enforce a unique constraint on (payment_method_id, cycle_end_date) to prevent duplicate entries for the same billing cycle.
4. WHEN a payment method is deleted, THE Billing_Cycle_Repository SHALL cascade delete all associated billing cycle records.
5. THE Billing_Cycle_Repository SHALL support querying billing cycle history by payment_method_id with optional date range filtering.

### Requirement 2: Billing Cycle History CRUD Operations

**User Story:** As a user, I want to create, read, update, and delete billing cycle history records, so that I can manage my statement balance tracking.

#### Acceptance Criteria

1. WHEN a user submits a billing cycle record with actual_statement_balance, THE Billing_Cycle_History_Service SHALL create a new record with the provided data and auto-calculate the calculated_statement_balance using the Statement_Balance_Service.
2. WHEN a user requests billing cycle history for a credit card, THE Billing_Cycle_History_Service SHALL return all records sorted by cycle_end_date in descending order.
3. WHEN a user updates a billing cycle record, THE Billing_Cycle_History_Service SHALL update the actual_statement_balance, minimum_payment, due_date, and notes fields while preserving the calculated_statement_balance.
4. WHEN a user deletes a billing cycle record, THE Billing_Cycle_History_Service SHALL remove the record from the database.
5. IF a billing cycle record already exists for the same payment_method_id and cycle_end_date, THEN THE Billing_Cycle_History_Service SHALL return an error indicating a duplicate entry.

### Requirement 3: Discrepancy Calculation

**User Story:** As a user, I want to see the difference between my actual statement balance and the calculated balance, so that I can identify tracking gaps.

#### Acceptance Criteria

1. WHEN a billing cycle record is retrieved, THE Billing_Cycle_History_Service SHALL calculate and return the discrepancy as (actual_statement_balance - calculated_statement_balance).
2. WHEN the discrepancy is positive, THE Billing_Cycle_History_Service SHALL indicate that the actual balance is higher than tracked (potential untracked expenses).
3. WHEN the discrepancy is negative, THE Billing_Cycle_History_Service SHALL indicate that the actual balance is lower than tracked (potential untracked returns/credits).
4. WHEN the discrepancy is zero, THE Billing_Cycle_History_Service SHALL indicate that tracking is accurate.

### Requirement 4: Billing Cycle Reminder Integration

**User Story:** As a user, I want to be reminded to enter my actual statement balance after each billing cycle ends, so that I don't forget to update my records.

#### Acceptance Criteria

1. WHEN a billing cycle ends (based on billing_cycle_day), THE Reminder_Service SHALL include a reminder to enter the actual statement balance for that credit card.
2. WHEN the user has already entered the actual statement balance for the current billing cycle, THE Reminder_Service SHALL NOT show the reminder for that credit card.
3. WHEN the user dismisses the billing cycle reminder, THE Reminder_Service SHALL suppress the reminder until the next billing cycle.
4. THE Reminder_Service SHALL return billing cycle reminder status alongside existing investment and loan reminders.

### Requirement 5: Billing Cycle History UI Display

**User Story:** As a user, I want to view my billing cycle history in the credit card detail view, so that I can review my statement balance tracking over time.

#### Acceptance Criteria

1. WHEN viewing a credit card with billing_cycle_day configured, THE Credit_Card_Detail_View SHALL display a billing cycle history section.
2. WHEN displaying billing cycle history, THE Credit_Card_Detail_View SHALL show cycle dates, actual balance, calculated balance, discrepancy, and discrepancy indicator for each record.
3. WHEN the discrepancy is significant (greater than $1), THE Credit_Card_Detail_View SHALL highlight the discrepancy with a visual indicator (positive = orange, negative = blue).
4. WHEN no billing cycle history exists, THE Credit_Card_Detail_View SHALL display an empty state with a prompt to enter the first statement balance.

### Requirement 6: Billing Cycle History Entry Form

**User Story:** As a user, I want to enter my actual statement balance through a form, so that I can record my statement details.

#### Acceptance Criteria

1. WHEN the user opens the billing cycle entry form, THE Billing_Cycle_History_Form SHALL pre-populate the cycle dates based on the most recent completed billing cycle.
2. WHEN the user submits the form, THE Billing_Cycle_History_Form SHALL validate that actual_statement_balance is a non-negative number.
3. WHEN the user submits the form, THE Billing_Cycle_History_Form SHALL allow optional entry of minimum_payment, due_date, and notes.
4. WHEN the form is submitted successfully, THE Billing_Cycle_History_Form SHALL display the calculated discrepancy to the user.
5. IF the user attempts to enter a duplicate billing cycle, THEN THE Billing_Cycle_History_Form SHALL display an error message and prevent submission.

### Requirement 7: Statement Balance Display and Payment Alert Priority

**User Story:** As a user, I want the actual statement balance to be the authoritative source for payment alerts and displays, so that I receive accurate payment reminders.

#### Acceptance Criteria

1. WHEN displaying statement balance in the Credit_Card_Detail_View, THE system SHALL show the actual_statement_balance if a billing cycle record exists for the current period.
2. WHEN no billing cycle record exists for the current period, THE system SHALL fall back to displaying the calculated statement balance.
3. WHEN displaying statement balance, THE system SHALL indicate whether the value is user-provided or calculated.
4. WHEN determining payment alert amounts, THE Reminder_Service SHALL use the actual_statement_balance as the authoritative required payment amount if a billing cycle record exists.
5. WHEN the actual_statement_balance is zero or the user has marked the statement as paid, THE Reminder_Service SHALL suppress payment due alerts for that billing cycle.
6. WHEN no billing cycle record exists, THE Reminder_Service SHALL fall back to using the calculated statement balance for payment alerts.

### Requirement 8: API Endpoints

**User Story:** As a developer, I want RESTful API endpoints for billing cycle history, so that the frontend can interact with the backend.

#### Acceptance Criteria

1. THE system SHALL provide a POST endpoint at /api/payment-methods/:id/billing-cycles to create a billing cycle record.
2. THE system SHALL provide a GET endpoint at /api/payment-methods/:id/billing-cycles/history to retrieve billing cycle history.
3. THE system SHALL provide a PUT endpoint at /api/payment-methods/:id/billing-cycles/:cycleId to update a billing cycle record.
4. THE system SHALL provide a DELETE endpoint at /api/payment-methods/:id/billing-cycles/:cycleId to delete a billing cycle record.
5. THE system SHALL provide a GET endpoint at /api/payment-methods/:id/billing-cycles/current to get the current billing cycle status including whether actual balance has been entered.

### Requirement 9: Database Migration

**User Story:** As a system administrator, I want the database schema to be updated automatically, so that existing deployments can use the new feature.

#### Acceptance Criteria

1. WHEN the application starts, THE migration system SHALL create the credit_card_billing_cycles table if it does not exist.
2. THE migration system SHALL preserve existing data in related tables during migration.
3. THE migration system SHALL create appropriate indexes for efficient querying by payment_method_id and cycle_end_date.
