# Implementation Plan

- [ ] 1. Create backend service and repository methods
  - [ ] 1.1 Add merchant analytics query methods to expenseRepository
    - Add `getMerchantAnalytics(filters)` method for aggregated merchant data
    - Add `getMerchantExpenses(merchantName, filters)` method for filtered expenses
    - Add `getMerchantTrend(merchantName, months)` method for monthly trend data
    - Use SQL aggregation (GROUP BY place) for efficient queries
    - _Requirements: 1.1, 1.2, 2.1, 5.2_

  - [ ] 1.2 Write property test for merchant ranking sort order
    - **Property 1: Merchant ranking by total spend is correctly sorted**
    - **Validates: Requirements 1.1**

  - [ ] 1.3 Create merchantAnalyticsService with aggregation logic
    - Implement `getTopMerchants(filters, sortBy)` with sorting options
    - Implement `getMerchantDetails(merchantName, filters)` with full statistics
    - Implement `getMerchantTrend(merchantName, months)` with gap filling
    - Implement date filter calculation for all period types
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5, 5.2, 5.3, 5.4_

  - [ ] 1.4 Write property test for merchant statistics calculation
    - **Property 2: Merchant statistics are correctly calculated**
    - **Validates: Requirements 1.2, 2.1, 2.3**

  - [ ] 1.5 Write property test for date range filtering
    - **Property 3: Date range filtering includes only expenses within the period**
    - **Validates: Requirements 1.3, 4.2, 4.3, 4.4, 4.5**

  - [ ] 1.6 Write property test for first/last visit dates
    - **Property 4: First and last visit dates are correctly identified**
    - **Validates: Requirements 2.2**

  - [ ] 1.7 Write property test for primary category and payment method
    - **Property 5: Primary category and payment method are most frequent**
    - **Validates: Requirements 2.4**

  - [ ] 1.8 Write property test for visit frequency sorting
    - **Property 6: Visit frequency sorting is correct**
    - **Validates: Requirements 3.1**

  - [ ] 1.9 Write property test for average days between visits
    - **Property 7: Average days between visits is correctly calculated**
    - **Validates: Requirements 3.2**

- [ ] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Create backend controller and routes
  - [ ] 3.1 Create merchantAnalyticsController with endpoint handlers
    - Implement GET /api/analytics/merchants handler
    - Implement GET /api/analytics/merchants/:name handler
    - Implement GET /api/analytics/merchants/:name/trend handler
    - Implement GET /api/analytics/merchants/:name/expenses handler
    - Add input validation and error handling
    - _Requirements: 1.1, 2.1, 5.1, 7.2_

  - [ ] 3.2 Create merchantAnalyticsRoutes and register with Express app
    - Define routes for all analytics endpoints
    - Register routes in server.js
    - _Requirements: 6.1_

  - [ ] 3.3 Write property test for trend data generation
    - **Property 8: Trend data covers correct time range with gap filling**
    - **Validates: Requirements 5.2, 5.3**

  - [ ] 3.4 Write property test for month-over-month change calculation
    - **Property 9: Month-over-month change percentage is correctly calculated**
    - **Validates: Requirements 5.4**

  - [ ] 3.5 Write property test for merchant expense filtering
    - **Property 10: Merchant expense filter returns only matching expenses**
    - **Validates: Requirements 7.2**

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Create frontend API client
  - [ ] 5.1 Create merchantAnalyticsApi.js with API functions
    - Implement getTopMerchants(period, sortBy)
    - Implement getMerchantDetails(name, period)
    - Implement getMerchantTrend(name, months)
    - Implement getMerchantExpenses(name, period)
    - Handle errors and loading states
    - _Requirements: 1.1, 2.1, 5.1, 7.2_

- [ ] 6. Create frontend components
  - [ ] 6.1 Create MerchantAnalyticsModal component
    - Display ranked list of merchants with totals, visits, percentages
    - Add period filter dropdown (All Time, This Year, This Month, Last 3 Months)
    - Add sort toggle (by total spend, by visits, by average)
    - Handle loading and empty states
    - Style with MerchantAnalyticsModal.css
    - _Requirements: 1.1, 1.2, 3.1, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 6.2 Create MerchantDetailView component
    - Display detailed statistics (total, visits, average, date range)
    - Show category breakdown with percentages
    - Show payment method breakdown
    - Display average days between visits (or N/A for single visit)
    - Add "View All Expenses" button
    - Style with MerchantDetailView.css
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.2, 3.3, 7.1_

  - [ ] 6.3 Add spending trend chart to MerchantDetailView
    - Display line chart showing monthly spending
    - Show month-over-month change percentages
    - Handle months with zero spending
    - Use existing chart patterns from InvestmentDetailView
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ] 6.4 Add navigation button to access Merchant Analytics
    - Add "Merchant Analytics" button to main navigation area
    - Wire up modal open/close state in App.jsx
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 6.5 Implement drill-down to expense list
    - Add click handler to view expenses at merchant
    - Filter expense list by selected merchant
    - Provide navigation back to analytics view
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Add frontend tests
  - [ ] 8.1 Write unit tests for MerchantAnalyticsModal
    - Test rendering with merchant data
    - Test period filter changes
    - Test sort toggle functionality
    - Test empty state display
    - Test loading state
    - _Requirements: 1.1, 4.1_

  - [ ] 8.2 Write unit tests for MerchantDetailView
    - Test rendering with merchant details
    - Test category breakdown display
    - Test payment method breakdown display
    - Test N/A display for single visit merchants
    - Test trend chart rendering
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.3, 5.1_

- [ ] 9. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
