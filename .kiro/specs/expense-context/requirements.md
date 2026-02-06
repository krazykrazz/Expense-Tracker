# Requirements Document

## Introduction

This specification defines the requirements for extracting expense data state management from the monolithic App.jsx component into a dedicated ExpenseContext. This is Phase 2 of the frontend state management refactoring. Phase 1 (Filter Context) successfully extracted filter and view mode state. Phase 2 targets expense data: the expenses array, loading/error states, CRUD handlers, fetch logic with view mode awareness, and client-side filtered expenses computation. The refactoring reduces App.jsx complexity while maintaining identical user-facing behavior.

## Glossary

- **Expense_Context**: A React Context that provides expense data and CRUD operations to child components
- **Expense_Provider**: The React Context Provider component that manages expense state and data fetching
- **Filter_Context**: The existing React Context (from Phase 1) providing filter and view mode state
- **CRUD_Handlers**: Functions for Create (add), Read (fetch), Update (edit), and Delete expense operations
- **Filtered_Expenses**: The client-side filtered subset of expenses computed by applying active filters (searchText, filterType, filterMethod) to the raw expenses array
- **Refresh_Trigger**: A counter state used to force re-fetching of dependent data (summary panel, budget alerts, floating button count)
- **View_Mode**: Whether the app is in monthly view (single month) or global view (all expenses), determined by Filter_Context

## Requirements

### Requirement 1: Expense Context Creation

**User Story:** As a developer, I want expense data managed in a dedicated context, so that I can access expense state and operations from any component without prop drilling.

#### Acceptance Criteria

1. THE Expense_Context SHALL provide access to the expenses array
2. THE Expense_Context SHALL provide access to loading state (boolean)
3. THE Expense_Context SHALL provide access to error state (string or null)
4. THE Expense_Context SHALL provide access to the filtered expenses array
5. THE Expense_Context SHALL provide access to the current month expense count
6. THE Expense_Context SHALL provide CRUD handler functions (handleExpenseAdded, handleExpenseDeleted, handleExpenseUpdated)
7. THE Expense_Context SHALL provide a refreshTrigger value for dependent components
8. THE Expense_Context SHALL provide a function to manually trigger expense refresh

### Requirement 2: Expense Provider Implementation

**User Story:** As a developer, I want an Expense Provider component that manages all expense state and data fetching, so that expense logic is centralized and testable.

#### Acceptance Criteria

1. THE Expense_Provider SHALL initialize expenses as an empty array
2. THE Expense_Provider SHALL initialize loading as false
3. THE Expense_Provider SHALL initialize error as null
4. THE Expense_Provider SHALL consume Filter_Context to access view mode and filter values for fetching and filtering
5. WHEN the Expense_Provider mounts, THE Expense_Provider SHALL fetch expenses based on the current view mode

### Requirement 3: Expense Fetching Logic

**User Story:** As a developer, I want expense fetching to be view-mode-aware, so that the correct set of expenses is loaded based on the current filter state.

#### Acceptance Criteria

1. WHILE the application is in monthly view, THE Expense_Provider SHALL fetch expenses for the selected year and month only
2. WHILE the application is in global view with no year filter, THE Expense_Provider SHALL fetch all expenses
3. WHILE the application is in global view with a year filter active, THE Expense_Provider SHALL fetch expenses for the filtered year only
4. WHEN selectedYear, selectedMonth, isGlobalView, or filterYear changes, THE Expense_Provider SHALL re-fetch expenses
5. WHEN expense fetching begins, THE Expense_Provider SHALL set loading to true and error to null
6. WHEN expense fetching succeeds, THE Expense_Provider SHALL update the expenses array and set loading to false
7. IF expense fetching fails with a network error, THEN THE Expense_Provider SHALL set a user-friendly error message and set loading to false
8. IF expense fetching fails with a server error, THEN THE Expense_Provider SHALL parse the error response and set the error message

### Requirement 4: Expense CRUD Handlers

**User Story:** As a developer, I want centralized CRUD handlers for expenses, so that all expense mutations go through a single code path.

#### Acceptance Criteria

