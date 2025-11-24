# Requirements Document

## Introduction

This feature adds a new expense category called "Personal Care" to the expense tracking system. Personal Care expenses include items such as haircuts, cosmetics, toiletries, spa services, and other personal grooming and hygiene products. This category will be integrated into all existing functionality including expense tracking, budgeting, CSV import/export, and reporting.

## Glossary

- **Expense Tracker**: The application system that manages household financial expenses
- **Category**: A classification type for expenses (e.g., Housing, Groceries, Personal Care)
- **Budgetable Category**: A category that can have monthly budget limits set
- **Tax-Deductible Category**: A special category for tax-deductible expenses (not applicable to Personal Care)
- **Database Migration**: An automated process that updates the database schema when the application starts
- **Category Constraint**: A database-level validation that ensures only valid categories are stored

## Requirements

### Requirement 1

**User Story:** As a user, I want to categorize my personal care expenses (haircuts, cosmetics, toiletries, etc.) separately from other categories, so that I can track and budget for these expenses specifically.

#### Acceptance Criteria

1. WHEN a user creates or edits an expense THEN the system SHALL include "Personal Care" in the available category options
2. WHEN a user selects "Personal Care" as a category THEN the system SHALL accept and store the expense with that category
3. WHEN a user views expenses THEN the system SHALL display "Personal Care" expenses alongside other categories
4. WHEN a user filters or searches expenses THEN the system SHALL include "Personal Care" in the filterable categories
5. WHEN a user creates a budget THEN the system SHALL include "Personal Care" in the budgetable categories

### Requirement 2

**User Story:** As a system administrator, I want the database to automatically migrate to support the new Personal Care category, so that existing data remains intact and the new category is available immediately upon deployment.

#### Acceptance Criteria

1. WHEN the application starts with an existing database THEN the system SHALL automatically run a migration to add "Personal Care" to category constraints
2. WHEN the migration runs THEN the system SHALL create a backup of the database before making changes
3. WHEN the migration completes THEN the system SHALL update the expenses table constraint to include "Personal Care"
4. WHEN the migration completes THEN the system SHALL update the budgets table constraint to include "Personal Care"
5. WHEN the migration has already been applied THEN the system SHALL skip the migration and continue startup

### Requirement 3

**User Story:** As a developer, I want all code references to categories to include Personal Care, so that the application behaves consistently across all features.

#### Acceptance Criteria

1. WHEN the category list is defined in backend utilities THEN the system SHALL include "Personal Care" in the CATEGORIES array
2. WHEN the category list is defined in backend utilities THEN the system SHALL include "Personal Care" in the BUDGETABLE_CATEGORIES array
3. WHEN category validation occurs THEN the system SHALL accept "Personal Care" as a valid category
4. WHEN CSV files are imported THEN the system SHALL accept "Personal Care" as a valid category in the CSV data
5. WHEN CSV validation scripts run THEN the system SHALL include "Personal Care" in the valid categories list

### Requirement 4

**User Story:** As a user, I want to import expenses with Personal Care category from CSV files, so that I can bulk-load historical personal care expenses.

#### Acceptance Criteria

1. WHEN a CSV file contains expenses with "Personal Care" category THEN the system SHALL successfully import those expenses
2. WHEN the CSV validation script runs THEN the system SHALL validate "Personal Care" as an acceptable category
3. WHEN the XLS to CSV conversion script runs THEN the system SHALL preserve "Personal Care" category values
4. WHEN CSV import fails due to invalid data THEN the system SHALL provide clear error messages that do not incorrectly flag "Personal Care" as invalid

### Requirement 5

**User Story:** As a user, I want all existing features (budgets, summaries, reports, tax views) to work seamlessly with Personal Care expenses, so that I have a consistent experience across the application.

#### Acceptance Criteria

1. WHEN viewing monthly summaries THEN the system SHALL include Personal Care expenses in the total calculations
2. WHEN viewing annual summaries THEN the system SHALL include Personal Care expenses in yearly totals and breakdowns
3. WHEN viewing budget tracking THEN the system SHALL allow setting and tracking budgets for Personal Care
4. WHEN viewing category breakdowns THEN the system SHALL display Personal Care as a separate category with its own totals
5. WHEN exporting data THEN the system SHALL include Personal Care expenses in all export formats
