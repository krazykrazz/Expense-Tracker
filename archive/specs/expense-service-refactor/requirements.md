# Requirements Document

## Introduction

The `backend/services/expenseService.js` file has grown into a 2,391-line god object with 50+ methods spanning multiple concerns: CRUD operations, validation, insurance tracking, people allocation, tax summaries, annual aggregations, category suggestions, credit card balance updates, reimbursement processing, and more. This refactoring splits the monolithic service into focused, single-responsibility sub-services while maintaining full backward compatibility. No API endpoints, controller interfaces, or database schemas change. All existing tests must continue to pass.

## Glossary

- **Expense_Service**: The current monolithic `expenseService.js` and its refactored orchestrator replacement
- **Validation_Service**: The new `expenseValidationService.js` handling all expense data validation
- **Insurance_Service**: The new `expenseInsuranceService.js` handling insurance status, eligibility, and defaults
- **People_Service**: The new `expensePeopleService.js` handling people allocation, grouping, and totals for expenses
- **Tax_Service**: The new `expenseTaxService.js` handling tax-deductible summaries and reports
- **Aggregation_Service**: The new `expenseAggregationService.js` handling annual/monthly summaries
- **Category_Service**: The new `expenseCategoryService.js` handling category suggestions and place lookups
- **Facade**: The backward-compatible `expenseService.js` that re-exports all public methods by delegating to sub-services
- **Sub_Service**: Any of the new focused services extracted from the monolithic Expense_Service
- **Consumer**: Any file (controller, service, or test) that imports and calls methods on Expense_Service

## Requirements

### Requirement 1: Backward-Compatible Facade

**User Story:** As a developer, I want the refactored expenseService.js to expose the same public API as before, so that no controller, test, or other consumer needs import path changes.

#### Acceptance Criteria

1. THE Facade SHALL export every public method that the current Expense_Service exports
2. WHEN a Consumer calls a method on the Facade, THE Facade SHALL delegate the call to the appropriate Sub_Service and return the same result
3. THE Facade SHALL maintain the same module.exports shape as the current Expense_Service
4. WHEN any existing test file imports `./expenseService` or `../services/expenseService`, THE Facade SHALL resolve correctly without import changes

### Requirement 2: Validation Service Extraction

**User Story:** As a developer, I want all validation logic extracted into a dedicated service, so that validation rules are centralized and independently testable.

#### Acceptance Criteria

1. THE Validation_Service SHALL implement `validateExpense`, `isValidDate`, `validatePostedDate`, `validateInsuranceData`, `validateReimbursement`, and `validateInsurancePersonAllocations`
2. THE Validation_Service SHALL implement `validatePersonAllocations` for people allocation amount validation
3. WHEN the Validation_Service validates an expense, THE Validation_Service SHALL apply the same validation rules as the current Expense_Service
4. WHEN the Validation_Service receives invalid data, THE Validation_Service SHALL throw the same error messages as the current Expense_Service

### Requirement 3: Insurance Service Extraction

**User Story:** As a developer, I want all insurance-related logic extracted into a dedicated service, so that insurance tracking concerns are isolated.

#### Acceptance Criteria

1. THE Insurance_Service SHALL implement `updateInsuranceStatus`, `updateInsuranceEligibility`, and `_applyInsuranceDefaults`
2. WHEN the Insurance_Service updates an insurance status, THE Insurance_Service SHALL produce the same database state as the current Expense_Service
3. WHEN the Insurance_Service applies insurance defaults, THE Insurance_Service SHALL return the same default values as the current Expense_Service

### Requirement 4: People Service Extraction

**User Story:** As a developer, I want all people-allocation logic extracted into a dedicated service, so that person-expense relationships are managed in one place.

#### Acceptance Criteria

1. THE People_Service SHALL implement `createExpenseWithPeople`, `updateExpenseWithPeople`, `getExpenseWithPeople`, `groupExpensesByPerson`, `calculatePersonTotals`, and `handleUnassignedExpenses`
2. WHEN the People_Service creates an expense with people allocations, THE People_Service SHALL produce the same database records as the current Expense_Service
3. WHEN the People_Service groups expenses by person, THE People_Service SHALL return the same grouping structure as the current Expense_Service

