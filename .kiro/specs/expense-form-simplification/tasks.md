# Implementation Plan: ExpenseForm Simplification

## Overview

This plan refactors the ExpenseForm component to reduce complexity through progressive disclosure, collapsible sections, and contextual help. The implementation follows an incremental approach, extracting reusable components first, then refactoring sections one at a time to minimize risk.

## Tasks

- [ ] 1. Create reusable UI components
  - [ ] 1.1 Create CollapsibleSection component
    - Create `frontend/src/components/CollapsibleSection.jsx` and `.css`
    - Implement expand/collapse toggle with keyboard support
    - Add badge display and error indicator support
    - Include aria-expanded and aria-controls attributes
    - _Requirements: 1.3, 1.4, 2.3, 9.3, 10.2, 10.5, 12.2_
  
  - [ ]* 1.2 Write property test for CollapsibleSection toggle behavior
    - **Property 6: Section toggle interaction**
    - **Validates: Requirements 2.3, 10.2**
  
  - [ ]* 1.3 Write unit tests for CollapsibleSection
    - Test rendering in expanded/collapsed states
    - Test badge display
    - Test error indicator display
    - Test keyboard interactions (Enter/Space)
    - _Requirements: 2.3, 9.3, 10.2_
  
  - [ ] 1.4 Create HelpTooltip component
    - Create `frontend/src/components/HelpTooltip.jsx` and `.css`
    - Implement hover and focus tooltip display
    - Add Escape key to hide tooltip
    - Position tooltip to avoid viewport overflow
    - Include aria-describedby for accessibility
    - _Requirements: 3.1, 3.5, 10.3_
  
  - [ ]* 1.5 Write property test for HelpTooltip display behavior
    - **Property 8: Tooltip display on hover/focus**
    - **Validates: Requirements 3.1, 3.5, 10.3**
  
  - [ ]* 1.6 Write unit tests for HelpTooltip
    - Test tooltip display on hover
    - Test tooltip display on focus
    - Test tooltip hide on mouse leave
    - Test tooltip hide on Escape key
    - _Requirements: 3.1, 3.5, 10.3_



- [ ] 2. Add session state management to ExpenseForm
  - [ ] 2.1 Create useFormSectionState custom hook
    - Create `frontend/src/hooks/useFormSectionState.js`
    - Implement sessionStorage read/write for expansion states
    - Support separate keys for create vs edit mode
    - Provide toggle functions for each section
    - Return expansion state object and toggle handlers
    - _Requirements: 1.3, 11.2, 11.3, 11.5_
  
  - [ ]* 2.2 Write property test for session state persistence
    - **Property 3: Session state persistence**
    - **Validates: Requirements 1.3, 11.2, 11.5**
  
  - [ ]* 2.3 Write unit tests for useFormSectionState hook
    - Test initial state from sessionStorage
    - Test state updates to sessionStorage
    - Test separate keys for create/edit modes
    - Test state reset functionality
    - _Requirements: 1.3, 11.2, 11.3, 11.5_
  
  - [ ] 2.4 Integrate useFormSectionState into ExpenseForm
    - Import and use the hook in ExpenseForm component
    - Initialize expansion state based on mode (create/edit)
    - Wire up toggle handlers to section headers
    - _Requirements: 1.3, 11.2, 11.5_

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.



- [ ] 4. Refactor Advanced Options section
  - [ ] 4.1 Extract Advanced Options section with CollapsibleSection wrapper
    - Wrap future months and posted date fields in CollapsibleSection
    - Implement badge logic (show future months count and/or posted date)
    - Set default expansion state (collapsed in create, conditional in edit)
    - Add help tooltips to future months and posted date fields
    - _Requirements: 2.1, 2.2, 3.2, 3.3_
  
  - [ ]* 4.2 Write property test for Advanced Options badge display
    - **Property 5: Badge display for data presence** (Advanced Options)
    - **Validates: Requirements 2.2**
  
  - [ ]* 4.3 Write property test for posted date conditional rendering
    - **Property 9: Posted date field visibility**
    - **Validates: Requirements 4.1, 4.2**
  
  - [ ]* 4.4 Write unit tests for Advanced Options section
    - Test section renders with correct default state
    - Test badge displays correct content
    - Test posted date field visibility based on payment method
    - Test help tooltip content
    - _Requirements: 2.1, 2.2, 3.2, 3.3, 4.1, 4.2_

