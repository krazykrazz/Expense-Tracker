# Implementation Plan: Expense Service Refactor

## Overview

Incrementally extract concerns from the 2,391-line `expenseService.js` into focused sub-services, wiring each through a backward-compatible facade. Each extraction step is followed by running existing tests to catch regressions immediately.

## Tasks

- [x] 1. Extract expenseValidationService
  - [x] 1.1 Create `backend/services/expenseValidationService.js` with all validation methods extracted from expenseService.js
    - Extract: `validateExpense`, `isValidDate`, `validatePostedDate`, `validateInsuranceData`, `validateReimbursement`, `validateInsurancePersonAllocations`, `validatePersonAllocations`
    - Copy the CATEGORIES import and any constants needed
    - Export as singleton instance matching project pattern
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 1.2 Update expenseService.js to import expenseValidationService and delegate validation methods
    - Add `require('./expenseValidationService')` to constructor/top of file
    - Replace validation method bodies with delegation calls
    - Keep internal calls to validation from CRUD methods working via delegation
    - _Requirements: 1.1, 1.2, 8.3, 8.4_

  - [x] 1.3 Write property test for validation equivalence
    - **Property 1: Validation equivalence**
    - **Validates: Requirements 2.3, 2.4**

- [x] 2. Extract expenseInsuranceService
  - [x] 2.1 Create `backend/services/expenseInsuranceService.js` with insurance methods extracted from expenseService.js
    - Extract: `updateInsuranceStatus`, `updateInsuranceEligibility`, `applyInsuranceDefaults` (renamed from `_applyInsuranceDefaults`)
    - Import `expenseRepository` and `expenseValidationService` as dependencies
    - Export as singleton instance
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 2.2 Update expenseService.js to import expenseInsuranceService and delegate insurance methods
    - Delegate `updateInsuranceStatus`, `updateInsuranceEligibility`
    - Replace `this._applyInsuranceDefaults()` calls in `_createSingleExpense` with `this.insuranceService.applyInsuranceDefaults()`
    - _Requirements: 1.2, 8.3_

  - [x] 2.3 Write property test for insurance defaults equivalence
    - **Property 2: Insurance defaults equivalence**
    - **Validates: Requirements 3.3**

- [x] 3. Checkpoint - Run existing tests after insurance extraction
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Extract expensePeopleService
  - [x] 4.1 Create `backend/services/expensePeopleService.js` with people-related methods extracted from expenseService.js
    - Extract: `createExpenseWithPeople`, `updateExpenseWithPeople`, `getExpenseWithPeople`, `groupExpensesByPerson`, `calculatePersonTotals`, `handleUnassignedExpenses`
    - Import `expenseRepository`, `expensePeopleRepository`, `peopleRepository`, `expenseValidationService`
    - Add `init(facadeMethods)` method to receive `createExpense`, `updateExpense`, `deleteExpense`, `getExpenseById` from facade (avoids circular dependency)
    - Export as singleton instance
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.2 Update expenseService.js to import expensePeopleService and delegate people methods
    - Call `this.peopleService.init(...)` in constructor, passing bound CRUD methods
    - Delegate `createExpenseWithPeople`, `updateExpenseWithPeople`, `getExpenseWithPeople`, `groupExpensesByPerson`, `calculatePersonTotals`, `handleUnassignedExpenses`
    - _Requirements: 1.2, 4.2_

  - [x] 4.3 Write property tests for people grouping and person totals equivalence
    - **Property 3: People grouping equivalence**
    - **Property 4: Person totals equivalence**
    - **Validates: Requirements 4.3**

- [x] 5. Extract expenseTaxService
  - [x] 5.1 Create `backend/services/expenseTaxService.js` with tax-deductible methods extracted from expenseService.js
    - Extract: `getTaxDeductibleSummary`, `getTaxDeductibleYoYSummary`, `getTaxDeductibleWithPeople`, `calculateInsuranceSummary` (renamed from `_calculateInsuranceSummary`)
    - Import `expenseRepository`, `expensePeopleRepository`, `peopleRepository`, categories utils
    - Export as singleton instance
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 5.2 Update expenseService.js to import expenseTaxService and delegate tax methods
    - Delegate `getTaxDeductibleSummary`, `getTaxDeductibleYoYSummary`, `getTaxDeductibleWithPeople`
    - _Requirements: 1.2_

  - [x] 5.3 Write property test for insurance summary equivalence
    - **Property 5: Insurance summary equivalence**
    - **Validates: Requirements 5.2**

- [x] 6. Checkpoint - Run existing tests after tax and people extraction
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Extract expenseAggregationService
  - [x] 7.1 Create `backend/services/expenseAggregationService.js` with summary/aggregation methods extracted from expenseService.js
    - Extract: `getSummary`, `getAnnualSummary`, `getMonthlyGross`, `setMonthlyGross`, `getExpensesByCategory`, `getExpensesByPaymentMethod`
    - Extract all private helpers: `_getMonthSummary`, `_calculatePreviousMonth`, `_getYearEndInvestmentValues`, `_getYearEndLoanBalances`, `_getMonthlyVariableExpenses`, `_getMonthlyFixedExpenses`, `_getMonthlyIncome`, `_getTransactionCount`, `_getCategoryTotals`, `_getMethodTotals`, `_buildAnnualSummary`, `_createMonthMap`, `_buildMonthlyTotals`, `_arrayToObject`
    - Import `expenseRepository`, `fixedExpenseRepository`, `loanService`, `investmentService`, `getDatabase`, `validateYearMonth`, categories utils
    - Export as singleton instance
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 7.2 Update expenseService.js to import expenseAggregationService and delegate aggregation methods
    - Delegate `getSummary`, `getAnnualSummary`, `getMonthlyGross`, `setMonthlyGross`, `getExpensesByCategory`, `getExpensesByPaymentMethod`
    - _Requirements: 1.2_

- [x] 8. Extract expenseCategoryService
  - [x] 8.1 Create `backend/services/expenseCategoryService.js` with category suggestion methods extracted from expenseService.js
    - Extract: `getDistinctPlaces`, `getSuggestedCategory`
    - Import `expenseRepository`
    - Export as singleton instance
    - _Requirements: 7.1, 7.2_

  - [x] 8.2 Update expenseService.js to import expenseCategoryService and delegate category methods
    - Delegate `getDistinctPlaces`, `getSuggestedCategory`
    - _Requirements: 1.2_

- [x] 9. Checkpoint - Run existing tests after aggregation and category extraction
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Clean up facade and verify API surface
  - [x] 10.1 Remove all extracted method implementations from expenseService.js, keeping only CRUD + private helpers + delegation wrappers
    - Verify the facade file is significantly smaller (target: ~600-800 lines down from 2,391)
    - Ensure all delegation methods are present in module.exports
    - _Requirements: 1.1, 1.3, 8.1, 8.2_

  - [x] 10.2 Write property test for facade API surface completeness
    - **Property 6: Facade API surface completeness**
    - **Validates: Requirements 1.1, 1.3**

- [x] 11. Final checkpoint - Run full test suite
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are mandatory including property tests for behavioral equivalence
- Each extraction step is independently verifiable — run tests after each
- No API endpoints, controllers, or database schemas change
- All existing test files continue importing `./expenseService` unchanged
- The facade pattern ensures zero breaking changes for consumers
- Property tests validate behavioral equivalence between extracted sub-services and original implementations
