# Implementation Plan: Spending Patterns & Predictions

## Overview

This implementation plan creates the Spending Patterns & Predictions feature following the established layered architecture. The feature adds intelligent analytics capabilities to the Expense Tracker, integrating with the existing Merchant Analytics under a unified Analytics Hub. Implementation proceeds from backend services through API endpoints to frontend components.

## Tasks

- [x] 1. Set up analytics infrastructure and constants
  - [x] 1.1 Create analytics constants file with configurable thresholds
    - Create `backend/utils/analyticsConstants.js` with MIN_MONTHS, tolerance values, and thresholds
    - Export ANALYTICS_CONFIG object with all configuration values
    - _Requirements: 1.4, 5.1, 5.2, 4.2, 3.4_

  - [x] 1.2 Add API endpoint constants to frontend config
    - Add analytics endpoints to `frontend/src/config.js` API_ENDPOINTS object
    - Include: patterns, predictions, seasonal, anomalies, data-sufficiency endpoints
    - _Requirements: 8.1_

- [x] 2. Implement SpendingPatternsService
  - [x] 2.1 Create SpendingPatternsService with data sufficiency check
    - Create `backend/services/spendingPatternsService.js`
    - Implement `checkDataSufficiency()` method to validate minimum data requirements
    - Calculate months of data, quality score, and available features
    - _Requirements: 1.3, 6.1, 6.2, 6.3_

  - [x] 2.2 Write property test for data sufficiency validation
    - **Property 3: Data Sufficiency Validation**
    - **Validates: Requirements 1.3, 6.1**

  - [x] 2.3 Implement recurring pattern detection
    - Add `getRecurringPatterns()` method to identify weekly/bi-weekly/monthly patterns
    - Use ±3 day tolerance for date matching
    - Calculate average amount and variance range for each pattern
    - _Requirements: 1.1, 1.2, 1.4, 1.5_

  - [x] 2.4 Write property test for recurring pattern detection
    - **Property 1: Recurring Pattern Detection Accuracy**
    - **Validates: Requirements 1.1, 1.4**

  - [x] 2.5 Write property test for amount variance calculation
    - **Property 4: Amount Variance Calculation**
    - **Validates: Requirements 1.5**

  - [x] 2.6 Implement day-of-week analysis
    - Add `getDayOfWeekPatterns()` method with category filtering support
    - Calculate average spending per day and identify high-spending days (>30% above average)
    - Include top categories per day
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 2.7 Write property test for day-of-week calculations
    - **Property 13: Day-of-Week Average Calculation**
    - **Property 14: High-Spending Day Identification**
    - **Validates: Requirements 4.1, 4.2**

  - [x] 2.8 Implement seasonal analysis
    - Add `getSeasonalAnalysis()` method for month-over-month and quarter-over-quarter comparisons
    - Identify categories with >25% seasonal variance
    - Calculate both absolute amounts and percentage changes
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.9 Write property test for seasonal analysis
    - **Property 10: Month-Over-Month Comparison Completeness**
    - **Property 11: Quarter-Over-Quarter Aggregation**
    - **Property 12: Seasonal Category Variance Detection**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 3. Checkpoint - Verify SpendingPatternsService
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement PredictionService
  - [x] 4.1 Create PredictionService with month-end prediction
    - Create `backend/services/predictionService.js`
    - Implement `getMonthEndPrediction()` using current trajectory and historical averages
    - Include category breakdown in predictions
    - _Requirements: 2.1, 2.2_

  - [x] 4.2 Write property test for prediction formula
    - **Property 5: Prediction Formula Consistency**
    - **Validates: Requirements 2.1, 2.2**

  - [x] 4.3 Implement confidence level calculation
    - Add `calculateConfidenceLevel()` based on months of available data
    - High (12+ months), Medium (6-11 months), Low (<6 months)
    - _Requirements: 2.5_

  - [x] 4.4 Write property test for confidence levels
    - **Property 8: Confidence Level Assignment**
    - **Validates: Requirements 2.5**

  - [x] 4.5 Implement early-month historical weighting
    - Adjust prediction formula to weight historical data more heavily when <7 days elapsed
    - _Requirements: 2.6_

  - [x] 4.6 Write property test for early-month weighting
    - **Property 9: Early Month Historical Weighting**
    - **Validates: Requirements 2.6**

  - [x] 4.7 Implement income comparison and YoY variance
    - Add `compareToHistorical()` for year-over-year comparison
    - Flag predictions exceeding income or >20% above same month last year
    - _Requirements: 2.3, 2.4_

  - [x] 4.8 Write property test for income and YoY warnings
    - **Property 6: Income Exceedance Warning**
    - **Property 7: Year-Over-Year Variance Highlighting**
    - **Validates: Requirements 2.3, 2.4**

