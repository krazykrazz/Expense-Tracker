# Implementation Plan: Frontend Test Simplification

## Overview

This plan implements a comprehensive frontend test simplification strategy by creating reusable test utilities, establishing clear testing guidelines, and converting over-engineered property-based tests to simpler parameterized tests. The implementation is organized into four phases: utility creation, test conversion, documentation, and validation.

## Tasks

- [x] 1. Create test utilities directory structure
  - Create `frontend/src/test-utils/` directory
  - Create placeholder files for each utility module
  - Create index.js for unified exports
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 2. Implement arbitraries module
  - [x] 2.1 Create date generators (safeDate, safeDateObject, dateRange)
    - Implement safe date generation with fallbacks for invalid dates
    - Add configurable min/max date ranges
    - _Requirements: 3.1_
  
  - [x] 2.2 Create amount generators (safeAmount, positiveAmount, amountWithCents)
    - Filter out NaN, Infinity, and negative values
    - Support configurable min/max ranges
    - _Requirements: 3.1_
  
  - [x] 2.3 Create string generators (safeString, nonEmptyString, placeName)
    - Filter empty and whitespace-only strings
    - Support configurable length constraints
    - _Requirements: 3.1_
  
  - [x] 2.4 Create domain-specific generators
    - Implement expenseCategory, taxDeductibleCategory, paymentMethod, insuranceStatus
    - Use constantFrom for valid domain values
    - _Requirements: 3.1_
  
  - [x] 2.5 Create composite generators (expenseRecord, personRecord, budgetRecord)
    - Combine primitive generators into domain objects
    - Support optional field overrides
    - _Requirements: 3.1_
  
  - [x] 2.6 Create sequence generators (modalOperationSequence, stateTransitionSequence)
    - Generate arrays of operations for state machine testing
    - Support configurable sequence lengths
    - _Requirements: 3.1_
  
  - [x]* 2.7 Write property tests for arbitraries module
    - **Property 2: Arbitrary generators produce valid domain values**
    - **Validates: Requirements 3.1**

- [x] 3. Implement wrappers module
  - [x] 3.1 Create basic context wrappers
    - Implement createModalWrapper, createFilterWrapper, createExpenseWrapper, createSharedDataWrapper
    - Support optional props for initial state
    - _Requirements: 3.2, 5.1_
  
  - [x] 3.2 Create composite wrapper functions
    - Implement createFullContextWrapper with all contexts
    - Implement createMinimalWrapper with selective contexts
    - _Requirements: 3.2_
  
  - [x] 3.3 Implement wrapper builder with fluent API
    - Create builder class with withModal, withFilter, withExpense, withSharedData methods
    - Implement build() method that composes all added contexts
    - _Requirements: 3.2_
  
  - [x]* 3.4 Write property tests for wrappers module
    - **Property 3: Wrapper builders provide all requested contexts**
    - **Validates: Requirements 3.2**

- [x] 4. Implement assertions module
  - [x] 4.1 Create async state assertion helpers
    - Implement waitForState with polling and timeout
    - Implement waitForStateChange that detects any change
    - Implement waitForApiCall for mock function tracking
    - _Requirements: 3.3_
  
  - [x] 4.2 Create modal-specific assertions
    - Implement assertModalOpen, assertModalClosed, assertAllModalsClosed
    - Include clear error messages with modal names
    - _Requirements: 5.2_
  
  - [x] 4.3 Create sequence assertion helpers
    - Implement assertSequenceResult for operation sequences
    - Implement assertIdempotence for repeated operations
    - _Requirements: 5.2, 5.5_
  
  - [x]* 4.4 Write property tests for assertions module
    - **Property 5: Async assertions wait for conditions correctly**
    - **Property 8: Failed assertions include diagnostic information**
    - **Validates: Requirements 3.3, 2.5, 5.5**

- [x] 5. Implement mocks module
  - [x] 5.1 Create API mock factories
    - Implement createExpenseApiMock, createPaymentMethodApiMock, createPeopleApiMock, createBudgetApiMock
    - Support override options for custom responses
    - _Requirements: 3.4_
  
  - [x] 5.2 Create response builder helpers
    - Implement mockExpenseResponse, mockErrorResponse, mockSuccessResponse
    - Ensure responses match actual API structure
    - _Requirements: 3.4_
  
  - [x] 5.3 Implement call tracking utilities
    - Create createCallTracker with track, getCallCount, getLastCall, reset methods
    - Support multiple tracked functions
    - _Requirements: 5.3_
  
  - [x]* 5.4 Write property tests for mocks module
    - **Property 4: Mock factories produce valid API responses**
    - **Property 7: Call tracking utilities count invocations accurately**
    - **Validates: Requirements 3.4, 5.3**

- [x] 6. Implement parameterized test helper
  - [x] 6.1 Create testEach utility function
    - Support array of test cases with input, expected, description
    - Provide test and it methods for Vitest compatibility
    - Support skip and only flags on individual test cases
    - _Requirements: 4.1, 4.2_
  
  - [x]* 6.2 Write unit tests for parameterized helper
    - Test that all cases are executed
    - Test skip and only functionality
    - Test error reporting
    - _Requirements: 4.1, 4.2_

