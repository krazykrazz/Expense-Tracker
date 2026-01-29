# Requirements Document

## Introduction

This feature adds payment day tracking to the existing mortgage configuration, enabling users to track when their mortgage payments are due each month. The system will display "Next payment due" dates in the mortgage insights panel and potentially integrate with the existing Monthly Data Reminders system to notify users of upcoming payments.

## Glossary

- **Payment_Day**: An integer value (1-31) representing the day of the month when a mortgage payment is due
- **Mortgage**: A loan type with amortization tracking, equity calculations, and renewal reminders (loan_type = 'mortgage')
- **Next_Payment_Date**: The calculated date of the next upcoming mortgage payment based on the current date and payment_day
- **Monthly_Data_Reminders**: The existing system that prompts users to update investment values and loan balances at the start of each month
- **CurrentStatusInsights**: The frontend component that displays current mortgage status including rate, interest breakdown, and payment information
- **LoansModal**: The frontend component for creating and editing loans/mortgages

## Requirements

### Requirement 1: Database Schema Extension

**User Story:** As a system administrator, I want the loans table to support a payment day field, so that mortgage payment due dates can be stored and retrieved.

#### Acceptance Criteria

1. THE Database_Migration SHALL add a `payment_day` column of type INTEGER to the loans table
2. THE Database_Migration SHALL allow `payment_day` values between 1 and 31 inclusive
3. THE Database_Migration SHALL allow `payment_day` to be NULL for backward compatibility with existing mortgages
4. THE Database_Migration SHALL only apply `payment_day` semantically to loans where loan_type is 'mortgage'
5. WHEN the migration runs on an existing database THEN THE Database_Migration SHALL preserve all existing loan data

### Requirement 2: Mortgage Creation Form

**User Story:** As a user, I want to specify the payment day when creating a new mortgage, so that the system knows when my payments are due.

#### Acceptance Criteria

1. WHEN a user selects loan_type 'mortgage' in LoansModal THEN THE System SHALL display a payment day input field
2. THE Payment_Day_Input SHALL present values 1 through 31 as selectable options
3. THE Payment_Day_Input SHALL be optional (user can leave it unset)
4. WHEN a user submits a mortgage with a payment_day value THEN THE System SHALL validate that the value is between 1 and 31
5. IF a user enters an invalid payment_day value THEN THE System SHALL display a validation error and prevent form submission

### Requirement 3: Mortgage Edit Form

**User Story:** As a user, I want to add or update the payment day on an existing mortgage, so that I can correct or add this information after initial creation.

#### Acceptance Criteria

1. WHEN a user edits an existing mortgage THEN THE System SHALL display the current payment_day value if set
2. WHEN a user edits an existing mortgage THEN THE System SHALL allow modification of the payment_day field
3. THE Payment_Day_Field SHALL be editable even after mortgage creation (unlike amortization_period)
4. WHEN a user saves changes to payment_day THEN THE System SHALL persist the updated value to the database

### Requirement 4: Next Payment Date Calculation

**User Story:** As a user, I want to see when my next mortgage payment is due, so that I can plan my finances accordingly.

#### Acceptance Criteria

1. WHEN a mortgage has a payment_day set THEN THE CurrentStatusInsights SHALL display the next payment due date
2. THE Next_Payment_Calculator SHALL determine the next payment date based on the current date and payment_day
3. IF the payment_day has already passed in the current month THEN THE Next_Payment_Calculator SHALL return the payment_day in the next month
4. IF the payment_day has not yet occurred in the current month THEN THE Next_Payment_Calculator SHALL return the payment_day in the current month
5. WHEN payment_day is 31 and the target month has fewer than 31 days THEN THE Next_Payment_Calculator SHALL return the last day of that month
6. WHEN payment_day is 30 and the target month is February THEN THE Next_Payment_Calculator SHALL return the last day of February
7. WHEN a mortgage does not have a payment_day set THEN THE CurrentStatusInsights SHALL not display a next payment date

### Requirement 5: Next Payment Date Display

**User Story:** As a user, I want the next payment date displayed clearly in the mortgage insights panel, so that I can easily see when payment is due.

#### Acceptance Criteria

1. THE CurrentStatusInsights SHALL display "Next payment: [formatted date]" when payment_day is set
2. THE Next_Payment_Display SHALL format the date in a user-friendly format (e.g., "January 15, 2025")
3. WHEN the next payment is within 7 days THEN THE Next_Payment_Display SHALL show a visual indicator highlighting the upcoming payment
4. WHEN the next payment is today THEN THE Next_Payment_Display SHALL show "Payment due today" with emphasis styling
5. WHEN payment_day is not set THEN THE CurrentStatusInsights SHALL display "Payment day not set" with a hint to configure it

### Requirement 6: API Layer Support

**User Story:** As a developer, I want the API to support payment_day in loan CRUD operations, so that the frontend can read and write this field.

#### Acceptance Criteria

1. WHEN creating a mortgage via POST /api/loans THEN THE API SHALL accept an optional payment_day field
2. WHEN updating a mortgage via PUT /api/loans/:id THEN THE API SHALL accept an optional payment_day field
3. WHEN retrieving loans via GET /api/loans THEN THE API SHALL include the payment_day field in the response
4. THE API SHALL validate that payment_day is between 1 and 31 when provided
5. IF an invalid payment_day is provided THEN THE API SHALL return a 400 error with a descriptive message