- [x] 5. Checkpoint - Verify PredictionService
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement AnomalyDetectionService
  - [x] 6.1 Create AnomalyDetectionService with baseline calculation
    - Create `backend/services/anomalyDetectionService.js`
    - Implement `calculateCategoryBaseline()` to compute mean and standard deviation per category
    - Exclude months with gaps from baseline calculations
    - _Requirements: 5.1, 6.4_

  - [x] 6.2 Write property test for gap exclusion
    - **Property 22: Gap Exclusion in Baselines**
    - **Validates: Requirements 6.4**

  - [x] 6.3 Implement amount anomaly detection
    - Add logic to flag expenses >3 standard deviations from category average
    - _Requirements: 5.1_

  - [x] 6.4 Write property test for amount anomaly detection
    - **Property 17: Amount Anomaly Detection**
    - **Validates: Requirements 5.1**

  - [x] 6.5 Implement daily total anomaly detection
    - Add logic to flag days with spending >2x daily average
    - _Requirements: 5.2_

  - [x] 6.6 Write property test for daily anomaly detection
    - **Property 18: Daily Total Anomaly Detection**
    - **Validates: Requirements 5.2**

  - [x] 6.7 Implement new merchant anomaly detection
    - Add logic to flag first-time merchant visits with unusually high amounts
    - _Requirements: 5.3_

  - [x] 6.8 Write property test for new merchant detection
    - **Property 19: New Merchant Anomaly Detection**
    - **Validates: Requirements 5.3**

  - [x] 6.9 Implement anomaly dismiss functionality
    - Add `dismissAnomaly()` and `getDismissedAnomalies()` methods
    - Store dismissed expense IDs (can use localStorage or simple in-memory for MVP)
    - Exclude dismissed expenses from future detection
    - _Requirements: 5.5, 5.6_

  - [x] 6.10 Write property test for dismissed anomaly learning
    - **Property 20: Dismissed Anomaly Learning**
    - **Validates: Requirements 5.6**

- [x] 7. Checkpoint - Verify AnomalyDetectionService
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Create Analytics API endpoints
  - [x] 8.1 Create analytics routes file
    - Create `backend/routes/analyticsRoutes.js`
    - Define routes for patterns, predictions, seasonal, anomalies, data-sufficiency
    - _Requirements: 8.1_

  - [x] 8.2 Create analytics controller
    - Create `backend/controllers/analyticsController.js`
    - Implement handlers for all analytics endpoints
    - Add date range filtering support to all endpoints
    - Include metadata (dataQuality, confidenceLevel) in all responses
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 8.3 Write property test for API date filtering
    - **Property 25: API Date Range Filtering**
    - **Validates: Requirements 8.2**

  - [x] 8.4 Write property test for API response metadata
    - **Property 26: API Response Metadata**
    - **Validates: Requirements 8.3**

  - [x] 8.5 Register analytics routes in server.js
    - Import and use analytics routes in main server file
    - _Requirements: 8.1_

  - [x] 8.6 Write property test for edge case handling
    - **Property 27: Edge Case Handling**
    - **Validates: Requirements 8.4**

- [x] 9. Checkpoint - Verify Backend API
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Create frontend analytics API service
  - [x] 10.1 Create analyticsApi.js service file
    - Create `frontend/src/services/analyticsApi.js`
    - Implement API functions for all analytics endpoints
    - Use API_ENDPOINTS constants from config
    - _Requirements: 8.1_

- [x] 11. Create Analytics Hub frontend components
  - [x] 11.1 Create AnalyticsHubModal component
    - Create `frontend/src/components/AnalyticsHubModal.jsx` and `.css`
    - Implement tabbed navigation for different analytics views
    - Include existing Merchant Analytics as a tab
    - Default to Spending Patterns overview
    - _Requirements: 7.1, 7.5, 7.6_

  - [x] 11.2 Create SpendingPatternsView component
    - Create `frontend/src/components/SpendingPatternsView.jsx` and `.css`
    - Display recurring patterns with merchant, amount, frequency, next expected
    - Show day-of-week analysis with high-spending day highlighting
    - _Requirements: 1.2, 4.1, 4.2, 4.3_

  - [x] 11.3 Create PredictionsView component
    - Create `frontend/src/components/PredictionsView.jsx` and `.css`
    - Display end-of-month prediction with confidence indicator
    - Show income comparison warning when applicable
    - Show YoY variance highlighting when >20%
    - Include category breakdown
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

  - [x] 11.4 Create SeasonalAnalysisView component
    - Create `frontend/src/components/SeasonalAnalysisView.jsx` and `.css`
    - Display month-over-month comparison chart
    - Display quarter-over-quarter comparison
    - Highlight seasonal categories with >25% variance
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 11.5 Create AnomalyAlertsView component
    - Create `frontend/src/components/AnomalyAlertsView.jsx` and `.css`
    - Display detected anomalies with reason and severity
    - Implement dismiss functionality
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 11.6 Create DataSufficiencyMessage component
    - Create `frontend/src/components/DataSufficiencyMessage.jsx` and `.css`
    - Display informative message when insufficient data
    - Show which features are available and data requirements
    - _Requirements: 1.3, 6.2_

- [x] 12. Integrate Analytics Hub into main application
  - [x] 12.1 Add Analytics button to App.jsx navigation
    - Add "Analytics" button to main navigation area
    - Wire up AnalyticsHubModal open/close state
    - _Requirements: 7.1, 7.5_

  - [x] 12.2 Integrate budget alerts with predictions
    - Pass budget alert data to PredictionsView when available
    - Display budget status alongside spending predictions
    - _Requirements: 7.4_

  - [x] 12.3 Write property test for budget integration
    - **Property 24: Budget Integration**
    - **Validates: Requirements 7.4**

- [x] 13. Final checkpoint - Full integration testing
  - Ensure all tests pass, ask the user if questions arise.
  - Verify Analytics Hub opens and displays all views correctly
  - Verify data flows from backend through frontend
  - Test with various data scenarios (insufficient data, full data, edge cases)

## Notes

- All tasks including property tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- No database migrations required - all analysis uses existing expense data
- The feature integrates with existing Merchant Analytics under unified Analytics Hub
