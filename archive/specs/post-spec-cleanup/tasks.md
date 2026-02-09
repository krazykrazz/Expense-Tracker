# Implementation Plan: Post-Spec Cleanup

## Overview

A cleanup and optimization pass across the frontend codebase. All tasks are frontend-only refactoring — no new features, no API changes, no database changes. This document reflects the current state after significant progress on hook extractions.

## Completed Work

The following tasks have been successfully completed:
- ✅ Orphaned CSS classes removed from ExpenseForm.css
- ✅ Unused `activeOnly` parameter removed from usePaymentMethods
- ✅ Badge calculation functions extracted to `hooks/useBadgeCalculations.js`
- ✅ Place autocomplete logic extracted to `hooks/usePlaceAutocomplete.js`
- ✅ Category suggestion logic extracted to `hooks/useCategorySuggestion.js`
- ✅ Form submission logic extracted to `hooks/useFormSubmission.js`
- ✅ Property tests written for badge calculations and place autocomplete
- ✅ Basic JSDoc added to test-utils/index.js
- ✅ ExpenseForm.jsx successfully refactored to use all extracted hooks

## Remaining Tasks

- [x] 1. Consolidate error handling in useInvoiceManagement
  - [x] 1.1 Extract shared error handling helper in `useInvoiceManagement.js`
    - Create a `withErrorHandling(operation, context, fallback)` helper inside the hook
    - Refactor `fetchInvoices`, `openInvoiceModal`, and the auto-load effect to use the helper
    - Preserve identical logging (logger.error with context) and fallback (empty array) behavior
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 1.2 Write property tests for error handling fallback consistency
    - **Property 4: Error handling fallback consistency**
    - **Validates: Requirements 5.2, 5.3**

- [x] 2. Migrate ExpenseForm tests to shared test-utils
  - [x] 2.1 Add missing mock factories to `test-utils/mocks.js`
    - Add `createCategorySuggestionApiMock` for categorySuggestionApi
    - Add `createCategoriesApiMock` for categoriesApi
    - Add `createPeopleApiMock` for peopleApi (if not already sufficient)
    - Add `createInvoiceApiMock` for invoiceApi
    - Ensure `createPaymentMethodApiMock` covers all needed methods
    - _Requirements: 2.6_

  - [x] 2.2 Migrate ExpenseForm.test.jsx to shared test-utils
    - Replace inline `vi.mock` implementations with imports from `test-utils/mocks.js`
    - Keep `vi.mock()` calls at top level but delegate to shared factories
    - Run tests to verify identical pass/fail results
    - _Requirements: 2.1, 2.5_

  - [x] 2.3 Migrate ExpenseForm.pbt.test.jsx to shared test-utils
    - Replace inline mock setup with shared factories
    - Run tests to verify identical pass/fail results
    - _Requirements: 2.2, 2.5_

  - [x] 2.4 Migrate ExpenseForm.editMode.test.jsx to shared test-utils
    - Replace inline `vi.mock` implementations with shared factories
    - Run tests to verify identical pass/fail results
    - _Requirements: 2.3, 2.5_

  - [x] 2.5 Migrate ExpenseForm.invoice.test.jsx to shared test-utils
    - Replace inline `vi.mock` implementations with shared factories
    - Run tests to verify identical pass/fail results
    - _Requirements: 2.4, 2.5_

  - [x] 2.6 Migrate ExpenseForm.integration.test.jsx to shared test-utils
    - Replace inline `vi.mock` implementations with shared factories
    - Run tests to verify identical pass/fail results
    - _Requirements: 2.5_

- [x] 3. Checkpoint - Verify test migrations
  - Ensure all migrated test files pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Adopt HelpTooltip in other forms
  - [x] 4.1 Adopt HelpTooltip in BillingCycleHistoryForm
    - Replace inline hint spans with HelpTooltip for statement balance hint and PDF upload hint
    - Import HelpTooltip component
    - Verify visual appearance and functionality remain identical
    - _Requirements: 6.1, 6.5, 6.6_

  - [x] 4.2 Adopt HelpTooltip in LoanPaymentForm
    - Replace inline hint spans with HelpTooltip for amount hint and suggestion hint
    - Import HelpTooltip component
    - Verify visual appearance and functionality remain identical
    - _Requirements: 6.2, 6.5, 6.6_

  - [x] 4.3 Adopt HelpTooltip in PaymentMethodForm
    - Replace inline `form-hint` spans with HelpTooltip for display name, full name, account details, payment due day, and statement closing day hints
    - Import HelpTooltip component
    - Verify visual appearance and functionality remain identical
    - _Requirements: 6.3, 6.5, 6.6_

  - [x] 4.4 Adopt HelpTooltip in PersonAllocationModal
    - Replace the insurance allocation note with HelpTooltip on the "Original Cost" and "Out-of-Pocket" column headers
    - Import HelpTooltip component
    - Verify visual appearance and functionality remain identical
    - _Requirements: 6.4, 6.5, 6.6_

- [x] 5. Enhance JSDoc documentation in test-utils/index.js
  - [x] 5.1 Add detailed module-level JSDoc
    - Add comprehensive description of the test-utils module
    - Include multiple usage examples showing different import patterns
    - Document the purpose of unified exports
    - _Requirements: 7.1, 7.3_

  - [x] 5.2 Add JSDoc for each re-exported module
    - Document arbitraries module (fast-check generators)
    - Document wrappers module (React context provider factories)
    - Document assertions module (async test helpers)
    - Document mocks module (API mock factories)
    - Document parameterized module (testEach helper)
    - _Requirements: 7.2_

- [x] 6. Final checkpoint - Ensure all tests pass
  - Run full frontend test suite to verify no regressions
  - Verify ExpenseForm.jsx line count is reduced from original 1,839 lines
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The major hook extraction work (tasks 2.1-2.6 from original plan) has been completed successfully
- ExpenseForm.jsx now uses all extracted hooks and is significantly smaller
- Remaining work focuses on test migration, component adoption, and documentation
- No backend changes, no database changes, no API changes in this spec

## Migration Status Summary

| Area | Status | Notes |
|------|--------|-------|
| Orphaned CSS Removal | ✅ Complete | All 4 classes removed |
| usePaymentMethods Cleanup | ✅ Complete | activeOnly parameter removed |
| Hook Extractions | ✅ Complete | All 4 hooks extracted and integrated |
| Property Tests for Hooks | ✅ Mostly Complete | Badge and place autocomplete tested |
| Error Handling Consolidation | ❌ Not Started | useInvoiceManagement still has repeated patterns |
| Test Migration to test-utils | ❌ Not Started | 6 test files still use inline mocks |
| HelpTooltip Adoption | ❌ Not Started | 4 forms need updates |
| JSDoc Enhancement | ⚠️ Partial | Basic docs exist, needs enhancement |

