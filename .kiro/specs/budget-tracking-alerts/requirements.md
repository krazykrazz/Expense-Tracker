# Requirements Document

## Introduction

This document specifies the requirements for the Budget Tracking & Alerts feature for the Expense Tracker application. This feature enables users to set monthly budgets per expense category, monitor spending against those budgets in real-time, and receive visual alerts when approaching or exceeding budget limits.

## Glossary

- **Budget System**: The application component responsible for managing budget limits and tracking spending against those limits
- **Budget Limit**: A maximum spending amount set by the user for a specific category in a specific month
- **Budget Progress**: The percentage of a budget limit that has been consumed by actual spending
- **Alert Threshold**: A predefined percentage (80%, 90%, 100%) that triggers a visual warning when budget progress reaches or exceeds it
- **Expense Category**: One of the seventeen predefined expense types (Clothing, Dining Out, Entertainment, Gas, Gifts, Groceries, Housing, Insurance, Personal Care, Pet Care, Recreation Activities, Subscriptions, Utilities, Vehicle Maintenance, Other, Tax - Medical, Tax - Donation)
- **Budgetable Category**: An expense category that can have budget limits set (all categories except tax-deductible categories: Clothing, Dining Out, Entertainment, Gas, Gifts, Groceries, Housing, Insurance, Personal Care, Pet Care, Recreation Activities, Subscriptions, Utilities, Vehicle Maintenance, Other)
- **Budget Period**: A single month for which budget limits are set and tracked
- **Budget Status**: The current state of a budget (under budget, approaching limit, at limit, over budget)

## Requirements

### Requirement 1

**User Story:** As a user, I want to set monthly budget limits for each expense category, so that I can control my spending in specific areas.

#### Acceptance Criteria

1. WHEN a user accesses the budget management interface THEN the system SHALL display only budgetable categories (all 15 non-tax-deductible categories: Clothing, Dining Out, Entertainment, Gas, Gifts, Groceries, Housing, Insurance, Personal Care, Pet Care, Recreation Activities, Subscriptions, Utilities, Vehicle Maintenance, Other) with current budget settings
2. WHEN a user sets a budget limit for a category THEN the system SHALL store the limit amount and associate it with the current month and category
3. WHEN a user updates an existing budget limit THEN the system SHALL replace the previous limit with the new value
4. WHEN a user removes a budget limit THEN the system SHALL delete the limit and stop tracking that category
5. WHERE a budget limit is set THEN the system SHALL validate that the amount is a positive number greater than zero
6. WHEN a user attempts to set a budget for a tax-deductible category THEN the system SHALL prevent the action and display an informative message

### Requirement 2

**User Story:** As a user, I want to see visual progress bars showing how much of each budget I've used, so that I can quickly understand my spending status.

#### Acceptance Criteria

1. WHEN a user views the budget interface THEN the system SHALL display a progress bar for each category with an active budget
2. WHEN calculating budget progress THEN the system SHALL compute the percentage as (total spent / budget limit) × 100
3. WHEN displaying progress bars THEN the system SHALL use color coding to indicate budget status (green for under 80%, yellow for 80-99%, red for 100% or more)
4. WHEN a user adds or modifies an expense THEN the system SHALL immediately update the corresponding budget progress bar
5. WHEN total spending exceeds the budget limit THEN the system SHALL display the progress bar at 100% with overflow indication

### Requirement 3

**User Story:** As a user, I want to receive visual alerts when I'm approaching or exceeding my budget limits, so that I can adjust my spending behavior proactively.

#### Acceptance Criteria

1. WHEN budget progress reaches 80% of the limit THEN the system SHALL display a warning indicator on the budget progress bar
2. WHEN budget progress reaches 90% of the limit THEN the system SHALL display a stronger warning indicator with increased visual prominence
3. WHEN budget progress reaches or exceeds 100% of the limit THEN the system SHALL display a critical alert indicator
4. WHEN displaying alerts THEN the system SHALL show the exact amount over or under budget
5. WHEN a user views the summary panel THEN the system SHALL display budget status indicators for categories with active budgets

