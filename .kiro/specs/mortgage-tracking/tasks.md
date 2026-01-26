# Implementation Plan: Mortgage Tracking

## Overview

This implementation plan extends the existing loan tracking system to support mortgages as a specialized loan type. The approach builds incrementally on existing infrastructure, starting with database schema changes, then backend services, and finally frontend components.

## Tasks

- [ ] 1. Database Schema and Migration
  - [ ] 1.1 Add mortgage fields to loans table via migration
    - Create migration `add_mortgage_fields_v1` in `backend/database/migrations.js`
    - Add columns: amortization_period, term_length, renewal_date, rate_type, payment_frequency, estimated_property_value
    - Update loan_type CHECK constraint to include 'mortgage'
    - _Requirements: 2.1, 2.4_
  
  - [ ] 1.2 Update test database schema
    - Update `createTestDatabase()` in `backend/database/db.js` to include mortgage fields
    - Ensure test schema matches production schema
    - _Requirements: 2.1_

- [ ] 2. Backend Repository Layer
  - [ ] 2.1 Extend LoanRepository for mortgage fields
    - Update `create()` method to accept mortgage-specific fields
    - Update `update()` method to handle mortgage field updates
    - Add `updateMortgageFields()` method for allowed field updates only
    - Update `findById()` and `findAll()` to return mortgage fields
    - _Requirements: 2.1, 2.2, 2.3, 9.3_
  
  - [ ] 2.2 Write property test for non-mortgage null fields
    - **Property 3: Non-Mortgage Loans Have Null Mortgage Fields**
    - **Validates: Requirements 2.5**
  
  - [ ] 2.3 Write property test for immutable fields on update
    - **Property 8: Immutable Fields on Update**
    - **Validates: Requirements 9.3**

- [ ] 3. Checkpoint - Database layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Backend Service Layer - Validation
  - [ ] 4.1 Create MortgageService with validation methods
    - Create `backend/services/mortgageService.js`
    - Implement `validateMortgageFields()` for all mortgage-specific validation
    - Implement validation for: amortization_period (1-40), term_length (1-10), term <= amortization, renewal_date (future), rate_type, payment_frequency, estimated_property_value (> 0 if provided)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  
  - [ ] 4.2 Write property test for required fields validation
    - **Property 1: Mortgage Required Fields Validation**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6**
  
  - [ ] 4.3 Write property test for validation bounds
    - **Property 7: Validation Bounds**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

- [ ] 5. Backend Service Layer - Calculations
  - [ ] 5.1 Implement equity calculation in MortgageService
    - Add `calculateEquity(estimatedPropertyValue, remainingBalance)` method
    - Return equityAmount and equityPercentage
    - Handle edge cases (zero property value, negative balance)
    - _Requirements: 4.1, 4.4_
  
  - [ ] 5.2 Implement amortization schedule generation
    - Add `generateAmortizationSchedule(params)` method
    - Add `calculatePaymentAmount(params)` method
    - Support monthly, bi-weekly, and accelerated bi-weekly frequencies
    - Calculate principal/interest breakdown for each period
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [ ] 5.3 Implement renewal status calculation
    - Add `checkRenewalStatus(renewalDate)` method
    - Return isApproaching (within 6 months), isPastDue, monthsUntilRenewal
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [ ] 5.4 Implement payment breakdown calculation
    - Add `calculatePaymentBreakdown(loanId, balanceHistory)` method
    - Calculate total principal and interest paid from balance changes
    - _Requirements: 6.1, 6.2, 6.4_
  
  - [ ] 5.5 Write property test for equity calculation
    - **Property 4: Equity Calculation Formula**
    - **Validates: Requirements 4.1, 4.4**
  
  - [ ] 5.6 Write property test for amortization invariants
    - **Property 5: Amortization Schedule Invariants**
    - **Validates: Requirements 5.2, 5.3**
  
  - [ ] 5.7 Write property test for renewal status
    - **Property 6: Renewal Status Calculation**
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [ ] 6. Backend Service Layer - Integration
  - [ ] 6.1 Extend LoanService for mortgage operations
    - Add `createMortgage(data)` method that validates and persists
    - Add `updateMortgage(id, data)` method with field restrictions
    - Integrate MortgageService validation
    - _Requirements: 1.1, 9.2, 9.3_
  
  - [ ] 6.2 Write property test for mortgage round-trip
    - **Property 2: Mortgage Data Round-Trip**
    - **Validates: Requirements 2.1, 2.2, 2.3**

