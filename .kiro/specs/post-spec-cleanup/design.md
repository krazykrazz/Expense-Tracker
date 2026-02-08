# Design Document: Post-Spec Cleanup

## Overview

This spec covers a cleanup and optimization pass across the frontend codebase following the expense-form-simplification and frontend-test-simplification specs. The work is purely refactoring — no new features, no API changes, no database changes. The goal is to reduce dead code, improve consistency, shrink the largest component, and ensure all test files use the shared test-utils infrastructure.

The changes span seven areas:
1. Removing ~50 lines of orphaned CSS from a removed recurring expenses feature
2. Migrating four ExpenseForm test files from inline mocks to shared test-utils
3. Extracting four custom hooks from the 1,839-line ExpenseForm.jsx
4. Removing an unused `activeOnly` parameter from usePaymentMethods
5. Consolidating repeated error handling in useInvoiceManagement
6. Adopting CollapsibleSection/HelpTooltip in four other form components
7. Adding JSDoc documentation to the test-utils index

## Architecture

No architectural changes. All work stays within the existing frontend layer:

```
frontend/src/
├── components/       # Cleanup items 1, 3, 6
├── hooks/            # Cleanup items 3, 4, 5
├── test-utils/       # Cleanup item 7
└── components/*.test.jsx  # Cleanup item 2
```

The hook extraction (item 3) follows the same pattern already established by `useExpenseFormValidation`, `usePaymentMethods`, `useInvoiceManagement`, and `useFormSectionState` — all previously extracted from ExpenseForm.jsx.

## Components and Interfaces

### 1. Orphaned CSS Removal (ExpenseForm.css)

Remove these class definitions that were left behind when the recurring expenses feature was removed:
- `.recurring-checkbox` (lines ~152-154)
- `.recurring-fields` (lines ~172-178)
- `.recurring-section-title` (lines ~180-193)
- `.section-divider` (lines ~1347-1353)

Note: `.checkbox-group` is still referenced by `BackupSettings.jsx`, so it must be retained.

### 2. Test Migration to Shared Test-Utils

Four test files need migration from inline `vi.mock()` calls to shared factories:

| File | Current Pattern | Target Pattern |
|------|----------------|----------------|
| ExpenseForm.test.jsx | Inline `vi.mock('../services/expenseApi', ...)` | Import from `test-utils/mocks.js` |
| ExpenseForm.pbt.test.jsx | Inline mock + `createMockFetch` helper | Import from `test-utils/mocks.js` |
| ExpenseForm.editMode.test.jsx | Inline `vi.mock` for 6 service modules | Import from `test-utils/mocks.js` |
| ExpenseForm.invoice.test.jsx | Inline `vi.mock` for 6 service modules | Import from `test-utils/mocks.js` |

The shared `test-utils/mocks.js` already provides `createExpenseApiMock` and `createPaymentMethodApiMock`. Additional mock factories may need to be added for:
- `categorySuggestionApi` (fetchCategorySuggestion)
- `categoriesApi` (getCategories)
- `peopleApi` (getPeople)
- `invoiceApi` (getInvoicesForExpense, updateInvoicePersonLink)
- `paymentMethodApi` (getActivePaymentMethods, getPaymentMethod)

Since `vi.mock()` calls must be at the top level and hoisted, the migration will keep `vi.mock()` calls but have them delegate to shared factory functions rather than defining inline implementations.

### 3. Hook Extraction from ExpenseForm.jsx

Four new hooks to extract:

#### useBadgeCalculations

Extracts the five pure badge calculation functions that are currently module-level in ExpenseForm.jsx:
- `calculateAdvancedOptionsBadge(futureMonths, postedDate)`
- `calculateReimbursementBadge(genericOriginalCost, amount)`
- `calculateInsuranceBadge(insuranceEligible, claimStatus)`
- `calculatePeopleBadge(selectedPeople)`
- `calculateInvoiceBadge(invoices, invoiceFiles)`
- `calculateFutureDatePreview(sourceDate, futureMonths)`

These are pure functions, so the "hook" is really a utility module. They'll be exported as named functions from `hooks/useBadgeCalculations.js` for consistency with the existing hook naming pattern, though they don't use React hooks internally.

```javascript
// hooks/useBadgeCalculations.js
export const calculateAdvancedOptionsBadge = (futureMonths, postedDate) => { ... };
export const calculateReimbursementBadge = (genericOriginalCost, amount) => { ... };
export const calculateInsuranceBadge = (insuranceEligible, claimStatus) => { ... };
export const calculatePeopleBadge = (selectedPeople) => { ... };
export const calculateInvoiceBadge = (invoices, invoiceFiles) => { ... };
export const calculateFutureDatePreview = (sourceDate, futureMonths) => { ... };
```