- [ ] 5. Refactor Reimbursement section
  - [ ] 5.1 Extract Reimbursement section with CollapsibleSection wrapper
    - Wrap generic original cost field in CollapsibleSection
    - Implement badge logic (show reimbursement amount)
    - Set default expansion state (collapsed in create, conditional in edit)
    - Add help tooltip to original cost field
    - Ensure section is hidden for medical expenses
    - _Requirements: 5.1, 5.2, 5.3, 3.4_
  
  - [ ]* 5.2 Write property test for Reimbursement section visibility
    - **Property 10: Section visibility based on expense type** (Reimbursement)
    - **Validates: Requirements 5.1**
  
  - [ ]* 5.3 Write property test for reimbursement breakdown display
    - **Property 12: Reimbursement breakdown display**
    - **Validates: Requirements 5.3, 5.4**
  
  - [ ]* 5.4 Write property test for reimbursement validation
    - **Property 13: Reimbursement validation**
    - **Validates: Requirements 5.5**
  
  - [ ]* 5.5 Write unit tests for Reimbursement section
    - Test section visibility based on expense type
    - Test badge displays reimbursement amount
    - Test breakdown display with valid amounts
    - Test validation error display
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_



- [ ] 6. Refactor Insurance Tracking section
  - [ ] 6.1 Extract Insurance Tracking section with CollapsibleSection wrapper
    - Wrap insurance fields in CollapsibleSection
    - Implement badge logic (show claim status when enabled)
    - Set default expansion state (collapsed in create, conditional in edit)
    - Add help tooltips to insurance fields
    - Ensure section is only visible for medical expenses
    - _Requirements: 6.1, 6.2, 6.5, 4.3_
  
  - [ ]* 6.2 Write property test for Insurance section visibility
    - **Property 10: Section visibility based on expense type** (Insurance)
    - **Validates: Requirements 4.3, 4.4**
  
  - [ ]* 6.3 Write property test for insurance details conditional rendering
    - **Property 11: Insurance details conditional rendering**
    - **Validates: Requirements 6.3, 6.4**
  
  - [ ]* 6.4 Write property test for insurance status notes display
    - **Property 22: Insurance status notes display**
    - **Validates: Requirements 6.5**
  
  - [ ]* 6.5 Write unit tests for Insurance Tracking section
    - Test section visibility for medical vs non-medical expenses
    - Test badge displays claim status
    - Test insurance details expand/collapse with checkbox
    - Test status notes display for each claim status
    - _Requirements: 4.3, 4.4, 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.



- [ ] 8. Refactor People Assignment section
  - [ ] 8.1 Extract People Assignment section with CollapsibleSection wrapper
    - Wrap people selection and allocation UI in CollapsibleSection
    - Implement badge logic (show people count)
    - Set default expansion state (collapsed in create, conditional in edit)
    - Add help tooltip to people assignment field
    - Ensure section is only visible for medical expenses
    - _Requirements: 7.1, 7.2, 7.4_
  
  - [ ]* 8.2 Write property test for People section visibility
    - **Property 10: Section visibility based on expense type** (People)
    - **Validates: Requirements 7.1**
  
  - [ ]* 8.3 Write property test for allocation summary display
    - **Property 14: Allocation summary display**
    - **Validates: Requirements 7.2, 7.4**
  
  - [ ]* 8.4 Write property test for allocation total validation
    - **Property 15: Allocation total validation**
    - **Validates: Requirements 7.5**
  
  - [ ]* 8.5 Write unit tests for People Assignment section
    - Test section visibility for medical expenses only
    - Test badge displays people count
    - Test allocation summary with Edit button
    - Test allocation breakdown display
    - Test validation error for mismatched totals
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

