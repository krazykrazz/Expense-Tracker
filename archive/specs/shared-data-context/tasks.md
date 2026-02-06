# Implementation Plan: SharedDataContext (Phase 4)

## Overview

This plan implements the SharedDataContext, extracting shared data fetching (payment methods, people, budgets) from App.jsx into a dedicated context. The implementation follows the same patterns established in FilterContext, ExpenseContext, and ModalContext.

## Tasks

- [x] 1. Create SharedDataContext with core structure
  - [x] 1.1 Create SharedDataContext.jsx with provider and hook
    - Create context with createContext(null)
    - Implement SharedDataProvider component with state for paymentMethods, people, budgets
    - Implement useSharedDataContext hook with error handling
    - Use useCallback for all handlers, useMemo for context value
    - _Requirements: 1.1, 1.2, 2.1, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 6.4, 6.5_

  - [x] 1.2 Write unit tests for SharedDataContext
    - Test initial state values
    - Test hook throws error outside provider
    - Test context value is accessible
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 5.2_

- [x] 2. Implement payment methods data fetching and modal state
  - [x] 2.1 Add payment methods fetching logic
    - Add useEffect to fetch payment methods on mount
    - Add useEffect to re-fetch when refreshTrigger changes
    - Implement refreshPaymentMethods callback
    - Handle API errors gracefully
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 5.3, 5.4_

  - [x] 2.2 Add payment methods modal state and event listener
    - Add showPaymentMethods state with open/close handlers
    - Add window event listener for 'openPaymentMethods' event
    - Clean up event listener on unmount
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.3 Write property test for modal state idempotence
    - **Property 2: Modal State Transitions are Idempotent**
    - **Validates: Requirements 2.2, 2.3**

- [x] 3. Implement people data fetching
  - [x] 3.1 Add people fetching logic
    - Add useEffect to fetch people on mount
    - Add useEffect to re-fetch when refreshTrigger changes
    - Implement refreshPeople callback
    - Add window event listener for 'peopleUpdated' event
    - Handle API errors gracefully
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 5.3, 5.4_

  - [x] 3.2 Write property test for refresh triggers re-fetch
    - **Property 1: Refresh Callback Triggers Re-fetch**
    - **Validates: Requirements 1.4, 1.5, 3.4, 3.5, 4.4, 4.5**

- [x] 4. Implement budgets data fetching
  - [x] 4.1 Add budgets fetching logic
    - Add useEffect to fetch budgets on mount and when year/month props change
    - Add useEffect to re-fetch when refreshTrigger changes
    - Implement refreshBudgets callback
    - Handle API errors gracefully
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 5.3, 5.4_

  - [x] 4.2 Write property test for year/month change triggers fetch
    - **Property 3: Budget Fetching Responds to Year/Month Changes**
    - **Validates: Requirements 4.3**

- [x] 5. Checkpoint - Verify context implementation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Integrate SharedDataContext into App.jsx
  - [x] 6.1 Update App component to use SharedDataProvider
    - Import SharedDataProvider and useSharedDataContext
    - Wrap AppContent with SharedDataProvider inside ModalProvider
    - Pass selectedYear and selectedMonth props to SharedDataProvider
    - Remove local paymentMethods state from App component
    - Remove local showPaymentMethods state from App component
    - Remove openPaymentMethods event listener from App component
    - _Requirements: 6.1, 6.2, 7.1_

  - [x] 6.2 Update AppContent to consume SharedDataContext
    - Replace local people state with context
    - Replace local budgets fetching with context
    - Use context for PaymentMethodsModal visibility
    - Remove redundant state and effects
    - _Requirements: 7.2, 7.3_

  - [x] 6.3 Write property test for error handling preserves state
    - **Property 4: Error Handling Preserves State**
    - **Validates: Requirements 5.3, 5.4**

- [x] 7. Write remaining property tests
  - [x] 7.1 Write property test for handler reference stability
    - **Property 5: Handler References are Stable**
    - **Validates: Requirements 6.4, 6.5**

- [x] 8. Final checkpoint - Verify integration
  - Ensure all tests pass, ask the user if questions arise.
  - Verify payment methods modal opens from MonthSelector
  - Verify people data is available in ExpenseForm
  - Verify budgets refresh works correctly

## Notes

- All tasks are mandatory
- This is a frontend-only refactoring - no backend changes required
- The existing API endpoints (payment methods, people, budgets) are already in place
- Follow the same patterns as ModalContext for consistency
- Property tests use fast-check with minimum 100 iterations
