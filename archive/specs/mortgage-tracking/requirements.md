# Requirements Document

## Introduction

This document specifies the requirements for adding mortgage tracking capabilities to the existing loan management system. The feature introduces a new "mortgage" loan type with specialized fields and analytics for tracking mortgages, including amortization periods, term lengths, renewal dates, variable rate support, equity tracking, and detailed payment analytics.

## Glossary

- **Mortgage_System**: The subsystem responsible for managing mortgage-specific data and calculations within the loan tracking module
- **Loan_Repository**: The data access layer for loan and mortgage records
- **Balance_Repository**: The data access layer for monthly balance and rate history records
- **Amortization_Calculator**: The component that computes amortization schedules and payment breakdowns
- **Equity_Calculator**: The component that calculates property equity based on estimated value and remaining balance
- **Rate_Type**: An indicator specifying whether a mortgage has a fixed or variable interest rate
- **Payment_Frequency**: The schedule for mortgage payments (monthly, bi-weekly, accelerated bi-weekly)
- **Term**: The period until the mortgage must be renewed or renegotiated
- **Amortization_Period**: The total time over which the mortgage would be fully paid off

## Requirements

### Requirement 1: Mortgage Loan Type

**User Story:** As a user, I want to create mortgages as a distinct loan type, so that I can track mortgage-specific information separately from regular loans and lines of credit.

#### Acceptance Criteria

1. WHEN a user creates a new loan, THE Mortgage_System SHALL provide "mortgage" as a loan type option alongside "loan" and "line_of_credit"
2. WHEN a mortgage is created, THE Mortgage_System SHALL require amortization period in years
3. WHEN a mortgage is created, THE Mortgage_System SHALL require term length in years
4. WHEN a mortgage is created, THE Mortgage_System SHALL require a renewal date
5. WHEN a mortgage is created, THE Mortgage_System SHALL require a rate type selection (fixed or variable)
6. WHEN a mortgage is created, THE Mortgage_System SHALL require a payment frequency selection (monthly, bi-weekly, or accelerated bi-weekly)
7. WHEN a mortgage is created, THE Mortgage_System SHALL allow an optional estimated property value for equity tracking

### Requirement 2: Mortgage Data Persistence

**User Story:** As a user, I want my mortgage data to be saved and retrieved correctly, so that I can track my mortgage over time.

#### Acceptance Criteria

1. THE Loan_Repository SHALL store mortgage-specific fields (amortization_period, term_length, renewal_date, rate_type, payment_frequency, estimated_property_value) in the loans table
2. WHEN a mortgage is retrieved, THE Loan_Repository SHALL return all mortgage-specific fields along with standard loan fields
3. WHEN a mortgage is updated, THE Loan_Repository SHALL persist changes to mortgage-specific fields
4. WHEN the database schema is updated, THE Mortgage_System SHALL provide a migration script that runs automatically on container startup
5. IF a loan type is not "mortgage", THEN THE Mortgage_System SHALL treat mortgage-specific fields as null

### Requirement 3: Variable Rate Support

**User Story:** As a user with a variable rate mortgage, I want to update my current interest rate and see rate history, so that I can track how my rate changes over time.

#### Acceptance Criteria

1. WHEN a mortgage has rate_type "variable", THE Mortgage_System SHALL display a prominent rate update option
2. WHEN a user updates the interest rate, THE Balance_Repository SHALL create a new balance entry for the current month with the updated rate
3. WHEN viewing a variable rate mortgage, THE Mortgage_System SHALL display a rate history chart showing rate changes over time
4. THE Balance_Repository SHALL leverage the existing loan_balances table to track monthly rate history

### Requirement 4: Equity Tracking

**User Story:** As a homeowner, I want to track my home equity, so that I can understand my net worth position in my property.

#### Acceptance Criteria

1. WHEN a mortgage has an estimated property value, THE Equity_Calculator SHALL calculate equity as (estimated_property_value - remaining_balance)
2. WHEN viewing a mortgage with equity data, THE Mortgage_System SHALL display current equity amount and percentage
3. WHEN viewing a mortgage with historical data, THE Mortgage_System SHALL display an equity buildup chart over time
4. WHEN a user updates the estimated property value, THE Mortgage_System SHALL recalculate and display updated equity

