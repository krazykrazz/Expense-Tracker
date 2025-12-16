# Requirements Document

## Introduction

This feature enhances the global search functionality in the Expense Tracker application to support filtering by category (expense type) and payment method, in addition to the existing place and notes text search. Currently, users can only search globally by place or notes text, while category and payment method filters only work within the monthly expense list view. This enhancement will allow users to filter expenses by category and payment method across all time periods when performing a global search.

## Glossary

- **Global Search**: A search operation that retrieves expenses from all time periods, not limited to the currently selected month
- **Expense Tracker Application**: The web-based personal finance management system
- **Category Filter**: A dropdown selector that filters expenses by their expense type (e.g., Groceries, Dining Out, Gas, etc.)
- **Payment Method Filter**: A dropdown selector that filters expenses by their payment method (e.g., Credit Card, Debit Card, Cash, etc.)
- **Search Bar Component**: The React component that provides the text search input field
- **Expense List Component**: The React component that displays the filtered list of expenses
- **Filter State**: The current values of category and payment method filters maintained in the application state

## Requirements

### Requirement 1

**User Story:** As a user, I want to filter expenses by category independently or during a search, so that I can view all expenses of a specific type across all time periods.

#### Acceptance Criteria

1. WHEN the user selects a category from the filter dropdown THEN the system SHALL filter the displayed expenses to show only expenses matching that category across all time periods
2. WHEN the user selects a category filter without entering search text THEN the system SHALL display all expenses matching that category from all time periods
3. WHEN the user selects a category filter with active search text THEN the system SHALL apply both the category filter and text search filter simultaneously
4. WHEN the user clears only the search text while a category filter is active THEN the system SHALL maintain the category filter and continue displaying filtered results
5. WHEN the user switches from global filtered view to monthly view THEN the system SHALL preserve the category filter selection and apply it to the monthly view

### Requirement 2

**User Story:** As a user, I want to filter expenses by payment method independently or during a search, so that I can view all expenses paid with a specific method across all time periods.

#### Acceptance Criteria

1. WHEN the user selects a payment method from the filter dropdown THEN the system SHALL filter the displayed expenses to show only expenses matching that payment method across all time periods
2. WHEN the user selects a payment method filter without entering search text THEN the system SHALL display all expenses matching that payment method from all time periods
3. WHEN the user selects both category and payment method filters THEN the system SHALL apply both filters simultaneously using AND logic
4. WHEN the user selects a payment method filter with active search text THEN the system SHALL apply both the payment method filter and text search filter simultaneously
5. WHEN no payment method is selected THEN the system SHALL display expenses with all payment methods

### Requirement 3

**User Story:** As a user, I want to clear all active filters with a single action, so that I can quickly return to viewing monthly expenses without manually resetting each filter.

#### Acceptance Criteria

1. WHEN any filter is active (category, payment method, or text search) THEN the system SHALL display a clear filters button
2. WHEN the user clicks the clear filters button THEN the system SHALL reset all filters to their default state
3. WHEN all filters are cleared and no search text is present THEN the system SHALL return to the monthly view showing expenses for the currently selected month
4. WHEN the clear filters button is clicked THEN the system SHALL provide visual feedback that filters have been cleared
5. WHEN only category or payment method filters are active without search text THEN the system SHALL treat this as a global filter displaying all matching expenses across all time periods

### Requirement 4

**User Story:** As a user, I want the filter controls to be easily accessible and visually clear, so that I can quickly filter expenses by category or payment method at any time.

#### Acceptance Criteria

1. WHEN the application is displayed THEN the system SHALL show category and payment method filter dropdowns alongside the search input
2. WHEN filters are applied THEN the system SHALL provide visual indicators showing which filters are active
3. WHEN the user hovers over filter controls THEN the system SHALL display tooltips explaining each filter's purpose
4. WHEN multiple filters are active THEN the system SHALL clearly indicate the combined filter state to the user
5. WHEN the user applies a filter without search text THEN the system SHALL automatically switch to global view displaying all matching expenses

### Requirement 5

**User Story:** As a user, I want the filtering behavior to be consistent between monthly view and global search, so that I can predict how filters will behave regardless of the view mode.

#### Acceptance Criteria

1. WHEN filters are applied in monthly view THEN the system SHALL use the same filtering logic as global search
2. WHEN the user switches between monthly view and global search THEN the system SHALL maintain consistent filter dropdown options and behavior
3. WHEN expenses are filtered THEN the system SHALL display a count or message indicating how many expenses match the current filters
4. WHEN no expenses match the applied filters THEN the system SHALL display a clear message explaining that no results were found