- [x] 7. Create unified exports in index.js
  - Export all arbitraries from arbitraries.js
  - Export all wrappers from wrappers.js
  - Export all assertions from assertions.js
  - Export all mocks from mocks.js
  - Export testEach from parameterized.js
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x]* 8. Write integration tests for test utilities
  - Test that utilities work together (e.g., wrappers + arbitraries + assertions)
  - Test realistic testing scenarios
  - Validate error handling across modules
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 9. Checkpoint - Ensure all utility tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Convert CollapsibleSection PBT to parameterized tests
  - [x] 10.1 Analyze existing PBT test for edge cases
    - Identify all meaningful input variations
    - Document edge cases found by shrinking
    - _Requirements: 4.3_
  
  - [x] 10.2 Create parameterized test cases
    - Create test cases for click, Enter, Space interactions
    - Include edge cases: empty title, with/without badge, with/without error
    - Use testEach helper for clean test structure
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [x] 10.3 Validate coverage is maintained
    - Run coverage before and after conversion
    - Ensure no coverage loss
    - _Requirements: 6.1_
  
  - [x] 10.4 Remove original PBT test
    - Delete CollapsibleSection.pbt.test.jsx after validation
    - _Requirements: 4.1_

- [x] 11. Convert HelpTooltip PBT to parameterized tests
  - [x] 11.1 Analyze existing PBT test for edge cases
    - Identify meaningful prop combinations
    - Document edge cases
    - _Requirements: 4.3_
  
  - [x] 11.2 Create parameterized test cases
    - Create test cases for different prop combinations
    - Use testEach helper
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [x] 11.3 Validate coverage and remove PBT
    - Verify coverage maintained
    - Delete HelpTooltip.pbt.test.jsx
    - _Requirements: 6.1, 4.1_

- [x] 12. Simplify SharedDataContext PBT using utilities
  - [x] 12.1 Refactor to use modalOperationSequence arbitrary
    - Replace custom operation arbitraries with utility version
    - _Requirements: 2.1, 3.1_
  
  - [x] 12.2 Refactor to use createSharedDataWrapper
    - Replace inline wrapper with utility version
    - _Requirements: 2.3, 3.2_
  
  - [x] 12.3 Refactor to use assertion helpers
    - Replace manual assertions with utility helpers
    - _Requirements: 2.2, 3.3_
  
  - [x] 12.4 Measure boilerplate reduction
    - Count lines before and after
    - Verify at least 30% reduction
    - _Requirements: 2.4_

- [x] 13. Simplify ModalContext PBT using utilities
  - [x] 13.1 Refactor to use modalOperationSequence arbitrary
    - Replace custom arbitraries
    - _Requirements: 2.1, 3.1_
  
  - [x] 13.2 Refactor to use createModalWrapper
    - Replace inline wrapper
    - _Requirements: 2.3, 3.2_
  
  - [x] 13.3 Refactor to use assertSequenceResult
    - Replace manual sequence validation
    - _Requirements: 2.2, 5.2_

- [x] 14. Simplify ExpenseContext PBT using utilities
  - [x] 14.1 Refactor to use expenseRecord arbitrary
    - Replace custom expense generators
    - _Requirements: 2.1, 3.1_
  
  - [x] 14.2 Refactor to use createExpenseWrapper
    - Replace inline wrapper
    - _Requirements: 2.3, 3.2_
  
  - [x] 14.3 Refactor to use async assertion helpers
    - Replace manual waitFor patterns
    - _Requirements: 2.2, 3.3_

- [x] 15. Simplify FilterContext PBT using utilities
  - [x] 15.1 Refactor to use domain arbitraries
    - Use expenseCategory, paymentMethod arbitraries
    - _Requirements: 2.1, 3.1_
  
  - [x] 15.2 Refactor to use createFilterWrapper
    - Replace inline wrapper
    - _Requirements: 2.3, 3.2_
  
  - [x] 15.3 Refactor to use state transition helpers
    - Use stateTransitionSequence and assertion helpers
    - _Requirements: 2.2, 5.5_

- [x] 16. Checkpoint - Ensure all refactored tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Create testing guidelines documentation
  - [x] 17.1 Write FRONTEND_TESTING_GUIDELINES.md
    - Create docs/testing/ directory
    - Document when to use PBT vs unit tests vs parameterized tests
    - Include decision tree diagram
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [x] 17.2 Add examples of good test patterns
    - Include unit test examples
    - Include PBT examples
    - Include parameterized test examples
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [x] 17.3 Add migration examples
    - Show before/after for converted tests
    - Explain rationale for each conversion
    - Document boilerplate reduction
    - _Requirements: 8.5_
  
  - [x] 17.4 Document test utility usage
    - Provide examples for each utility module
    - Show common patterns and best practices
    - Include troubleshooting tips
    - _Requirements: 3.5, 8.4_

- [x] 18. Update existing test documentation
  - Update testing.md steering file with new guidelines
  - Add references to test utilities
  - Document parameterized test patterns
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 19. Measure and document improvements
  - [x] 19.1 Measure test execution time improvements
    - Run full test suite before and after
    - Measure individual converted tests
    - Document time savings
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [x] 19.2 Measure boilerplate reduction
    - Count lines of code in refactored tests
    - Calculate percentage reduction
    - Document in migration guide
    - _Requirements: 2.4, 5.4_
  
  - [x] 19.3 Validate coverage maintained
    - Run coverage report
    - Verify no coverage loss
    - Document coverage metrics
    - _Requirements: 6.1, 6.5_

- [x] 20. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for faster MVP
- Test utilities should be created first to enable refactoring of existing tests
- Conversion of PBT to parameterized tests should validate coverage before removing original tests
- High-value PBT tests (context state machines) are refactored to use utilities, not converted
- Low-value PBT tests (simple component interactions) are converted to parameterized tests
- Documentation should be created after utilities and conversions are complete
- Each checkpoint ensures incremental validation of changes
