# Requirements Document

## Introduction

This feature enhances the existing income source tracking system by introducing categorization of income sources. Currently, users can add named income sources (e.g., "Salary", "Freelance") but cannot categorize them by type. This enhancement will allow users to assign each income source to a predefined category (Salary, Government, Gifts, Other), enabling better income analysis and reporting on the annual summary view.

## Glossary

- **Expense Tracker System**: The web application that manages household expenses and income
- **Income Source**: A named income entry with an associated amount and category
- **Income Category**: A classification type for income sources (Salary, Government, Gifts, Other)
- **Income Management Modal**: The popup interface for viewing and editing income sources for a specific month
- **Annual Summary**: The yearly overview page that displays aggregated financial data
- **Income Breakdown**: A visual representation showing total income split by category type

## Requirements

### Requirement 1

**User Story:** As a user, I want to categorize my income sources by type, so that I can understand where my income comes from

#### Acceptance Criteria

1. THE Expense Tracker System SHALL provide a category selection field when adding a new income source
2. THE Expense Tracker System SHALL support four income categories: Salary, Government, Gifts, and Other
3. THE Expense Tracker System SHALL require a category to be selected for each income source
4. THE Expense Tracker System SHALL default the category selection to "Other" when adding a new income source
5. WHEN an income source is created, THE Expense Tracker System SHALL store the category with the income source record

### Requirement 2

**User Story:** As a user, I want to view the category for each income source in the income management modal, so that I can see how my income is categorized

#### Acceptance Criteria

1. THE Expense Tracker System SHALL display the category for each income source in the income source list
2. THE Expense Tracker System SHALL use distinct visual indicators for different income categories
3. WHEN displaying income sources, THE Expense Tracker System SHALL group or sort sources by category
4. THE Expense Tracker System SHALL show the category name alongside the income source name
5. THE Expense Tracker System SHALL calculate and display subtotals for each income category

### Requirement 3

**User Story:** As a user, I want to edit the category of existing income sources, so that I can correct miscategorizations

#### Acceptance Criteria

1. WHEN editing an income source, THE Expense Tracker System SHALL display the current category in the category selection field
2. THE Expense Tracker System SHALL allow the user to change the category to any of the four supported categories
3. WHEN the user saves the edited income source, THE Expense Tracker System SHALL update the category in the database
4. THE Expense Tracker System SHALL recalculate category subtotals immediately after category changes
5. THE Expense Tracker System SHALL validate that a category is selected before saving

### Requirement 4

**User Story:** As a user, I want to see an income breakdown by category on the annual summary, so that I can analyze my income sources over the year

#### Acceptance Criteria

1. THE Expense Tracker System SHALL display a new "Income by Category" section on the annual summary page
2. THE Expense Tracker System SHALL calculate the total income for each category across all months in the year
3. THE Expense Tracker System SHALL display the category name, total amount, and percentage of total income for each category
4. THE Expense Tracker System SHALL use visual elements such as bars or charts to represent the income distribution
5. WHEN no income exists for a category, THE Expense Tracker System SHALL either hide that category or show it with a zero value

### Requirement 5

**User Story:** As a user, I want to see monthly income breakdown by category on the annual summary chart, so that I can track income trends throughout the year

#### Acceptance Criteria

1. THE Expense Tracker System SHALL enhance the monthly breakdown chart to show income split by category
2. THE Expense Tracker System SHALL use distinct colors for each income category in the chart
3. THE Expense Tracker System SHALL display a legend identifying which color represents which income category
4. WHEN hovering over or clicking a chart element, THE Expense Tracker System SHALL show detailed category amounts for that month
5. THE Expense Tracker System SHALL maintain the existing expense visualization while adding income category details

### Requirement 6

**User Story:** As a user, I want the carry-forward feature to preserve income source categories, so that I don't have to recategorize sources each month

#### Acceptance Criteria

1. WHEN copying income sources from the previous month, THE Expense Tracker System SHALL preserve the category for each income source
2. THE Expense Tracker System SHALL maintain the same category assignment when carrying forward income sources
3. THE Expense Tracker System SHALL allow users to edit categories after carry-forward if needed
4. WHEN no previous month data exists, THE Expense Tracker System SHALL use default categories for new income sources
5. THE Expense Tracker System SHALL display a confirmation showing which categories will be carried forward

### Requirement 7

**User Story:** As a system administrator, I want existing income sources to be migrated with a default category, so that the system remains functional after the database schema change

#### Acceptance Criteria

1. THE Expense Tracker System SHALL provide a database migration script that adds a category column to the income_sources table
2. THE Expense Tracker System SHALL assign a default category of "Other" to all existing income sources during migration
3. THE Expense Tracker System SHALL ensure the migration is idempotent and can be run multiple times safely
4. THE Expense Tracker System SHALL validate that all income sources have a category after migration
5. WHEN the migration completes, THE Expense Tracker System SHALL log the number of records updated
6. THE Expense Tracker System SHALL execute the migration automatically when a Docker container is started
