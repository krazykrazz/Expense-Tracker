# Implementation Plan: Frontend Custom Hooks Extraction

## Overview

Extract six custom hooks from three oversized React components into `frontend/src/hooks/`. Each task creates a hook, integrates it into the consuming component(s), and verifies existing tests still pass. Implementation order prioritizes hooks with the most consumers first.

## Tasks

- [x] 1. Set up hooks directory and implement useExpenseFormValidation
  - [x] 1.1 Create `frontend/src/hooks/` directory and implement `useExpenseFormValidation.js`
    - Extract the `validateForm` logic from ExpenseForm.jsx (lines ~730–810) into a pure validation hook
    - The hook exposes a single `validate(formData, options)` function returning `{ valid, errors }`
    - Options include: `isMedicalExpense`, `insuranceEligible`, `originalCost`, `isCreditCard`, `postedDate`, `showGenericReimbursementUI`, `genericOriginalCost`
    - Validation rules: date required, amount > 0, type required, payment_method_id required, place ≤ 200, notes ≤ 200, insurance cost relationships, posted date ordering, generic reimbursement cost relationships
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_
  - [x] 1.2 Write property tests for useExpenseFormValidation
    - **Property 6: Validation rejects invalid basic fields**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - **Property 7: Validation rejects original cost less than net amount**
    - **Validates: Requirements 4.5, 4.7**
    - **Property 8: Validation rejects posted date before expense date**
    - **Validates: Requirements 4.6**
    - **Property 9: Valid form data passes validation**
    - **Validates: Requirements 4.8**
  - [x] 1.3 Integrate useExpenseFormValidation into ExpenseForm.jsx
    - Replace inline `validateForm` function with hook call
    - Map hook's structured errors to component's `setMessage` state
    - Verify ExpenseForm renders and behaves identically
    - _Requirements: 4.9, 7.1_

- [x] 2. Implement usePaymentMethods and integrate
  - [x] 2.1 Create `frontend/src/hooks/usePaymentMethods.js`
    - Extract payment method fetching from ExpenseForm.jsx (lines ~82–310)
    - Include: `getActivePaymentMethods` fetch, inactive method fetch for editing, `getLastPaymentMethodId` with legacy migration, `saveLastPaymentMethodId`, loading/error state
    - Hook accepts `{ expensePaymentMethodId, activeOnly }` options
    - Returns `{ paymentMethods, loading, error, inactivePaymentMethod, getLastUsedId, saveLastUsed, defaultPaymentMethodId }`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - [x] 2.2 Write property tests for usePaymentMethods
    - **Property 1: Payment method localStorage round-trip**
    - **Validates: Requirements 1.4**
  - [x] 2.3 Integrate usePaymentMethods into ExpenseForm.jsx
    - Replace inline payment method state and fetch logic with hook call
    - Wire `getLastUsedId` and `saveLastUsed` into existing form logic
    - _Requirements: 1.7, 7.1_
  - [x] 2.4 Integrate usePaymentMethods into TaxDeductible.jsx
    - Replace inline payment method fetch logic with hook call (using `activeOnly: true`)
    - _Requirements: 1.8, 7.2_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement useInsuranceStatus and integrate
  - [x] 4.1 Create `frontend/src/hooks/useInsuranceStatus.js`
    - Extract insurance status update logic from ExpenseList and TaxDeductible
    - Include: `updateStatus(expenseId, newStatus)` calling `expenseApi.updateInsuranceStatus`, `updating`/`error` state, quick status state management (`quickStatusExpense`, `openQuickStatus`, `closeQuickStatus`)
    - Dispatches `expensesUpdated` custom event after successful update
    - Hook accepts `{ onStatusChanged }` callback option
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 4.2 Write property tests for useInsuranceStatus
    - **Property 2: Quick status state round-trip**
    - **Validates: Requirements 2.3**
  - [x] 4.3 Integrate useInsuranceStatus into ExpenseList.jsx
    - Replace inline `quickStatusExpenseId`, `quickStatusPosition`, and `updateInsuranceStatus` calls with hook
    - _Requirements: 2.4, 7.3_
  - [x] 4.4 Integrate useInsuranceStatus into TaxDeductible.jsx
    - Replace inline `quickStatusExpense`, `handleQuickStatusClick`, `handleStatusChange`, `handleCloseQuickStatus` with hook
    - _Requirements: 2.5, 7.2_

