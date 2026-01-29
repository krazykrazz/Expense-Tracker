# Implementation Plan: Mortgage Payment Date Tracking

## Overview

This implementation adds payment day tracking to mortgages, enabling users to see when their next payment is due. The work follows the existing layered architecture and integrates with the current mortgage tracking infrastructure.

## Tasks

- [ ] 1. Database schema and migration
  - [ ] 1.1 Add migration function to add payment_day column to loans table
    - Create `migrateAddPaymentDay` function in `backend/database/migrations.js`
    - Use foreign key disable pattern (loans has CASCADE DELETE from loan_balances)
    - Add CHECK constraint for payment_day between 1 and 31
    - Allow NULL for backward compatibility
    - _Requirements: 1.1, 1.2, 1.3, 1.5_
  
  - [ ] 1.2 Update database initialization
    - Add payment_day column to loans table in `backend/database/db.js` initializeDatabase()
    - Add payment_day column to loans table in `backend/database/db.js` initializeTestDatabase()
    - _Requirements: 1.1_
  
  - [ ] 1.3 Write property test for migration data preservation
    - **Property 2: Migration data preservation**
    - **Validates: Requirements 1.5**

- [ ] 2. Backend repository and service layer
  - [ ] 2.1 Update loan repository to include payment_day
    - Add payment_day to INSERT in `create()` method
    - Add payment_day to UPDATE in `update()` method
    - Add payment_day to allowed fields in `updateMortgageFields()` method
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [ ] 2.2 Add payment_day validation to loan service
    - Add `validatePaymentDay()` method to `backend/services/loanService.js`
    - Integrate validation into create and update flows
    - _Requirements: 6.4, 6.5_
  
  - [ ] 2.3 Write property test for payment_day validation
    - **Property 1: Payment day validation range**
    - **Validates: Requirements 1.2, 2.4, 6.4**

- [ ] 3. Checkpoint - Backend complete
  - Ensure all backend tests pass, ask the user if questions arise.

- [ ] 4. Frontend next payment calculator utility
  - [ ] 4.1 Create next payment calculator module
    - Create `frontend/src/utils/nextPaymentCalculator.js`
    - Implement `calculateNextPaymentDate(paymentDay, referenceDate)` function
    - Implement `getLastDayOfMonth(year, month)` helper
    - Implement `adjustPaymentDayForMonth(paymentDay, year, month)` helper
    - Handle edge cases for February and short months
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_
  
  - [ ] 4.2 Write property test for next payment calculation
    - **Property 4: Next payment date calculation**
    - **Validates: Requirements 4.2, 4.3, 4.4**
  
  - [ ] 4.3 Implement payment soon indicator logic
    - Add `isPaymentSoon(nextPaymentDate, currentDate)` function
    - Return true if within 7 days
    - _Requirements: 5.3_
  
  - [ ] 4.4 Write property test for payment soon indicator
    - **Property 5: Payment soon indicator logic**
    - **Validates: Requirements 5.3**

- [ ] 5. Frontend LoansModal updates
  - [ ] 5.1 Add payment_day to form state and validation
    - Add payment_day to formData state in `frontend/src/components/LoansModal.jsx`
    - Add payment_day to validationErrors state
    - Add validation logic for payment_day (1-31 range)
    - _Requirements: 2.4, 2.5_
  
  - [ ] 5.2 Add payment_day input field to mortgage section
    - Add dropdown with options 1-31 plus "Not set" option
    - Display only when loan_type is 'mortgage'
    - Make field editable for both create and edit modes
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_
  
  - [ ] 5.3 Update create and update handlers
    - Include payment_day in create loan request
    - Include payment_day in update loan request
    - _Requirements: 3.4_
  
  - [ ] 5.4 Write unit tests for LoansModal payment_day
    - Test dropdown rendering
    - Test validation error display
    - Test form submission with payment_day
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 6. Frontend CurrentStatusInsights updates
  - [ ] 6.1 Add next payment display section
    - Import next payment calculator utilities
    - Calculate next payment date from loan's payment_day
    - Display formatted date with appropriate styling
    - _Requirements: 4.1, 5.1, 5.2_
  
  - [ ] 6.2 Add payment soon and today indicators
    - Show "Payment due today" when next payment is today
    - Show "Due soon" badge when within 7 days
    - Show "Payment day not set" when payment_day is null
    - _Requirements: 5.3, 5.4, 5.5, 4.7_
  
  - [ ] 6.3 Add CSS styles for next payment display
    - Style next-payment section
    - Style payment-soon-badge
    - Style payment-today emphasis
    - _Requirements: 5.1, 5.3, 5.4_
  
  - [ ] 6.4 Write unit tests for CurrentStatusInsights payment display
    - Test next payment date display
    - Test payment soon indicator
    - Test payment day not set state
    - _Requirements: 4.1, 4.7, 5.1, 5.3, 5.4, 5.5_

- [ ] 7. Checkpoint - Frontend complete
  - Ensure all frontend tests pass, ask the user if questions arise.

- [ ] 8. Integration and wiring
  - [ ] 8.1 Update loanApi.js if needed
    - Verify payment_day is included in request/response handling
    - No changes needed if using generic object spread
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [ ] 8.2 Write property test for payment_day update round-trip
    - **Property 3: Payment day update round-trip**
    - **Validates: Requirements 3.4**

- [ ] 9. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The migration must use the foreign key disable pattern due to loan_balances CASCADE DELETE
