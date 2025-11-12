# Requirements Document

## Introduction

This feature enhances the monthly gross income management system by allowing users to configure multiple income sources per month. Currently, users can only set a single gross income value per month. This enhancement will enable users to break down their monthly income into multiple named sources (e.g., salary, freelance, investments) and view the total gross income calculated from these sources.

## Glossary

- **Expense Tracker System**: The web application that manages household expenses and income
- **Monthly Gross Income**: The total income amount for a specific month and year, calculated as the sum of all income sources
- **Income Source**: A named income entry with an associated amount (e.g., "Salary: $5000", "Freelance: $1200")
- **Income Management Modal**: A popup interface for viewing and editing income sources for a specific month
- **Income Source List**: The collection of all income sources configured for a specific month

## Requirements

### Requirement 1

**User Story:** As a user, I want to add multiple income sources to a month, so that I can track different sources of income separately

#### Acceptance Criteria

1. THE Expense Tracker System SHALL provide an interface for adding income sources with a name field and an amount field
2. THE Expense Tracker System SHALL validate that the income source name is not empty
3. THE Expense Tracker System SHALL validate that the income source amount is a non-negative number
4. WHEN the user adds an income source, THE Expense Tracker System SHALL store the income source with the associated year and month
5. THE Expense Tracker System SHALL allow multiple income sources to be added for the same month

### Requirement 2

**User Story:** As a user, I want to view all income sources for a specific month, so that I can see the breakdown of my monthly income

#### Acceptance Criteria

1. THE Expense Tracker System SHALL display a list of all income sources for the selected month
2. THE Expense Tracker System SHALL display the name and amount for each income source
3. THE Expense Tracker System SHALL calculate and display the total monthly gross income as the sum of all income source amounts
4. WHEN no income sources exist for a month, THE Expense Tracker System SHALL display a zero total or empty state message
5. THE Expense Tracker System SHALL update the displayed total immediately when income sources are added, edited, or deleted

### Requirement 3

**User Story:** As a user, I want to edit existing income sources, so that I can correct mistakes or update amounts

#### Acceptance Criteria

1. THE Expense Tracker System SHALL provide an edit button for each income source in the list
2. WHEN the user clicks the edit button, THE Expense Tracker System SHALL display input fields with the current name and amount values
3. THE Expense Tracker System SHALL validate that the edited name is not empty
4. THE Expense Tracker System SHALL validate that the edited amount is a non-negative number
5. WHEN the user saves the edited values, THE Expense Tracker System SHALL update the income source in the database

### Requirement 4

**User Story:** As a user, I want to delete income sources, so that I can remove incorrect or outdated entries

#### Acceptance Criteria

1. THE Expense Tracker System SHALL provide a delete button for each income source in the list
2. WHEN the user clicks the delete button, THE Expense Tracker System SHALL prompt for confirmation before deletion
3. WHEN the user confirms deletion, THE Expense Tracker System SHALL remove the income source from the database
4. THE Expense Tracker System SHALL update the total monthly gross income immediately after deletion
5. THE Expense Tracker System SHALL display a success message after successful deletion

### Requirement 5

**User Story:** As a user, I want to access the income management interface from the monthly summary view, so that I can easily configure income for the current month

#### Acceptance Criteria

1. THE Expense Tracker System SHALL provide a view or edit button next to the monthly gross income display in the summary panel
2. WHEN the user clicks the button, THE Expense Tracker System SHALL open the Income Management Modal for the currently selected month and year
3. THE Expense Tracker System SHALL display the Income Management Modal as a popup overlay
4. THE Expense Tracker System SHALL provide a close button to dismiss the modal
5. WHEN the modal is closed, THE Expense Tracker System SHALL update the monthly gross income display in the summary panel to reflect any changes made
