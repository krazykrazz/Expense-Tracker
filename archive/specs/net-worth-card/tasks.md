mg# Implementation Plan

- [x] 1. Enhance backend annual summary endpoint with net worth calculation





  - Modify `backend/services/expenseService.js` getAnnualSummary method
  - Add helper function to get year-end investment values (prefer December, fallback to latest month)
  - Add helper function to get year-end loan balances (prefer December, fallback to latest month)
  - Calculate total assets (sum of investment values)
  - Calculate total liabilities (sum of loan balances, excluding paid-off loans)
  - Calculate net worth (totalAssets - totalLiabilities)
  - Add netWorth, totalAssets, and totalLiabilities to response
  - _Requirements: 1.2, 1.3, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 1.1 Write property test for net worth calculation





  - **Property 1: Net worth calculation correctness**
  - **Validates: Requirements 1.2**

- [x] 1.2 Write property test for non-negative values




  - **Property 2: Non-negative assets and liabilities**
  - **Validates: Requirements 2.4, 2.5**


- [x] 1.3 Write unit tests for net worth calculation



  - Test correct calculation of net worth
  - Test year-end value selection (December preference)
  - Test fallback to latest month when December missing
  - Test handling of no investment data
  - Test handling of no loan data
  - Test exclusion of paid-off loans
  - _Requirements: 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 2. Add Net Worth card to AnnualSummary component





  - Modify `frontend/src/components/AnnualSummary.jsx`
  - Add Net Worth card to summary grid
  - Display net worth value with conditional styling (green for positive/zero, red for negative)
  - Add assets and liabilities breakdown display
  - Add subtitle "Year-end position"
  - Handle missing data (display $0 when no data available)
  - _Requirements: 1.1, 1.4, 1.5, 2.1, 2.2, 2.3, 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 2.1 Write property test for color coding





  - **Property 3: Color coding correctness**
  - **Validates: Requirements 1.4, 1.5**

- [x] 2.2 Write unit tests for Net Worth card rendering





  - Test correct rendering with positive net worth
  - Test correct rendering with negative net worth
  - Test correct rendering with zero net worth
  - Test assets and liabilities breakdown display
  - Test handling of missing data
  - _Requirements: 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 3. Update CSS styling





  - Update `frontend/src/components/AnnualSummary.css`
  - Add styles for net-worth-card
  - Add styles for net-worth-breakdown
  - Add styles for assets-label and liabilities-label
  - Ensure responsive design for mobile devices
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 4. Write integration tests




  - Test complete data flow from API to UI
  - Test card rendering with various data scenarios
  - Test responsive layout
  - _Requirements: 4.3_

- [x] 5. Add Net Worth card to monthly summary (SummaryPanel)





  - Modify `frontend/src/components/SummaryPanel.jsx`
  - Calculate net worth from existing totalInvestmentValue and totalOutstandingDebt
  - Add Net Worth card after Total Investments card
  - Display net worth value with conditional styling (green for positive/zero, red for negative)
  - Add assets and liabilities breakdown display
  - Add subtitle "Current month position"
  - Handle missing data (display $0 when no data available)
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 5.1 Write property test for monthly net worth calculation


  - **Property 5: Monthly net worth calculation correctness**
  - **Validates: Requirements 5.2, 5.3**

- [x] 5.2 Write unit tests for monthly Net Worth card rendering


  - Test correct rendering with positive net worth
  - Test correct rendering with negative net worth
  - Test correct rendering with zero net worth
  - Test assets and liabilities breakdown display
  - Test handling of missing data
  - _Requirements: 5.4, 5.5, 5.6_

- [x] 6. Update CSS styling for monthly summary





  - Update `frontend/src/components/SummaryPanel.css`
  - Ensure net-worth-card styles work in monthly context
  - Ensure responsive design for mobile devices
  - _Requirements: 5.1_

- [x] 7. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.
