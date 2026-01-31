# Requirements Document

## Introduction

This feature implements three distinct balance calculations for credit cards to provide users with a complete picture of their credit card status. Currently, the system uses a single "current_balance" that tracks all-time totals (all expenses minus all payments), which creates confusion when expense counts (based on billing cycles) change but balances don't. This feature introduces Statement Balance, Current (Posted) Balance, and Projected Balance to give users accurate, context-aware balance information.

## Glossary

- **Balance_Calculator**: The service component responsible for computing the three balance types for credit cards
- **Effective_Date**: The date used for balance calculations, defined as COALESCE(posted_date, date) - uses posted_date if available, otherwise the transaction date
- **Statement_Balance**: Sum of all transactions from past billing cycles only, minus payments dated before current cycle start
- **Current_Balance**: Sum of all transactions with effective date ≤ today, minus payments dated ≤ today (what you currently owe)
- **Projected_Balance**: Sum of ALL transactions including future-dated ones, minus all payments (what balance will be once all pre-logged expenses post)
- **Billing_Cycle**: The period defined by billing_cycle_start and billing_cycle_end day-of-month fields on the payment_methods table
- **Credit_Card_Detail_View**: The frontend component that displays credit card information including balances

## Requirements

### Requirement 1: Statement Balance Calculation

**User Story:** As a credit card user, I want to see my statement balance, so that I know what charges have been finalized from previous billing cycles.

#### Acceptance Criteria

1. WHEN the Balance_Calculator computes statement balance, THE Balance_Calculator SHALL sum all expenses where effective_date < current billing cycle start date
2. WHEN the Balance_Calculator computes statement balance, THE Balance_Calculator SHALL subtract all payments where payment_date < current billing cycle start date
3. IF a credit card has no billing cycle configured, THEN THE Balance_Calculator SHALL return null for statement balance
4. THE Balance_Calculator SHALL use COALESCE(posted_date, date) as the effective_date for each expense
5. WHEN statement balance is calculated, THE Balance_Calculator SHALL ensure the result is never negative (minimum 0)

### Requirement 2: Current (Posted) Balance Calculation

**User Story:** As a credit card user, I want to see my current posted balance, so that I know what I actually owe right now.

#### Acceptance Criteria

1. WHEN the Balance_Calculator computes current balance, THE Balance_Calculator SHALL sum all expenses where effective_date ≤ today
2. WHEN the Balance_Calculator computes current balance, THE Balance_Calculator SHALL subtract all payments where payment_date ≤ today
3. THE Balance_Calculator SHALL use COALESCE(posted_date, date) as the effective_date for each expense
4. WHEN current balance is calculated, THE Balance_Calculator SHALL ensure the result is never negative (minimum 0)
5. WHEN an expense's posted_date is updated, THE current balance SHALL automatically reflect the change without manual recalculation

### Requirement 3: Projected Balance Calculation

**User Story:** As a credit card user, I want to see my projected balance, so that I can plan for what my balance will be once all pre-logged expenses post.

#### Acceptance Criteria

1. WHEN the Balance_Calculator computes projected balance, THE Balance_Calculator SHALL sum ALL expenses regardless of date
2. WHEN the Balance_Calculator computes projected balance, THE Balance_Calculator SHALL subtract ALL payments regardless of date
3. WHEN projected balance is calculated, THE Balance_Calculator SHALL ensure the result is never negative (minimum 0)
4. THE projected balance SHALL include future-dated expenses that have not yet posted

### Requirement 4: Balance Display in Credit Card Detail View

**User Story:** As a user, I want to see all three balance types in the credit card detail view, so that I have a complete picture of my credit card status.

#### Acceptance Criteria

1. WHEN the Credit_Card_Detail_View displays a credit card, THE Credit_Card_Detail_View SHALL show the current balance prominently
2. WHEN the Credit_Card_Detail_View displays a credit card with a configured billing cycle, THE Credit_Card_Detail_View SHALL show the statement balance
3. WHEN the Credit_Card_Detail_View displays a credit card, THE Credit_Card_Detail_View SHALL show the projected balance if it differs from current balance
4. WHEN projected balance equals current balance, THE Credit_Card_Detail_View SHALL hide or de-emphasize the projected balance display
5. THE Credit_Card_Detail_View SHALL display utilization percentage based on the current balance

### Requirement 5: Expense Count Consistency

**User Story:** As a user, I want the expense count and balance calculations to be consistent, so that changes to posted_date affect both metrics appropriately.

#### Acceptance Criteria

1. WHEN counting expenses for the current billing cycle, THE Balance_Calculator SHALL use effective_date (COALESCE(posted_date, date)) for date filtering
2. WHEN an expense's posted_date is changed, THE expense count for the billing cycle SHALL update accordingly
3. WHEN an expense's posted_date is changed, THE current balance SHALL update accordingly
4. THE expense count and current balance SHALL both use the same effective_date logic for consistency

### Requirement 6: Payment Impact on Balances

**User Story:** As a user, I want payments to correctly reduce the appropriate balance types, so that my balance information is accurate.

#### Acceptance Criteria

1. WHEN a payment is recorded with a date before the current billing cycle start, THE payment SHALL reduce the statement balance
2. WHEN a payment is recorded with a date ≤ today, THE payment SHALL reduce the current balance
3. WHEN a payment is recorded, THE payment SHALL always reduce the projected balance regardless of date
4. WHEN a payment is deleted, THE Balance_Calculator SHALL correctly reverse the payment's impact on all applicable balance types

### Requirement 7: API Response Structure

**User Story:** As a frontend developer, I want the API to return all three balance types, so that I can display them in the UI.

#### Acceptance Criteria

1. WHEN the credit card detail API is called, THE API SHALL return statement_balance, current_balance, and projected_balance fields
2. WHEN statement_balance cannot be calculated (no billing cycle), THE API SHALL return null for statement_balance
3. THE API SHALL return the billing cycle dates used for calculations when available
4. THE API SHALL return a flag indicating whether projected_balance differs from current_balance

### Requirement 8: Billing Cycle as First-Class Entity

**User Story:** As a credit card user, I want to view my billing cycles as distinct periods, so that I can understand my spending patterns per cycle.

#### Acceptance Criteria

1. WHEN the Credit_Card_Detail_View displays a credit card with billing cycle configured, THE Credit_Card_Detail_View SHALL show the current billing cycle period (start and end dates)
2. WHEN displaying a billing cycle, THE Credit_Card_Detail_View SHALL show the number of transactions within that cycle
3. WHEN displaying a billing cycle, THE Credit_Card_Detail_View SHALL show the total amount spent within that cycle
4. THE Balance_Calculator SHALL provide a method to get billing cycle details including transaction count and total
5. WHEN a user views billing cycle details, THE Credit_Card_Detail_View SHALL clearly distinguish between current cycle transactions and statement (past cycle) transactions

### Requirement 9: Billing Cycle History

**User Story:** As a credit card user, I want to view past billing cycles, so that I can review my historical spending patterns.

#### Acceptance Criteria

1. WHEN the Credit_Card_Detail_View displays billing cycle information, THE Credit_Card_Detail_View SHALL allow navigation to previous billing cycles
2. WHEN viewing a past billing cycle, THE Credit_Card_Detail_View SHALL show the transaction count for that cycle
3. WHEN viewing a past billing cycle, THE Credit_Card_Detail_View SHALL show the total amount for that cycle
4. THE Balance_Calculator SHALL provide a method to calculate billing cycle details for any given cycle period
