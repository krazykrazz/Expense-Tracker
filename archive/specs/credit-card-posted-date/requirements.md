# Requirements Document

## Introduction

This feature adds support for distinguishing between transaction date and posted date for credit card expenses. Users who pre-log future expenses need accurate credit card balance calculations that reflect when expenses actually post to their credit card statement, not just when the transaction occurred.

## Glossary

- **Transaction_Date**: The date when a purchase or expense occurred (existing `date` field)
- **Posted_Date**: The date when an expense posts to a credit card statement and affects the balance
- **Pre-logged_Expense**: An expense entered before its transaction date (future-dated expense)
- **Pending_Transaction**: A credit card expense that has not yet posted to the statement
- **Dynamic_Balance**: The credit card balance calculated in real-time based on posted expenses and payments
- **Expense_Form**: The UI component for creating and editing expenses
- **Payment_Method_Service**: The backend service that calculates credit card balances

## Requirements

### Requirement 1: Posted Date Field

**User Story:** As a user, I want to optionally specify when an expense posts to my credit card, so that my credit card balance accurately reflects posted transactions.

#### Acceptance Criteria

1. THE Expense_Form SHALL display an optional "Posted Date" field when the selected payment method is a credit card
2. WHEN a user creates an expense without specifying a posted date, THE System SHALL treat the transaction date as the posted date for balance calculations
3. WHEN a user specifies a posted date, THE System SHALL use that date for credit card balance calculations
4. THE System SHALL allow posted date to be NULL to indicate a pending transaction that has not yet posted
5. WHEN editing an existing expense, THE Expense_Form SHALL display the current posted date value if one exists

### Requirement 2: Credit Card Balance Calculation

**User Story:** As a user, I want my credit card balance to only include posted transactions, so that I can see an accurate current balance.

#### Acceptance Criteria

1. WHEN calculating credit card balance, THE Payment_Method_Service SHALL use `COALESCE(posted_date, date)` to determine the effective posting date
2. THE Payment_Method_Service SHALL only include expenses where the effective posting date is on or before today in the balance calculation
3. WHEN an expense has a NULL posted date and a future transaction date, THE System SHALL exclude it from the current balance
4. WHEN an expense has a NULL posted date and a past or current transaction date, THE System SHALL include it in the current balance
5. THE System SHALL continue to use the transaction date for all non-balance views (expense lists, reports, budgets, analytics)

### Requirement 3: Database Schema

**User Story:** As a developer, I want the posted date stored in the database, so that it persists across sessions and can be queried efficiently.

#### Acceptance Criteria

1. THE System SHALL add a `posted_date` column of type TEXT (nullable) to the expenses table
2. THE System SHALL create a database migration that adds the column without modifying existing data
3. WHEN the migration runs, THE System SHALL set existing expenses' posted_date to NULL (meaning "use transaction date")
4. THE System SHALL create an index on the posted_date column for query performance

### Requirement 4: API Support

**User Story:** As a developer, I want the API to accept and return posted date, so that the frontend can manage this field.

#### Acceptance Criteria

1. WHEN creating an expense, THE API SHALL accept an optional `posted_date` field
2. WHEN updating an expense, THE API SHALL accept an optional `posted_date` field
3. WHEN returning expense data, THE API SHALL include the `posted_date` field
4. THE API SHALL validate that posted_date is either NULL or a valid date in YYYY-MM-DD format
5. THE API SHALL validate that posted_date is on or after the transaction date (posted_date >= date)
6. IF posted_date is before the transaction date, THEN THE API SHALL return an error: "Posted date cannot be before transaction date"
7. IF posted_date format validation fails, THEN THE API SHALL return a descriptive error message

### Requirement 5: Backward Compatibility

**User Story:** As a user with existing expenses, I want my data to work correctly after the update, so that I don't lose any information.

#### Acceptance Criteria

1. THE System SHALL treat existing expenses with NULL posted_date as having posted_date equal to transaction date
2. THE System SHALL not require any data migration for existing expenses
3. THE System SHALL maintain the same balance calculation results for expenses that don't use the posted_date feature
4. WHEN a user does not interact with the posted date field, THE System SHALL behave identically to before this feature was added

### Requirement 6: User Interface Behavior

**User Story:** As a user, I want clear visual feedback about posted date status, so that I understand how my expenses affect my credit card balance.

#### Acceptance Criteria

1. THE Expense_Form SHALL only show the posted date field when a credit card payment method is selected
2. WHEN the posted date field is empty, THE Expense_Form SHALL display placeholder text indicating "Uses transaction date"
3. THE Expense_Form SHALL allow clearing the posted date to indicate a pending transaction
4. WHEN switching payment method away from credit card, THE Expense_Form SHALL hide the posted date field
5. WHEN switching payment method to credit card, THE Expense_Form SHALL show the posted date field with the current value (if any)
