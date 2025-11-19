# Implementation Plan

- [x] 1. Enhance backend annual summary endpoint





  - Modify `backend/services/expenseService.js` getAnnualSummary method
  - Add aggregation for fixed expenses from fixed_expenses table
  - Add aggregation for income from income_sources table
  - Calculate net income (totalIncome - totalExpenses)
  - Enhance monthly breakdown to include fixedExpenses, variableExpenses, and income
  - Update response structure with new fields
  - _Requirements: 1.3, 1.4, 2.2, 3.2_

- [x] 1.1 Write property test for total expenses calculation


  - **Property 1: Total expenses equals sum of fixed and variable**
  - **Validates: Requirements 1.1, 1.2**

- [x] 1.2 Write property test for net income calculation


  - **Property 2: Net income calculation correctness**
  - **Validates: Requirements 3.2**

- [x] 1.3 Write property test for monthly totals consistency


  - **Property 3: Monthly totals consistency**
  - **Validates: Requirements 4.2**

- [x] 1.4 Write unit tests for enhanced backend service


  - Test fixed expenses aggregation
  - Test income aggregation
  - Test handling of missing data (no fixed expenses, no income)
  - Test monthly breakdown calculations
  - _Requirements: 1.5, 2.4_

- [x] 2. Update Total Expenses card





  - Modify `frontend/src/components/AnnualSummary.jsx`
  - Update Total Expenses card to show fixed + variable breakdown
  - Add expense-breakdown div with fixed and variable labels
  - Style breakdown text appropriately
  - _Requirements: 1.1, 1.2_

- [x] 3. Add Total Income card





  - Add new summary card for Total Income
  - Display total income with positive/green styling
  - Add subtitle "From all sources"
  - Handle zero income case
  - _Requirements: 2.1, 2.3, 2.4, 2.5_

- [x] 4. Add Net Income card





  - Add new summary card for Net Income
  - Implement conditional styling (green for positive, red for negative, neutral for zero)
  - Add subtitle showing "Surplus" or "Deficit"
  - Display absolute value with appropriate sign
  - _Requirements: 3.1, 3.3, 3.4, 3.5_


- [x] 4.1 Write property test for color coding

  - **Property 4: Color coding correctness**
  - **Validates: Requirements 3.3, 3.4, 3.5**

- [x] 5. Implement stacked bar chart





  - Replace existing monthly chart with stacked bar implementation
  - Create stacked-bar structure with fixed (bottom) and variable (top) segments
  - Calculate segment heights based on max month total
  - Add tooltips showing expense type and amount
  - Handle empty months (zero-height bars)
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 5.1 Write property test for chart completeness


  - **Property 5: Chart data completeness**
  - **Validates: Requirements 4.1**

- [x] 6. Add chart legend




  - Create legend component above stacked bar chart
  - Display "Fixed Expenses" with blue color indicator
  - Display "Variable Expenses" with purple color indicator
  - Position legend clearly visible near chart
  - _Requirements: 5.1, 5.2, 5.3, 5.5_

- [x] 7. Update CSS styling





  - Update `frontend/src/components/AnnualSummary.css`
  - Add styles for expense breakdown in Total Expenses card
  - Add styles for income-card with positive/green theme
  - Add styles for net-income-card with conditional coloring
  - Add styles for stacked bar chart (.stacked-bar, .bar-segment, .fixed-segment, .variable-segment)
  - Add styles for chart legend
  - Ensure responsive design for mobile devices
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 8. Write integration tests






  - Test complete data flow from API to UI
  - Test card rendering with various data scenarios
  - Test stacked bar chart rendering
  - Test responsive layout
  - _Requirements: 6.3, 6.5_

- [x] 9. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.