- [ ] 7. Checkpoint - Backend services complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Backend Controller and Routes
  - [ ] 8.1 Extend LoanController for mortgage endpoints
    - Update existing create/update handlers to support mortgage fields
    - Add `getAmortizationSchedule(req, res)` handler
    - Add `getEquityHistory(req, res)` handler
    - Add `updatePropertyValue(req, res)` handler
    - _Requirements: 5.1, 4.2, 4.4_
  
  - [ ] 8.2 Add mortgage routes
    - Add GET `/api/loans/:id/amortization` route
    - Add GET `/api/loans/:id/equity-history` route
    - Add PUT `/api/loans/:id/property-value` route
    - _Requirements: 5.1, 4.2, 4.4_
  
  - [ ] 8.3 Update frontend API config
    - Add new endpoints to `frontend/src/config.js` API_ENDPOINTS
    - _Requirements: 5.1, 4.2_

- [ ] 9. Frontend - Form Integration
  - [ ] 9.1 Extend LoansModal with mortgage form fields
    - Add conditional rendering for mortgage-specific fields when loan_type === 'mortgage'
    - Add form fields: amortization_period, term_length, renewal_date, rate_type, payment_frequency, estimated_property_value
    - Add client-side validation for mortgage fields
    - Update form submission to include mortgage fields
    - _Requirements: 1.1, 9.1, 9.4, 9.5_
  
  - [ ] 9.2 Add mortgage API functions
    - Add functions to `frontend/src/services/loanApi.js` for new endpoints
    - Add getAmortizationSchedule, getEquityHistory, updatePropertyValue
    - _Requirements: 5.1, 4.2_

- [ ] 10. Frontend - Mortgage Detail View
  - [ ] 10.1 Create MortgageDetailSection component
    - Create `frontend/src/components/MortgageDetailSection.jsx` and CSS
    - Display mortgage summary (amortization, term, renewal, rate type, frequency)
    - Display renewal reminder banner when within 6 months
    - Integrate with LoanDetailView
    - _Requirements: 8.1, 8.2, 8.5, 7.1_
  
  - [ ] 10.2 Create EquityChart component
    - Create `frontend/src/components/EquityChart.jsx` and CSS
    - SVG line chart showing equity buildup over time
    - Display current equity amount and percentage
    - _Requirements: 4.2, 4.3, 8.3_
  
  - [ ] 10.3 Create AmortizationChart component
    - Create `frontend/src/components/AmortizationChart.jsx` and CSS
    - Stacked area chart showing principal vs interest over loan life
    - Display payment breakdown summary
    - _Requirements: 5.5, 6.3, 8.4_
  
  - [ ] 10.4 Extend LoanDetailView for mortgages
    - Add conditional rendering for MortgageDetailSection when loan_type === 'mortgage'
    - Integrate EquityChart and AmortizationChart
    - Show rate history chart for variable rate mortgages (reuse existing chart)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 3.3_

- [ ] 11. Checkpoint - Frontend components complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Integration and Polish
  - [ ] 12.1 Wire up mortgage creation flow
    - Test end-to-end mortgage creation from LoansModal
    - Verify all fields persist correctly
    - Verify mortgage appears in loan list with correct type badge
    - _Requirements: 1.1, 2.1_
  
  - [ ] 12.2 Wire up mortgage detail view
    - Test navigation from loan list to mortgage detail
    - Verify all charts render with data
    - Verify renewal reminder displays correctly
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [ ] 12.3 Test variable rate mortgage flow
    - Test rate update creates balance entry
    - Verify rate history chart updates
    - Verify amortization recalculates with new rate
    - _Requirements: 3.1, 3.2, 3.3, 5.4_

- [ ] 13. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including property-based tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- The implementation builds on existing loan infrastructure to minimize code duplication
- Database migration runs automatically on container startup per project conventions
- Frontend components follow existing patterns (paired .jsx and .css files)
