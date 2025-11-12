# Requirements Document

## Introduction

This feature enables users to configure and manage fixed monthly expenses for each month. Fixed expenses are predictable costs that remain relatively constant (such as rent, insurance, subscriptions, and utilities). Users can define multiple fixed expense items per month with names and amounts, view them as a separate line in the monthly summary, and carry forward fixed expenses from the previous month to simplify month-to-month setup.

## Glossary

- **Expense Tracker System**: The web application that manages household expenses and income
- **Fixed Expense**: A monthly expense entry with a name and amount that represents a predictable cost
- **Fixed Expense Item**: A named expense entry with an associated amount (e.g., "Rent: $1500", "Insurance: $200")
- **Fixed Expenses Management Modal**: A popup interface for viewing and editing fixed expense items for a specific month
- **Fixed Expense List**: The collection of all fixed expense items configured for a specific month
- **Total Fixed Expenses**: The sum of all fixed expense item amounts for a specific month
- **Monthly Summary**: The financial overview showing income, expenses, and net balance for a specific month

## Requirements

### Requirement 1

**User Story:** As a user, I want to add multiple fixed expense items to a month, so that I can track different fixed costs separately

#### Acceptance Criteria

1. THE Expense Tracker System SHALL provide an interface for adding fixed expense items with a name field and an amount field
2. THE Expense Tracker System SHALL validate that the fixed expense item name is not empty
3. THE Expense Tracker System SHALL validate that the fixed expense item amount is a non-negative number
4. WHEN the user adds a fixed expense item, THE Expense Tracker System SHALL store the fixed expense item with the associated year and month
5. THE Expense Tracker System SHALL allow multiple fixed expense items to be added for the same month

### Requirement 2

**User Story:** As a user, I want to view all fixed expense items for a specific month, so that I can see the breakdown of my monthly fixed costs

#### Acceptance Criteria

1. THE Expense Tracker System SHALL display a list of all fixed expense items for the selected month
2. THE Expense Tracker System SHALL display the name and amount for each fixed expense item
3. THE Expense Tracker System SHALL calculate and display the total fixed expenses as the sum of all fixed expense item amounts
4. WHEN no fixed expense items exist for a month, THE Expense Tracker System SHALL display a zero total or empty state message
5. THE Expense Tracker System SHALL update the displayed total immediately when fixed expense items are added, edited, or deleted

### Requirement 3

**User Story:** As a user, I want to edit existing fixed expense items, so that I can correct mistakes or update amounts

#### Acceptance Criteria

1. THE Expense Tracker System SHALL provide an edit button for each fixed expense item in the list
2. WHEN the user clicks the edit button, THE Expense Tracker System SHALL display input fields with the current name and amount values
3. THE Expense Tracker System SHALL validate that the edited name is not empty
4. THE Expense Tracker System SHALL validate that the edited amount is a non-negative number
5. WHEN the user saves the edited values, THE Expense Tracker System SHALL update the fixed expense item in the database

### Requirement 4

**User Story:** As a user, I want to delete fixed expense items, so that I can remove incorrect or outdated entries

#### Acceptance Criteria

1. THE Expense Tracker System SHALL provide a delete button for each fixed expense item in the list
2. WHEN the user clicks the delete button, THE Expense Tracker System SHALL prompt for confirmation before deletion
3. WHEN the user confirms deletion, THE Expense Tracker System SHALL remove the fixed expense item from the database
4. THE Expense Tracker System SHALL update the total fixed expenses immediately after deletion
5. THE Expense Tracker System SHALL display a success message after successful deletion

### Requirement 5

**User Story:** As a user, I want to access the fixed expenses management interface from the monthly summary view, so that I can easily configure fixed expenses for the current month

#### Acceptance Criteria

1. THE Expense Tracker System SHALL provide a view or edit button next to the total fixed expenses display in the summary panel
2. WHEN the user clicks the button, THE Expense Tracker System SHALL open the Fixed Expenses Management Modal for the currently selected month and year
3. THE Expense Tracker System SHALL display the Fixed Expenses Management Modal as a popup overlay
4. THE Expense Tracker System SHALL provide a close button to dismiss the modal
5. WHEN the modal is closed, THE Expense Tracker System SHALL update the total fixed expenses display in the summary panel to reflect any changes made

### Requirement 6

**User Story:** As a user, I want to see total fixed expenses as a separate line in the monthly summary, so that I can distinguish fixed costs from variable expenses

#### Acceptance Criteria

1. THE Expense Tracker System SHALL display total fixed expenses as a separate line item in the monthly summary panel
2. THE Expense Tracker System SHALL display the total fixed expenses amount calculated as the sum of all fixed expense items for the month
3. THE Expense Tracker System SHALL include the total fixed expenses in the calculation of total monthly expenses
4. THE Expense Tracker System SHALL subtract total fixed expenses from monthly gross income when calculating the net balance
5. THE Expense Tracker System SHALL display total fixed expenses above or near the regular expenses total for clear visibility

### Requirement 7

**User Story:** As a user, I want to carry forward fixed expenses from the previous month, so that I can quickly set up recurring fixed costs without re-entering them

#### Acceptance Criteria

1. THE Expense Tracker System SHALL provide a carry forward button in the Fixed Expenses Management Modal
2. WHEN the user clicks the carry forward button, THE Expense Tracker System SHALL retrieve all fixed expense items from the previous month
3. WHEN carrying forward fixed expenses, THE Expense Tracker System SHALL copy the name and amount of each fixed expense item from the previous month to the current month
4. WHEN the previous month has no fixed expense items, THE Expense Tracker System SHALL display a message indicating there are no items to carry forward
5. WHEN fixed expense items already exist for the current month, THE Expense Tracker System SHALL prompt the user for confirmation before carrying forward to avoid accidental duplication
