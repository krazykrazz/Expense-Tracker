# Implementation Plan: Mortgage Insights

## Overview

This implementation plan extends the existing mortgage tracking system with practical financial insights. The approach builds incrementally on the existing `mortgageService.js` and `loan_balances` infrastructure, adding a new `mortgage_payments` table and `MortgageInsightsService` for insight calculations.

## Tasks

- [x] 1. Database Schema and Migration
  - [x] 1.1 Create mortgage_payments table via migration
    - Create migration `add_mortgage_payments_v1` in `backend/database/migrations.js`
    - Create table with columns: id, loan_id, payment_amount, effective_date, notes, created_at, updated_at
    - Add foreign key to loans table with ON DELETE CASCADE
    - Add indexes for loan_id and (loan_id, effective_date)
    - _Requirements: 8.1, 8.2, 8.4, 8.5_

  - [x] 1.2 Update test database schema
    - Update `initializeTestDatabase()` in `backend/database/db.js` to include mortgage_payments table
    - Ensure test schema matches production schema exactly
    - _Requirements: 8.1_

- [x] 2. Backend Repository Layer
  - [x] 2.1 Create MortgagePaymentRepository
    - Create `backend/repositories/mortgagePaymentRepository.js`
    - Implement `create()`, `findByMortgage()`, `findCurrentByMortgage()`, `update()`, `delete()` methods
    - Ensure `findByMortgage()` returns entries sorted by effective_date ASC
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 2.2 Write property test for cascade delete
    - **Property 10: Cascade Delete Integrity**
    - **Validates: Requirements 8.5**

- [x] 3. Backend Service Layer - Payment Tracking
  - [x] 3.1 Create MortgagePaymentService
    - Create `backend/services/mortgagePaymentService.js`
    - Implement `setPaymentAmount()` with validation (positive amount, valid date format, not future date)
    - Implement `getCurrentPayment()` to return most recent payment entry
    - Implement `getPaymentHistory()` to return all entries in chronological order
    - _Requirements: 1.2, 1.3, 1.4, 8.1, 8.2, 8.3_

  - [x] 3.2 Write property test for payment round-trip and history
    - **Property 1: Payment Round-Trip**
    - **Property 2: Payment History Preservation**
    - **Property 9: Payment History Ordering**
    - **Validates: Requirements 1.2, 1.3, 8.1, 8.2, 8.3**

- [x] 4. Checkpoint - Payment tracking layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Backend Service Layer - Insights Calculations
  - [x] 5.1 Create MortgageInsightsService with interest calculations
    - Create `backend/services/mortgageInsightsService.js`
    - Implement `calculateInterestBreakdown(balance, annualRate)` returning { daily, weekly, monthly, annual }
    - Daily = balance × (rate/100) / 365
    - Weekly = daily × 7
    - Monthly = daily × 30.44
    - Handle edge cases: zero balance, zero rate
    - _Requirements: 3.1, 3.3, 3.4, 3.5_

  - [x] 5.2 Write property test for interest calculation formula
    - **Property 5: Interest Calculation Formula**
    - **Validates: Requirements 3.1, 3.3, 3.4**

  - [x] 5.3 Implement payoff projection calculations
    - Add `projectPayoff(params)` method to MortgageInsightsService
    - Iteratively calculate months until balance reaches zero
    - Track total interest paid along the way
    - Return { payoffDate, totalMonths, totalInterest, totalPaid }
    - Handle edge case: payment less than interest (underpayment)
    - _Requirements: 4.1, 4.2, 4.4, 4.6_

  - [x] 5.4 Implement payment scenario comparison
    - Add `comparePaymentScenarios(params)` method
    - Calculate both current and minimum payment scenarios
    - Return comparison with monthsSaved and interestSaved
    - Flag underpayment condition when current < minimum
    - _Requirements: 4.3, 4.5, 4.6_

  - [x] 5.5 Write property test for payoff projection consistency
    - **Property 6: Payoff Projection Consistency**
    - **Property 7: Underpayment Detection**
    - **Validates: Requirements 4.1, 4.2, 4.4, 4.5, 4.6**

  - [x] 5.6 Implement what-if scenario analysis
    - Add `calculateExtraPaymentScenario(params)` method
    - Calculate new payoff with extra payment added to current payment
    - Return { newPayoffDate, monthsSaved, interestSaved, newTotalInterest }
    - _Requirements: 5.2, 5.3, 5.4_

  - [x] 5.7 Write property test for extra payment scenario benefits
    - **Property 8: Extra Payment Scenario Benefits**
    - **Validates: Requirements 5.2, 5.3, 5.4**

  - [x] 5.8 Implement aggregate insights retrieval
    - Add `getMortgageInsights(mortgageId)` method
    - Fetch mortgage data, current balance, current rate from loan_balances
    - Fetch current payment from mortgage_payments (or use minimum as default)
    - Calculate all insights and return aggregate object
    - _Requirements: 1.5, 2.1, 6.1_

