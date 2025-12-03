# Implementation Plan

- [x] 1. Create reusable sub-components





  - [x] 1.1 Create CollapsibleSection component


    - Create CollapsibleSection.jsx with expand/collapse toggle functionality
    - Create CollapsibleSection.css with transition animations for expand/collapse
    - Accept title, summaryValue, icon, defaultExpanded, and children props
    - Display chevron icon that rotates based on expanded state
    - _Requirements: 3.2, 3.3, 3.4, 3.5_
  - [x] 1.2 Write property test for CollapsibleSection toggle


    - **Property 4: Collapsible Section Toggle**
    - **Validates: Requirements 3.2, 3.3**
  - [x] 1.3 Create TabNavigation component


    - Create TabNavigation.jsx with tab selection handling
    - Create TabNavigation.css with active/hover states
    - Accept tabs array, activeTab, and onTabChange props
    - Render horizontal tab bar with icons and labels
    - _Requirements: 2.1, 2.2, 2.4_
  - [x] 1.4 Write property test for tab content exclusivity


    - **Property 3: Tab Content Exclusivity**
    - **Validates: Requirements 2.2**

  - [x] 1.5 Write property test for active tab styling

    - **Property 11: Active Tab Styling**
    - **Validates: Requirements 7.2**

- [x] 2. Create KeyMetricsRow component





  - [x] 2.1 Create KeyMetricsRow component


    - Create KeyMetricsRow.jsx displaying Income, Total Expenses, Net Balance
    - Create KeyMetricsRow.css with prominent card styling and responsive layout
    - Calculate Total Expenses as sum of fixed and variable expenses
    - Apply color coding based on net balance sign
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 2.2 Write property test for net balance color coding

    - **Property 1: Net Balance Color Coding**
    - **Validates: Requirements 1.3, 1.4**

  - [x] 2.3 Write property test for total expenses calculation

    - **Property 2: Total Expenses Calculation**
    - **Validates: Requirements 1.5**

- [x] 3. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Create CategoryList component





  - [x] 4.1 Create CategoryList component


    - Create CategoryList.jsx with filtering, sorting, and truncation logic
    - Create CategoryList.css with list styling
    - Filter out categories with zero values in both current and previous month
    - Sort categories by current amount in descending order
    - Show top 5 by default with "Show all" button
    - Include TrendIndicator for each category
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 4.2 Write property test for category filtering

    - **Property 7: Category Filtering**
    - **Validates: Requirements 4.1, 4.3**

  - [x] 4.3 Write property test for category sorting
    - **Property 8: Category Sorting**
    - **Validates: Requirements 4.4**

  - [x] 4.4 Write property test for category truncation
    - **Property 9: Category Truncation**
    - **Validates: Requirements 4.5**

- [x] 5. Create FinancialCard component





  - [x] 5.1 Create FinancialCard component


    - Create FinancialCard.jsx with title, value, action button
    - Create FinancialCard.css with card styling matching existing design
    - Support optional details list for loans/investments breakdown
    - Handle click events for action buttons
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_
  - [x] 5.2 Write property test for modal opening


    - **Property 10: Modal Opening**
    - **Validates: Requirements 5.6**

- [x] 6. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Create tab content components






  - [x] 7.1 Create BreakdownTab component

    - Create BreakdownTab.jsx with CollapsibleSection for Weekly and Payment Methods
    - Include TrendIndicator for each item
    - Show summary totals when sections are collapsed
    - _Requirements: 3.1, 3.4, 3.5_
  - [x] 7.2 Write property test for collapsed section summary


    - **Property 5: Collapsed Section Summary**
    - **Validates: Requirements 3.4**
  - [x] 7.3 Write property test for expanded section items


    - **Property 6: Expanded Section Items**
    - **Validates: Requirements 3.5**
  - [x] 7.4 Create CategoriesTab component


    - Create CategoriesTab.jsx wrapping CategoryList component
    - Pass category data from summary to CategoryList
    - _Requirements: 4.1, 4.2_
  - [x] 7.5 Create FinancialHealthTab component


    - Create FinancialHealthTab.jsx with four FinancialCard components
    - Wire up modal handlers for each card's action button
    - Display Income, Fixed Expenses, Loans, and Investments sections
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 8. Refactor SummaryPanel to use new components




  - [x] 8.1 Refactor SummaryPanel container


    - Replace existing grid layout with new component structure
    - Add tab state management (activeTab, expandedSections)
    - Integrate KeyMetricsRow at the top
    - Add TabNavigation below key metrics
    - Render appropriate tab content based on activeTab
    - Preserve all existing modal functionality
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 8.2 Update SummaryPanel.css


    - Remove old grid layout styles
    - Add new container styles for tabbed layout
    - Ensure responsive breakpoints work correctly
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 9. Checkpoint - Ensure all tests pass




  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Add visual polish and accessibility



  - [x] 10.1 Add loading states


    - Add skeleton loaders for each section during data fetch
    - Maintain layout stability during loading
    - _Requirements: 7.5_
  - [x] 10.2 Add hover and transition effects


    - Add hover states for tabs and collapsible headers
    - Add smooth transitions for expand/collapse animations
    - Add rotation animation for chevron icons
    - _Requirements: 7.1, 7.3, 7.4_
  - [x] 10.3 Write unit tests for loading states



    - Test that loading skeleton renders when loading is true
    - Test that content renders when loading is false
    - _Requirements: 7.5_

- [x] 11. Final Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.
