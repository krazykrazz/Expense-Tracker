# Requirements Document

## Introduction

This document specifies the requirements for the Mortgage Insights feature, which extends the existing mortgage tracking system with practical financial insights. The feature provides users with actionable information about their mortgage including daily interest costs, payment tracking, payoff projections, and "what-if" scenario analysis to help optimize their mortgage strategy.

## Glossary

- **Insights_Engine**: The subsystem responsible for calculating and presenting mortgage insights and projections
- **Payment_Tracker**: The component that tracks and manages user-entered payment amounts over time
- **Interest_Calculator**: The component that calculates daily and periodic interest costs based on current balance and rate
- **Payoff_Projector**: The component that projects payoff dates based on different payment scenarios
- **Scenario_Analyzer**: The component that calculates "what-if" scenarios for extra payments
- **Current_Payment**: The user-entered actual payment amount being made (may differ from calculated minimum)
- **Minimum_Payment**: The calculated minimum payment based on amortization schedule
- **Interest_Per_Day**: The daily interest cost calculated from current balance and annual rate

## Requirements

### Requirement 1: Payment Amount Tracking

**User Story:** As a mortgage holder, I want to track my current payment amount, so that I can see how my actual payments compare to the minimum required payment.

#### Acceptance Criteria

1. WHEN viewing a mortgage, THE Insights_Engine SHALL display a field for the current payment amount
2. WHEN a user enters or updates the current payment amount, THE Payment_Tracker SHALL persist the payment amount with a timestamp
3. WHEN the current payment amount changes, THE Payment_Tracker SHALL create a new payment history entry preserving the previous value
4. WHEN viewing payment history, THE Insights_Engine SHALL display all payment amount changes with their effective dates
5. IF no current payment is set, THEN THE Insights_Engine SHALL use the calculated minimum payment as the default

### Requirement 2: Interest Rate Display

**User Story:** As a mortgage holder, I want to see my current interest rate prominently displayed, so that I can quickly understand my current rate situation.

#### Acceptance Criteria

1. WHEN viewing a mortgage, THE Insights_Engine SHALL display the current interest rate from the most recent loan_balances entry
2. WHEN the mortgage has rate_type "variable", THE Insights_Engine SHALL display a visual indicator highlighting the rate
3. WHEN viewing rate history, THE Insights_Engine SHALL show rate changes over time with dates
4. IF no balance entries exist, THEN THE Insights_Engine SHALL display "Rate not set" with a prompt to add a balance entry

### Requirement 3: Daily Interest Calculation

**User Story:** As a mortgage holder, I want to see how much interest I'm paying per day, so that I can understand the real cost of my mortgage in tangible terms.

#### Acceptance Criteria

1. WHEN viewing a mortgage with balance data, THE Interest_Calculator SHALL calculate interest per day as (current_balance × annual_rate / 365)
2. WHEN displaying daily interest, THE Insights_Engine SHALL show the amount formatted as currency
3. WHEN the balance or rate changes, THE Interest_Calculator SHALL recalculate the daily interest automatically
4. THE Insights_Engine SHALL display weekly and monthly interest amounts alongside daily interest
5. IF balance or rate is zero or missing, THEN THE Interest_Calculator SHALL display zero with an explanatory message

### Requirement 4: Payoff Date Projection

**User Story:** As a mortgage holder, I want to see when my mortgage will be paid off based on my current payments, so that I can plan for the future.

#### Acceptance Criteria

1. WHEN viewing a mortgage, THE Payoff_Projector SHALL calculate the projected payoff date based on current payment amount
2. WHEN viewing a mortgage, THE Payoff_Projector SHALL calculate the projected payoff date based on minimum payment amount
3. THE Payoff_Projector SHALL display both payoff dates for comparison
4. THE Payoff_Projector SHALL calculate total interest paid under each scenario
5. WHEN current payment exceeds minimum payment, THE Insights_Engine SHALL highlight the time saved and interest saved
6. IF current payment is less than minimum payment, THEN THE Insights_Engine SHALL display a warning that the mortgage will not be paid off on schedule

### Requirement 5: What-If Scenario Analysis

**User Story:** As a mortgage holder, I want to see what happens if I pay extra each month, so that I can make informed decisions about accelerating my mortgage payoff.

#### Acceptance Criteria

1. WHEN viewing mortgage insights, THE Scenario_Analyzer SHALL provide an input for extra monthly payment amount
2. WHEN a user enters an extra payment amount, THE Scenario_Analyzer SHALL calculate the new payoff date
3. THE Scenario_Analyzer SHALL calculate months saved compared to current payment schedule
4. THE Scenario_Analyzer SHALL calculate total interest saved compared to current payment schedule
5. THE Scenario_Analyzer SHALL display a comparison table showing current vs scenario outcomes
6. THE Insights_Engine SHALL provide preset scenario buttons for common extra payment amounts ($100, $250, $500, $1000)

### Requirement 6: Insights Dashboard

**User Story:** As a mortgage holder, I want to see all my mortgage insights in one organized view, so that I can quickly understand my mortgage situation.

#### Acceptance Criteria

1. WHEN viewing a mortgage, THE Insights_Engine SHALL display an insights section within the mortgage detail view
2. THE Insights_Engine SHALL organize insights into logical groups: Current Status, Projections, and Scenarios
3. THE Insights_Engine SHALL use visual indicators (colors, icons) to highlight positive and negative insights
4. WHEN insights data is loading, THE Insights_Engine SHALL display appropriate loading states
5. IF insufficient data exists for calculations, THEN THE Insights_Engine SHALL display helpful messages explaining what data is needed

### Requirement 7: Extensibility

**User Story:** As a developer, I want the insights system to be extensible, so that new insights can be added easily in the future.

#### Acceptance Criteria

1. THE Insights_Engine SHALL implement a modular architecture where each insight type is a separate component
2. THE Insights_Engine SHALL define a standard interface for insight calculations
3. THE Insights_Engine SHALL store insight configurations in a way that allows easy addition of new insight types
4. WHEN adding a new insight type, THE Insights_Engine SHALL require only the new calculation logic and display component

### Requirement 8: Data Persistence

**User Story:** As a user, I want my payment tracking data to be saved, so that I can track changes over time.

#### Acceptance Criteria

1. THE Payment_Tracker SHALL store payment amounts in a new mortgage_payments table
2. THE Payment_Tracker SHALL record the effective date for each payment amount entry
3. WHEN retrieving payment history, THE Payment_Tracker SHALL return entries in chronological order
4. THE Payment_Tracker SHALL provide a migration script that runs automatically on container startup
5. WHEN a mortgage is deleted, THE Payment_Tracker SHALL cascade delete associated payment entries

</content>
</invoke>