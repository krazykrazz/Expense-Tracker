# Requirements Document

## Introduction

This specification defines the requirements for extracting filter and view mode state management from the monolithic App.jsx component into a dedicated React Context. This is a refactoring effort to improve code maintainability and reduce the complexity of App.jsx (currently ~1000 lines with 30+ useState hooks). The refactoring focuses on filter/view state as the highest-impact, most self-contained extraction target.

## Glossary

- **Filter_Context**: A React Context that provides filter and view mode state to child components
- **Filter_Provider**: The React Context Provider component that wraps the application and manages filter state
- **Global_View**: Application mode showing expenses from all time periods (triggered by certain filters)
- **Monthly_View**: Application mode showing expenses for a single selected month (default mode)
- **Filter_State**: The collection of state values controlling expense filtering (searchText, filterType, filterMethod, filterYear, filterInsurance)
- **View_State**: The collection of state values controlling the current view (selectedYear, selectedMonth, isGlobalView)
- **Derived_State**: State values computed from other state (isGlobalView, globalViewTriggers)

## Requirements

### Requirement 1: Filter Context Creation

**User Story:** As a developer, I want filter state managed in a dedicated context, so that I can access filter values from any component without prop drilling.

#### Acceptance Criteria

1. THE Filter_Context SHALL provide access to all filter state values (searchText, filterType, filterMethod, filterYear, filterInsurance)
2. THE Filter_Context SHALL provide access to view state values (selectedYear, selectedMonth)
3. THE Filter_Context SHALL provide computed derived state (isGlobalView, globalViewTriggers)
4. THE Filter_Context SHALL provide setter functions for all mutable state values
5. THE Filter_Context SHALL provide utility functions (handleClearFilters, handleReturnToMonthlyView)

### Requirement 2: Filter Provider Implementation

**User Story:** As a developer, I want a Filter Provider component that manages all filter state, so that state logic is centralized and testable.

#### Acceptance Criteria

1. THE Filter_Provider SHALL initialize filter state with appropriate default values (empty strings for filters, current date for year/month)
2. THE Filter_Provider SHALL compute isGlobalView as true WHEN searchText, filterMethod, filterYear, or filterInsurance is active
3. THE Filter_Provider SHALL compute isGlobalView as false WHEN only filterType is active (category filter alone does not trigger global view)
4. THE Filter_Provider SHALL compute globalViewTriggers as an array of active filter names that triggered global view
5. THE Filter_Provider SHALL validate filterType against the approved CATEGORIES list
6. THE Filter_Provider SHALL validate filterMethod against the available payment methods list
7. WHEN handleClearFilters is called, THE Filter_Provider SHALL reset all filter values to empty strings
8. WHEN handleReturnToMonthlyView is called, THE Filter_Provider SHALL clear only global-triggering filters (searchText, filterMethod, filterYear, filterInsurance) but preserve filterType

### Requirement 3: Custom Hook for Filter Access

**User Story:** As a developer, I want a custom hook to access filter context, so that I have a clean API for consuming filter state.

#### Acceptance Criteria

1. THE useFilterContext hook SHALL return all filter state values and setter functions
2. IF useFilterContext is called outside of Filter_Provider, THEN THE hook SHALL throw a descriptive error
3. THE useFilterContext hook SHALL be importable from a dedicated context file

### Requirement 4: App.jsx Integration

**User Story:** As a developer, I want App.jsx to use the Filter Context, so that filter state is removed from the main component.

#### Acceptance Criteria

1. WHEN the refactoring is complete, THE App component SHALL wrap its content with Filter_Provider
2. WHEN the refactoring is complete, THE App component SHALL consume filter state via useFilterContext hook
3. WHEN the refactoring is complete, THE App component SHALL NOT contain useState hooks for filter state (searchText, filterType, filterMethod, filterYear, filterInsurance)
4. WHEN the refactoring is complete, THE App component SHALL NOT contain useState hooks for view state (selectedYear, selectedMonth)
5. THE App component SHALL continue to pass filter values to child components as props (backward compatibility)

### Requirement 5: Backward Compatibility

**User Story:** As a user, I want the application to behave exactly the same after refactoring, so that my workflow is not disrupted.

#### Acceptance Criteria

1. THE refactored application SHALL maintain identical filtering behavior for text search
2. THE refactored application SHALL maintain identical filtering behavior for category filter
3. THE refactored application SHALL maintain identical filtering behavior for payment method filter
4. THE refactored application SHALL maintain identical filtering behavior for year filter
5. THE refactored application SHALL maintain identical filtering behavior for insurance status filter
6. THE refactored application SHALL maintain identical global view triggering logic
7. THE refactored application SHALL maintain identical monthly view display
8. THE refactored application SHALL maintain identical "Return to Monthly View" functionality

### Requirement 6: Event Handler Migration

**User Story:** As a developer, I want event handlers that modify filter state to be part of the context, so that state mutations are centralized.

#### Acceptance Criteria

1. THE Filter_Context SHALL provide handleSearchChange function that updates searchText
2. THE Filter_Context SHALL provide handleFilterTypeChange function that validates and updates filterType
3. THE Filter_Context SHALL provide handleFilterMethodChange function that validates and updates filterMethod
4. THE Filter_Context SHALL provide handleFilterYearChange function that updates filterYear
5. THE Filter_Context SHALL provide handleMonthChange function that updates selectedYear and selectedMonth
6. THE Filter_Context SHALL provide setFilterInsurance function that updates filterInsurance

### Requirement 7: Payment Methods Integration

**User Story:** As a developer, I want the filter context to integrate with payment methods data, so that method validation works correctly.

#### Acceptance Criteria

1. THE Filter_Provider SHALL accept paymentMethods as a prop or fetch them internally
2. WHEN filterMethod is set to a value not in paymentMethods list, THE Filter_Provider SHALL reset filterMethod to empty string
3. THE Filter_Provider SHALL handle the case where paymentMethods list is empty (skip validation)
