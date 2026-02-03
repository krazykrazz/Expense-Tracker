# Implementation Plan: Expense List UX Improvements

## Overview

This implementation plan covers frontend-only changes to improve the ExpenseList filter UX. The work is organized into logical phases: creating new components, updating the main ExpenseList component, enhancing the global view indicator in App.jsx, and adding tests.

## Tasks

- [x] 1. Create FilterChip component
  - [x] 1.1 Create FilterChip.jsx with label, value, and onRemove props
    - Render chip with "{label}: {value}" format
    - Include remove button (×) that calls onRemove
    - Handle long values with text truncation
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 1.2 Create FilterChip.css with chip styling
    - Style as pill-shaped badge with remove button
    - Add hover states and transitions
    - Ensure responsive wrapping behavior
    - _Requirements: 4.4_
  - [x] 1.3 Write unit tests for FilterChip component
    - Test rendering with various label/value combinations
    - Test onRemove callback is called on button click
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 2. Create AdvancedFilters component
  - [x] 2.1 Create AdvancedFilters.jsx with collapsible section
    - Accept isExpanded, onToggle, activeCount, and children props
    - Render toggle button with "Advanced" text and count badge
    - Conditionally render children based on isExpanded
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 2.2 Create AdvancedFilters.css with styling
    - Style toggle button with badge
    - Add expand/collapse animation
    - Style the expanded content area
    - _Requirements: 2.2, 2.3_
  - [x] 2.3 Write unit tests for AdvancedFilters component
    - Test collapsed state shows badge with correct count
    - Test toggle expands/collapses content
    - _Requirements: 2.2, 2.3, 2.4_
  - [x] 2.4 Write property test for advanced filter badge count
    - **Property 4: Advanced Filter Badge Count Accuracy**
    - **Validates: Requirements 2.2, 2.4**

- [x] 3. Implement Smart Method Filter in ExpenseList
  - [x] 3.1 Create helper function to generate grouped filter options
    - Group payment methods by type (cash, debit, cheque, credit_card)
    - Create type headers and method items with proper structure
    - Handle methods with missing type gracefully
    - _Requirements: 1.1_
  - [x] 3.2 Replace Method and Method Type dropdowns with smart filter
    - Remove localFilterMethodType state variable
    - Update localFilterMethod to use encoded values (type: or method:)
    - Create parseSmartMethodFilter helper function
    - Update the filter dropdown to render grouped options
    - _Requirements: 1.1, 1.4, 1.5_
  - [x] 3.3 Update filteredExpenses logic for smart method filter
    - Parse the smart filter value to determine mode (type vs method)
    - Apply appropriate filtering based on mode
    - _Requirements: 1.2, 1.3_
  - [x] 3.4 Write property test for smart method type filtering
    - **Property 2: Smart Method Type Filtering**
    - **Validates: Requirements 1.2**
  - [x] 3.5 Write property test for smart method specific filtering
    - **Property 3: Smart Method Specific Filtering**
    - **Validates: Requirements 1.3**

- [x] 4. Checkpoint - Verify smart filter works correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Integrate new components into ExpenseList
  - [x] 5.1 Add AdvancedFilters section with Invoice and Insurance filters
    - Add showAdvancedFilters state variable
    - Calculate advancedFilterCount from invoice and insurance filters
    - Wrap Invoice and Insurance dropdowns in AdvancedFilters component
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 5.2 Add filter count badge to filter controls
    - Calculate total active filter count
    - Render badge near filter controls when count > 0
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 5.3 Add FilterChip row for active filters
    - Build activeFilters array from current filter state
    - Render FilterChip components for each active filter
    - Wire up onRemove callbacks to clear individual filters
    - _Requirements: 4.1, 4.2, 4.3, 4.5_
  - [x] 5.4 Update ExpenseList.css with new styles
    - Add styles for filter count badge
    - Add styles for filter chips row
    - Update filter controls layout for new structure
    - _Requirements: 3.1, 4.4_
  - [x] 5.5 Write property test for filter count badge accuracy
    - **Property 5: Total Filter Count Badge Accuracy**
    - **Validates: Requirements 3.1, 3.2, 3.3**
  - [x] 5.6 Write property test for filter chips generation
    - **Property 6: Filter Chips Generation**
    - **Validates: Requirements 4.1**
  - [x] 5.7 Write property test for filter chip removal independence
    - **Property 7: Filter Chip Removal Independence**
    - **Validates: Requirements 4.2**

- [x] 6. Checkpoint - Verify filter UI improvements work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Enhance Global View Indicator in App.jsx
  - [x] 7.1 Update global view banner with trigger information
    - Calculate which filters triggered global view (searchText, filterMethod, filterYear)
    - Display trigger names in the banner
    - _Requirements: 5.4_
  - [x] 7.2 Add "Return to Monthly View" button to banner
    - Add button that clears all global-triggering filters
    - Style button prominently within the banner
    - _Requirements: 5.2, 5.3_
  - [x] 7.3 Enhance Clear Filters button styling
    - Show "Clear All" text when filters are active
    - Apply enhanced styling in global view mode
    - Hide button when no filters are active
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 7.4 Update App.css with enhanced global view styles
    - Style the enhanced banner with trigger information
    - Style the Return to Monthly View button
    - Style the enhanced Clear Filters button
    - _Requirements: 5.1, 5.5, 6.1, 6.3_
  - [x] 7.5 Write property test for return to monthly view action
    - **Property 9: Return to Monthly View Action**
    - **Validates: Requirements 5.3**
  - [x] 7.6 Write property test for global view trigger identification
    - **Property 10: Global View Trigger Identification**
    - **Validates: Requirements 5.4**

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including tests are required for comprehensive coverage
- This is a frontend-only feature - no backend changes required
- All filter state remains local to components (no global state management changes)
- Property tests use fast-check library for JavaScript/React testing
- Each property test should run minimum 100 iterations

