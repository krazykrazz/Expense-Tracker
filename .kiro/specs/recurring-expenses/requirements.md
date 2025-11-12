# Requirements Document

## Introduction

The Recurring Expenses feature enables users to define expense templates that automatically generate expense entries on a monthly basis within a specified date range. This eliminates the need to manually enter the same expenses every month.

**Note:** Recurring expenses are different from Fixed Expenses. Recurring expenses generate actual expense entries in the expenses table with specific dates and full details (place, notes, type, method), while Fixed Expenses are tracked separately as monthly budget items without specific transaction dates.

## Glossary

- **Recurring Expense Template**: A saved expense configuration that defines the pattern for automatically generating monthly expenses
- **Start Month**: The first month (YYYY-MM) when the recurring expense should begin generating entries
- **End Month**: The last month (YYYY-MM) when the recurring expense should stop generating entries (optional, can be ongoing)
- **Day of Month**: The specific day (1-31) when the expense should be created each month
- **Generated Expense**: An actual expense entry created from a recurring expense template

## Requirements

### Requirement 1

**User Story:** As a user, I want to create recurring expense templates, so that I don't have to manually enter the same expenses every month.

#### Acceptance Criteria

1. WHEN the User creates a recurring expense template with place, amount, type, method, day of month, and start month, THE Expense Tracker Application SHALL store the template in the Database
2. THE Expense Tracker Application SHALL require place, amount, type, method, day of month, and start month for recurring expense templates
3. THE Expense Tracker Application SHALL allow the User to optionally specify an end month for the recurring expense
4. WHEN no end month is specified, THE Expense Tracker Application SHALL treat the recurring expense as ongoing

### Requirement 2

**User Story:** As a user, I want recurring expenses to automatically generate monthly entries, so that my regular expenses are tracked without manual input.

#### Acceptance Criteria

1. WHEN the User views a month that falls within a recurring expense's date range, THE Expense Tracker Application SHALL automatically generate an expense entry for that month
2. THE Expense Tracker Application SHALL generate the expense entry with the date set to the specified day of month
3. THE Expense Tracker Application SHALL only generate one expense entry per recurring template per month
4. WHEN the day of month exceeds the number of days in a month, THE Expense Tracker Application SHALL use the last day of that month

### Requirement 3

**User Story:** As a user, I want to view and manage my recurring expense templates, so that I can update or remove them as needed.

#### Acceptance Criteria

1. THE Expense Tracker Application SHALL provide a list of all recurring expense templates
2. THE Expense Tracker Application SHALL allow the User to edit recurring expense templates
3. THE Expense Tracker Application SHALL allow the User to delete recurring expense templates
4. WHEN a recurring expense template is deleted, THE Expense Tracker Application SHALL not delete previously generated expense entries

### Requirement 4

**User Story:** As a user, I want generated expenses to be clearly marked, so that I can distinguish them from manually entered expenses.

#### Acceptance Criteria

1. THE Expense Tracker Application SHALL display a visual indicator on expenses generated from recurring templates
2. THE Expense Tracker Application SHALL allow the User to edit generated expenses independently
3. WHEN a generated expense is edited, THE Expense Tracker Application SHALL maintain the link to the original recurring template
4. THE Expense Tracker Application SHALL allow the User to delete individual generated expenses without affecting the template

### Requirement 5

**User Story:** As a user, I want to pause or skip recurring expenses for specific months, so that I can handle exceptions without deleting the template.

#### Acceptance Criteria

1. THE Expense Tracker Application SHALL allow the User to mark a recurring expense as paused
2. WHEN a recurring expense is paused, THE Expense Tracker Application SHALL not generate new expense entries
3. THE Expense Tracker Application SHALL allow the User to resume a paused recurring expense
4. THE Expense Tracker Application SHALL allow the User to delete a generated expense for a specific month without affecting other months
