# Requirements Document

## Introduction

This feature expands the expense tracking system's category options from the current minimal set (Food, Gas, Other, Tax - Medical, Tax - Donation) to a comprehensive set of expense categories that provide users with better insights into their spending patterns. The expansion will maintain backward compatibility with existing data while offering more granular categorization for new expenses.

## Glossary

- **Expense Tracker System**: The full-stack personal expense tracking application
- **Category**: A classification label assigned to an expense that groups similar types of spending
- **Legacy Category**: One of the original five categories (Food, Gas, Other, Tax - Medical, Tax - Donation)
- **Expanded Category**: A new category added as part of this feature
- **Database Schema**: The SQLite table structure that stores expense data
- **Budget System**: The existing budget tracking feature that monitors spending limits by category
- **Recurring Expense**: An expense template that automatically generates expenses on a schedule
- **Fixed Expense**: A predefined monthly expense amount
- **CSV Import**: The bulk expense entry feature that reads expense data from CSV files
- **Category Migration**: The process of renaming the existing "Food" category to "Dining Out" in all existing records

## Approved Category List

The complete list of expense categories after this feature is implemented (17 total):

**Essential Living:**
- Clothing (added in personal-care-category spec)
- Groceries
- Housing
- Insurance
- Utilities

**Transportation:**
- Gas (existing)
- Vehicle Maintenance

**Food & Dining:**
- Dining Out (renamed from "Food")

**Entertainment & Lifestyle:**
- Entertainment
- Recreation Activities
- Subscriptions

**Personal & Family:**
- Gifts (added in personal-care-category spec)
- Personal Care (added in personal-care-category spec)
- Pet Care

**Tax-Deductible:**
- Tax - Donation (existing, keep as-is)
- Tax - Medical (existing)

**Other:**
- Other (existing)

> **Note:** Clothing, Gifts, and Personal Care categories were added in subsequent updates (see personal-care-category spec).

## Requirements

### Requirement 1

**User Story:** As a user, I want to select from a comprehensive list of expense categories when adding expenses, so that I can accurately categorize my spending and gain better insights into my financial patterns.

#### Acceptance Criteria

1. WHEN a user views the expense type dropdown THEN the Expense Tracker System SHALL display all available categories organized in a logical grouping
2. WHEN a user selects a category from the dropdown THEN the Expense Tracker System SHALL accept and store the selected category value
3. WHEN a user adds an expense with an expanded category THEN the Expense Tracker System SHALL persist the category to the database without data loss
4. WHEN a user views existing expenses with legacy categories THEN the Expense Tracker System SHALL display those expenses with their original category values unchanged
5. WHEN a user filters or searches expenses by category THEN the Expense Tracker System SHALL return accurate results for both legacy and expanded categories

### Requirement 2

**User Story:** As a system administrator, I want the database schema to support expanded categories while maintaining backward compatibility, so that existing expense data remains valid and accessible.

#### Acceptance Criteria

1. WHEN the database schema is updated THEN the Expense Tracker System SHALL allow all legacy category values to remain valid
2. WHEN the database schema is updated THEN the Expense Tracker System SHALL accept all expanded category values as valid entries
3. WHEN an expense record is created or updated THEN the Expense Tracker System SHALL validate the category against the complete list of allowed values
4. WHEN the system queries expenses THEN the Expense Tracker System SHALL retrieve expenses with any valid category value without errors
5. WHEN the database constraint is applied THEN the Expense Tracker System SHALL reject category values that are not in the approved list

### Requirement 3

**User Story:** As a user, I want the budget tracking system to work with expanded categories, so that I can set spending limits for my new category choices.

#### Acceptance Criteria

1. WHEN a user creates a budget for an expanded category THEN the Expense Tracker System SHALL accept and store the budget limit
2. WHEN a user adds an expense in a budgeted expanded category THEN the Expense Tracker System SHALL calculate the spending against the budget limit
3. WHEN a user views budget progress THEN the Expense Tracker System SHALL display accurate spending totals for expanded categories
4. WHEN a user exceeds a budget limit for an expanded category THEN the Expense Tracker System SHALL indicate the budget status appropriately
5. WHEN the budget system queries expense totals THEN the Expense Tracker System SHALL aggregate expenses by expanded category correctly

### Requirement 4

**User Story:** As a user, I want to create recurring expenses with expanded categories, so that my automated expense generation uses accurate categorization.

#### Acceptance Criteria

1. WHEN a user creates a recurring expense template with an expanded category THEN the Expense Tracker System SHALL store the category in the template
2. WHEN the system generates expenses from a recurring template THEN the Expense Tracker System SHALL apply the template's expanded category to generated expenses
3. WHEN a user views recurring expense templates THEN the Expense Tracker System SHALL display the assigned expanded category
4. WHEN a user edits a recurring template category THEN the Expense Tracker System SHALL update the template with the new expanded category value
5. WHEN a recurring template with an expanded category is paused or deleted THEN the Expense Tracker System SHALL maintain data integrity

