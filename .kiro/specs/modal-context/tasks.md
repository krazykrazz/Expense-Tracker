# Implementation Plan: Frontend State Management - Phase 3: Modal Context

## Overview

This implementation plan extracts modal visibility state (8 booleans + 1 focus category) and their open/close handlers from AppContent in App.jsx into a dedicated ModalContext. The approach mirrors Phase 1 and Phase 2: create the context, add tests, then integrate into App.jsx while maintaining backward compatibility.

## Tasks

- [x] 1. Create ModalContext module
  - [x] 1.1 Create `frontend/src/contexts/ModalContext.jsx` with ModalProvider and useModalContext
    - Implement 8 boolean visibility states (showExpenseForm, showBackupSettings, showAnnualSummary, showTaxDeductible, showBudgetManagement, showBudgetHistory, showPeopleManagement, showAnalyticsHub)
    - Implement budgetManagementFocusCategory state (string or null)
    - Implement open/close handlers for each modal using useCallback
    - Implement openBudgetManagement with optional category parameter
    - Implement closeBudgetManagement that resets focus category to null
    - Implement closeAllOverlays that closes only overlay modals (taxDeductible, annualSummary, backupSettings, budgetHistory)
    - Implement navigateToTaxDeductible window event listener in useEffect
    - Export useModalContext hook with descriptive error when used outside provider
    - Memoize context value with useMemo
    - _Requirements: 1.1-1.9, 2.1-2.16, 3.1, 3.2, 4.1-4.3, 6.1_

  - [x] 1.2 Write unit tests for ModalContext
    - Test useModalContext throws outside provider
    - Test ModalProvider works without FilterProvider or ExpenseProvider (independence)
    - Test initial state values (all false, focusCategory null)
    - Test interface completeness (all expected fields present)
    - Test navigateToTaxDeductible event opens tax deductible modal
    - _Requirements: 1.1-1.9, 4.2, 5.2, 6.1_

- [x] 2. Checkpoint - Ensure context module tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Write property tests for modal handlers
  - [x] 3.1 Write property test for open/close round-trip
    - **Property 1: Open/close round-trip for simple modals**
    - Generate random sequences of modal names from the 7 simple modals
    - For each, call open handler and verify state is true, call close handler and verify state is false
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16**

  - [x] 3.2 Write property test for budget management focus category
    - **Property 2: Budget management open with focus category and close resets**
    - Generate random category strings (including null)
    - Verify openBudgetManagement sets visibility and category, closeBudgetManagement resets both
    - **Validates: Requirements 2.9, 2.10**

  - [x] 3.3 Write property test for closeAllOverlays selectivity
    - **Property 3: closeAllOverlays selectively closes overlay modals**
    - Generate random initial boolean states for all 8 modals
    - Call closeAllOverlays and verify overlay modals are false, non-overlay modals unchanged
    - **Validates: Requirements 3.1, 3.2**

- [x] 4. Checkpoint - Ensure all context and property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Integrate ModalContext into App.jsx
  - [x] 5.1 Wrap AppContent with ModalProvider inside ExpenseProvider
    - Add ModalProvider between ExpenseProvider and AppContent in App component
    - Add useModalContext import to App.jsx
    - _Requirements: 5.1_

  - [x] 5.2 Consume ModalContext in AppContent and remove extracted state
    - Add useModalContext() call in AppContent
    - Remove useState hooks: showExpenseForm, showBackupSettings, showAnnualSummary, showTaxDeductible, showBudgetManagement, budgetManagementFocusCategory, showBudgetHistory, showPeopleManagement, showAnalyticsHub
    - Remove handleManageBudgets function (replaced by openBudgetManagement)
    - Remove handleCloseBudgetManagement function (replaced by closeBudgetManagement + triggerRefresh)
    - Remove handleClosePeopleManagement function (replaced by closePeopleManagement)
    - Remove handleViewBudgetHistory function (replaced by openBudgetHistory)
    - Remove handleCloseBudgetHistory function (replaced by closeBudgetHistory)
    - Remove navigateToTaxDeductible event listener useEffect (moved to ModalProvider)
    - Update navigateToExpenseList event listener to use closeAllOverlays
    - Update filterByInsuranceStatus event listener to use closeAllOverlays
    - Replace all inline setShow* calls with context open/close handlers in JSX
    - Update handleExpenseAdded wrapper to use closeExpenseForm
    - Update handleViewExpensesFromAnalytics to use closeAnalyticsHub
    - _Requirements: 5.3, 5.4, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 5.3 Write integration tests for App.jsx with ModalContext
    - Test modal opens from MonthSelector button callbacks
    - Test modal overlay click-to-close works through context
    - Test FloatingAddButton opens expense form through context
    - Test header settings button opens backup settings through context
    - Test navigateToExpenseList event closes overlay modals
    - _Requirements: 7.1, 7.3, 7.4_

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Verify AppContent has 9 fewer useState hooks
  - Verify no user-facing behavior changes

## Notes

- All tasks are mandatory
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- ModalProvider is independent of FilterContext and ExpenseContext
- showPaymentMethods stays in App component (Phase 4 scope)
