# Implementation Plan: Expense Form Consolidation

## Overview

This implementation plan consolidates the duplicate expense form code by having ExpenseList render ExpenseForm inside its edit modal. The refactoring removes ~200 lines of duplicate state and handlers from ExpenseList while maintaining full feature parity.

## Tasks

- [ ] 1. Prepare ExpenseList for refactoring
  - [ ] 1.1 Add ExpenseForm import to ExpenseList.jsx
    - Add `import ExpenseForm from './ExpenseForm';` at the top of the file
    - _Requirements: 2.1_

  - [ ] 1.2 Create simplified edit handlers
    - Create `handleExpenseUpdated` callback that calls `onExpenseUpdated` and closes modal
    - Simplify `handleEditClick` to only set `expenseToEdit` and `showEditModal`
    - Simplify `handleCancelEdit` to only close modal and clear `expenseToEdit`
    - _Requirements: 2.4, 5.2, 5.3_

- [ ] 2. Replace inline edit form with ExpenseForm
  - [ ] 2.1 Update edit modal JSX to render ExpenseForm
    - Replace the entire `<form onSubmit={handleEditSubmit}>` block with ExpenseForm component
    - Pass `expense={expenseToEdit}` prop
    - Pass `people={people}` prop
    - Pass `onExpenseAdded={handleExpenseUpdated}` callback
    - Keep modal overlay with click-outside-to-close behavior
    - Keep close button (×) in modal header
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2_

  - [ ] 2.2 Write property test for modal rendering with correct props
    - **Property 1: Modal Renders ExpenseForm with Correct Props**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

- [ ] 3. Remove duplicate state variables
  - [ ] 3.1 Remove edit form state from ExpenseList
    - Remove `editFormData` state and `setEditFormData`
    - Remove `editInsuranceEligible` state and `setEditInsuranceEligible`
    - Remove `editClaimStatus` state and `setEditClaimStatus`
    - Remove `editOriginalCost` state and `setEditOriginalCost`
    - Remove `editFutureMonths` state and `setEditFutureMonths`
    - Remove `editInvoices` state and `setEditInvoices`
    - Remove `selectedPeople` state (for edit form) and `setSelectedPeople`
    - Remove `showPersonAllocation` state and `setShowPersonAllocation`
    - Remove `isSubmitting` state and `setIsSubmitting`
    - Remove `editMessage` state and `setEditMessage`
    - _Requirements: 1.1, 1.4_

- [ ] 4. Remove duplicate handler functions
  - [ ] 4.1 Remove edit form handlers from ExpenseList
    - Remove `handleEditChange` function
    - Remove `handleEditSubmit` function
    - Remove `handleEditPeopleChange` function
    - Remove `handleEditPersonAllocation` function
    - Remove `handleEditInvoiceUploaded` function
    - Remove `handleEditInvoiceDeleted` function
    - Remove `handleEditPersonLinkUpdated` function
    - _Requirements: 1.2_

- [ ] 5. Remove duplicate constants and utilities
  - [ ] 5.1 Remove duplicate constants from ExpenseList
    - Remove `FUTURE_MONTHS_OPTIONS` constant (already exists in ExpenseForm)
    - Remove `calculateFutureDatePreview` function (already exists in ExpenseForm)
    - _Requirements: 1.3_

- [ ] 6. Remove unused imports and components
  - [ ] 6.1 Clean up ExpenseList imports
    - Remove `InvoiceUpload` import (now handled by ExpenseForm)
    - Remove `PersonAllocationModal` usage for edit (keep if used elsewhere)
    - Remove any other imports that are no longer needed
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 7. Checkpoint - Verify refactoring
  - Ensure all tests pass, ask the user if questions arise.
  - Verify ExpenseList compiles without errors
  - Verify edit modal opens and displays ExpenseForm
  - Verify expense data is pre-populated in form

- [ ] 8. Test feature parity
  - [ ] 8.1 Write property test for form pre-population
    - **Property 3: Form Pre-population**
    - **Validates: Requirements 3.5**

  - [ ] 8.2 Write property test for medical expense sections
    - **Property 4: Medical Expense Sections Visibility**
    - **Validates: Requirements 4.1, 4.2**

  - [ ] 8.3 Write property test for tax-deductible invoice section
    - **Property 5: Tax-Deductible Invoice Section Visibility**
    - **Validates: Requirements 4.3**

  - [ ] 8.4 Write property test for general form features
    - **Property 6: General Form Features Availability**
    - **Validates: Requirements 4.4, 4.5, 4.6**

- [ ] 9. Test callback chain and error handling
  - [ ] 9.1 Write property test for successful update callback chain
    - **Property 7: Successful Update Callback Chain**
    - **Validates: Requirements 5.1, 5.2, 5.3, 3.3**

  - [ ] 9.2 Write property test for error handling
    - **Property 8: Error Handling Preserves Modal State**
    - **Validates: Requirements 5.4**

- [ ] 10. Test data loading
  - [ ] 10.1 Write property test for invoice data loading
    - **Property 9: Invoice Data Loading and Display**
    - **Validates: Requirements 6.1, 6.2**

  - [ ] 10.2 Write property test for people data loading
    - **Property 11: People Data Loading and Display**
    - **Validates: Requirements 7.1, 7.2**

- [ ] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Verify complete edit flow works end-to-end
  - Verify all expense types can be edited
  - Verify insurance tracking works for medical expenses
  - Verify invoice upload/delete works for tax-deductible expenses
  - Verify people assignment works for medical expenses

## Notes

- All tasks are required for comprehensive validation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- The refactoring is primarily deletion of duplicate code - ExpenseForm already has all needed functionality
