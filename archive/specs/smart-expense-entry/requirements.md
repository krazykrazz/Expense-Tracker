# Requirements Document

## Introduction

This feature improves the expense entry workflow by reordering the form fields and adding intelligent category suggestions based on the place name. The goal is to reduce friction when adding expenses by leveraging historical data to auto-suggest the most likely expense type for a given place.

## Glossary

- **Expense_Entry_System**: The component responsible for capturing and validating new expense records
- **Category_Suggestion_Engine**: The service that analyzes historical expenses to suggest the most likely category for a place
- **Place_Autocomplete**: The existing feature that suggests place names as the user types
- **Expense_Type**: The category of an expense (e.g., Groceries, Gas, Dining Out)

## Requirements

### Requirement 1

**User Story:** As a user, I want to enter the place name first when adding an expense, so that the application can suggest an appropriate category based on my history.

#### Acceptance Criteria

1. WHEN a user opens the expense form THEN the Expense_Entry_System SHALL display the Place field as the first input with focus
2. WHEN a user types in the Place field THEN the Expense_Entry_System SHALL show autocomplete suggestions from existing places
3. WHEN a user selects or enters a place name THEN the Category_Suggestion_Engine SHALL analyze historical expenses for that place
4. WHEN historical data exists for a place THEN the Category_Suggestion_Engine SHALL suggest the most frequently used category for that place

### Requirement 2

**User Story:** As a user, I want the expense type to be automatically suggested based on the place I enter, so that I can save time and maintain consistency.

#### Acceptance Criteria

1. WHEN a place has been used before THEN the Category_Suggestion_Engine SHALL pre-select the most common category for that place
2. WHEN a place has never been used before THEN the Expense_Entry_System SHALL default to "Other" category
3. WHEN a category is suggested THEN the Expense_Entry_System SHALL display a visual indicator showing it was auto-suggested
4. WHEN a user changes the suggested category THEN the Expense_Entry_System SHALL accept the override without restriction

### Requirement 3

**User Story:** As a user, I want to quickly enter the amount, payment method, and notes after the place and type are set, so that I can complete the expense entry efficiently.

#### Acceptance Criteria

1. WHEN a place is entered THEN the Expense_Entry_System SHALL automatically move focus to the Amount field
2. WHEN the form is displayed THEN the Expense_Entry_System SHALL show fields in this order: Date, Place, Type, Amount, Payment Method, Notes
3. WHEN all required fields are filled THEN the Expense_Entry_System SHALL enable the submit button
4. WHEN the user submits the form THEN the Expense_Entry_System SHALL save the expense and clear the form for the next entry

### Requirement 4

**User Story:** As a user, I want the category suggestion to be accurate based on my spending patterns, so that I rarely need to manually change it.

#### Acceptance Criteria

1. WHEN calculating the suggested category THEN the Category_Suggestion_Engine SHALL use the most frequent category for that exact place name
2. WHEN a place has multiple categories with equal frequency THEN the Category_Suggestion_Engine SHALL use the most recently used category
3. WHEN the suggestion algorithm runs THEN the Category_Suggestion_Engine SHALL complete within 100 milliseconds
4. WHEN no historical data exists THEN the Category_Suggestion_Engine SHALL return null and the form SHALL default to "Other"

### Requirement 5

**User Story:** As a user, I want the form to remember my last used payment method, so that I don't have to select it every time.

#### Acceptance Criteria

1. WHEN a user opens the expense form THEN the Expense_Entry_System SHALL pre-select the last used payment method
2. WHEN no previous payment method exists THEN the Expense_Entry_System SHALL default to "Cash"
3. WHEN a user changes the payment method THEN the Expense_Entry_System SHALL remember this selection for the next expense entry
