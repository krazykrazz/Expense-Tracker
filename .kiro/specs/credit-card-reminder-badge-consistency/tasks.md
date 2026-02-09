# Implementation Plan: Credit Card Reminder Badge Consistency

## Overview

This implementation plan addresses UX inconsistencies in the CreditCardReminderBanner component by adding Statement badges and due date information to the multiple payment view. The changes are minimal and focused on the JSX rendering logic and supporting CSS.

## Tasks

- [ ] 1. Update CreditCardReminderBanner component JSX for multiple payment view
  - Modify the `.reminder-cards-breakdown` section (lines 186-202)
  - Restructure `.reminder-card-item` to use vertical layout with flexbox
  - Add Statement badge display with conditional rendering based on `has_actual_balance`
  - Add due date display with conditional rendering based on `payment_due_day`
  - Ensure Statement badge appears before Urgency indicator
  - Use same CSS classes and tooltip text as single payment view
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2_

- [ ] 2. Update CreditCardReminderBanner CSS for new layout
  - Modify `.reminder-card-item` to use `flex-direction: column`
  - Add `.reminder-card-main-info` class for card name and amount row
  - Add `.reminder-card-badges` class for badge container with horizontal layout
  - Add `.reminder-card-due-date` class for due date styling
  - Ensure adequate spacing between elements (4px vertical gap, 6px horizontal gap for badges)
  - _Requirements: 2.4, 3.3, 3.4, 3.5_

- [ ]* 3. Write property tests for badge display consistency
  - [ ]* 3.1 Write property test for Statement badge display consistency
    - **Property 1: Statement Badge Display Consistency**
    - **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
  
  - [ ]* 3.2 Write property test for Statement badge conditional rendering
    - **Property 2: Statement Badge Conditional Rendering**
    - **Validates: Requirements 1.3**
  
  - [ ]* 3.3 Write property test for due date display consistency
    - **Property 3: Due Date Display Consistency**
    - **Validates: Requirements 2.1, 2.2, 3.5**
  
  - [ ]* 3.4 Write property test for due date conditional rendering
    - **Property 4: Due Date Conditional Rendering**
    - **Validates: Requirements 2.3**
  
  - [ ]* 3.5 Write property test for badge ordering consistency
    - **Property 5: Badge Ordering Consistency**
    - **Validates: Requirements 1.4**
  
  - [ ]* 3.6 Write property test for CSS class consistency
    - **Property 6: CSS Class Consistency**
    - **Validates: Requirements 3.1**
  
  - [ ]* 3.7 Write property test for tooltip consistency
    - **Property 7: Tooltip Consistency**
    - **Validates: Requirements 3.2**
  
  - [ ]* 3.8 Write property test for backward compatibility
    - **Property 8: Backward Compatibility**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

- [ ]* 4. Write unit tests for specific scenarios
  - Test single card with Statement badge displays correctly
  - Test single card without Statement badge does not show badge
  - Test multiple cards with mixed Statement badges
  - Test cards with due dates display correctly
  - Test cards without due dates do not show due date
  - Test badge ordering (Statement before Urgency)
  - Verify existing tests still pass (backward compatibility)
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 5. Manual testing and verification
  - Test single payment reminder displays correctly
  - Test multiple payment reminders display Statement badges and due dates
  - Test with cards that have/don't have statement balances
  - Test with cards that have/don't have due dates
  - Verify click and dismiss handlers work correctly
  - Test in light and dark mode
  - Test responsive behavior and badge wrapping
  - Verify accessibility (keyboard navigation, screen readers)
  - _Requirements: All_

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- This is a pure frontend change with no API or database modifications
- All changes are in `frontend/src/components/CreditCardReminderBanner.jsx` and `.css`
- Existing functionality must remain unchanged (backward compatibility)
- Use existing CSS classes from single payment view for consistency
- Property tests should run minimum 100 iterations each
