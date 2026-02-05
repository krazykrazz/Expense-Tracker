# Implementation Plan: Loan Payment Tracking

## Overview

This implementation plan converts the loan tracking system from balance-based to payment-based tracking for loans and mortgages. The work is organized into database setup, backend services, API endpoints, frontend components, and migration utilities.

## Tasks

- [x] 1. Database Schema and Migration
  - [x] 1.1 Create loan_payments table migration
    - Add migration in `backend/database/migrations.js` for the new `loan_payments` table
    - Include indexes for loan_id and payment_date
    - _Requirements: 1.1_
  
  - [x] 1.2 Update test database schema
    - Add `loan_payments` table to `initializeTestDatabase()` in `backend/database/db.js`
    - Ensure test schema matches production schema
    - _Requirements: 1.1_

- [x] 2. Loan Payment Repository
  - [x] 2.1 Create LoanPaymentRepository
    - Create `backend/repositories/loanPaymentRepository.js`
    - Implement CRUD methods: create, findByLoan, findById, update, delete
    - Implement findByLoanOrdered for reverse chronological ordering
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [x] 2.2 Write property test for payment ordering
    - **Property 2: Payment Ordering**
    - **Validates: Requirements 1.2**

- [x] 3. Loan Payment Service
  - [x] 3.1 Create LoanPaymentService
    - Create `backend/services/loanPaymentService.js`
    - Implement payment validation (amount > 0, valid date format, not future)
    - Implement createPayment, getPayments, updatePayment, deletePayment
    - Verify loan exists and is not a line_of_credit before operations
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 5.1_
  
  - [x] 3.2 Write property test for payment CRUD round-trip
    - **Property 1: Payment CRUD Round-Trip**
    - **Validates: Requirements 1.1, 1.3**
  
  - [x] 3.3 Write property test for payment amount validation
    - **Property 4: Payment Amount Validation**
    - **Validates: Requirements 1.5**
  
  - [x] 3.4 Write property test for payment date validation
    - **Property 5: Payment Date Validation**
    - **Validates: Requirements 1.6**

- [x] 4. Balance Calculation Service
  - [x] 4.1 Create BalanceCalculationService
    - Create `backend/services/balanceCalculationService.js`
    - Implement calculateBalance: initial_balance - sum(payments), clamped to 0
    - Implement getBalanceHistory with running totals
    - _Requirements: 2.1, 2.2, 2.4_
  
  - [x] 4.2 Write property test for balance calculation formula
    - **Property 6: Balance Calculation Formula**
    - **Validates: Requirements 2.1, 2.2, 2.4**

- [x] 5. Checkpoint - Core Services Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Payment Suggestion Service
  - [x] 6.1 Create PaymentSuggestionService
    - Create `backend/services/paymentSuggestionService.js`
    - For mortgages: return monthly_payment field value
    - For loans with history: return average of previous payments
    - For loans without history: return null
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [x] 6.2 Write property test for mortgage payment suggestion
    - **Property 7: Mortgage Payment Suggestion**
    - **Validates: Requirements 3.1**
  
  - [x] 6.3 Write property test for loan average payment suggestion
    - **Property 8: Loan Average Payment Suggestion**
    - **Validates: Requirements 3.2**
  
  - [x] 6.4 Write property test for no suggestion with empty history
    - **Property 9: No Suggestion for Empty History**
    - **Validates: Requirements 3.3**

- [x] 7. Migration Service
  - [x] 7.1 Create MigrationService
    - Create `backend/services/migrationService.js`
    - Implement migrateBalanceEntries: convert balance differences to payments
    - Implement previewMigration for dry-run
    - Skip entries where balance increased, add to skipped list
    - Preserve original balance entries
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [x] 7.2 Write property test for migration payment calculation
    - **Property 10: Migration Payment Calculation**
    - **Validates: Requirements 4.1, 4.2**
  
  - [x] 7.3 Write property test for migration preserves balance entries
    - **Property 11: Migration Preserves Balance Entries**
    - **Validates: Requirements 4.3, 2.5**
  
  - [x] 7.4 Write property test for migration skips balance increases
    - **Property 12: Migration Skips Balance Increases**
    - **Validates: Requirements 4.4**

