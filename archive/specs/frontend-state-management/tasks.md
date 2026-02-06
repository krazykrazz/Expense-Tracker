# Implementation Plan: Frontend State Management - Phase 1: Filter Context

## Overview

This implementation plan extracts filter and view mode state from App.jsx into a dedicated React Context. The approach is incremental: create the context, add tests, then integrate into App.jsx while maintaining backward compatibility.

## Tasks

- [x] 1. Create FilterContext module
  - [x] 1.1 Create `frontend/src/contexts/FilterContext.jsx` with FilterProvider and useFilterContext
    - Implement all filter state (searchText, filterType, filterMethod, filterYear, filterInsurance)
    - Implement view state (selectedYear, selectedMonth)
    - Implement derived state (isGlobalView, globalViewTriggers)
    - Implement all handler functions with validation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 6.1, 6.4, 6.5, 6.6_

  - [x] 1.2 Write unit tests for FilterContext
    - Test useFilterContext throws outside provider
    - Test initial state values
    - Test edge cases (empty strings, whitespace)
    - _Requirements: 3.2_

  - [x] 1.3 Write property test for context interface completeness
    - **Property 1: Context provides complete interface**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

  - [x] 1.4 Write property test for default values initialization
    - **Property 2: Default values initialization**
    - **Validates: Requirements 2.1**

- [x] 2. Checkpoint - Ensure context module tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement derived state computation
  - [x] 3.1 Verify isGlobalView and globalViewTriggers computation logic
    - Ensure filterType alone does not trigger global view
    - Ensure all global-triggering filters are correctly identified
    - _Requirements: 2.2, 2.3, 2.4_

  - [x] 3.2 Write property test for isGlobalView computation
    - **Property 3: isGlobalView computation**
    - **Validates: Requirements 2.2, 2.3**

  - [x] 3.3 Write property test for globalViewTriggers computation
    - **Property 4: globalViewTriggers computation**
    - **Validates: Requirements 2.4**

- [x] 4. Implement filter validation
  - [x] 4.1 Implement category validation in handleFilterTypeChange
    - Validate against CATEGORIES constant
    - Reset to empty string if invalid
    - _Requirements: 2.5_

  - [x] 4.2 Implement payment method validation in handleFilterMethodChange
    - Validate against paymentMethods prop
    - Skip validation if paymentMethods is empty
    - Reset to empty string if invalid
    - _Requirements: 2.6, 7.2, 7.3_

  - [x] 4.3 Write property test for filter validation
    - **Property 5: Filter validation**
    - **Validates: Requirements 2.5, 2.6, 7.2, 7.3**

- [x] 5. Implement utility handlers
  - [x] 5.1 Implement handleClearFilters
    - Reset all filter values to empty strings
    - _Requirements: 2.7_

  - [x] 5.2 Implement handleReturnToMonthlyView
    - Clear only global-triggering filters
    - Preserve filterType value
    - _Requirements: 2.8_

  - [x] 5.3 Write property test for handleClearFilters
    - **Property 6: handleClearFilters resets all filters**
    - **Validates: Requirements 2.7**

  - [x] 5.4 Write property test for handleReturnToMonthlyView
    - **Property 7: handleReturnToMonthlyView preserves filterType**
    - **Validates: Requirements 2.8**

- [x] 6. Implement state update handlers
  - [x] 6.1 Implement handleSearchChange, handleFilterYearChange, handleMonthChange, setFilterInsurance
    - Each handler updates its corresponding state value
    - _Requirements: 6.1, 6.4, 6.5, 6.6_

  - [x] 6.2 Write property test for handler state updates
    - **Property 8: Handlers update state correctly**
    - **Validates: Requirements 6.1, 6.4, 6.5, 6.6**

- [x] 7. Checkpoint - Ensure all context tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Integrate FilterContext into App.jsx
  - [x] 8.1 Wrap App content with FilterProvider
    - Pass paymentMethods prop to FilterProvider
    - Create AppContent component to consume context
    - _Requirements: 4.1, 4.2, 7.1_

  - [x] 8.2 Remove filter useState hooks from App.jsx
    - Remove searchText, filterType, filterMethod, filterYear, filterInsurance useState
    - Remove selectedYear, selectedMonth useState
    - Replace with useFilterContext consumption
    - _Requirements: 4.3, 4.4_

  - [x] 8.3 Update handler references in App.jsx
    - Replace local handlers with context handlers
    - Maintain prop passing to child components for backward compatibility
    - _Requirements: 4.5_

  - [x] 8.4 Write integration tests for App.jsx with FilterContext
    - Test filter state flows to child components
    - Test global view mode triggers correctly
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Verify App.jsx line count is reduced
  - Verify no user-facing behavior changes

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The refactoring maintains backward compatibility - child components continue receiving props
