# Requirements Document

## Introduction

This feature displays the next mortgage payment date in the CurrentStatusInsights component by leveraging the existing fixed expense - loan linkage system. Fixed expenses linked to mortgages already store a `payment_due_day` field, and `LoanDetailView` already fetches linked fixed expenses. This feature simply passes that data down to CurrentStatusInsights and renders it with appropriate formatting and visual indicators.

No database changes, no API changes, no form updates are needed.

## Glossary

- **CurrentStatusInsights**: The frontend component that displays current mortgage status including rate, interest breakdown, and payment information
- **LoanDetailView**: The frontend component that manages the mortgage detail view and already fetches linked fixed expenses via `getFixedExpensesByLoan()`
- **MortgageInsightsPanel**: The intermediate component that renders CurrentStatusInsights and receives mortgage data
- **Linked_Fixed_Expense**: A fixed expense record linked to a loan via `linked_loan_id`, which includes a `payment_due_day` field (1-31)
- **Payment_Due_Day**: An integer (1-31) from the linked fixed expense representing the day of the month when a mortgage payment is due
- **Next_Payment_Date**: The calculated next occurrence of the payment due day based on the current date

## Requirements

### Requirement 1: Pass Payment Due Day Through Component Tree

**User Story:** As a developer, I want the payment due day from linked fixed expenses to flow through the component tree to CurrentStatusInsights, so that the component can display next payment information.

#### Acceptance Criteria

1. WHEN LoanDetailView fetches linked fixed expenses THEN THE LoanDetailView SHALL extract the `payment_due_day` from the first linked fixed expense
2. WHEN LoanDetailView renders MortgageInsightsPanel THEN THE LoanDetailView SHALL pass the extracted `payment_due_day` as a prop
3. WHEN MortgageInsightsPanel renders CurrentStatusInsights THEN THE MortgageInsightsPanel SHALL forward the `payment_due_day` prop

### Requirement 2: Next Payment Date Calculation

**User Story:** As a user, I want the system to calculate when my next mortgage payment is due, so that I can see the upcoming payment date.

#### Acceptance Criteria

1. WHEN a `payment_due_day` is provided THEN THE Next_Payment_Calculator SHALL determine the next payment date based on the current date and payment_due_day
2. IF the payment_due_day has already passed in the current month THEN THE Next_Payment_Calculator SHALL return the payment_due_day in the next month
3. IF the payment_due_day has not yet occurred in the current month THEN THE Next_Payment_Calculator SHALL return the payment_due_day in the current month
4. WHEN payment_due_day is 31 and the target month has fewer than 31 days THEN THE Next_Payment_Calculator SHALL return the last day of that month
5. WHEN payment_due_day is 29, 30, or 31 and the target month is February THEN THE Next_Payment_Calculator SHALL return the last day of February

### Requirement 3: Next Payment Date Display

**User Story:** As a user, I want to see when my next mortgage payment is due in the mortgage insights panel, so that I can plan my finances.

#### Acceptance Criteria

1. WHEN payment_due_day is set THEN THE CurrentStatusInsights SHALL display "Next payment: [formatted date]" in a user-friendly format (e.g., "January 15, 2025")
2. WHEN the next payment is within 7 days THEN THE CurrentStatusInsights SHALL show a "Due soon" visual indicator
3. WHEN the next payment is today THEN THE CurrentStatusInsights SHALL show "Payment due today" with emphasis styling
4. WHEN no linked fixed expense exists or payment_due_day is not set THEN THE CurrentStatusInsights SHALL display "Payment day not set" with a hint to configure it in fixed expenses