### Requirement 5

**User Story:** As a user, I want to import expenses from CSV files using expanded categories, so that I can bulk-load expenses with accurate categorization.

#### Acceptance Criteria

1. WHEN a CSV file contains expenses with expanded category values THEN the Expense Tracker System SHALL parse and import those expenses successfully
2. WHEN a CSV file contains expenses with legacy category values THEN the Expense Tracker System SHALL import those expenses without modification
3. WHEN a CSV file contains an invalid category value THEN the Expense Tracker System SHALL reject the import and provide a clear error message
4. WHEN the CSV validation script runs THEN the Expense Tracker System SHALL validate category values against the complete approved list
5. WHEN a user views the CSV import template or documentation THEN the Expense Tracker System SHALL list all valid category options

### Requirement 6

**User Story:** As a user, I want to view spending summaries and analytics for expanded categories, so that I can understand my spending patterns across all category types.

#### Acceptance Criteria

1. WHEN a user views the monthly summary THEN the Expense Tracker System SHALL display spending totals grouped by expanded categories
2. WHEN a user views the annual summary THEN the Expense Tracker System SHALL aggregate expenses by expanded categories across all months
3. WHEN a user views category breakdowns in charts THEN the Expense Tracker System SHALL include expanded categories in the visualization
4. WHEN a user filters the expense list by category THEN the Expense Tracker System SHALL support filtering by any expanded category
5. WHEN the system calculates spending trends THEN the Expense Tracker System SHALL include expanded categories in trend calculations

### Requirement 7

**User Story:** As a user, I want tax-deductible categories to remain clearly identified, so that I can continue to track and report tax-deductible expenses accurately.

#### Acceptance Criteria

1. WHEN a user views the category list THEN the Expense Tracker System SHALL clearly mark tax-deductible categories with a distinguishing prefix or indicator
2. WHEN a user selects a tax-deductible category THEN the Expense Tracker System SHALL flag the expense as tax-deductible in the database
3. WHEN a user views the tax-deductible report THEN the Expense Tracker System SHALL include all expenses from tax-deductible categories
4. WHEN the system identifies tax-deductible expenses THEN the Expense Tracker System SHALL recognize both legacy and expanded tax-deductible categories
5. WHEN a user exports tax-deductible data THEN the Expense Tracker System SHALL include expenses from all tax-deductible category types

### Requirement 8

**User Story:** As a developer, I want the category list to be maintainable and extensible, so that future category additions or modifications can be made efficiently.

#### Acceptance Criteria

1. WHEN categories are defined in the codebase THEN the Expense Tracker System SHALL maintain a single source of truth for the category list
2. WHEN the category list is updated THEN the Expense Tracker System SHALL reflect changes in all components that reference categories
3. WHEN the frontend requests category options THEN the Expense Tracker System SHALL provide the complete list from the backend
4. WHEN the database schema enforces category constraints THEN the Expense Tracker System SHALL use the same category list as the application code
5. WHEN a developer adds a new category THEN the Expense Tracker System SHALL require updates in no more than three locations

### Requirement 9

**User Story:** As a user, I want a smooth migration experience when the system is updated with expanded categories, so that my existing data and workflows remain unaffected.

#### Acceptance Criteria

1. WHEN the system is updated with expanded categories THEN the Expense Tracker System SHALL preserve all existing expense data without modification
2. WHEN a user opens the application after the update THEN the Expense Tracker System SHALL display all existing expenses with their updated or original categories
3. WHEN a user adds a new expense after the update THEN the Expense Tracker System SHALL offer all expanded category options
4. WHEN the database migration runs THEN the Expense Tracker System SHALL complete without data loss or corruption
5. WHEN a user views historical reports after the update THEN the Expense Tracker System SHALL display accurate data for all time periods

### Requirement 10

**User Story:** As a user with existing "Food" expenses, I want those expenses automatically renamed to "Dining Out", so that my historical data uses the new category naming convention.

#### Acceptance Criteria

1. WHEN the database migration executes THEN the Expense Tracker System SHALL update all expense records with category "Food" to category "Dining Out"
2. WHEN the database migration executes THEN the Expense Tracker System SHALL update all recurring expense templates with category "Food" to category "Dining Out"
3. WHEN the database migration executes THEN the Expense Tracker System SHALL update all budget records with category "Food" to category "Dining Out"
4. WHEN a user views expenses after migration THEN the Expense Tracker System SHALL display "Dining Out" for all previously "Food" categorized expenses
5. WHEN the migration completes THEN the Expense Tracker System SHALL log the number of records updated for verification purposes