#### useFormSubmission

Extracts the `handleSubmit` logic (~100 lines) including:
- Form data assembly with conditional fields (posted_date, insurance, reimbursement)
- People allocation preparation
- API calls (createExpense / updateExpense)
- Invoice upload loop
- Post-submission state reset
- Success message construction

```javascript
// hooks/useFormSubmission.js
function useFormSubmission({ onExpenseAdded, isEditing, expense, saveLastUsed }) {
  const submitExpense = async (formData, options) => { ... };
  return { submitExpense, isSubmitting, message };
}
```

#### useCategorySuggestion

Extracts category suggestion logic:
- `fetchAndApplyCategorySuggestion(place)` — fetches suggestion and updates form type
- `handlePlaceSelect(place)` — handles dropdown selection with suggestion fetch
- `handlePlaceBlur()` — handles blur with debounced suggestion fetch
- Manages `isCategorySuggested` state

```javascript
// hooks/useCategorySuggestion.js
function useCategorySuggestion({ setFormData, setTrackedTimeout }) {
  const [isCategorySuggested, setIsCategorySuggested] = useState(false);
  const fetchAndApply = async (place) => { ... };
  const handlePlaceSelect = async (place) => { ... };
  const handlePlaceBlur = async () => { ... };
  return { isCategorySuggested, setIsCategorySuggested, fetchAndApply, handlePlaceSelect, handlePlaceBlur };
}
```

#### usePlaceAutocomplete

Extracts place autocomplete logic:
- Fetches places list on mount
- Filters places based on input
- Manages `filteredPlaces`, `showSuggestions` state

```javascript
// hooks/usePlaceAutocomplete.js
function usePlaceAutocomplete() {
  const [places, setPlaces] = useState([]);
  const [filteredPlaces, setFilteredPlaces] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const filterPlaces = (value) => { ... };
  return { places, filteredPlaces, showSuggestions, setShowSuggestions, filterPlaces };
}
```

### 4. usePaymentMethods Cleanup

Remove the `activeOnly` parameter from the destructured options object. The parameter is declared but never used in the function body — the hook always calls `getActivePaymentMethods()` regardless.

Before:
```javascript
function usePaymentMethods({ expensePaymentMethodId = null, activeOnly = true } = {}) {
```

After:
```javascript
function usePaymentMethods({ expensePaymentMethodId = null } = {}) {
```

### 5. useInvoiceManagement Error Handling Consolidation

The hook has a repeated pattern across 4+ locations:

```javascript
try {
  // ... async operation
} catch (error) {
  logger.error('Failed to ...:', error);
  if (isMountedRef.current) {
    setInvoiceCache(prev => { /* set empty fallback */ });
  }
  return [];
}
```

Extract a helper:

```javascript
const withErrorHandling = async (operation, context, fallback = []) => {
  try {
    return await operation();
  } catch (error) {
    logger.error(`Failed to ${context}:`, error);
    return fallback;
  }
};
```

The `isMountedRef` guard and cache-setting logic varies per call site, so the helper focuses on the try/catch + logging + fallback pattern. State updates that depend on `isMountedRef` remain at the call site.

### 6. CollapsibleSection/HelpTooltip Adoption

After reviewing the four target forms:

- **BillingCycleHistoryForm**: The optional fields (minimum payment, due date, notes, PDF upload) could be wrapped in a CollapsibleSection. The hint text "Enter the balance from your credit card statement" could use HelpTooltip.
- **LoanPaymentForm**: The optional notes field could be in a CollapsibleSection. The suggestion hint could use HelpTooltip.
- **PaymentMethodForm**: The credit card-specific fields section (credit limit, balance, billing cycle days) is already conditionally rendered based on type. A CollapsibleSection for "Advanced Settings" (billing cycle start/end) would add value. The `form-hint` spans could use HelpTooltip.
- **PersonAllocationModal**: The insurance allocation note at the bottom could use HelpTooltip. The insurance-mode header row could benefit from HelpTooltip for "Original Cost" vs "Out-of-Pocket" explanation.

The adoption should be conservative — only add CollapsibleSection where it genuinely improves UX by hiding optional/advanced fields, and HelpTooltip where inline hint text would benefit from the tooltip pattern.

### 7. JSDoc for test-utils/index.js

Add module-level JSDoc and per-export documentation:

