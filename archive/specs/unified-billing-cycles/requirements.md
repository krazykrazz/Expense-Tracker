# Requirements Document

## Introduction

This feature consolidates and enhances the credit card billing cycle functionality by merging the "Billing Cycle History" section from the Overview tab and the "Statements" tab into a unified "Billing Cycles" tab. The system will auto-generate billing cycle entries based on historical expenses using the billing_cycle_day configuration, display transaction counts per cycle, and show trend indicators comparing cycle-to-cycle spending using "effective balance" (actual if entered, otherwise calculated).

This enhancement builds on the existing credit-card-billing-cycle-history feature, eliminating redundant UI elements while providing more meaningful trend analysis.

## Glossary

- **Billing_Cycle_Service**: The enhanced backend service responsible for auto-generating billing cycle records and calculating trend indicators.
- **Billing_Cycle_Repository**: The existing data access layer for the credit_card_billing_cycles table.
- **Statement_Balance_Service**: The existing service that calculates statement balance based on billing cycle dates and tracked expenses.
- **Credit_Card_Detail_View**: The frontend component that displays detailed credit card information.
- **Billing_Cycles_Tab**: The renamed and enhanced tab (formerly "Statements") displaying unified billing cycle information.
- **Effective_Balance**: The authoritative balance for a cycle - actual_statement_balance if > 0, otherwise calculated_statement_balance.
- **Trend_Indicator**: Visual indicator showing spending change compared to previous cycle (↑ higher, ↓ lower, ✓ same).
- **Billing_Cycle_Day**: The day of the month when the credit card statement closes (existing field on payment_methods table).
- **Auto_Generated_Cycle**: A billing cycle record created automatically by the system based on historical expense data.

## Requirements

### Requirement 1: Tab Renaming and UI Consolidation

**User Story:** As a user, I want a single "Billing Cycles" tab that shows all cycle-related information, so that I don't see duplicate data in multiple places.

#### Acceptance Criteria

1. WHEN viewing a credit card detail view, THE system SHALL display a tab labeled "Billing Cycles" instead of "Statements".
2. WHEN the "Billing Cycles" tab is active, THE system SHALL display all billing cycle records in a unified list.
3. THE Credit_Card_Detail_View SHALL NOT display the "Billing Cycle History" collapsible section in the Overview tab.
4. WHEN billing_cycle_day is not configured, THE "Billing Cycles" tab SHALL display a message prompting the user to configure billing cycle day.

### Requirement 2: Auto-Generation of Billing Cycles

**User Story:** As a user, I want billing cycle entries to be created automatically based on my expense history, so that I don't have to manually enter each cycle.

#### Acceptance Criteria

1. WHEN a user views the Billing Cycles tab for a credit card with billing_cycle_day configured, THE Billing_Cycle_Service SHALL auto-generate billing cycle records for historical periods that have expenses.
2. WHEN auto-generating a billing cycle, THE Billing_Cycle_Service SHALL calculate cycle_start_date and cycle_end_date based on billing_cycle_day.
3. WHEN auto-generating a billing cycle, THE Billing_Cycle_Service SHALL set actual_statement_balance to 0 (indicating no user-provided value).
4. WHEN auto-generating a billing cycle, THE Billing_Cycle_Service SHALL calculate and store calculated_statement_balance using the Statement_Balance_Service.
5. THE Billing_Cycle_Service SHALL NOT auto-generate duplicate cycles for periods that already have records.
6. WHEN auto-generating cycles, THE Billing_Cycle_Service SHALL generate cycles going back up to 12 months from the current date.

### Requirement 3: Transaction Count Display

**User Story:** As a user, I want to see how many transactions occurred in each billing cycle, so that I can understand my spending patterns.

#### Acceptance Criteria

1. WHEN displaying a billing cycle record, THE system SHALL show the transaction count for that cycle period.
2. WHEN calculating transaction count, THE Billing_Cycle_Service SHALL count all expenses where COALESCE(posted_date, date) falls within the cycle period.
3. WHEN a billing cycle has zero transactions, THE system SHALL display "0 transactions".

### Requirement 4: Effective Balance Calculation

**User Story:** As a user, I want the system to use my actual statement balance when available, so that trend comparisons are accurate.

#### Acceptance Criteria

1. WHEN calculating effective balance for a cycle, THE Billing_Cycle_Service SHALL return actual_statement_balance if it is greater than 0.
2. WHEN actual_statement_balance is 0 or not entered, THE Billing_Cycle_Service SHALL return calculated_statement_balance as the effective balance.
3. WHEN displaying a billing cycle, THE system SHALL indicate whether the balance shown is "Actual" (user-provided) or "Calculated" (auto-generated).

