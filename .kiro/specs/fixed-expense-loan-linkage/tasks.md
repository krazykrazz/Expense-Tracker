# Implementation Plan: Fixed Expense Loan Linkage

## Overview

This implementation extends the fixed expenses system to support loan payment tracking with due dates and loan linkages. The work is organized to build incrementally: database migration first, then backend services, then frontend UI, with testing integrated throughout.

## Tasks

- [x] 1. Database schema migration
  - [x] 1.1 Add migration for payment_due_day and linked_loan_id columns
    - Add migration function in `backend/database/migrations.js`
    - Add payment_due_day INTEGER column (nullable, CHECK 1-31)
    - Add linked_loan_id INTEGER column (nullable, FK to loans ON DELETE SET NULL)
    - Create indexes for efficient queries
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [x] 1.2 Update initializeDatabase and initializeTestDatabase
    - Update `backend/database/db.js` to include new columns in CREATE TABLE
    - Ensure test database schema matches production
    - _Requirements: 6.1_

- [x] 2. Backend repository layer
  - [x] 2.1 Extend FixedExpenseRepository with new fields
    - Update createFixedExpense to accept payment_due_day, linked_loan_id
    - Update updateFixedExpense to accept payment_due_day, linked_loan_id
    - Add getFixedExpensesWithLoans method (joins with loans table)
    - Add getLinkedFixedExpensesWithDueDates method for reminders
    - _Requirements: 1.4, 2.3, 2.4, 3.1_
  
  - [x] 2.2 Write property test for fixed expense round-trip
    - **Property 1: Fixed Expense Round-Trip with New Fields**
    - **Validates: Requirements 1.4, 2.3, 2.4**
  
  - [x] 2.3 Write property test for carry-forward with new fields
    - **Property 13: Carry-Forward with New Fields**
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 3. Backend service layer - validation
  - [x] 3.1 Extend FixedExpenseService validation
    - Add validation for payment_due_day (1-31 or null)
    - Add validation for linked_loan_id (valid loan or null)
    - Update createFixedExpense and updateFixedExpense methods
    - _Requirements: 1.2, 1.3, 2.3, 2.4_
  
  - [x] 3.2 Write property test for payment due day validation
    - **Property 2: Payment Due Day Validation**
    - **Validates: Requirements 1.2**
  
  - [x] 3.3 Write property test for backward compatibility
    - **Property 12: Backward Compatibility**
    - **Validates: Requirements 6.3, 6.4**

- [x] 4. Checkpoint - Ensure repository and validation tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Backend service layer - reminders
  - [x] 5.1 Add getLoanPaymentReminders to ReminderService
    - Query linked fixed expenses with due dates
    - Use existing calculateDaysUntilDue method
    - Check for existing loan payments to suppress reminders
    - Return overduePayments and dueSoonPayments arrays
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [x] 5.2 Extend getReminderStatus to include loan payment reminders
    - Add loanPaymentReminders to response object
    - _Requirements: 5.1, 5.4_
  
  - [x] 5.3 Write property test for reminder inclusion
    - **Property 5: Reminder Inclusion Based on Days Until Due**
    - **Validates: Requirements 3.1, 3.2**
  
  - [x] 5.4 Write property test for reminder content completeness
    - **Property 6: Reminder Content Completeness**
    - **Validates: Requirements 3.3**
  
  - [x] 5.5 Write property test for reminder suppression
    - **Property 7: Reminder Suppression When Payment Exists**
    - **Validates: Requirements 3.4**
  
  - [x] 5.6 Write property test for days until due consistency
    - **Property 8: Days Until Due Calculation Consistency**
    - **Validates: Requirements 3.5**

- [x] 6. Backend service layer - auto-logging
  - [x] 6.1 Create AutoPaymentLoggerService
    - Implement createPaymentFromFixedExpense method
    - Implement getPendingAutoLogSuggestions method
    - Add note indicating auto-logged source
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_
  
  - [x] 6.2 Write property test for auto-log suggestion eligibility
    - **Property 9: Auto-Log Suggestion Eligibility**
    - **Validates: Requirements 4.1**
  
  - [x] 6.3 Write property test for auto-logged payment attributes
    - **Property 10: Auto-Logged Payment Attributes**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.6**

- [x] 7. Backend controller and routes
  - [x] 7.1 Update FixedExpenseController
    - Handle new fields in create/update endpoints
    - Return loan details in GET responses
    - _Requirements: 1.4, 2.3, 6.4_
  
  - [x] 7.2 Add auto-log endpoint
    - Add POST /api/loans/:loanId/loan-payments/auto-log route
    - Implement controller method for auto-logging
    - _Requirements: 4.4_
  
  - [x] 7.3 Update API_ENDPOINTS in frontend config
    - Add LOAN_PAYMENT_AUTO_LOG endpoint
    - _Requirements: 4.4_

- [x] 8. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Frontend - Fixed Expenses Modal
  - [x] 9.1 Add payment_due_day field to FixedExpensesModal
    - Add number input for due day (1-31)
    - Add validation and error display
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 9.2 Add loan selection dropdown to FixedExpensesModal
    - Fetch active loans from API
    - Display grouped dropdown
    - Handle selection and clearing
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [x] 9.3 Update fixed expense list display
    - Show due day when configured
    - Show loan indicator for linked expenses
    - Show "Loan Paid Off" badge when applicable
    - _Requirements: 1.5, 2.5, 2.6_
  
  - [x] 9.4 Write property test for active loans filter
    - **Property 3: Active Loans Filter**
    - **Validates: Requirements 2.2**

- [x] 10. Frontend - Loan Payment Reminder Banner
  - [x] 10.1 Create LoanPaymentReminderBanner component
    - Similar structure to CreditCardReminderBanner
    - Display loan name, amount, days until due
    - Distinct visual style
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [x] 10.2 Integrate with App.jsx reminder section
    - Fetch loan payment reminders from API
    - Display alongside credit card reminders
    - Handle click navigation to loan detail
    - _Requirements: 5.1, 5.3, 5.4, 5.5_
  
  - [x] 10.3 Write property test for reminder badge count
    - **Property 11: Reminder Badge Count Accuracy**
    - **Validates: Requirements 5.4**

- [x] 11. Frontend - Auto-Log Prompt
  - [x] 11.1 Create AutoLogPrompt component
    - Modal/toast for auto-log confirmation
    - Show expense name, amount, loan name
    - Log Payment and Skip buttons
    - _Requirements: 4.4, 4.5_
  
  - [x] 11.2 Integrate auto-log flow with reminders
    - Check for pending auto-log suggestions on load
    - Show prompt when suggestions exist
    - Handle confirmation and dismissal
    - _Requirements: 4.1, 4.4, 4.5_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Integration testing
  - [x] 13.1 Write property test for loan linkage preservation
    - **Property 4: Loan Linkage Preservation on Paid-Off**
    - **Validates: Requirements 2.6**
  
  - [x] 13.2 Write integration test for end-to-end flow
    - Create linked fixed expense
    - Verify reminders appear
    - Auto-log payment
    - Verify reminder suppressed
    - _Requirements: 3.4, 4.4_

## Notes

- All tasks are required including property-based tests
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (minimum 100 iterations)
- Unit tests validate specific examples and edge cases
- Follow existing patterns from credit card reminder implementation