```javascript
/**
 * @module test-utils
 * @description Unified exports for shared test utilities.
 * Provides mock factories, context wrappers, async assertions,
 * PBT arbitraries, and parameterized test helpers.
 *
 * @example
 * import { safeDate, createModalWrapper, waitForState, testEach } from '../test-utils';
 */

/** @see module:test-utils/arbitraries - fast-check generators */
export * from './arbitraries';
/** @see module:test-utils/wrappers - React context provider factories */
export * from './wrappers.jsx';
// ... etc
```

## Data Models

No data model changes. All work is frontend-only refactoring with no impact on database schema, API contracts, or state shapes.

The extracted hooks will use the same state shapes already present in ExpenseForm.jsx — no new data structures are introduced.


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Most of this spec's acceptance criteria are structural code checks (CSS class absence, import patterns, component usage) that are best verified as examples or by running existing tests. However, the hook extractions introduce pure functions and behavioral contracts that are well-suited to property-based testing.

### Property 1: Badge calculation purity

*For any* valid combination of badge inputs (futureMonths as non-negative integer, postedDate as date string or empty, genericOriginalCost and amount as numeric strings, insuranceEligible as boolean, claimStatus as one of the valid statuses, selectedPeople as array of person objects, invoices and invoiceFiles as arrays), the extracted badge calculation functions shall return a string result, and calling the same function with the same inputs shall always produce the same output.

**Validates: Requirements 3.1**

### Property 2: Form data assembly preserves all fields

*For any* valid form state (formData with date/place/amount/type/payment_method_id, plus optional posted_date, insurance fields, and reimbursement fields), the extracted form data assembly function shall produce an object containing all provided fields, with numeric fields correctly parsed and conditional fields (insurance, reimbursement, posted_date) included only when their preconditions are met.

**Validates: Requirements 3.2**

### Property 3: Place autocomplete filtering is case-insensitive substring match

*For any* list of place name strings and any search string, the filtered results shall be exactly the subset of places where the place name contains the search string as a case-insensitive substring. The filtered list shall be a subset of the original list, and every item in the filtered list shall contain the search string (case-insensitive).

**Validates: Requirements 3.4**

### Property 4: Error handling fallback consistency

*For any* async invoice operation that throws an error, the consolidated error handler shall call `logger.error` with a context-specific message and the error object, and shall return the specified fallback value (empty array by default).

**Validates: Requirements 5.2, 5.3**

## Error Handling

No new error handling patterns are introduced. The consolidation in useInvoiceManagement (Requirement 5) extracts the existing pattern into a helper without changing behavior:

- All async operations that can fail continue to catch errors
- All errors are logged via `logger.error` with contextual messages
- All failures return safe fallback values (empty arrays)
- The `isMountedRef` guard pattern for state updates after unmount is preserved

The extracted hooks (useFormSubmission, useCategorySuggestion, usePlaceAutocomplete) carry over the same error handling from ExpenseForm.jsx without modification.

## Testing Strategy

### Dual Testing Approach

This spec uses both unit tests and property-based tests:

- **Unit tests**: Verify specific examples — CSS class removal, import patterns, component rendering after refactoring, existing test suite pass/fail equivalence
- **Property tests**: Verify universal properties of extracted pure functions and behavioral contracts

### Property-Based Testing Configuration

- Library: **fast-check** (already in use across the frontend test suite)
- Minimum iterations: 100 per property test
- Each property test references its design document property with a tag comment

Tag format: `Feature: post-spec-cleanup, Property {number}: {property_text}`

### Test Plan

| Requirement | Test Type | Verification Method |
|-------------|-----------|-------------------|
| 1 (Orphaned CSS) | Manual/CI | Grep for removed class names; run existing tests |
| 2 (Test migration) | Unit | Run migrated test files; verify same pass/fail |
| 3 (Hook extraction) | Property + Unit | PBT for pure functions (Properties 1-3); existing tests for behavioral equivalence |
| 4 (Unused param) | Linter | Run linter on usePaymentMethods.js |
| 5 (Error consolidation) | Property + Unit | PBT for fallback consistency (Property 4); existing tests for behavioral equivalence |
| 6 (Component adoption) | Unit | Existing form tests + new render tests for CollapsibleSection/HelpTooltip presence |
| 7 (JSDoc) | Manual | Visual inspection of IDE hover documentation |

### Property Test Implementation

Each correctness property maps to a single property-based test:

- Property 1 → `useBadgeCalculations.pbt.test.js`
- Property 2 → `useFormSubmission.pbt.test.js`
- Property 3 → `usePlaceAutocomplete.pbt.test.js`
- Property 4 → `useInvoiceManagement.pbt.test.js` (added to existing test file or new)