- [x] 8. Checkpoint - All Backend Services Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. API Controller and Routes
  - [x] 9.1 Create LoanPaymentController
    - Create `backend/controllers/loanPaymentController.js`
    - Implement handlers for all payment endpoints
    - Include proper error handling and HTTP status codes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 3.1, 4.1_
  
  - [x] 9.2 Create loan payment routes
    - Create `backend/routes/loanPaymentRoutes.js`
    - Define routes: POST/GET/PUT/DELETE for payments
    - Add routes for calculated-balance, payment-suggestion, migrate-balances
    - Register routes in server.js
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 3.1, 4.1_
  
  - [x] 9.3 Write integration tests for API endpoints
    - Test all CRUD operations
    - Test error responses
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 10. Frontend API Service
  - [x] 10.1 Add API endpoints to config.js
    - Add LOAN_PAYMENTS, LOAN_CALCULATED_BALANCE, LOAN_PAYMENT_SUGGESTION, LOAN_MIGRATE_BALANCES to API_ENDPOINTS
    - _Requirements: 1.1, 2.1, 3.1, 4.1_
  
  - [x] 10.2 Create loanPaymentApi.js
    - Create `frontend/src/services/loanPaymentApi.js`
    - Implement API functions: createPayment, getPayments, updatePayment, deletePayment
    - Implement getCalculatedBalance, getPaymentSuggestion, migrateBalances
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 3.1, 4.1_

- [x] 11. Checkpoint - API Layer Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Frontend Payment Form Component
  - [x] 12.1 Create LoanPaymentForm component
    - Create `frontend/src/components/LoanPaymentForm.jsx` and `.css`
    - Include amount input with suggestion pre-fill
    - Include date picker defaulting to today
    - Include optional notes field
    - Show "Suggested" label when suggestion is available
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 6.3_
  
  - [x] 12.2 Write unit tests for LoanPaymentForm
    - Test form validation
    - Test suggestion display
    - _Requirements: 3.1, 6.3_

- [x] 13. Frontend Payment History Component
  - [x] 13.1 Create LoanPaymentHistory component
    - Create `frontend/src/components/LoanPaymentHistory.jsx` and `.css`
    - Display payments in reverse chronological order
    - Show payment date, amount, and running balance
    - Include edit and delete buttons
    - _Requirements: 1.2, 6.2_
  
  - [x] 13.2 Write property test for running balance calculation
    - **Property 14: Running Balance in Payment History**
    - **Validates: Requirements 6.2**

- [x] 14. Update LoanDetailView Component
  - [x] 14.1 Add payment tracking UI to LoanDetailView
    - Conditionally show "Log Payment" for loans/mortgages
    - Keep "Add Balance Entry" for lines of credit
    - Display total payments and calculated balance
    - Integrate LoanPaymentForm and LoanPaymentHistory
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.4, 6.5_
  
  - [x] 14.2 Write property test for loan type determines tracking method
    - **Property 13: Loan Type Determines Tracking Method**
    - **Validates: Requirements 5.1, 5.2**

- [x] 15. Migration UI Component
  - [x] 15.1 Create MigrationUtility component
    - Create migration UI within LoanDetailView or as modal
    - Show preview of what will be migrated
    - Display summary after migration (converted, skipped)
    - _Requirements: 4.1, 4.5_
  
  - [x] 15.2 Write unit tests for MigrationUtility
    - Test preview display
    - Test summary display
    - _Requirements: 4.5_

- [x] 16. Payment History Visualization
  - [x] 16.1 Add balance reduction chart
    - Add chart showing balance over time based on payments
    - Show cumulative payments on chart
    - Add tooltips for payment details
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 17. Final Checkpoint - All Features Complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify payment tracking works for loans and mortgages
  - Verify balance tracking still works for lines of credit
  - Verify migration utility converts existing data correctly

## Notes

- All tasks including tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The existing `mortgage_payments` table tracks payment amount changes over time (for insights), while the new `loan_payments` table tracks actual payments made