### Requirement 5: Trend Indicator Calculation

**User Story:** As a user, I want to see how my spending compares to the previous billing cycle, so that I can track spending trends.

#### Acceptance Criteria

1. WHEN displaying a billing cycle record, THE system SHALL show a trend indicator comparing to the previous cycle's effective balance.
2. WHEN the current cycle's effective balance is higher than the previous cycle, THE system SHALL display an upward arrow (↑) in orange with the difference amount.
3. WHEN the current cycle's effective balance is lower than the previous cycle, THE system SHALL display a downward arrow (↓) in blue with the difference amount.
4. WHEN the current cycle's effective balance equals the previous cycle (within $1 tolerance), THE system SHALL display a checkmark (✓) in green.
5. WHEN there is no previous cycle to compare against, THE system SHALL NOT display a trend indicator.
6. THE trend indicator SHALL display the absolute difference amount (e.g., "↑ $45.33" or "↓ $120.00").

### Requirement 6: Billing Cycle List Display

**User Story:** As a user, I want to see a comprehensive list of my billing cycles with all relevant information, so that I can review my credit card history.

#### Acceptance Criteria

1. WHEN displaying the billing cycles list, THE system SHALL show cycles sorted by cycle_end_date in descending order (most recent first).
2. WHEN displaying a billing cycle, THE system SHALL show: cycle dates, effective balance, balance type indicator, transaction count, and trend indicator.
3. WHEN a billing cycle has user-entered data (actual_statement_balance > 0), THE system SHALL display edit and delete action buttons.
4. WHEN a billing cycle is auto-generated only (actual_statement_balance = 0), THE system SHALL display an "Enter Statement" button instead of edit/delete.
5. WHEN the user clicks "Enter Statement" on an auto-generated cycle, THE system SHALL open the billing cycle form pre-populated with that cycle's dates.

### Requirement 7: Prerequisite Validation

**User Story:** As a user, I want clear feedback when billing cycle features are unavailable, so that I understand what configuration is needed.

#### Acceptance Criteria

1. WHEN billing_cycle_day is not configured for a credit card, THE Billing Cycles tab SHALL display an empty state with instructions to configure billing cycle day.
2. WHEN billing_cycle_day is not configured, THE system SHALL NOT attempt to auto-generate billing cycles.
3. THE empty state message SHALL explain that billing cycle day must be set in the card's settings.

### Requirement 8: API Enhancements

**User Story:** As a developer, I want enhanced API endpoints that support auto-generation and trend calculation, so that the frontend can display unified billing cycle data.

#### Acceptance Criteria

1. THE system SHALL provide a GET endpoint at /api/payment-methods/:id/billing-cycles/unified that returns billing cycles with transaction counts and trend indicators.
2. WHEN the unified endpoint is called, THE Billing_Cycle_Service SHALL auto-generate missing cycles before returning results.
3. THE unified endpoint response SHALL include for each cycle: id, cycle_start_date, cycle_end_date, effective_balance, balance_type, transaction_count, trend_indicator, actual_statement_balance, calculated_statement_balance.
4. THE unified endpoint SHALL accept optional query parameters: limit (default 12), include_auto_generate (default true).

### Requirement 9: Backward Compatibility

**User Story:** As a user with existing billing cycle data, I want my previously entered statement balances to be preserved, so that I don't lose my historical records.

#### Acceptance Criteria

1. WHEN auto-generating cycles, THE Billing_Cycle_Service SHALL NOT modify existing billing cycle records.
2. WHEN a user has previously entered an actual_statement_balance for a cycle, THE system SHALL preserve that value and use it as the effective balance.
3. THE existing billing cycle CRUD operations SHALL continue to function unchanged.
4. THE existing reminder system integration SHALL continue to use actual_statement_balance when available.

### Requirement 10: Current Billing Cycle Summary

**User Story:** As a user, I want to see a summary of my current billing cycle in the Overview tab, so that I can quickly understand my current spending.

#### Acceptance Criteria

1. THE Overview tab SHALL continue to display the "Current Billing Cycle" card showing cycle dates, transaction count, and total spent.
2. WHEN the current billing cycle has payments, THE system SHALL display the payment count and total in the Current Billing Cycle card.
3. THE Current Billing Cycle card SHALL remain in the Overview tab (not moved to Billing Cycles tab).

