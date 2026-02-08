# Requirements Document

## Introduction

Three frontend React components (ExpenseForm, TaxDeductible, ExpenseList) have grown oversized with duplicated logic across payment method handling, insurance status management, invoice operations, form validation, tax calculations, and year-over-year comparisons. This refactoring extracts shared and complex logic into six reusable custom hooks under `frontend/src/hooks/`, reducing component size and eliminating duplication while preserving all existing behavior and component APIs.

## Glossary

- **Hook**: A reusable React custom hook function (prefixed with `use`) that encapsulates stateful logic
- **ExpenseForm**: The `frontend/src/components/ExpenseForm.jsx` component (~1663 lines) for creating and editing expenses
- **TaxDeductible**: The `frontend/src/components/TaxDeductible.jsx` component (~1677 lines) for tax deductible expense views
- **ExpenseList**: The `frontend/src/components/ExpenseList.jsx` component (~1111 lines) for listing and filtering expenses
- **Payment_Method_API**: The `frontend/src/services/paymentMethodApi.js` service for payment method CRUD operations
- **Invoice_API**: The `frontend/src/services/invoiceApi.js` service for invoice CRUD and upload operations
- **Expense_API**: The `frontend/src/services/expenseApi.js` service for expense CRUD and insurance status operations
- **Tax_Credit_Calculator**: The `frontend/src/utils/taxCreditCalculator.js` utility for Canadian tax credit calculations
- **Tax_Settings_Storage**: The `frontend/src/utils/taxSettingsStorage.js` utility for localStorage persistence of tax settings
- **YoY_Comparison_Utils**: The `frontend/src/utils/yoyComparison.js` utility for year-over-year change calculations
- **localStorage**: Browser-based key-value storage used for persisting user preferences across sessions

## Requirements

### Requirement 1: Extract usePaymentMethods Hook

**User Story:** As a developer, I want payment method fetching, inactive method handling, and last-used method memory consolidated into a single hook, so that ExpenseForm and TaxDeductible share the same logic without duplication.

#### Acceptance Criteria

1. WHEN the usePaymentMethods Hook is initialized, THE usePaymentMethods Hook SHALL fetch active payment methods from the Payment_Method_API and expose them as a `paymentMethods` array
2. WHEN the usePaymentMethods Hook is initialized with an `expensePaymentMethodId` that is not in the active methods list, THE usePaymentMethods Hook SHALL fetch the inactive method separately and expose it as `inactivePaymentMethod`
3. WHEN no saved payment method exists in localStorage, THE usePaymentMethods Hook SHALL default to the payment method with ID 1 or the first available method
4. WHEN a payment method is selected by the user, THE usePaymentMethods Hook SHALL persist the selected payment method ID to localStorage via a `saveLastUsed` function
5. WHEN a legacy string-based payment method value exists in localStorage, THE usePaymentMethods Hook SHALL migrate the value to the ID-based format and remove the legacy entry
6. WHEN the Payment_Method_API call fails, THE usePaymentMethods Hook SHALL expose the error via a `paymentMethodsError` state and set `loading` to false
7. WHEN the usePaymentMethods Hook is used in ExpenseForm, THE ExpenseForm SHALL produce identical rendered output and behavior as before the extraction
8. WHEN the usePaymentMethods Hook is used in TaxDeductible, THE TaxDeductible SHALL produce identical rendered output and behavior as before the extraction

### Requirement 2: Extract useInsuranceStatus Hook

**User Story:** As a developer, I want insurance claim status management logic consolidated into a single hook, so that ExpenseForm, ExpenseList, and TaxDeductible share the same insurance update logic.

#### Acceptance Criteria