- [ ] 9. Refactor Invoice Attachments section
  - [ ] 9.1 Extract Invoice Attachments section with CollapsibleSection wrapper
    - Wrap invoice upload UI in CollapsibleSection
    - Implement badge logic (show invoice count)
    - Set default expansion state (collapsed in create, conditional in edit)
    - Add help tooltip to invoice attachment field
    - Ensure section is visible for medical and donation expenses
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  
  - [ ]* 9.2 Write property test for Invoice section visibility
    - **Property 10: Section visibility based on expense type** (Invoices)
    - **Validates: Requirements 4.5, 8.1**
  
  - [ ]* 9.3 Write property test for invoice list display in edit mode
    - **Property 16: Invoice list display in edit mode**
    - **Validates: Requirements 8.3**
  
  - [ ]* 9.4 Write property test for multiple invoice upload support
    - **Property 17: Multiple invoice upload support**
    - **Validates: Requirements 8.5**
  
  - [ ]* 9.5 Write unit tests for Invoice Attachments section
    - Test section visibility for tax-deductible expenses
    - Test badge displays invoice count
    - Test invoice list display in edit mode
    - Test file selection interface in create mode
    - Test person assignment for medical expenses
    - _Requirements: 4.5, 8.1, 8.2, 8.3, 8.4, 8.5_



- [ ] 10. Implement auto-expansion for validation errors
  - [ ] 10.1 Add error detection logic to ExpenseForm
    - Detect validation errors in collapsed sections
    - Auto-expand sections containing errors
    - Display error indicator badge on section headers
    - Focus first field with error after expansion
    - _Requirements: 2.4, 12.3_
  
  - [ ]* 10.2 Write property test for auto-expansion on validation errors
    - **Property 7: Auto-expansion on validation errors**
    - **Validates: Requirements 2.4**
  
  - [ ]* 10.3 Write unit tests for error handling
    - Test section auto-expands with validation error
    - Test error indicator appears on section header
    - Test focus moves to first error field
    - Test multiple errors in different sections
    - _Requirements: 2.4, 12.3_

- [ ] 11. Implement initial visibility and data-based expansion
  - [ ] 11.1 Add logic for initial section states
    - Set all sections collapsed in create mode
    - Expand sections with data in edit mode
    - Apply sessionStorage overrides if present
    - _Requirements: 1.1, 1.2_
  
  - [ ]* 11.2 Write property test for initial visibility in create mode
    - **Property 1: Initial visibility in create mode**
    - **Validates: Requirements 1.1**
  
  - [ ]* 11.3 Write property test for section expansion based on existing data
    - **Property 2: Section expansion based on existing data**
    - **Validates: Requirements 1.2**
  
  - [ ]* 11.4 Write unit tests for initial state logic
    - Test create mode has all sections collapsed
    - Test edit mode expands sections with data
    - Test sessionStorage overrides default states
    - _Requirements: 1.1, 1.2_

- [ ] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.



- [ ] 13. Implement data preservation during collapse
  - [ ] 13.1 Ensure form data persists when sections collapse
    - Verify collapsing sections only hides UI, not data
    - Test data remains in state after collapse/expand cycle
    - Ensure form submission includes data from collapsed sections
    - _Requirements: 1.4_
  
  - [ ]* 13.2 Write property test for data preservation during collapse
    - **Property 4: Data preservation during collapse**
    - **Validates: Requirements 1.4**
  
  - [ ]* 13.3 Write unit tests for data preservation
    - Test data persists after collapsing section
    - Test data displays correctly after re-expanding
    - Test form submission includes collapsed section data
    - _Requirements: 1.4_