1. WHEN handleExpenseAdded is called with a new expense, THE Expense_Provider SHALL insert the expense into the array in date-sorted order if the expense belongs to the current view
2. WHEN handleExpenseAdded is called with a new expense that does not belong to the current view, THE Expense_Provider SHALL not add the expense to the array
3. WHEN handleExpenseAdded is called, THE Expense_Provider SHALL increment the refreshTrigger
4. WHEN handleExpenseDeleted is called with an expense ID, THE Expense_Provider SHALL remove the expense with that ID from the array
5. WHEN handleExpenseDeleted is called, THE Expense_Provider SHALL increment the refreshTrigger
6. WHEN handleExpenseUpdated is called with an updated expense, THE Expense_Provider SHALL replace the matching expense in the array
7. WHEN handleExpenseUpdated is called, THE Expense_Provider SHALL increment the refreshTrigger

### Requirement 5: Client-Side Expense Filtering

**User Story:** As a developer, I want filtered expenses computed within the context, so that all components receive consistently filtered data.

#### Acceptance Criteria

1. THE Expense_Provider SHALL compute filteredExpenses by applying searchText, filterType, and filterMethod filters to the expenses array
2. WHEN searchText is active, THE Expense_Provider SHALL match against expense place and notes fields (case-insensitive)
3. WHEN filterType is active, THE Expense_Provider SHALL include only expenses matching the selected category
4. WHEN filterMethod is active, THE Expense_Provider SHALL include only expenses matching the selected payment method
5. THE Expense_Provider SHALL apply all active filters using AND logic (all conditions must match)
6. WHEN no filters are active, THE Expense_Provider SHALL return the full expenses array as filteredExpenses

### Requirement 6: Event-Driven Refresh

**User Story:** As a developer, I want the expense context to respond to external events, so that expense data stays synchronized when other parts of the application modify expenses.

#### Acceptance Criteria

1. WHEN an "expensesUpdated" window event is dispatched, THE Expense_Provider SHALL re-fetch expenses from the API
2. WHEN an "expensesUpdated" window event is dispatched, THE Expense_Provider SHALL increment the refreshTrigger

### Requirement 7: Current Month Expense Count

**User Story:** As a developer, I want the current month expense count managed in the expense context, so that the floating add button can display the correct count.

#### Acceptance Criteria

1. THE Expense_Provider SHALL track the current month expense count
2. WHEN the refreshTrigger changes, THE Expense_Provider SHALL re-fetch the current month expense count
3. THE Expense_Provider SHALL fetch the count for the actual current calendar month regardless of the selected view month

### Requirement 8: Custom Hook for Expense Access

**User Story:** As a developer, I want a custom hook to access expense context, so that I have a clean API for consuming expense state.

#### Acceptance Criteria

1. THE useExpenseContext hook SHALL return all expense state values and handler functions
2. IF useExpenseContext is called outside of Expense_Provider, THEN THE hook SHALL throw a descriptive error
3. THE useExpenseContext hook SHALL be importable from a dedicated context file

### Requirement 9: App.jsx Integration

**User Story:** As a developer, I want App.jsx to use the Expense Context, so that expense state is removed from the main component.

#### Acceptance Criteria

1. WHEN the refactoring is complete, THE App component SHALL wrap its content with Expense_Provider inside the existing Filter_Provider
2. WHEN the refactoring is complete, THE AppContent component SHALL consume expense state via useExpenseContext hook
3. WHEN the refactoring is complete, THE AppContent component SHALL NOT contain useState hooks for expenses, loading, error, or refreshTrigger
4. WHEN the refactoring is complete, THE AppContent component SHALL NOT contain the expense fetching useEffect
5. WHEN the refactoring is complete, THE AppContent component SHALL NOT contain the filteredExpenses useMemo
6. THE AppContent component SHALL continue to pass expense values to child components as props (backward compatibility)

### Requirement 10: Backward Compatibility

**User Story:** As a user, I want the application to behave exactly the same after refactoring, so that my workflow is not disrupted.

#### Acceptance Criteria

1. THE refactored application SHALL maintain identical expense list display
2. THE refactored application SHALL maintain identical expense creation behavior
3. THE refactored application SHALL maintain identical expense editing behavior
4. THE refactored application SHALL maintain identical expense deletion behavior
5. THE refactored application SHALL maintain identical client-side filtering behavior
6. THE refactored application SHALL maintain identical loading and error state display
7. THE refactored application SHALL maintain identical view mode switching behavior (monthly to global and back)
8. THE refactored application SHALL maintain identical floating add button expense count display