- [x] 6. Checkpoint - Insights calculations complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Backend Controller and Routes
  - [x] 7.1 Add insights endpoints to LoanController
    - Add `getMortgageInsights(req, res)` handler
    - Add `getMortgagePayments(req, res)` handler
    - Add `createMortgagePayment(req, res)` handler
    - Add `updateMortgagePayment(req, res)` handler
    - Add `deleteMortgagePayment(req, res)` handler
    - Add `calculateScenario(req, res)` handler
    - _Requirements: 5.1, 5.2, 1.2, 1.4_

  - [x] 7.2 Add mortgage insights routes
    - Add GET `/api/loans/:id/insights` route
    - Add GET `/api/loans/:id/payments` route
    - Add POST `/api/loans/:id/payments` route
    - Add PUT `/api/loans/:id/payments/:paymentId` route
    - Add DELETE `/api/loans/:id/payments/:paymentId` route
    - Add POST `/api/loans/:id/insights/scenario` route
    - _Requirements: 5.1, 5.2, 1.2, 1.4_

  - [x] 7.3 Update frontend API config
    - Add new endpoints to `frontend/src/config.js` API_ENDPOINTS:
      - MORTGAGE_INSIGHTS: '/api/loans/{id}/insights'
      - MORTGAGE_PAYMENTS: '/api/loans/{id}/payments'
      - MORTGAGE_PAYMENT: '/api/loans/{id}/payments/{paymentId}'
      - MORTGAGE_SCENARIO: '/api/loans/{id}/insights/scenario'
    - _Requirements: 5.1, 1.2_

  - [x] 7.4 Add mortgage insights API functions
    - Create `frontend/src/services/mortgageInsightsApi.js`
    - Add `getMortgageInsights(mortgageId)` function
    - Add `getMortgagePayments(mortgageId)` function
    - Add `createMortgagePayment(mortgageId, data)` function
    - Add `updateMortgagePayment(mortgageId, paymentId, data)` function
    - Add `deleteMortgagePayment(mortgageId, paymentId)` function
    - Add `calculateScenario(mortgageId, extraPayment)` function
    - _Requirements: 5.1, 1.2_

- [x] 8. Checkpoint - Backend API complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Frontend - Current Status Insights
  - [x] 9.1 Create CurrentStatusInsights component
    - Create `frontend/src/components/CurrentStatusInsights.jsx` and CSS
    - Display current interest rate with visual indicator for variable rate
    - Display daily, weekly, monthly interest amounts formatted as currency
    - Display current payment amount with edit capability
    - Show "Rate not set" message when no balance data exists
    - _Requirements: 2.1, 2.2, 2.4, 3.1, 3.2, 3.4, 3.5_

  - [x] 9.2 Create PaymentTrackingHistory component
    - Create `frontend/src/components/PaymentTrackingHistory.jsx` and CSS
    - Display payment history with effective dates
    - Allow adding new payment entries
    - Allow editing existing payment entries
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 10. Frontend - Payoff Projections
  - [x] 10.1 Create PayoffProjectionInsights component
    - Create `frontend/src/components/PayoffProjectionInsights.jsx` and CSS
    - Display comparison table: current payment vs minimum payment scenarios
    - Show payoff date, total months, total interest for each scenario
    - Highlight time saved and interest saved when current > minimum
    - Display warning banner when current < minimum (underpayment)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 11. Frontend - Scenario Analysis
  - [x] 11.1 Create ScenarioAnalysisInsights component
    - Create `frontend/src/components/ScenarioAnalysisInsights.jsx` and CSS
    - Add input field for custom extra payment amount
    - Add preset buttons for $100, $250, $500, $1000
    - Display scenario results: new payoff date, months saved, interest saved
    - Show comparison table: current vs scenario outcomes
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 12. Frontend - Insights Panel Integration
  - [x] 12.1 Create MortgageInsightsPanel component
    - Create `frontend/src/components/MortgageInsightsPanel.jsx` and CSS
    - Organize insights into sections: Current Status, Projections, Scenarios
    - Handle loading states while fetching insights data
    - Display helpful messages when insufficient data exists
    - Use visual indicators (colors, icons) for positive/negative insights
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 12.2 Integrate MortgageInsightsPanel into MortgageDetailSection
    - Add MortgageInsightsPanel to MortgageDetailSection component
    - Fetch insights data when mortgage detail view loads
    - Pass mortgage data and insights to child components
    - _Requirements: 6.1, 8.1_

- [x] 13. Checkpoint - Frontend components complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Integration and Polish
  - [x] 14.1 Test end-to-end insights flow
    - Test insights display for mortgage with balance data
    - Test payment tracking (create, update, view history)
    - Test scenario calculations with various extra payment amounts
    - Verify default payment fallback when no payment set
    - _Requirements: 1.5, 2.1, 3.1, 4.1, 5.2_

  - [x] 14.2 Test edge cases and error handling
    - Test with missing balance data (no rate available)
    - Test with zero balance (paid off mortgage)
    - Test underpayment warning display
    - Test cascade delete when mortgage is deleted
    - _Requirements: 2.4, 3.5, 4.6, 6.5, 8.5_

- [x] 15. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including property-based tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- The implementation builds on existing mortgage infrastructure (mortgageService.js, loan_balances)
- Database migration runs automatically on container startup per project conventions
- Frontend API config must be updated before frontend components can call new endpoints
