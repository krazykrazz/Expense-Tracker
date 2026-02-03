# Implementation Plan: Credit Card Billing Cycle History

## Overview

This implementation plan covers the Credit Card Billing Cycle History feature, which allows users to record actual statement balances from credit card statements each billing cycle. The implementation follows the existing layered architecture (Controller → Service → Repository → Database) and integrates with existing credit card and reminder systems.

## Tasks

- [x] 1. Database Schema and Migration
  - [x] 1.1 Create migration for credit_card_billing_cycles table
    - Add migration function `migrateBillingCyclesTable` in `backend/database/migrations.js`
    - Create table with columns: id, payment_method_id, cycle_start_date, cycle_end_date, actual_statement_balance, calculated_statement_balance, minimum_payment, due_date, notes, created_at, updated_at
    - Add foreign key constraint to payment_methods with ON DELETE CASCADE
    - Add unique constraint on (payment_method_id, cycle_end_date)
    - Create indexes for efficient querying
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 9.1, 9.2, 9.3_
  
  - [x] 1.2 Update test database schema
    - Add credit_card_billing_cycles table to `createTestDatabase()` in `backend/database/db.js`
    - Add corresponding indexes to `createTestIndexes()`
    - Ensure test schema matches production schema exactly
    - _Requirements: 9.1_

- [x] 2. Backend Repository Layer
  - [x] 2.1 Create BillingCycleRepository
    - Create `backend/repositories/billingCycleRepository.js`
    - Implement `create(data)` method
    - Implement `findById(id)` method
    - Implement `findByPaymentMethodAndCycleEnd(paymentMethodId, cycleEndDate)` method
    - Implement `findByPaymentMethod(paymentMethodId, options)` method with date range filtering
    - Implement `update(id, data)` method
    - Implement `delete(id)` method
    - Implement `getCurrentCycleStatus(paymentMethodId, cycleEndDate)` method
    - _Requirements: 1.1, 1.5, 2.2, 2.4_
  
  - [x] 2.2 Write property tests for BillingCycleRepository
    - Create `backend/repositories/billingCycleRepository.pbt.test.js`
    - **Property 1: Billing Cycle CRUD Round-Trip**
    - **Property 2: Uniqueness Constraint Enforcement**
    - **Property 3: Foreign Key Constraint Enforcement**
    - **Property 4: Cascade Delete Behavior**
    - **Property 5: History Sorting Order**
    - **Property 13: Date Range Filtering**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.2, 2.4**

- [x] 3. Backend Service Layer
  - [x] 3.1 Create BillingCycleHistoryService
    - Create `backend/services/billingCycleHistoryService.js`
    - Implement `createBillingCycle(paymentMethodId, data)` with auto-calculation of calculated_statement_balance
    - Implement `getBillingCycleHistory(paymentMethodId, options)` with discrepancy calculation
    - Implement `updateBillingCycle(paymentMethodId, cycleId, data)` preserving calculated_statement_balance
    - Implement `deleteBillingCycle(paymentMethodId, cycleId)`
    - Implement `getCurrentCycleStatus(paymentMethodId)`
    - Implement `calculateDiscrepancy(actualBalance, calculatedBalance)` helper
    - Integrate with StatementBalanceService for auto-calculation
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_
  
  - [x] 3.2 Write property tests for BillingCycleHistoryService
    - Create `backend/services/billingCycleHistoryService.pbt.test.js`
    - **Property 6: Discrepancy Calculation Correctness**
    - **Property 7: Discrepancy Type Classification**
    - **Property 8: Update Preserves Calculated Balance**
    - **Validates: Requirements 2.3, 3.1, 3.2, 3.3, 3.4**

- [x] 4. Checkpoint - Backend Core Complete
  - Ensure all repository and service tests pass
  - Ask the user if questions arise

- [x] 5. Update Reminder Service for Authoritative Balance
  - [x] 5.1 Update ReminderService to use actual statement balance
    - Modify `getCreditCardReminders()` in `backend/services/reminderService.js`
    - Check for billing cycle record for current period
    - Use actual_statement_balance as authoritative required_payment when available
    - Suppress payment alerts when actual_statement_balance is 0
    - Fall back to calculated balance when no record exists
    - _Requirements: 7.4, 7.5, 7.6_
  
  - [x] 5.2 Add billing cycle reminder generation
    - Add `getBillingCycleReminders(referenceDate)` method to ReminderService
    - Only generate reminders for most recently completed billing cycle
    - Check if entry exists before generating reminder
    - Integrate with existing `getReminderStatus()` response
    - _Requirements: 4.1, 4.2, 4.4_
  
  - [x] 5.3 Write property tests for reminder service billing cycle integration
    - Create `backend/services/reminderService.billingCycle.pbt.test.js`
    - **Property 10: Payment Alert Authoritative Balance**
    - **Property 12: Billing Cycle Reminder Generation**
    - **Validates: Requirements 4.1, 4.2, 7.4, 7.5, 7.6**

