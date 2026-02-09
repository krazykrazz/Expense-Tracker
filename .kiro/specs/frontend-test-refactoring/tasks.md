# Implementation Plan: Frontend Test Simplification

## Overview

This plan implements a gradual refactoring approach to simplify and improve the frontend test suite. We'll start by creating reusable utilities and patterns, then apply them to the most problematic tests (ExpenseForm), and finally document the patterns for broader adoption.

The implementation is structured to deliver value incrementally - each task produces working, tested code that improves the test suite immediately.

## Tasks

- [x] 1. Create test utility infrastructure
  - [x] 1.1 Create MockCollapsibleSection component
    - Create `frontend/src/test-utils/componentMocks.jsx`
    - Implement MockCollapsibleSection with same interface as real component
    - Always render children (jsdom workaround)
    - Add data-testid attributes for easy querying
    - Export from `frontend/src/test-utils/index.js`
    - _Requirements: 1.2, 2.1, 8.1_
  
  - [x] 1.2 Write unit tests for MockCollapsibleSection
    - Test that children render regardless of isExpanded state
    - Test that badge displays correctly
    - Test that onToggle is called on button click
    - Test that aria-expanded attribute is set correctly
    - _Requirements: 8.1_
  
  - [x] 1.3 Add enhanced ExpenseForm test helpers
    - Add `mockCollapsibleSection()` function to `expenseFormHelpers.js`
    - Add `assertFieldVisible()` and `assertFieldHidden()` helpers
    - Add `assertSubmittedData()` helper for form submission verification
    - Add `assertValidationError()` helper for error message verification
    - Export new helpers from `frontend/src/test-utils/index.js`
    - _Requirements: 8.2, 8.3_
  
  - [x] 1.4 Write unit tests for new test helpers
    - Test assertFieldVisible with visible and hidden fields
    - Test assertSubmittedData with matching and non-matching data
    - Test assertValidationError with present and absent errors
    - _Requirements: 8.2, 8.3_

