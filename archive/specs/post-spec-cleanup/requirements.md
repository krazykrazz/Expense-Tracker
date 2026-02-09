# Requirements Document

## Introduction

A cleanup and optimization pass following the completion of the expense-form-simplification and frontend-test-simplification specs. This spec addresses orphaned CSS, test migration to shared utilities, hook extraction from a large component, unused parameters, error handling consolidation, component reuse, and documentation improvements. All changes are PATCH-level — no new features, no database changes, no API changes.

## Glossary

- **ExpenseForm**: The primary React component (`ExpenseForm.jsx`) for creating and editing expenses, currently 1,839 lines
- **Test_Utils**: The shared test utility modules in `frontend/src/test-utils/` providing reusable mocks, wrappers, assertions, and arbitraries
- **CollapsibleSection**: A reusable React component for toggling visibility of form sections with animated expand/collapse
- **HelpTooltip**: A reusable React component for displaying contextual help text on hover/focus
- **Orphaned_CSS**: CSS class definitions that are no longer referenced by any JSX component
- **Inline_Mock**: A `vi.mock()` call defined directly inside a test file rather than imported from a shared mock factory
- **Custom_Hook**: A React hook function extracted from a component to encapsulate reusable stateful logic

## Requirements

### Requirement 1: Remove Orphaned CSS

**User Story:** As a developer, I want orphaned CSS classes removed from ExpenseForm.css, so that the stylesheet only contains rules that are actively used.

#### Acceptance Criteria

1. WHEN the Orphaned_CSS cleanup is complete, THE ExpenseForm.css file SHALL NOT contain the `.recurring-checkbox` class definition
2. WHEN the Orphaned_CSS cleanup is complete, THE ExpenseForm.css file SHALL NOT contain the `.recurring-fields` class definition
3. WHEN the Orphaned_CSS cleanup is complete, THE ExpenseForm.css file SHALL NOT contain the `.recurring-section-title` class definition
4. WHEN the Orphaned_CSS cleanup is complete, THE ExpenseForm.css file SHALL NOT contain the `.section-divider` class definition
5. WHEN the Orphaned_CSS cleanup is complete, THE ExpenseForm.css file SHALL retain all CSS classes that are referenced by at least one JSX component

### Requirement 2: Migrate ExpenseForm Tests to Shared Test_Utils

**User Story:** As a developer, I want ExpenseForm test files to use the shared Test_Utils, so that test setup is consistent and maintainable across the codebase.

#### Acceptance Criteria

1. WHEN ExpenseForm.test.jsx is migrated, THE test file SHALL import mock factories from Test_Utils instead of defining Inline_Mocks for API services
2. WHEN ExpenseForm.pbt.test.jsx is migrated, THE test file SHALL import mock factories from Test_Utils instead of defining Inline_Mocks for API services
3. WHEN ExpenseForm.editMode.test.jsx is migrated, THE test file SHALL import mock factories from Test_Utils instead of defining Inline_Mocks for API services
4. WHEN ExpenseForm.invoice.test.jsx is migrated, THE test file SHALL import mock factories from Test_Utils instead of defining Inline_Mocks for API services
5. WHEN any ExpenseForm test file is migrated, THE test file SHALL produce identical pass/fail results as before migration
6. WHEN any ExpenseForm test file is migrated, THE test file SHALL use `createExpenseApiMock` or equivalent shared factories from Test_Utils for expense API mocking

### Requirement 3: Extract Custom Hooks from ExpenseForm

**User Story:** As a developer, I want logic extracted from ExpenseForm.jsx into focused Custom_Hooks, so that the component is smaller and the logic is independently testable.

#### Acceptance Criteria

1. WHEN badge calculation logic is extracted, THE Custom_Hook SHALL compute badge counts for all collapsible sections (advanced options, reimbursement, insurance, people, invoices)
2. WHEN form submission logic is extracted, THE Custom_Hook SHALL handle expense creation and update API calls, form data assembly, and post-submission cleanup
3. WHEN category suggestion logic is extracted, THE Custom_Hook SHALL fetch and apply category suggestions based on the entered place name
4. WHEN place autocomplete logic is extracted, THE Custom_Hook SHALL provide place name suggestions from historical expense data
5. WHEN any Custom_Hook is extracted, THE ExpenseForm component SHALL produce identical rendered output and behavior as before extraction
6. WHEN all extractions are complete, THE ExpenseForm.jsx file SHALL have fewer lines than the pre-extraction count of 1,839

### Requirement 4: Clean Up Unused Parameter in usePaymentMethods

**User Story:** As a developer, I want the unused `activeOnly` parameter removed from usePaymentMethods, so that the linter produces no warnings for this hook.

#### Acceptance Criteria

1. WHEN the cleanup is complete, THE usePaymentMethods hook SHALL NOT accept an `activeOnly` parameter in its options object
2. WHEN the cleanup is complete, THE usePaymentMethods hook SHALL produce zero linter warnings related to unused variables
3. WHEN the cleanup is complete, all callers of usePaymentMethods SHALL continue to function without modification (since the parameter was unused)

### Requirement 5: Consolidate Error Handling in useInvoiceManagement

**User Story:** As a developer, I want repeated error handling patterns in useInvoiceManagement consolidated into a shared helper, so that the hook is more concise and consistent.

#### Acceptance Criteria

1. WHEN error handling is consolidated, THE useInvoiceManagement hook SHALL use a shared error handling helper for all try/catch blocks that log errors and set fallback state
2. WHEN error handling is consolidated, THE useInvoiceManagement hook SHALL preserve identical error logging behavior (logger.error calls with context)
3. WHEN error handling is consolidated, THE useInvoiceManagement hook SHALL preserve identical fallback behavior (returning empty arrays on failure)

### Requirement 6: Adopt CollapsibleSection and HelpTooltip in Other Forms

**User Story:** As a developer, I want other form components to use CollapsibleSection and HelpTooltip, so that the UX is consistent across all forms.

#### Acceptance Criteria

1. WHERE BillingCycleHistoryForm has collapsible or help-text sections, THE BillingCycleHistoryForm SHALL use the CollapsibleSection component
2. WHERE LoanPaymentForm has collapsible or help-text sections, THE LoanPaymentForm SHALL use the CollapsibleSection component
3. WHERE PaymentMethodForm has collapsible or help-text sections, THE PaymentMethodForm SHALL use the CollapsibleSection component
4. WHERE PersonAllocationModal has collapsible or help-text sections, THE PersonAllocationModal SHALL use the CollapsibleSection component
5. WHERE any form component has inline tooltip or help-text markup, THE form component SHALL use the HelpTooltip component instead
6. WHEN CollapsibleSection or HelpTooltip is adopted, THE form component SHALL maintain identical visual appearance and functionality as before adoption

### Requirement 7: Add JSDoc to Test_Utils Index

**User Story:** As a developer, I want JSDoc documentation on the Test_Utils index exports, so that IDE autocompletion and hover documentation improve discoverability.

#### Acceptance Criteria

1. WHEN JSDoc is added, THE Test_Utils index file SHALL include a module-level JSDoc comment describing the purpose of the unified export module
2. WHEN JSDoc is added, THE Test_Utils index file SHALL document each re-exported module with a brief description of what it provides
3. WHEN JSDoc is added, THE Test_Utils index file SHALL include usage examples in the JSDoc comments