- [x] 6. Backend Controller and Routes
  - [x] 6.1 Create BillingCycleController
    - Create `backend/controllers/billingCycleController.js`
    - Implement `createBillingCycle(req, res)` - POST handler
    - Implement `getBillingCycleHistory(req, res)` - GET handler
    - Implement `updateBillingCycle(req, res)` - PUT handler
    - Implement `deleteBillingCycle(req, res)` - DELETE handler
    - Implement `getCurrentCycleStatus(req, res)` - GET handler
    - Add input validation and error handling
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [x] 6.2 Create billing cycle routes
    - Create `backend/routes/billingCycleRoutes.js`
    - POST `/api/payment-methods/:id/billing-cycles`
    - GET `/api/payment-methods/:id/billing-cycles/history`
    - PUT `/api/payment-methods/:id/billing-cycles/:cycleId`
    - DELETE `/api/payment-methods/:id/billing-cycles/:cycleId`
    - GET `/api/payment-methods/:id/billing-cycles/current`
    - Register routes in `backend/server.js`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [x] 6.3 Write controller integration tests
    - Create `backend/controllers/billingCycleController.test.js`
    - Test all API endpoints with valid and invalid inputs
    - Test error responses for constraint violations
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

- [x] 7. Checkpoint - Backend API Complete
  - Ensure all backend tests pass
  - Test API endpoints manually with curl or browser
  - Ask the user if questions arise

- [x] 8. Frontend API Integration
  - [x] 8.1 Add API endpoints to frontend config
    - Update `frontend/src/config.js` with new endpoints:
      - `PAYMENT_METHOD_BILLING_CYCLE_CREATE`
      - `PAYMENT_METHOD_BILLING_CYCLE_HISTORY`
      - `PAYMENT_METHOD_BILLING_CYCLE_UPDATE`
      - `PAYMENT_METHOD_BILLING_CYCLE_DELETE`
      - `PAYMENT_METHOD_BILLING_CYCLE_CURRENT`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [x] 8.2 Add billing cycle API functions
    - Update `frontend/src/services/creditCardApi.js`
    - Add `createBillingCycle(paymentMethodId, data)`
    - Add `getBillingCycleHistory(paymentMethodId, options)`
    - Add `updateBillingCycle(paymentMethodId, cycleId, data)`
    - Add `deleteBillingCycle(paymentMethodId, cycleId)`
    - Add `getCurrentCycleStatus(paymentMethodId)`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 9. Frontend Components
  - [x] 9.1 Create BillingCycleHistoryForm component
    - Create `frontend/src/components/BillingCycleHistoryForm.jsx`
    - Create `frontend/src/components/BillingCycleHistoryForm.css`
    - Pre-populate cycle dates from most recent completed cycle
    - Validate actual_statement_balance is non-negative
    - Allow optional minimum_payment, due_date, notes
    - Display calculated balance for reference
    - Show discrepancy after successful submission
    - Handle duplicate entry error
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 9.2 Write property tests for BillingCycleHistoryForm
    - Create `frontend/src/components/BillingCycleHistoryForm.pbt.test.jsx`
    - **Property 11: Form Validation Non-Negative Balance**
    - **Validates: Requirements 6.2**
  
  - [x] 9.3 Create BillingCycleHistoryList component
    - Create `frontend/src/components/BillingCycleHistoryList.jsx`
    - Create `frontend/src/components/BillingCycleHistoryList.css`
    - Display cycle dates, actual balance, calculated balance, discrepancy
    - Add discrepancy indicator (orange for higher, blue for lower)
    - Add edit and delete actions with confirmation
    - Handle empty state
    - _Requirements: 5.2, 5.3, 5.4_
  
  - [x] 9.4 Write unit tests for BillingCycleHistoryList
    - Create `frontend/src/components/BillingCycleHistoryList.test.jsx`
    - Test discrepancy indicator styling
    - Test empty state rendering
    - **Validates: Requirements 5.2, 5.3, 5.4**

- [x] 10. Integrate with CreditCardDetailView
  - [x] 10.1 Add billing cycle history section to CreditCardDetailView
    - Update `frontend/src/components/CreditCardDetailView.jsx`
    - Add billing cycle history section (only when billing_cycle_day configured)
    - Integrate BillingCycleHistoryForm for entry
    - Integrate BillingCycleHistoryList for display
    - Update statement balance display to show actual when available
    - Add indicator for user-provided vs calculated balance
    - _Requirements: 5.1, 7.1, 7.2, 7.3_
  
  - [x] 10.2 Write tests for CreditCardDetailView billing cycle integration
    - Create `frontend/src/components/CreditCardDetailView.billingCycle.test.jsx`
    - **Property 9: Statement Balance Display Priority**
    - Test section visibility based on billing_cycle_day
    - **Validates: Requirements 5.1, 7.1, 7.2, 7.3**

- [-] 11. Update Reminder Banner
  - [-] 11.1 Update CreditCardReminderBanner for billing cycle reminders
    - Update `frontend/src/components/CreditCardReminderBanner.jsx` if needed
    - Ensure banner uses actual_statement_balance when available
    - Add billing cycle entry reminder display
    - _Requirements: 4.1, 7.4_

- [ ] 12. Final Checkpoint - Feature Complete
  - Ensure all tests pass (backend and frontend)
  - Verify full flow: create, read, update, delete billing cycles
  - Verify reminder integration works correctly
  - Verify payment alerts use actual balance when available
  - Ask the user if questions arise

## Notes

- All tasks are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
