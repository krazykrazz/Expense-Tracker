# Requirements Document

## Introduction

This feature adds visual trend indicators to the expense tracking application, showing month-over-month changes for weekly breakdowns, payment types, and expense types. Users will see at-a-glance whether their spending in each category is increasing or decreasing compared to the previous month, using color-coded arrows (green for down, red for up).

## Glossary

- **Trend Indicator**: A visual element (arrow icon) that shows the direction and magnitude of change between the current month and previous month
- **Monthly Summary**: The dashboard view showing expense breakdowns by week, type, and payment method
- **Month-over-Month (MoM)**: Comparison of current month's value to the previous month's value
- **Expense Tracker**: The system that manages and displays expense data

## Requirements

### Requirement 1

**User Story:** As a user, I want to see trend indicators on weekly expense breakdowns, so that I can quickly identify if my weekly spending is increasing or decreasing compared to last month.

#### Acceptance Criteria

1. WHEN viewing the monthly summary THEN the Expense Tracker SHALL display a trend indicator next to each week's total expense amount
2. WHEN the current week's expenses are higher than the same week in the previous month THEN the Expense Tracker SHALL display a red upward arrow
3. WHEN the current week's expenses are lower than the same week in the previous month THEN the Expense Tracker SHALL display a green downward arrow
4. WHEN the current week's expenses are equal to the same week in the previous month THEN the Expense Tracker SHALL display no trend indicator
5. WHEN viewing the first month of data with no previous month THEN the Expense Tracker SHALL display no trend indicators

### Requirement 2

**User Story:** As a user, I want to see trend indicators on expense type breakdowns, so that I can monitor which categories are growing or shrinking month-over-month.

#### Acceptance Criteria

1. WHEN viewing expense type breakdowns for all 14 expense categories THEN the Expense Tracker SHALL display a trend indicator next to each type's total
2. WHEN a type's current month total is higher than the previous month THEN the Expense Tracker SHALL display a red upward arrow
3. WHEN a type's current month total is lower than the previous month THEN the Expense Tracker SHALL display a green downward arrow
4. WHEN a type's current month total equals the previous month THEN the Expense Tracker SHALL display no trend indicator
5. WHEN a type has expenses in the current month but not in the previous month THEN the Expense Tracker SHALL display a red upward arrow

### Requirement 3

**User Story:** As a user, I want to see trend indicators on payment method breakdowns, so that I can track changes in how I'm paying for expenses.

#### Acceptance Criteria

1. WHEN viewing payment method breakdowns (Credit, Debit, Cash, Cheque) THEN the Expense Tracker SHALL display a trend indicator next to each method's total
2. WHEN a payment method's current month total is higher than the previous month THEN the Expense Tracker SHALL display a red upward arrow
3. WHEN a payment method's current month total is lower than the previous month THEN the Expense Tracker SHALL display a green downward arrow
4. WHEN a payment method's current month total equals the previous month THEN the Expense Tracker SHALL display no trend indicator
5. WHEN a payment method has expenses in the current month but not in the previous month THEN the Expense Tracker SHALL display a red upward arrow

### Requirement 4

**User Story:** As a user, I want trend indicators to be visually subtle and informative, so that they enhance the interface without cluttering it.

#### Acceptance Criteria

1. WHEN trend indicators are displayed THEN the Expense Tracker SHALL use small, compact arrow icons
2. WHEN displaying upward trends THEN the Expense Tracker SHALL use red color (#e74c3c or similar)
3. WHEN displaying downward trends THEN the Expense Tracker SHALL use green color (#27ae60 or similar)
4. WHEN hovering over a trend indicator THEN the Expense Tracker SHALL display a tooltip showing the percentage change
5. WHEN the percentage change is less than 1% THEN the Expense Tracker SHALL display no trend indicator to avoid noise