1. WHEN the useInsuranceStatus Hook receives an expense ID and a new claim status, THE useInsuranceStatus Hook SHALL call the Expense_API `updateInsuranceStatus` function and return the updated expense
2. WHEN the Expense_API call for insurance status update fails, THE useInsuranceStatus Hook SHALL expose the error and set `updating` to false
3. WHEN a quick status update is triggered, THE useInsuranceStatus Hook SHALL manage the `quickStatusExpense` state for the QuickStatusUpdate component
4. WHEN the useInsuranceStatus Hook is used in ExpenseList, THE ExpenseList SHALL produce identical rendered output and behavior as before the extraction
5. WHEN the useInsuranceStatus Hook is used in TaxDeductible, THE TaxDeductible SHALL produce identical rendered output and behavior as before the extraction

### Requirement 3: Extract useInvoiceManagement Hook

**User Story:** As a developer, I want invoice fetching, caching, modal state, and person link updates consolidated into a single hook, so that ExpenseForm, ExpenseList, and TaxDeductible share the same invoice logic.

#### Acceptance Criteria

1. WHEN the useInvoiceManagement Hook is asked to fetch invoices for an expense ID, THE useInvoiceManagement Hook SHALL call the Invoice_API `getInvoicesForExpense` function and cache the result keyed by expense ID
2. WHEN invoices for the same expense ID are requested again, THE useInvoiceManagement Hook SHALL return the cached result without making a duplicate API call
3. WHEN an invoice person link is updated, THE useInvoiceManagement Hook SHALL call the Invoice_API `updateInvoicePersonLink` function and update the cached invoices for that expense
4. WHEN the useInvoiceManagement Hook manages modal state, THE useInvoiceManagement Hook SHALL expose `showInvoiceModal`, `invoiceModalExpense`, and `invoiceModalInvoices` state values with open and close functions
5. WHEN the Invoice_API call fails, THE useInvoiceManagement Hook SHALL expose the error and maintain the previous cache state
6. WHEN the useInvoiceManagement Hook is used in ExpenseForm, THE ExpenseForm SHALL produce identical rendered output and behavior as before the extraction
7. WHEN the useInvoiceManagement Hook is used in ExpenseList, THE ExpenseList SHALL produce identical rendered output and behavior as before the extraction
8. WHEN the useInvoiceManagement Hook is used in TaxDeductible, THE TaxDeductible SHALL produce identical rendered output and behavior as before the extraction

### Requirement 4: Extract useExpenseFormValidation Hook

**User Story:** As a developer, I want expense form validation logic extracted into a dedicated hook, so that validation rules are testable in isolation and the ExpenseForm component is smaller.

#### Acceptance Criteria

1. WHEN the useExpenseFormValidation Hook validates a date field, THE useExpenseFormValidation Hook SHALL reject empty dates and return a validation error message
2. WHEN the useExpenseFormValidation Hook validates an amount field, THE useExpenseFormValidation Hook SHALL reject non-positive amounts and return a validation error message
3. WHEN the useExpenseFormValidation Hook validates a type field, THE useExpenseFormValidation Hook SHALL reject empty type values and return a validation error message
4. WHEN the useExpenseFormValidation Hook validates a payment method, THE useExpenseFormValidation Hook SHALL reject missing payment method selections and return a validation error message
5. WHEN the useExpenseFormValidation Hook validates insurance amounts for a medical expense, THE useExpenseFormValidation Hook SHALL reject cases where the original cost is less than the reimbursed amount and return a validation error message
6. WHEN the useExpenseFormValidation Hook validates a posted date for a credit card expense, THE useExpenseFormValidation Hook SHALL reject posted dates that are earlier than the expense date and return a validation error message
7. WHEN the useExpenseFormValidation Hook validates generic reimbursement for a non-medical expense, THE useExpenseFormValidation Hook SHALL reject cases where the original cost is less than the net amount and return a validation error message
8. WHEN all fields pass validation, THE useExpenseFormValidation Hook SHALL return an empty errors object
9. WHEN the useExpenseFormValidation Hook is used in ExpenseForm, THE ExpenseForm SHALL produce identical validation behavior as before the extraction

### Requirement 5: Extract useTaxCalculator Hook

