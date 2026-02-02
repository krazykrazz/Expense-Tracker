# Implementation Plan: Credit Card Statement Balance

## Overview

This implementation adds automatic statement balance calculation based on billing cycles and smart payment alert suppression. The work is organized into database migration, backend services, and frontend updates.

## Tasks

- [ ] 1. Database Migration
  - [ ] 1.1 Add billing_cycle_day column migration
    - Add migration function `addBillingCycleDayColumn` to `backend/database/migrations.js`
    - Add `billing_cycle_day` INTEGER column with CHECK constraint (1-31)
    - Migrate existing data: copy `billing_cycle_end` to `billing_cycle_day` for credit cards
    - Ensure migration is idempotent
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [ ] 1.2 Update database schema definitions
    - Update `initializeDatabase()` in `backend/database/db.js` to include `billing_cycle_day`
    - Update `initializeTestDatabase()` in `backend/database/db.js` to match
    - _Requirements: 2.1_
  
  - [ ] 1.3 Write property test for migration idempotence
    - **Property 5: Migration Idempotence**
    - **Validates: Requirements 2.4**

- [ ] 2. Checkpoint - Verify migration
  - Ensure migration runs successfully and existing data is preserved

- [ ] 3. Backend: StatementBalanceService
  - [ ] 3.1 Create StatementBalanceService
    - Create `backend/services/statementBalanceService.js`
    - Implement `calculatePreviousCycleDates(billingCycleDay, referenceDate)` method
    - Implement `calculateStatementBalance(paymentMethodId, referenceDate)` method
    - Implement `getStatementBalances(paymentMethodIds, referenceDate)` method
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  
  - [ ] 3.2 Write property test for billing cycle date calculation
    - **Property 7: Billing Cycle Date Calculation**
    - **Validates: Requirements 3.3**
  
  - [ ] 3.3 Write property test for statement balance expense calculation
    - **Property 6: Statement Balance Expense Calculation**
    - **Validates: Requirements 3.1, 3.2**
  
  - [ ] 3.4 Write property test for payment subtraction
    - **Property 8: Payment Subtraction in Statement Balance**
    - **Validates: Requirements 3.5, 4.2, 4.3**
  
  - [ ] 3.5 Write property test for floor at zero
    - **Property 9: Statement Balance Floor at Zero**
    - **Validates: Requirements 3.6, 4.4**

- [ ] 4. Backend: PaymentMethodService Validation Updates
  - [ ] 4.1 Add required field validation for credit cards
    - Update `validateCreditCard()` in `backend/services/paymentMethodService.js`
    - Require `billing_cycle_day` for new credit cards
    - Require `payment_due_day` for new credit cards
    - Validate range (1-31) for both fields
    - Prevent setting to null on update
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  
  - [ ] 4.2 Write property test for required fields validation
    - **Property 1: Required Fields Validation**
    - **Validates: Requirements 1.1, 1.2, 1.5**
  
  - [ ] 4.3 Write property test for range validation
    - **Property 2: Billing Cycle Day Range Validation**
    - **Validates: Requirements 1.3, 1.4**

- [ ] 5. Backend: Repository Updates
  - [ ] 5.1 Update PaymentMethodRepository
    - Add `billing_cycle_day` to create, update, and findAll queries
    - Update `backend/repositories/paymentMethodRepository.js`
    - _Requirements: 2.1_
  
  - [ ] 5.2 Update ReminderRepository
    - Add `billing_cycle_day` to `getCreditCardsWithDueDates()` query
    - Update `backend/repositories/reminderRepository.js`
    - _Requirements: 5.1_

- [ ] 6. Backend: ReminderService Updates
  - [ ] 6.1 Integrate StatementBalanceService into ReminderService
    - Update `getCreditCardReminders()` in `backend/services/reminderService.js`
    - Calculate statement balance for cards with billing_cycle_day configured
    - Use statement balance for alert show/suppress logic
    - Include required_payment amount in response
    - Maintain backward compatibility for unconfigured cards
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  
  - [ ] 6.2 Write property test for alert show logic
    - **Property 10: Alert Show Logic**
    - **Validates: Requirements 5.2, 5.4**
  
  - [ ] 6.3 Write property test for alert suppression logic
    - **Property 11: Alert Suppression Logic**
    - **Validates: Requirements 5.3**
  
  - [ ] 6.4 Write property test for backward compatibility
    - **Property 13: Backward Compatibility for Unconfigured Cards**
    - **Validates: Requirements 5.6**

- [ ] 7. Checkpoint - Backend complete
  - Ensure all backend tests pass, ask the user if questions arise

- [ ] 8. Frontend: PaymentMethodForm Updates
  - [ ] 8.1 Add billing_cycle_day field to PaymentMethodForm
    - Update `frontend/src/components/PaymentMethodForm.jsx`
    - Add billing_cycle_day input field for credit cards
    - Mark as required with validation (1-31)
    - Add helpful hint text explaining the field
    - Include in form submission payload
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  
  - [ ] 8.2 Write test for PaymentMethodForm billing cycle field
    - Test field rendering for credit cards
    - Test validation behavior
    - Test form submission includes billing_cycle_day
    - _Requirements: 6.1, 6.4, 6.6_

- [ ] 9. Frontend: CreditCardDetailView Updates
  - [ ] 9.1 Display statement balance in CreditCardDetailView
    - Update `frontend/src/components/CreditCardDetailView.jsx`
    - Fetch and display calculated statement balance
    - Show "Statement Paid" indicator when balance <= 0
    - Show remaining amount due with due date when balance > 0
    - Display billing cycle dates
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [ ] 9.2 Write test for CreditCardDetailView statement balance display
    - Test statement balance rendering
    - Test paid indicator display
    - Test amount due display
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 10. Frontend: API Integration
  - [ ] 10.1 Add statement balance endpoint to config
    - Add endpoint constant to `frontend/src/config.js` if needed
    - Update `frontend/src/services/creditCardApi.js` if new endpoints required
    - _Requirements: 7.1_

- [ ] 11. Frontend: Reminder Display Updates
  - [ ] 11.1 Update reminder UI to show required payment amount
    - Update reminder display components to show statement balance as required payment
    - Show urgency indicators (overdue, due soon, paid)
    - Display "Paid" status when statement is paid
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [ ] 11.2 Write test for reminder display
    - Test required payment amount display
    - Test urgency indicator correctness
    - Test paid status display
    - _Requirements: 8.1, 8.4, 8.5_

- [ ] 12. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise
  - Verify end-to-end flow: create credit card → add expenses → record payment → verify statement balance

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties
- The design uses JavaScript with Node.js/Express backend and React frontend
- Property-based tests should use fast-check library with minimum 100 iterations