### Requirement 5: Tax Service Extraction

**User Story:** As a developer, I want all tax-deductible logic extracted into a dedicated service, so that tax reporting is independently maintainable.

#### Acceptance Criteria

1. THE Tax_Service SHALL implement `getTaxDeductibleSummary`, `getTaxDeductibleYoYSummary`, `getTaxDeductibleWithPeople`, and `_calculateInsuranceSummary`
2. WHEN the Tax_Service generates a tax-deductible summary, THE Tax_Service SHALL return the same data structure as the current Expense_Service
3. WHEN the Tax_Service generates a year-over-year summary, THE Tax_Service SHALL return the same comparison data as the current Expense_Service

### Requirement 6: Aggregation Service Extraction

**User Story:** As a developer, I want all summary and aggregation logic extracted into a dedicated service, so that reporting concerns are separated from CRUD operations.

#### Acceptance Criteria

1. THE Aggregation_Service SHALL implement `getSummary`, `getAnnualSummary`, `getMonthlyGross`, `setMonthlyGross`, and all private helper methods for summaries (`_getMonthSummary`, `_calculatePreviousMonth`, `_getYearEndInvestmentValues`, `_getYearEndLoanBalances`, `_getMonthlyVariableExpenses`, `_getMonthlyFixedExpenses`, `_getMonthlyIncome`, `_getTransactionCount`, `_getCategoryTotals`, `_getMethodTotals`, `_buildAnnualSummary`, `_createMonthMap`, `_buildMonthlyTotals`, `_arrayToObject`, `getExpensesByCategory`, `getExpensesByPaymentMethod`)
2. WHEN the Aggregation_Service computes a monthly summary, THE Aggregation_Service SHALL return the same totals and breakdowns as the current Expense_Service
3. WHEN the Aggregation_Service computes an annual summary, THE Aggregation_Service SHALL return the same year-end data including investment values, loan balances, and net worth as the current Expense_Service

### Requirement 7: Category Service Extraction

**User Story:** As a developer, I want category suggestion and place lookup logic extracted into a dedicated service, so that suggestion logic is isolated.

#### Acceptance Criteria

1. THE Category_Service SHALL implement `getDistinctPlaces` and `getSuggestedCategory`
2. WHEN the Category_Service suggests a category for a place, THE Category_Service SHALL return the same suggestion as the current Expense_Service

### Requirement 8: Core CRUD Orchestrator

**User Story:** As a developer, I want the refactored expenseService.js to retain core CRUD operations and orchestrate sub-services, so that expense creation, reading, updating, and deleting remain cohesive.

#### Acceptance Criteria

1. THE Facade SHALL retain `createExpense`, `getExpenses`, `getExpenseById`, `updateExpense`, and `deleteExpense` as direct implementations
2. THE Facade SHALL retain private helper methods needed for CRUD: `_createSingleExpense`, `_resolvePaymentMethod`, `_processReimbursement`, `_updateCreditCardBalanceOnCreate`, `_updateCreditCardBalanceOnDelete`, `_calculateFutureDate`, `_validateFutureMonths`, `_isFutureDate`, `_getEffectivePostingDate`, `_triggerBudgetRecalculation`, and `_validatePeopleExist`
3. WHEN the Facade creates an expense, THE Facade SHALL call the Validation_Service for validation and the Insurance_Service for insurance defaults before persisting
4. WHEN the Facade updates an expense, THE Facade SHALL call the Validation_Service for validation before persisting

### Requirement 9: Test Continuity

**User Story:** As a developer, I want all existing PBT and unit tests to pass after the refactoring, so that I have confidence the refactoring introduced no regressions.

#### Acceptance Criteria

1. WHEN the refactoring is complete, THE existing test suite SHALL pass with zero test failures
2. WHEN a test file imports `./expenseService`, THE Facade SHALL provide the same methods the test expects
3. IF a test directly accesses a method that moved to a Sub_Service, THEN THE Facade SHALL still expose that method via delegation