### Requirement 4

**User Story:** As a user, I want to compare my current month's budget performance to previous months, so that I can track my improvement over time.

#### Acceptance Criteria

1. WHEN a user views budget history THEN the system SHALL display budget vs actual spending for the selected time period
2. WHEN comparing months THEN the system SHALL show budget limits, actual spending, and variance for each category
3. WHEN displaying historical data THEN the system SHALL calculate the percentage of months where budgets were met
4. WHEN a category has no budget set for a historical month THEN the system SHALL indicate "No budget set" rather than showing zero
5. WHEN generating comparisons THEN the system SHALL support viewing data for the last 3, 6, or 12 months

### Requirement 5

**User Story:** As a user, I want my budget limits to automatically carry forward to the next month, so that I don't have to manually re-enter recurring budgets each month.

#### Acceptance Criteria

1. WHEN a user accesses budget data for a month with no existing budgets THEN the system SHALL automatically copy budget limits from the previous month
2. WHEN budgets are automatically carried forward THEN the system SHALL preserve the category associations and limit amounts exactly
3. WHEN the previous month has no budgets THEN the system SHALL return an empty budget list without error
4. WHEN automatically carried forward budgets exist THEN the system SHALL allow the user to modify or delete them
5. WHEN a user manually creates budgets for a month THEN the system SHALL NOT automatically carry forward budgets for that month

### Requirement 5A

**User Story:** As a user, I want to manually copy budget limits from any previous month, so that I can restore or replicate budget configurations from specific time periods.

#### Acceptance Criteria

1. WHEN a user initiates manual budget copy THEN the system SHALL display a list of available source months with existing budgets
2. WHEN a user selects a source month and target month THEN the system SHALL copy all budget limits from source to target
3. WHEN copying budgets to a month with existing budgets THEN the system SHALL prompt the user to confirm overwriting existing values
4. WHEN the manual copy operation completes THEN the system SHALL display a confirmation message with the number of budgets copied
5. WHERE budgets are manually copied THEN the system SHALL preserve the category associations and limit amounts exactly

### Requirement 6

**User Story:** As a user, I want to see an overall budget summary showing my total budgeted amount versus total spending, so that I can understand my overall financial discipline.

#### Acceptance Criteria

1. WHEN a user views the budget summary THEN the system SHALL calculate the sum of all category budget limits
2. WHEN displaying the overall summary THEN the system SHALL show total budgeted, total spent, and remaining budget
3. WHEN total spending exceeds total budget THEN the system SHALL display the overage amount in red
4. WHEN calculating overall progress THEN the system SHALL compute (total spent / total budgeted) × 100
5. WHEN a category has no budget limit THEN the system SHALL exclude that category's spending from the overall budget calculation

### Requirement 7

**User Story:** As a user, I want budget data to persist across sessions and be included in backups, so that I don't lose my budget configuration.

#### Acceptance Criteria

1. WHEN a user sets or modifies budgets THEN the system SHALL persist the changes to the database immediately
2. WHEN the system performs a backup THEN the system SHALL include all budget data in the backup file
3. WHEN a user restores from backup THEN the system SHALL restore all budget limits and settings
4. WHEN the application starts THEN the system SHALL load budget data for the current month automatically
5. WHERE budget data is stored THEN the system SHALL maintain referential integrity with expense categories

### Requirement 8

**User Story:** As a system administrator, I want budget calculations to be accurate and consistent, so that users can trust the spending data.

#### Acceptance Criteria

1. WHEN calculating spent amounts THEN the system SHALL include only expenses from budgetable categories in the current budget period (month)
2. WHEN an expense is deleted THEN the system SHALL immediately recalculate affected budget progress
3. WHEN an expense is modified THEN the system SHALL update budget progress if the category or amount changed
4. WHEN an expense date is changed to a different month THEN the system SHALL update budget progress for both the old and new months
5. WHERE multiple expenses are added simultaneously THEN the system SHALL ensure budget calculations remain consistent and accurate