- [ ] 14. Implement state reset after submission
  - [ ] 14.1 Add state reset logic to form submission handler
    - Reset all section expansion states to defaults after successful submission
    - Update sessionStorage with reset states
    - Preserve last used payment method (existing behavior)
    - _Requirements: 11.3_
  
  - [ ]* 14.2 Write property test for state reset after submission
    - **Property 21: State reset after submission**
    - **Validates: Requirements 11.3**
  
  - [ ]* 14.3 Write unit tests for state reset
    - Test expansion states reset after successful submission
    - Test sessionStorage updated with reset states
    - Test payment method preserved (existing behavior)
    - _Requirements: 11.3_



- [ ] 15. Implement accessibility features
  - [ ] 15.1 Add ARIA attributes to all collapsible sections
    - Add aria-expanded to section headers
    - Add aria-controls linking headers to content
    - Add aria-describedby for help tooltips
    - Add role="region" to section content areas
    - _Requirements: 10.5_
  
  - [ ] 15.2 Implement keyboard navigation support
    - Ensure Tab moves through visible fields in logical order
    - Skip collapsed section contents in tab order
    - Support Enter/Space on section headers (already in CollapsibleSection)
    - Support Escape to hide tooltips (already in HelpTooltip)
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  
  - [ ]* 15.3 Write property test for keyboard navigation order
    - **Property 19: Keyboard navigation order**
    - **Validates: Requirements 10.1, 10.4**
  
  - [ ]* 15.4 Write property test for ARIA attributes
    - **Property 20: ARIA attributes for sections**
    - **Validates: Requirements 10.5**
  
  - [ ]* 15.5 Write unit tests for accessibility
    - Test ARIA attributes present on all sections
    - Test tab order with various expansion states
    - Test keyboard interactions (Enter/Space/Escape)
    - Test focus management
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 16. Add visual styling and polish
  - [ ] 16.1 Style CollapsibleSection component
    - Add section header styling with hover effects
    - Style expand/collapse icons (chevron-right/chevron-down)
    - Style badges for data indicators
    - Style error indicators
    - Add smooth transitions for expand/collapse
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 12.2, 12.4, 12.5_
  
  - [ ] 16.2 Style HelpTooltip component
    - Add tooltip container styling
    - Position tooltip to avoid viewport overflow
    - Add subtle animation for show/hide
    - Style info icon (ⓘ)
    - _Requirements: 3.1, 3.5_
  
  - [ ] 16.3 Update ExpenseForm.css for new layout
    - Add spacing between sections
    - Ensure consistent alignment
    - Maintain two-column layout for Date/Place and Type/Amount
    - Add visual hierarchy for section headers vs field labels
    - _Requirements: 9.1, 9.2, 9.4, 9.5_



- [ ] 17. Integration testing and validation
  - [ ] 17.1 Write integration tests for complete form flows
    - Test create expense with various section combinations
    - Test edit expense with existing data in multiple sections
    - Test form submission with collapsed sections
    - Test validation errors across multiple sections
    - Test expense type switching with data in sections
    - _Requirements: 1.1, 1.2, 1.4, 2.4_
  
  - [ ]* 17.2 Write property test for section header structure
    - **Property 18: Section header structure**
    - **Validates: Requirements 9.3, 12.2, 12.5**
  
  - [ ]* 17.3 Write property test for badge display logic
    - **Property 5: Badge display for data presence**
    - **Validates: Requirements 1.5, 2.2, 5.2, 6.2, 8.2**
  
  - [ ] 17.4 Manual testing checklist
    - Test all section expand/collapse interactions
    - Test all help tooltips display correct content
    - Test keyboard navigation through entire form
    - Test screen reader compatibility (if possible)
    - Test form submission with various data combinations
    - Test browser back/forward navigation
    - Test sessionStorage persistence across page reloads

- [ ] 18. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based and unit tests
- Each property test should run minimum 100 iterations
- All property tests should reference their design document property number
- The refactoring maintains all existing functionality while improving UX
- No backend changes required - this is purely a frontend refactor
- Existing validation logic and business rules remain unchanged
