# Implementation Plan: Post-Spec Cleanup

## Overview

A cleanup and optimization pass across the frontend codebase. All tasks are frontend-only refactoring — no new features, no API changes, no database changes. Tasks are ordered so that foundational changes (CSS cleanup, unused param removal) come first, followed by hook extractions, test migration, component adoption, and documentation.

## Tasks

- [ ] 1. Remove orphaned CSS and fix unused parameter
  - [ ] 1.1 Remove orphaned CSS classes from ExpenseForm.css
    - Delete `.recurring-checkbox`, `.recurring-fields`, `.recurring-section-title`, and `.section-divider` class definitions
    - Retain `.checkbox-group` (still used by BackupSettings.jsx)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ] 1.2 Remove unused `activeOnly` parameter from usePaymentMethods
    - Remove `activeOnly = true` from the destructured options in `usePaymentMethods.js`
    - Verify no callers pass this parameter
    - _Requirements: 4.1, 4.2, 4.3_

- [ ] 2. Extract hooks from ExpenseForm.jsx
  - [ ] 2.1 Extract badge calculation functions into `hooks/useBadgeCalculations.js`
    - Move `calculateAdvancedOptionsBadge`, `calculateReimbursementBadge`, `calculateInsuranceBadge`, `calculatePeopleBadge`, `calculateInvoiceBadge`, and `calculateFutureDatePreview` from ExpenseForm.jsx
    - Export as named functions
    - Update ExpenseForm.jsx to import from the new module
    - _Requirements: 3.1, 3.5_

  - [ ]* 2.2 Write property tests for badge calculations
    - **Property 1: Badge calculation purity**
    - **Validates: Requirements 3.1**

  - [ ] 2.3 Extract place autocomplete logic into `hooks/usePlaceAutocomplete.js`
    - Move places fetching, `filteredPlaces`/`showSuggestions` state, and filtering logic
    - Hook returns `{ places, filteredPlaces, showSuggestions, setShowSuggestions, filterPlaces, fetchPlaces }`
    - Update ExpenseForm.jsx to use the new hook
    - _Requirements: 3.4, 3.5_

  - [ ]* 2.4 Write property tests for place autocomplete filtering
    - **Property 3: Place autocomplete filtering is case-insensitive substring match**
    - **Validates: Requirements 3.4**

  - [ ] 2.5 Extract category suggestion logic into `hooks/useCategorySuggestion.js`
    - Move `fetchAndApplyCategorySuggestion`, `handlePlaceSelect`, `handlePlaceBlur`, and `isCategorySuggested` state
    - Hook accepts `{ setFormData, amountInputRef, isSubmittingRef, justSelectedFromDropdownRef, setTrackedTimeout }`
    - Update ExpenseForm.jsx to use the new hook
    - _Requirements: 3.3, 3.5_

  - [ ] 2.6 Extract form submission logic into `hooks/useFormSubmission.js`
    - Move `handleSubmit` logic: form data assembly, people allocation prep, API calls (createExpense/updateExpense), invoice upload loop, post-submission state reset, success message construction
    - Hook accepts form state and callbacks, returns `{ submitExpense, isSubmitting, submitMessage }`
    - Update ExpenseForm.jsx to use the new hook
    - _Requirements: 3.2, 3.5, 3.6_

  - [ ]* 2.7 Write property tests for form data assembly
    - **Property 2: Form data assembly preserves all fields**
    - **Validates: Requirements 3.2**

- [ ] 3. Checkpoint - Verify hook extractions
  - Ensure all existing ExpenseForm tests pass after hook extractions
  - Verify ExpenseForm.jsx line count is reduced from 1,839
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Consolidate error handling in useInvoiceManagement
  - [ ] 4.1 Extract shared error handling helper in `useInvoiceManagement.js`
    - Create a `withErrorHandling(operation, context, fallback)` helper inside the hook
    - Refactor `fetchInvoices`, `openInvoiceModal`, and the auto-load effect to use the helper
    - Preserve identical logging (logger.error with context) and fallback (empty array) behavior
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 4.2 Write property tests for error handling fallback consistency
    - **Property 4: Error handling fallback consistency**
    - **Validates: Requirements 5.2, 5.3**

- [ ] 5. Migrate ExpenseForm tests to shared test-utils
  - [ ] 5.1 Add missing mock factories to `test-utils/mocks.js`
    - Add `createCategorySuggestionApiMock`, `createCategoriesApiMock`, `createPeopleApiMock` (if not already sufficient), `createInvoiceApiMock`, and `createPaymentMethodApiMock` overrides as needed
    - _Requirements: 2.6_

  - [ ] 5.2 Migrate ExpenseForm.test.jsx to shared test-utils
    - Replace inline `vi.mock` implementations with imports from `test-utils/mocks.js`
    - Keep `vi.mock()` calls at top level but delegate to shared factories
    - Run tests to verify identical pass/fail results
    - _Requirements: 2.1, 2.5_

  - [ ] 5.3 Migrate ExpenseForm.pbt.test.jsx to shared test-utils
    - Replace inline mock setup and `createMockFetch` with shared factories
    - Run tests to verify identical pass/fail results
    - _Requirements: 2.2, 2.5_

  - [ ] 5.4 Migrate ExpenseForm.editMode.test.jsx to shared test-utils
    - Replace inline `vi.mock` implementations with shared factories
    - Run tests to verify identical pass/fail results
    - _Requirements: 2.3, 2.5_

  - [ ] 5.5 Migrate ExpenseForm.invoice.test.jsx to shared test-utils
    - Replace inline `vi.mock` implementations with shared factories
    - Run tests to verify identical pass/fail results
    - _Requirements: 2.4, 2.5_

- [ ] 6. Checkpoint - Verify test migrations
  - Ensure all migrated test files pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Adopt CollapsibleSection and HelpTooltip in other forms
  - [ ] 7.1 Adopt HelpTooltip in BillingCycleHistoryForm
    - Replace inline hint spans with HelpTooltip for statement balance hint and PDF upload hint
    - Import HelpTooltip component
    - _Requirements: 6.1, 6.5, 6.6_

  - [ ] 7.2 Adopt HelpTooltip in LoanPaymentForm
    - Replace inline hint spans with HelpTooltip for amount hint
    - Import HelpTooltip component
    - _Requirements: 6.2, 6.5, 6.6_

  - [ ] 7.3 Adopt HelpTooltip in PaymentMethodForm
    - Replace inline `form-hint` spans with HelpTooltip for display name, full name, account details, payment due day, and statement closing day hints
    - Import HelpTooltip component
    - _Requirements: 6.3, 6.5, 6.6_

  - [ ] 7.4 Adopt HelpTooltip in PersonAllocationModal
    - Replace the insurance allocation note with HelpTooltip on the "Original Cost" and "Out-of-Pocket" column headers
    - Import HelpTooltip component
    - _Requirements: 6.4, 6.5, 6.6_

- [ ] 8. Add JSDoc documentation to test-utils/index.js
  - Add module-level JSDoc comment with description and usage example
  - Add JSDoc comments for each re-exported module (arbitraries, wrappers, assertions, mocks, parameterized)
  - _Requirements: 7.1, 7.2, 7.3_

- [ ] 9. Final checkpoint - Ensure all tests pass
  - Run full frontend test suite to verify no regressions
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties of extracted pure functions
- No backend changes, no database changes, no API changes in this spec
