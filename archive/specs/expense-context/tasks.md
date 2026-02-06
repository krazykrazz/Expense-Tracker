# Implementation Plan: Frontend State Management - Phase 2: Expense Context

## Overview

This implementation plan extracts expense data state, fetching logic, CRUD handlers, and client-side filtering from AppContent in App.jsx into a dedicated ExpenseContext. The approach mirrors Phase 1 (FilterContext): create the context, add tests, then integrate into App.jsx while maintaining backward compatibility.

## Tasks

- [ ] 1. Create ExpenseContext module
  - [x] 1.1 Create `frontend/src/contexts/ExpenseContext.jsx` with ExpenseProvider and useExpenseContext
    - Implement core state (expenses, loading, error, refreshTrigger, budgetAlertRefreshTrigger, currentMonthExpenseCount)
    - Consume FilterContext internally via useFilterContext for view mode and filter values
    - Implement expense fetch effect with view-mode-aware URL construction
    - Implement expensesUpdated event listener with re-fetch
    - Implement currentMonthExpenseCount fetch effect (depends on refreshTrigger)
    - Implement CRUD handlers (handleExpenseAdded, handleExpenseDeleted, handleExpenseUpdated)
    - Implement filteredExpenses memoized computation with AND logic
    - Implement triggerRefresh and clearError utility functions
    - Export useExpenseContext hook with descriptive error when used outside provider
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3_

  - [x] 1.2 Write unit tests for ExpenseContext
    - Test useExpenseContext throws outside provider
    - Test ExpenseProvider requires FilterProvider (throws FilterContext error)
    - Test initial state values (empty array, loading false, error null)
    - Test fetch URL for monthly view, global view, global with year filter
    - Test network error produces user-friendly message
    - Test server error JSON is parsed
    - Test expensesUpdated event triggers refresh
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.2, 3.7, 3.8, 6.1, 6.2, 8.2_

- [x] 2. Checkpoint - Ensure context module tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Write property tests for fetch and loading behavior
  - [x] 3.1 Write property test for fetch URL construction
    - **Property 1: Fetch URL construction matches view mode**
    - Generate random year/month/filterYear/isGlobalView combinations
    - Verify URL matches expected pattern for each view mode
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [x] 3.2 Write property test for loading state transitions
    - **Property 2: Loading state transitions during fetch**
    - Verify loading is true during fetch, false after completion
    - **Validates: Requirements 3.5, 3.6, 3.7, 3.8**

- [ ] 4. Write property tests for CRUD handlers
  - [x] 4.1 Write property test for handleExpenseAdded sorted insertion
    - **Property 3: handleExpenseAdded inserts in date-sorted order**
    - Generate random expense arrays and new expenses within current view
    - Verify resulting array contains new expense and is date-sorted
    - **Validates: Requirements 4.1**

  - [x] 4.2 Write property test for handleExpenseAdded view filtering
    - **Property 4: handleExpenseAdded skips out-of-view expenses**
    - Generate expenses with year/month not matching selected view in monthly mode
    - Verify array length unchanged
    - **Validates: Requirements 4.2**

  - [x] 4.3 Write property test for handleExpenseDeleted
    - **Property 5: handleExpenseDeleted removes exactly the target expense**
    - Generate arrays with unique IDs, delete random ID
    - Verify length reduced by 1 and deleted ID absent
    - **Validates: Requirements 4.4**

  - [x] 4.4 Write property test for handleExpenseUpdated
    - **Property 6: handleExpenseUpdated replaces the matching expense**
    - Generate arrays, update random expense, verify replacement
    - **Validates: Requirements 4.6**

  - [x] 4.5 Write property test for CRUD refreshTrigger increment
    - **Property 7: CRUD operations increment refreshTrigger**
    - Verify refreshTrigger increases by 1 for each add/delete/update
    - **Validates: Requirements 4.3, 4.5, 4.7**

- [ ] 5. Write property test for client-side filtering
  - [x] 5.1 Write property test for filtering with AND logic
    - **Property 8: Client-side filtering with AND logic**
    - Generate random expenses and filter combinations (searchText, filterType, filterMethod)
    - Verify filteredExpenses matches manual AND-logic filtering
    - Verify case-insensitive search on place and notes
    - Verify no filters returns full array
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**

- [x] 6. Checkpoint - Ensure all context and property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Integrate ExpenseContext into App.jsx
  - [x] 7.1 Wrap AppContent with ExpenseProvider inside FilterProvider
    - Add ExpenseProvider between FilterProvider and AppContent in App component
    - _Requirements: 9.1_

  - [x] 7.2 Consume ExpenseContext in AppContent and remove extracted state
    - Add useExpenseContext() call in AppContent
    - Remove useState hooks: expenses, loading, error, refreshTrigger, currentMonthExpenseCount, budgetAlertRefreshTrigger
    - Remove expense fetch useEffect
    - Remove expensesUpdated event listener useEffect
    - Remove currentMonthExpenseCount fetch useEffect
    - Remove filteredExpenses useMemo
    - Remove handleExpenseAdded, handleExpenseDeleted, handleExpenseUpdated handler functions
    - Replace all references with context values
    - _Requirements: 9.2, 9.3, 9.4, 9.5_

  - [x] 7.3 Wire up remaining AppContent interactions with context
    - Wrap context handleExpenseAdded to also close expense form modal (setShowExpenseForm(false))
    - Update retry button to use clearError + triggerRefresh from context
    - Continue passing expense values to child components as props for backward compatibility
    - _Requirements: 9.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [x] 7.4 Write integration tests for App.jsx with ExpenseContext
    - Test expense data flows to ExpenseList via props
    - Test CRUD handlers update context state correctly
    - Test view mode changes trigger re-fetch
    - Test filtered expenses update when filters change
    - _Requirements: 10.1, 10.5, 10.7_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Verify App.jsx line count is reduced
  - Verify no user-facing behavior changes

## Notes

- All tasks are mandatory
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- ExpenseProvider must be nested inside FilterProvider (it consumes FilterContext internally)
- The refactoring maintains backward compatibility — child components continue receiving props