- [x] 2. Update testing guidelines documentation
  - [x] 2.1 Add "When to Use Each Test Type" section
    - Create decision flowchart (text-based or Mermaid diagram)
    - Document unit test use cases with examples
    - Document integration test use cases with examples
    - Document PBT use cases with examples
    - Document E2E test use cases with examples
    - Document when NOT to use PBT (UI interactions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  
  - [x] 2.2 Add "Testing UI Components" section
    - Document pattern for mocking CollapsibleSection
    - Document pattern for testing conditional field display
    - Document pattern for testing form submission
    - Document pattern for testing form validation
    - Include before/after examples for each pattern
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.7_
  
  - [x] 2.3 Add "Mocking Strategies" section
    - Document when and how to mock components
    - Document when and how to mock modules
    - Document when and how to mock APIs
    - Include examples of MockCollapsibleSection usage
    - _Requirements: 9.2_
  
  - [x] 2.4 Add "Async Testing Best Practices" section
    - Document waitFor usage with examples
    - Document findBy queries with examples
    - Document user-event vs fireEvent comparison
    - Include common async patterns and anti-patterns
    - _Requirements: 2.2, 2.3, 9.1, 9.3_
  
  - [x] 2.5 Add "Common Pitfalls and Solutions" section
    - Document jsdom limitations with CollapsibleSection
    - Document timing issues and solutions
    - Document implementation detail coupling issues
    - Include troubleshooting guide for common test failures
    - _Requirements: 2.4, 2.5, 9.4, 9.6_
  
  - [x] 2.6 Add "Migration Examples" section
    - Include before/after for mocking CollapsibleSection
    - Include before/after for PBT to parameterized conversion
    - Include before/after for fireEvent to user-event
    - Include before/after for implementation detail queries
    - _Requirements: 9.5_

- [x] 3. Refactor ExpenseForm.sections.test.jsx
  - [x] 3.1 Add MockCollapsibleSection mock at top of file
    - Import MockCollapsibleSection from test-utils
    - Add vi.mock('./CollapsibleSection') with MockCollapsibleSection
    - Remove expandSection calls from tests
    - _Requirements: 1.2, 5.1_
  
  - [x] 3.2 Update section visibility tests
    - Remove section expansion logic
    - Test that sections render with correct titles
    - Test that badges display correctly
    - Use accessible queries (getByRole, getByLabelText)
    - _Requirements: 1.4, 5.2_
  
  - [x] 3.3 Update conditional field display tests
    - Test fields appear/disappear based on category selection
    - Use assertFieldVisible and assertFieldHidden helpers
    - Replace fireEvent with user-event
    - _Requirements: 1.3, 5.3_
  
  - [x] 3.4 Update section badge tests
    - Test badge displays when people are assigned
    - Test badge displays when insurance status is set
    - Test badge displays when reimbursement is configured
    - _Requirements: 5.2_
  
  - [x] 3.5 Run ExpenseForm.sections.test.jsx to verify all tests pass
    - Ensure no tests are skipped
    - Ensure all tests pass reliably
    - Measure execution time (should be < 10 seconds)
    - _Requirements: 2.1, 7.2_

- [x] 4. Refactor ExpenseForm.pbt.test.jsx
  - [x] 4.1 Identify PBT tests that should be parameterized
    - Review each PBT test for finite input spaces
    - Mark tests with finite inputs (< 10 cases) for conversion
    - Keep PBT tests for truly infinite/large input spaces
    - _Requirements: 4.1, 4.2, 4.5_
  
  - [x] 4.2 Convert finite-input PBT tests to parameterized tests
    - Convert required field validation PBT to parameterized
    - Convert category-specific behavior PBT to parameterized
    - Use testEach helper from test-utils
    - _Requirements: 4.1, 4.2_
  
  - [x] 4.3 Update remaining PBT tests to use user-event
    - Replace fireEvent.change with userEvent.type
    - Replace fireEvent.click with userEvent.click
    - Replace fireEvent.keyDown with userEvent.keyboard
    - _Requirements: 1.3_
  
  - [x] 4.4 Run ExpenseForm.pbt.test.jsx to verify all tests pass
    - Ensure converted tests maintain same coverage
    - Measure execution time improvement
    - _Requirements: 7.3_

- [x] 5. Refactor ExpenseForm.core.test.jsx
  - [x] 5.1 Replace fireEvent with user-event throughout
    - Update form field interactions to use userEvent.type
    - Update button clicks to use userEvent.click
    - Update select interactions to use userEvent.selectOptions
    - _Requirements: 1.3_
  
  - [x] 5.2 Update DOM queries to use accessible queries
    - Replace getByTestId with getByRole where possible
    - Replace querySelector with getByLabelText where possible
    - Ensure all queries use accessible selectors
    - _Requirements: 1.4_
  
  - [x] 5.3 Update form submission tests
    - Use assertSubmittedData helper for verification
    - Test that correct data is sent to API
    - Test that form resets after successful submission
    - _Requirements: 5.4_
  
  - [x] 5.4 Update validation tests
    - Use assertValidationError helper for verification
    - Test all required field validations
    - Test amount validation (positive numbers)
    - _Requirements: 5.5_
  
  - [x] 5.5 Run ExpenseForm.core.test.jsx to verify all tests pass
    - Ensure all tests pass reliably
    - Measure execution time (should be < 10 seconds)
    - _Requirements: 7.2_

- [x] 6. Refactor ExpenseForm.dataPreservation.test.jsx
  - [x] 6.1 Add MockCollapsibleSection mock
    - Import and mock CollapsibleSection
    - Remove section expansion logic from tests
    - _Requirements: 1.2, 5.1_
  
  - [x] 6.2 Update data preservation tests to focus on user behavior
    - Test that field values persist when category changes
    - Test that field values persist when payment method changes
    - Verify through field values, not internal state
    - _Requirements: 1.5, 5.6_
  
  - [x] 6.3 Replace fireEvent with user-event
    - Update all user interactions to use user-event
    - _Requirements: 1.3_
  
  - [x] 6.4 Run ExpenseForm.dataPreservation.test.jsx to verify all tests pass
    - Ensure all tests pass reliably
    - Ensure no tests are skipped
    - _Requirements: 2.1_

- [x] 7. Create performance benchmark script
  - [x] 7.1 Create scripts/measure-test-performance.js
    - Measure full test suite execution time
    - Measure individual test file execution times
    - Report slow tests (> 1 second for unit tests)
    - Exit with error if thresholds exceeded
    - _Requirements: 7.1, 7.2_
  
  - [x] 7.2 Add npm script for performance measurement
    - Add "test:perf" script to frontend/package.json
    - Script should run measure-test-performance.js
    - _Requirements: 7.1_
  
  - [x] 7.3 Run performance benchmark and verify thresholds
    - Run full test suite and measure time
    - Verify < 5 minutes for full suite
    - Verify < 10 seconds for focused files
    - Document baseline metrics
    - _Requirements: 7.1, 7.2_

- [x] 8. Create refactoring tracking document
  - [x] 8.1 Create docs/development/TEST_REFACTORING_TRACKER.md
    - List all test files that need refactoring
    - Prioritize by brittleness and complexity
    - Estimate effort for each file
    - Track completion status
    - _Requirements: 10.1, 10.5_
  
  - [x] 8.2 Document refactoring process
    - Explain when to apply new patterns
    - Provide checklist for refactoring a test file
    - Include commit message guidelines
    - _Requirements: 10.2, 10.3, 10.4_

- [x] 9. Final validation and documentation
  - [x] 9.1 Run full frontend test suite
    - Verify all tests pass
    - Verify no tests are skipped (except intentional)
    - Measure total execution time
    - _Requirements: 2.1, 7.1_
  
  - [x] 9.2 Update FRONTEND_TESTING_GUIDELINES.md table of contents
    - Add links to all new sections
    - Ensure navigation is clear
    - _Requirements: 9.7_
  
  - [x] 9.3 Create example test file demonstrating all patterns
    - Create docs/development/EXAMPLE_TEST_PATTERNS.md
    - Include complete working examples
    - Show before/after for each pattern
    - _Requirements: 8.4_
  
  - [x] 9.4 Document success metrics baseline
    - Record initial test execution times
    - Record initial test flakiness rate
    - Record initial skipped test count
    - Provide comparison after refactoring
    - _Requirements: 7.1, 7.2_

## Notes

- This is a gradual refactoring effort - we're establishing patterns and applying them incrementally
- Focus on ExpenseForm tests first as they're the most problematic
- New features should use the new patterns from the start
- Existing tests should be refactored as we touch related code
- Performance benchmarks help track improvement over time
- Documentation is critical for team adoption