- [x] 5. Implement useInvoiceManagement and integrate
  - [x] 5.1 Create `frontend/src/hooks/useInvoiceManagement.js`
    - Extract invoice caching from ExpenseList (Map-based cache, loading set, auto-load for tax-deductible expenses)
    - Extract invoice modal state from TaxDeductible (`showInvoiceModal`, `invoiceModalExpense`, `invoiceModalInvoices`)
    - Include: `fetchInvoices`, `handleInvoiceUpdated`, `handleInvoiceDeleted`, `handlePersonLinkUpdated`, modal open/close
    - Hook accepts `{ expenses }` for auto-loading
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 5.2 Write property tests for useInvoiceManagement
    - **Property 3: Invoice cache deduplication**
    - **Validates: Requirements 3.2**
    - **Property 4: Invoice cache consistency after person link update**
    - **Validates: Requirements 3.3**
    - **Property 5: Invoice modal state round-trip**
    - **Validates: Requirements 3.4**
  - [x] 5.3 Integrate useInvoiceManagement into ExpenseList.jsx
    - Replace inline `invoiceData` Map, `loadingInvoices` Set, and invoice load effect with hook
    - Wire `handleInvoiceUpdated`, `handleInvoiceDeleted`, `handlePersonLinkUpdated` from hook
    - _Requirements: 3.7, 7.3_
  - [x] 5.4 Integrate useInvoiceManagement into TaxDeductible.jsx
    - Replace inline invoice modal state and invoice fetch logic with hook
    - _Requirements: 3.8, 7.2_
  - [x] 5.5 Integrate useInvoiceManagement into ExpenseForm.jsx
    - Replace inline invoice fetch for editing mode with hook's `fetchInvoices`
    - _Requirements: 3.6, 7.1_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement useTaxCalculator and integrate
  - [x] 7.1 Create `frontend/src/hooks/useTaxCalculator.js`
    - Extract tax calculator state from TaxDeductible (lines ~70–75, 175–185, 455–500)
    - Include: `netIncome`/`netIncomeInput`/`selectedProvince` state, `loadingAppIncome`, `taxCredits` memoized computation
    - Include: `handleNetIncomeChange`, `handleProvinceChange`, `handleUseAppIncome` handlers
    - Uses `taxSettingsStorage` for persistence and `taxCreditCalculator` for computation
    - Uses `getAnnualIncomeByCategory` from incomeApi for app income fetching
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [x] 7.2 Write property tests for useTaxCalculator
    - **Property 10: Tax settings localStorage round-trip**
    - **Validates: Requirements 5.2, 5.3**
    - **Property 11: Tax credits computation matches utility**
    - **Validates: Requirements 5.5**
  - [x] 7.3 Integrate useTaxCalculator into TaxDeductible.jsx
    - Replace inline tax calculator state, handlers, and `taxCredits` useMemo with hook
    - _Requirements: 5.7, 7.2_

- [x] 8. Implement useYoYComparison and integrate
  - [x] 8.1 Create `frontend/src/hooks/useYoYComparison.js`
    - Extract YoY comparison logic from TaxDeductible (lines ~155–175, 530–560)
    - Include: `previousYearData`, `yoyLoading`, `yoyError` state
    - Include: `calculateChange` (wraps `calculatePercentageChange`) and `getIndicator` (wraps `getChangeIndicator`)
    - Fetches `getTaxDeductibleSummary(year - 1)` on mount and when year/refreshTrigger changes
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 8.2 Write property tests for useYoYComparison
    - **Property 12: YoY calculateChange matches utility**
    - **Validates: Requirements 6.2**
  - [x] 8.3 Integrate useYoYComparison into TaxDeductible.jsx
    - Replace inline YoY state, fetch effect, and `yoyComparison` useMemo with hook
    - _Requirements: 6.5, 7.2_

- [-] 9. Final cleanup and verification
  - [x] 9.1 Verify all three components have reduced line counts
    - ExpenseForm, TaxDeductible, and ExpenseList should each be significantly smaller
    - Verify no duplicated logic remains across components for the extracted concerns
    - _Requirements: 7.5_
  - [x] 9.2 Run full frontend test suite
    - Run `npm test` from `frontend/` directory
    - All existing tests must pass unchanged
    - _Requirements: 7.4_

- [~] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after groups of related changes
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- This is a pure refactoring — no new API endpoints, no database changes, no new features
