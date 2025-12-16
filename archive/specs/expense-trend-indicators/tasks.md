# Implementation Plan

- [x] 1. Create trend calculation utility





  - Create `frontend/src/utils/trendCalculator.js` with `calculateTrend` function
  - Implement percentage change calculation logic
  - Handle edge cases (null, zero, undefined values)
  - Apply 1% threshold filtering
  - Format percentage display strings
  - _Requirements: 1.2, 1.3, 1.4, 4.5_

- [x] 1.1 Write property test for trend calculation


  - **Property 1 & 2: Trend direction correctness**
  - **Validates: Requirements 1.2, 1.3, 2.2, 2.3, 3.2, 3.3**

- [x] 1.2 Write property test for threshold filtering


  - **Property 3: Threshold filtering**
  - **Validates: Requirements 4.5**

- [x] 2. Create TrendIndicator component





  - Create `frontend/src/components/TrendIndicator.jsx` and `.css` files
  - Implement component that accepts currentValue and previousValue props
  - Use calculateTrend utility to determine display
  - Render arrow icons (▲ for up, ▼ for down)
  - Add tooltip with percentage change on hover
  - Apply appropriate CSS classes for styling
  - _Requirements: 1.2, 1.3, 4.1, 4.2, 4.3, 4.4_

- [x] 2.1 Write property test for tooltip accuracy


  - **Property 4: Tooltip accuracy**
  - **Validates: Requirements 4.4**

- [x] 2.2 Write unit tests for TrendIndicator component

  - Test upward arrow rendering for increases
  - Test downward arrow rendering for decreases
  - Test no rendering for values below threshold
  - Test no rendering when previous value is null
  - Test tooltip text formatting
  - _Requirements: 1.2, 1.3, 1.4, 4.4_

- [x] 3. Enhance backend summary endpoint





  - Modify `backend/services/expenseService.js` getSummary method
  - Add logic to fetch previous month's summary data
  - Calculate previous month (handle year rollover)
  - Return both current and previous month data in response
  - Handle case where previous month has no data
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 3.1 Write unit tests for enhanced summary endpoint


  - Test previous month calculation
  - Test year rollover (January -> December of previous year)
  - Test response structure with both current and previous data
  - Test handling of missing previous month data
  - _Requirements: 1.5_

- [x] 4. Update SummaryPanel to fetch and display trends





  - Modify `frontend/src/components/SummaryPanel.jsx`
  - Update API call to receive both current and previous month data
  - Import TrendIndicator component
  - Add TrendIndicator next to each weekly total (W1-W5)
  - Add TrendIndicator next to each expense type total
  - Add TrendIndicator next to each payment method total
  - Pass currentValue and previousValue props from summary data
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 4.1 Write property test for trend indicator presence


  - **Property 5: Trend indicators appear for all categories**
  - **Validates: Requirements 1.1, 2.1, 3.1**

- [x] 5. Add CSS styling for trend indicators




  - Update `frontend/src/components/SummaryPanel.css`
  - Add styles for .trend-indicator class
  - Add styles for .trend-up (red color #e74c3c)
  - Add styles for .trend-down (green color #27ae60)
  - Ensure small, compact sizing
  - Add hover effects for tooltip
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 6. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.