### Requirement 5: Amortization Schedule

**User Story:** As a mortgage holder, I want to see my amortization schedule, so that I can understand how my payments are allocated between principal and interest over time.

#### Acceptance Criteria

1. WHEN viewing a mortgage, THE Amortization_Calculator SHALL generate a projected amortization schedule based on current balance, rate, and remaining amortization period
2. THE Amortization_Calculator SHALL calculate monthly payment amounts based on payment frequency
3. THE Amortization_Calculator SHALL show principal vs interest breakdown for each payment period
4. WHEN the interest rate changes, THE Amortization_Calculator SHALL recalculate the schedule with the new rate
5. THE Mortgage_System SHALL display a visualization of principal paid vs interest paid over time

### Requirement 6: Payment Analytics

**User Story:** As a user, I want to see detailed analytics about my mortgage payments, so that I can understand my payment history and projections.

#### Acceptance Criteria

1. WHEN viewing a mortgage, THE Mortgage_System SHALL display total principal paid to date
2. WHEN viewing a mortgage, THE Mortgage_System SHALL display total interest paid to date (calculated from balance changes and rates)
3. WHEN viewing a mortgage, THE Mortgage_System SHALL display a chart showing principal vs interest paid over time
4. WHEN viewing a mortgage, THE Mortgage_System SHALL display the estimated payoff date based on current payment schedule

### Requirement 7: Renewal Tracking

**User Story:** As a mortgage holder, I want to be reminded of upcoming renewals, so that I can prepare for rate negotiations.

#### Acceptance Criteria

1. WHEN a mortgage renewal date is within 6 months, THE Mortgage_System SHALL display a renewal reminder indicator
2. WHEN viewing a mortgage, THE Mortgage_System SHALL display the renewal date and time until renewal
3. WHEN a mortgage renewal date has passed, THE Mortgage_System SHALL prompt the user to update renewal information

### Requirement 8: Mortgage Detail View

**User Story:** As a user, I want a comprehensive view of my mortgage details, so that I can see all relevant information in one place.

#### Acceptance Criteria

1. WHEN viewing a mortgage, THE Mortgage_System SHALL display all mortgage-specific fields (amortization period, term, renewal date, rate type, payment frequency)
2. WHEN viewing a mortgage, THE Mortgage_System SHALL display current balance, original amount, and paydown progress
3. WHEN viewing a mortgage, THE Mortgage_System SHALL display equity information if estimated property value is provided
4. WHEN viewing a mortgage, THE Mortgage_System SHALL display rate history for variable rate mortgages
5. THE Mortgage_System SHALL extend the existing LoanDetailView component with mortgage-specific sections

### Requirement 9: Mortgage Form Integration

**User Story:** As a user, I want to create and edit mortgages through the existing loan management interface, so that the experience is consistent with other loan types.

#### Acceptance Criteria

1. WHEN the user selects "mortgage" as loan type, THE Mortgage_System SHALL display additional mortgage-specific form fields
2. WHEN editing a mortgage, THE Mortgage_System SHALL allow updating of editable fields (name, notes, estimated property value, renewal date)
3. WHEN editing a mortgage, THE Mortgage_System SHALL prevent modification of initial balance, start date, amortization period, and term length
4. THE Mortgage_System SHALL extend the existing LoansModal component with mortgage-specific form fields
5. THE Mortgage_System SHALL validate all mortgage-specific fields before submission

### Requirement 10: Data Validation

**User Story:** As a user, I want the system to validate my mortgage data, so that I can avoid entering incorrect information.

#### Acceptance Criteria

1. WHEN creating a mortgage, THE Mortgage_System SHALL validate that amortization period is between 1 and 40 years
2. WHEN creating a mortgage, THE Mortgage_System SHALL validate that term length is between 1 and 10 years
3. WHEN creating a mortgage, THE Mortgage_System SHALL validate that term length does not exceed amortization period
4. WHEN creating a mortgage, THE Mortgage_System SHALL validate that renewal date is in the future
5. WHEN creating a mortgage, THE Mortgage_System SHALL validate that estimated property value is greater than zero if provided
6. IF validation fails, THEN THE Mortgage_System SHALL display specific error messages for each invalid field
