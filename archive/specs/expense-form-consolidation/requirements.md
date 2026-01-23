# Requirements Document

## Introduction

This document specifies the requirements for consolidating the expense form components in the expense tracker application. Currently, the application has duplicate expense form implementations: `ExpenseForm.jsx` for creating new expenses and an inline edit form modal in `ExpenseList.jsx` that duplicates much of ExpenseForm's functionality. This duplication has caused bugs where features were added to one form but not the other (e.g., insurance tracking fields were initially missed in the edit form). The consolidation will eliminate this duplication by having ExpenseList use ExpenseForm for editing.

## Glossary

- **ExpenseForm**: The main React component (`ExpenseForm.jsx`) used for creating and editing expenses, which already supports edit mode via the `expense` prop
- **ExpenseList**: The React component (`ExpenseList.jsx`) that displays the list of expenses and currently contains a duplicate inline edit form modal
- **Edit_Modal**: The modal dialog that appears when a user clicks "Edit" on an expense in the list
- **Form_State**: The collection of state variables that manage form data (date, place, amount, type, method, notes, insurance fields, people selection, invoices, future months)
- **Callback_Handler**: Functions passed as props to notify parent components of changes (onExpenseAdded, onExpenseUpdated)

## Requirements

### Requirement 1: Remove Duplicate Form State from ExpenseList

**User Story:** As a developer, I want to remove duplicate form state management from ExpenseList, so that form logic is centralized in one component and easier to maintain.

#### Acceptance Criteria

1. WHEN ExpenseList is refactored, THE ExpenseList component SHALL NOT contain any of the following duplicate state variables: editFormData, editInsuranceEligible, editClaimStatus, editOriginalCost, editFutureMonths, editInvoices, selectedPeople (for edit form)
2. WHEN ExpenseList is refactored, THE ExpenseList component SHALL NOT contain any of the following duplicate handler functions: handleEditChange, handleEditSubmit, handleEditPeopleChange, handleEditPersonAllocation, handleEditInvoiceUploaded, handleEditInvoiceDeleted, handleEditPersonLinkUpdated
3. WHEN ExpenseList is refactored, THE ExpenseList component SHALL NOT contain the duplicate FUTURE_MONTHS_OPTIONS constant or calculateFutureDatePreview function
4. THE ExpenseList component SHALL retain only the state needed for managing the edit modal visibility (showEditModal, expenseToEdit)

### Requirement 2: Render ExpenseForm in Edit Modal

**User Story:** As a user, I want to edit expenses using the same form interface as creating expenses, so that I have a consistent experience.

#### Acceptance Criteria

1. WHEN a user clicks the Edit button on an expense, THE ExpenseList component SHALL display ExpenseForm inside a modal overlay
2. WHEN rendering ExpenseForm for editing, THE ExpenseList component SHALL pass the expense object via the `expense` prop to enable edit mode
3. WHEN rendering ExpenseForm for editing, THE ExpenseList component SHALL pass the `people` prop to provide family member data for medical expense assignments
4. WHEN rendering ExpenseForm for editing, THE ExpenseList component SHALL pass an `onExpenseAdded` callback that handles the expense update and closes the modal
5. THE Edit_Modal SHALL maintain the existing modal styling and close behavior (click outside to close, close button)

### Requirement 3: Preserve Edit Modal UX

**User Story:** As a user, I want the edit modal to behave the same way after the refactor, so that my workflow is not disrupted.

#### Acceptance Criteria

1. WHEN the edit modal is open, THE modal overlay SHALL close when the user clicks outside the modal content area
2. WHEN the edit modal is open, THE modal SHALL display a close button (×) in the top-right corner
3. WHEN the user successfully saves an expense edit, THE modal SHALL close automatically
4. WHEN the user cancels editing, THE modal SHALL close and discard any unsaved changes
5. WHEN the edit modal opens, THE ExpenseForm SHALL be pre-populated with the existing expense data

### Requirement 4: Maintain Feature Parity

**User Story:** As a user, I want all expense editing features to work correctly after the refactor, so that I can continue managing my expenses effectively.

#### Acceptance Criteria

1. WHEN editing a medical expense, THE ExpenseForm SHALL display the insurance tracking section with eligibility checkbox, original cost, claim status, and reimbursement calculation
2. WHEN editing a medical expense, THE ExpenseForm SHALL display the people assignment section for allocating expenses to family members
3. WHEN editing a tax-deductible expense (medical or donation), THE ExpenseForm SHALL display the invoice upload section with support for multiple invoices
4. WHEN editing any expense, THE ExpenseForm SHALL display the "Add to Future Months" option
5. WHEN editing any expense, THE ExpenseForm SHALL support all expense types available in the category dropdown
6. WHEN editing any expense, THE ExpenseForm SHALL support all payment methods available in the payment method dropdown

### Requirement 5: Handle Expense Update Callback

**User Story:** As a developer, I want the expense update flow to work correctly through the callback chain, so that the expense list refreshes with updated data.

#### Acceptance Criteria

1. WHEN ExpenseForm successfully updates an expense, THE ExpenseForm component SHALL call the onExpenseAdded callback with the updated expense data
2. WHEN the onExpenseAdded callback is invoked in edit mode, THE ExpenseList component SHALL call its onExpenseUpdated prop to notify the parent (App.jsx)
3. WHEN the onExpenseAdded callback is invoked in edit mode, THE ExpenseList component SHALL close the edit modal
4. IF the expense update fails, THEN THE ExpenseForm SHALL display an error message and keep the modal open

### Requirement 6: Maintain Invoice Data Loading

**User Story:** As a user, I want invoice data to load correctly when editing tax-deductible expenses, so that I can view and manage attached invoices.

#### Acceptance Criteria

1. WHEN opening the edit modal for a tax-deductible expense, THE system SHALL load existing invoice data for that expense
2. WHEN ExpenseForm is rendered in edit mode, THE ExpenseForm component SHALL receive and display existing invoices via the expense prop or fetch them internally
3. WHEN a user uploads a new invoice during editing, THE invoice SHALL be associated with the expense being edited
4. WHEN a user deletes an invoice during editing, THE invoice SHALL be removed from the expense

### Requirement 7: Maintain People Data Loading

**User Story:** As a user, I want people assignment data to load correctly when editing medical expenses, so that I can view and modify family member allocations.

#### Acceptance Criteria

1. WHEN opening the edit modal for a medical expense, THE system SHALL load existing people assignments for that expense
2. WHEN ExpenseForm is rendered in edit mode for a medical expense, THE ExpenseForm component SHALL display the currently assigned people
3. WHEN a user modifies people assignments during editing, THE changes SHALL be saved when the expense is updated
4. WHEN multiple people are assigned, THE PersonAllocationModal SHALL open to allow amount allocation