**User Story:** As a developer, I want tax credit calculator state management extracted into a dedicated hook, so that the calculator logic is testable in isolation and the TaxDeductible component is smaller.

#### Acceptance Criteria

1. WHEN the useTaxCalculator Hook is initialized with a year, THE useTaxCalculator Hook SHALL load the saved net income for that year from Tax_Settings_Storage and the saved province selection
2. WHEN the user updates the net income value, THE useTaxCalculator Hook SHALL persist the value to Tax_Settings_Storage via `saveNetIncomeForYear`
3. WHEN the user changes the province selection, THE useTaxCalculator Hook SHALL persist the selection to Tax_Settings_Storage via `saveSelectedProvince`
4. WHEN the user requests to fetch income from the app, THE useTaxCalculator Hook SHALL call the income API and populate the net income field with the total annual income
5. WHEN medical and donation totals are provided, THE useTaxCalculator Hook SHALL compute tax credits using the Tax_Credit_Calculator utility and expose the result
6. WHEN the year parameter changes, THE useTaxCalculator Hook SHALL reload the saved settings for the new year
7. WHEN the useTaxCalculator Hook is used in TaxDeductible, THE TaxDeductible SHALL produce identical tax calculator behavior as before the extraction

### Requirement 6: Extract useYoYComparison Hook

**User Story:** As a developer, I want year-over-year comparison data fetching and calculation extracted into a dedicated hook, so that the comparison logic is testable in isolation and the TaxDeductible component is smaller.

#### Acceptance Criteria

1. WHEN the useYoYComparison Hook is initialized with a year, THE useYoYComparison Hook SHALL fetch the tax deductible summary for the previous year from the Expense_API
2. WHEN the previous year data is fetched, THE useYoYComparison Hook SHALL expose the raw previous year data and a `calculateChange` function that uses the YoY_Comparison_Utils
3. WHEN the Expense_API call for previous year data fails, THE useYoYComparison Hook SHALL expose the error via `yoyError` and set `yoyLoading` to false
4. WHEN the year parameter changes, THE useYoYComparison Hook SHALL re-fetch the previous year data for the new year
5. WHEN the useYoYComparison Hook is used in TaxDeductible, THE TaxDeductible SHALL produce identical YoY comparison behavior as before the extraction

### Requirement 7: Behavioral Equivalence After Refactoring

**User Story:** As a developer, I want assurance that the refactoring produces no functional changes, so that all existing features continue to work identically.

#### Acceptance Criteria

1. THE ExpenseForm SHALL accept the same props and invoke the same callbacks as before the refactoring
2. THE TaxDeductible SHALL accept the same props and invoke the same callbacks as before the refactoring
3. THE ExpenseList SHALL accept the same props and invoke the same callbacks as before the refactoring
4. WHEN existing tests are run after the refactoring, THE test suite SHALL produce the same pass/fail results as before the refactoring
5. THE refactored components SHALL import hooks from `frontend/src/hooks/` and remove the corresponding inline logic

### Requirement 8: Hook Testability

**User Story:** As a developer, I want each custom hook to be independently testable, so that hook logic can be verified without rendering full components.

#### Acceptance Criteria

1. THE usePaymentMethods Hook SHALL be testable using `@testing-library/react` renderHook without requiring the full ExpenseForm component
2. THE useInsuranceStatus Hook SHALL be testable using `@testing-library/react` renderHook without requiring the full ExpenseList component
3. THE useInvoiceManagement Hook SHALL be testable using `@testing-library/react` renderHook without requiring the full TaxDeductible component
4. THE useExpenseFormValidation Hook SHALL be testable as a pure function hook with no external API dependencies
5. THE useTaxCalculator Hook SHALL be testable using `@testing-library/react` renderHook with mocked Tax_Settings_Storage and income API
6. THE useYoYComparison Hook SHALL be testable using `@testing-library/react` renderHook with mocked Expense_API
