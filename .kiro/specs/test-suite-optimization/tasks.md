# Implementation Plan: Test Suite Optimization

## Overview

Split ExpenseForm.test.jsx into focused test files and add fast test commands to improve developer experience and test execution time.

## Tasks

- [ ] 1. Create shared test utilities
  - [ ] 1.1 Create `test-utils/expenseFormHelpers.js`
    - Extract common mock data (mockCategories, mockPaymentMethods, mockPeople)
    - Create `setupExpenseFormMocks()` function
    - Create `expandSection(container, sectionName)` helper
    - Create `fillBasicFields(container)` helper
    - _Requirements: 1.1, 1.2_

  - [ ] 1.2 Write unit tests for helpers
    - Test `expandSection` with valid and invalid section names
    - Test `fillBasicFields` fills all required fields
    - _Requirements: 1.4_

- [ ] 2. Create ExpenseForm.core.test.jsx
  - [ ] 2.1 Create file with basic structure
    - Add file header comment explaining scope
    - Import shared utilities
    - Set up describe block
    - _Requirements: 1.1, 1.5, 3.4_

  - [ ] 2.2 Migrate core tests from ExpenseForm.test.jsx
    - Copy tests for: rendering, required fields, basic submission
    - Copy tests for: form reset, default values, error handling
    - Update imports to use shared utilities
    - Remove duplicated mock setup
    - _Requirements: 1.3, 1.4_

  - [ ] 2.3 Verify core tests pass independently
    - Run: `npm test -- ExpenseForm.core.test.jsx`
    - Verify all tests pass
    - Count tests (should be ~10-12)
    - _Requirements: 1.4_

- [ ] 3. Create ExpenseForm.sections.test.jsx
  - [ ] 3.1 Create file with basic structure
    - Add file header comment
    - Import shared utilities
    - Set up describe blocks for each section
    - _Requirements: 1.1, 1.5, 3.4_

  - [ ] 3.2 Migrate section tests from ExpenseForm.test.jsx
    - Copy Advanced Options section tests
    - Copy Reimbursement section tests
    - Copy Insurance section tests
    - Copy People Assignment section tests (visibility only)
    - Copy Help tooltip tests
    - Update to use `expandSection` helper
    - _Requirements: 1.3, 1.4_

  - [ ] 3.3 Verify section tests pass independently
    - Run: `npm test -- ExpenseForm.sections.test.jsx`
    - Verify all tests pass
    - Count tests (should be ~15-18)
    - _Requirements: 1.4_

- [ ] 4. Create ExpenseForm.people.test.jsx
  - [ ] 4.1 Create file with basic structure
    - Add file header comment
    - Import shared utilities
    - Set up describe block
    - _Requirements: 1.1, 1.5, 3.4_

  - [ ] 4.2 Migrate people tests from ExpenseForm.test.jsx
    - Copy all tests from "People Selection Enhancement" describe block
    - Update to use shared utilities
    - _Requirements: 1.3, 1.4_

  - [ ] 4.3 Verify people tests pass independently
    - Run: `npm test -- ExpenseForm.people.test.jsx`
    - Verify all tests pass
    - Count tests (should be ~8-10)
    - _Requirements: 1.4_

- [ ] 5. Create ExpenseForm.futureMonths.test.jsx
  - [ ] 5.1 Create file with basic structure
    - Add file header comment
    - Import shared utilities
    - Set up describe block
    - _Requirements: 1.1, 1.5, 3.4_

  - [ ] 5.2 Migrate future months tests from ExpenseForm.test.jsx
    - Copy all tests from "Future Months Feature" describe block
    - Update to use shared utilities
    - _Requirements: 1.3, 1.4_

  - [ ] 5.3 Verify future months tests pass independently
    - Run: `npm test -- ExpenseForm.futureMonths.test.jsx`
    - Verify all tests pass
    - Count tests (should be ~8-10)
    - _Requirements: 1.4_

- [ ] 6. Create ExpenseForm.dataPreservation.test.jsx
  - [ ] 6.1 Create file with basic structure
    - Add file header comment
    - Import shared utilities
    - Set up describe block
    - _Requirements: 1.1, 1.5, 3.4_

  - [ ] 6.2 Migrate data preservation tests from ExpenseForm.test.jsx
    - Copy all tests from "Data Preservation During Collapse" describe block
    - Update to use shared utilities
    - _Requirements: 1.3, 1.4_

  - [ ] 6.3 Verify data preservation tests pass independently
    - Run: `npm test -- ExpenseForm.dataPreservation.test.jsx`
    - Verify all tests pass
    - Count tests (should be ~8-10)
    - _Requirements: 1.4_

- [ ] 7. Verification checkpoint
  - [ ] 7.1 Count total tests across all new files
    - Count tests in each file
    - Sum should equal 67 (original count)
    - Document any discrepancies
    - _Requirements: 1.3_

  - [ ] 7.2 Run all new test files together
    - Run: `npm test -- ExpenseForm.*.test.jsx`
    - Verify all 67 tests pass
    - Check for any flaky tests
    - _Requirements: 1.4_

  - [ ] 7.3 Test parallel execution
    - Run tests multiple times
    - Verify consistent results
    - Check for timing issues
    - _Requirements: 1.4_

- [ ] 8. Add NPM scripts
  - [ ] 8.1 Update frontend/package.json
    - Add `test:changed` script
    - Add `test:fast` script
    - Add `test:core`, `test:sections`, `test:people`, `test:futureMonths`, `test:dataPreservation` scripts
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 8.2 Test new scripts
    - Test `npm run test:changed` (make a change first)
    - Test `npm run test:fast`
    - Test each category script
    - Verify scripts work on Windows
    - _Requirements: 2.4_

- [ ] 9. Update documentation
  - [ ] 9.1 Update .kiro/steering/testing.md
    - Add section on ExpenseForm test organization
    - Document when to run each test category
    - Add examples of running specific test groups
    - Document new npm scripts
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ] 9.2 Add comments to test files
    - Verify each file has header comment
    - Ensure comments explain file scope
    - _Requirements: 3.4_

- [ ] 10. Cleanup and final verification
  - [ ] 10.1 Delete original ExpenseForm.test.jsx
    - Verify all tests migrated
    - Delete the file
    - _Requirements: 1.1_

  - [ ] 10.2 Run full test suite
    - Run: `npm test`
    - Verify all tests pass
    - Check execution time
    - _Requirements: 1.4_

  - [ ] 10.3 Measure performance improvement
    - Time individual test files
    - Compare to original 16s baseline
    - Document results
    - _Requirements: Success Metrics_

## Notes

- Each test file should be <800 lines
- Use shared utilities to avoid duplication
- Ensure tests are independent (no shared state)
- Run tests multiple times to catch flaky tests
- Document any issues or deviations from plan

## Test Count Tracking

| File | Expected Tests | Actual Tests | Status |
|------|---------------|--------------|--------|
| ExpenseForm.core.test.jsx | 10-12 | - | Not Started |
| ExpenseForm.sections.test.jsx | 15-18 | - | Not Started |
| ExpenseForm.people.test.jsx | 8-10 | - | Not Started |
| ExpenseForm.futureMonths.test.jsx | 8-10 | - | Not Started |
| ExpenseForm.dataPreservation.test.jsx | 8-10 | - | Not Started |
| **Total** | **67** | **-** | **Not Started** |

## Performance Tracking

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| ExpenseForm tests | 16s | - | 8-10s |
| Individual file (avg) | - | - | <5s |
| Full suite | - | - | No regression |
