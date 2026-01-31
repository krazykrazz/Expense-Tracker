# Implementation Plan: Configurable Payment Methods

## Overview

This implementation transforms the payment method system from a hardcoded enum to a database-driven configurable system. The approach is non-destructive - existing expense data remains unchanged while new tables are added for payment method configuration and credit card tracking.

## Tasks

- [x] 1. Database Schema and Migration
  - [x] 1.1 Create payment_methods table schema in migrations.js
    - Add table with type, display_name, full_name, account_details, credit_limit, current_balance, payment_due_day, billing_cycle_start, billing_cycle_end, is_active columns
    - Add indexes for type, display_name, is_active
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.7, 3A.1_
  
  - [x] 1.2 Create credit_card_payments table schema
    - Add table with payment_method_id, amount, payment_date, notes columns
    - Add foreign key to payment_methods with CASCADE DELETE
    - Add indexes for payment_method_id, payment_date
    - _Requirements: 3.4_
  
  - [x] 1.3 Create credit_card_statements table schema
    - Add table with payment_method_id, statement_date, statement_period_start, statement_period_end, filename, original_filename, file_path, file_size, mime_type columns
    - Add foreign key to payment_methods with CASCADE DELETE
    - _Requirements: 3B.3, 3B.4_
  
  - [x] 1.4 Implement payment method migration function
    - Use explicit mapping for existing enum values:
      - Cash → Cash (cash), id=1
      - Debit → Debit (debit), id=2
      - Cheque → Cheque (cheque), id=3
      - CIBC MC → CIBC MC / "CIBC Mastercard" (credit_card), id=4
      - PCF MC → PCF MC / "PCF Mastercard" (credit_card), id=5
      - WS VISA → WS VISA / "WealthSimple VISA" (credit_card), id=6
      - VISA → RBC VISA / "RBC VISA" (credit_card), id=7
    - Add payment_method_id column to expenses table as foreign key
    - Add payment_method_id column to fixed_expenses table as foreign key
    - Populate payment_method_id for all existing records based on method/payment_type string
    - Update expenses.method column where display name changes (VISA → RBC VISA)
    - Update fixed_expenses.payment_type column where display name changes
    - _Requirements: 6.1, 6.2, 6.4, 6.8, 6.9, 6.11_
  
  - [x] 1.5 Write property test for migration round-trip
    - **Property 12: Migration Round-Trip**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.7**
  
  - [x] 1.6 Write property test for migration idempotency
    - **Property 24: Migration Idempotency**
    - **Validates: Requirements 6A.4, 6A.5**
  
  - [x] 1.7 Update test database schema in db.js
    - Add payment_methods, credit_card_payments, credit_card_statements tables to createTestDatabase()
    - Add payment_method_id column to expenses table in test schema
    - Add payment_method_id column to fixed_expenses table in test schema
    - Ensure test schema matches production schema
    - _Requirements: 6A.1_

- [x] 2. Checkpoint - Database layer complete
  - Ensure migration runs successfully on existing database
  - Verify all tables created with correct schema
  - Ask the user if questions arise

- [x] 3. Backend Repository Layer
  - [x] 3.1 Create PaymentMethodRepository
    - Implement create, findAll (with type and activeOnly filters), findById, findByDisplayName, update, delete methods
    - Implement setActive for activating/deactivating payment methods
    - Implement countAssociatedExpenses (count from expenses where payment_method_id = id)
    - Implement getActivePaymentMethods for dropdown population
    - Implement updateBalance for credit card balance changes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  
  - [x] 3.2 Write property test for CRUD round-trip
    - **Property 3: Payment Method CRUD Round-Trip**
    - **Validates: Requirements 2.1**
  
  - [x] 3.3 Create CreditCardPaymentRepository
    - Implement create, findByPaymentMethodId, findByDateRange, delete methods
    - Implement getTotalPayments for sum calculation
    - _Requirements: 3.4, 3.5, 3.6_
  
  - [x] 3.4 Write property test for payment history ordering
    - **Property 10: Payment History Chronological Ordering**
    - **Validates: Requirements 3.5**
  
  - [x] 3.5 Create CreditCardStatementRepository
    - Implement create, findByPaymentMethodId, findById, delete methods
    - Handle file path management similar to invoiceRepository
    - _Requirements: 3B.3, 3B.4, 3B.5_

- [x] 4. Backend Service Layer
  - [x] 4.1 Create PaymentMethodService
    - Implement validatePaymentMethod with type-specific rules
    - Implement createPaymentMethod, updatePaymentMethod, deletePaymentMethod (only if no expenses)
    - Implement setPaymentMethodActive for activate/deactivate toggle
    - Implement getAllWithExpenseCounts
    - Implement getActivePaymentMethods for dropdown population
    - Implement isDisplayNameUnique validation (among active methods)
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 9.1, 9.2, 9.5, 9.6_
  
  - [x] 4.2 Write property test for type-specific validation
    - **Property 1: Type-Specific Validation Rules**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5**
  
  - [x] 4.3 Write property test for display name uniqueness
    - **Property 6: Display Name Uniqueness**
    - **Validates: Requirements 2.6, 9.5**
  
  - [x] 4.4 Create CreditCardPaymentService
    - Implement validatePayment
    - Implement recordPayment (creates payment and updates balance)
    - Implement getPaymentHistory
    - Implement getTotalPaymentsInRange
    - _Requirements: 3.2, 3.4, 3.5, 3.6, 9.4_
  
  - [x] 4.5 Write property test for payment reduces balance
    - **Property 7: Credit Card Payment Reduces Balance**
    - **Validates: Requirements 3.2**
  
  - [x] 4.6 Implement credit utilization calculation
    - Calculate utilization_percentage from balance and credit_limit
    - Calculate days_until_due from payment_due_day
    - Calculate current_cycle_spending from billing cycle dates
    - _Requirements: 3.8, 3.9, 3.10, 3A.2, 3A.5, 3B.1, 3B.2_
  
  - [x] 4.7 Write property test for utilization calculation
    - **Property 19: Credit Utilization Calculation**
    - **Validates: Requirements 3.7, 3.8**
  
  - [x] 4.8 Create CreditCardStatementService
    - Implement uploadStatement with file validation
    - Implement getStatements, downloadStatement, deleteStatement
    - Reuse file validation patterns from invoiceService
    - _Requirements: 3B.3, 3B.4, 3B.5_

- [x] 5. Checkpoint - Service layer complete
  - Run all property tests
  - Ensure all tests pass, ask the user if questions arise

- [x] 6. Backend Controller and Routes
  - [x] 6.1 Create PaymentMethodController
    - Implement getAll, getById, create, update, delete handlers
    - Implement getDisplayNames endpoint
    - Add proper error handling and validation
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 10.3_
  
  - [x] 6.2 Create CreditCardPaymentController
    - Implement recordPayment, getPayments, deletePayment handlers
    - Validate payment_method_id refers to a credit_card type
    - _Requirements: 3.2, 3.4, 3.5_
  
  - [x] 6.3 Create CreditCardStatementController
    - Implement uploadStatement, getStatements, downloadStatement, deleteStatement handlers
    - Use multer middleware for file uploads (similar to invoiceController)
    - _Requirements: 3B.3, 3B.4, 3B.5_
  
  - [x] 6.4 Create paymentMethodRoutes.js
    - Define all routes for payment methods, payments, and statements
    - Mount at /api/payment-methods
    - _Requirements: All API endpoints_
  
  - [x] 6.5 Register routes in server.js
    - Import and use paymentMethodRoutes
    - _Requirements: All API endpoints_

- [x] 7. Update Expense Service for Balance Tracking
  - [x] 7.1 Modify expenseService.createExpense
    - Accept payment_method_id instead of method string (with backward compatibility for string)
    - After creating expense, check if payment method is a credit_card type
    - If credit card, increment the current_balance by expense amount
    - _Requirements: 3.3, 10.1, 10.4_
  
  - [x] 7.2 Write property test for expense increases balance
    - **Property 8: Expense Increases Credit Card Balance**
    - **Validates: Requirements 3.3**
  
  - [x] 7.3 Modify expenseService.deleteExpense
    - If deleted expense used a credit card, decrement the balance
    - _Requirements: 3.3_
  
  - [x] 7.4 Update expense queries to join with payment_methods
    - Include payment method display_name and is_active in expense responses
    - _Requirements: 2.8_

- [x] 8. Update Backup Service
  - [x] 8.1 Add payment_methods to backup tables list
    - Include in backupService table enumeration
    - _Requirements: 11.1_
  
  - [x] 8.2 Add credit_card_payments to backup tables list
    - _Requirements: 11.2_
  
  - [x] 8.3 Add credit_card_statements to backup tables list
    - Include statement files in backup archive
    - _Requirements: 11.3_
  
  - [x] 8.4 Update restore logic to trigger migration if needed
    - Check if payment_methods table is empty after restore
    - If empty and expenses exist, run migration
    - _Requirements: 11.7_
  
  - [x] 8.5 Write property test for backup round-trip
    - **Property 23: Backup Includes Payment Methods**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5**

- [x] 9. Checkpoint - Backend complete
  - Test all API endpoints manually
  - Ensure all tests pass, ask the user if questions arise

- [x] 10. Frontend API Service
  - [x] 10.1 Add payment method endpoints to config.js
    - Add PAYMENT_METHODS, PAYMENT_METHOD_BY_ID, PAYMENT_METHOD_DISPLAY_NAMES
    - Add PAYMENT_METHOD_PAYMENTS, PAYMENT_METHOD_STATEMENTS
    - _Requirements: All API endpoints_
  
  - [x] 10.2 Create paymentMethodApi.js service
    - Implement getPaymentMethods, getPaymentMethod, createPaymentMethod, updatePaymentMethod, deletePaymentMethod
    - Implement getDisplayNames
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [x] 10.3 Create creditCardApi.js service
    - Implement recordPayment, getPayments, deletePayment
    - Implement uploadStatement, getStatements, downloadStatement, deleteStatement
    - _Requirements: 3.2, 3.4, 3B.3, 3B.4_

- [x] 11. Frontend Payment Methods Modal
  - [x] 11.1 Create PaymentMethodsModal.jsx component
    - Display list of payment methods grouped by type
    - Show expense count next to each method
    - Show current balance and utilization for credit cards
    - Add "Payment Methods" button to App.jsx toolbar
    - _Requirements: 8.1, 8.2, 8.6_
  
  - [x] 11.2 Create PaymentMethodsModal.css styles
    - Style list view with type grouping
    - Add utilization indicator colors (green/yellow/red)
    - _Requirements: 3.9, 3.10_
  
  - [x] 11.3 Create PaymentMethodForm.jsx component
    - Type selector dropdown
    - Type-specific form fields (show/hide based on type)
    - Validation for required fields
    - _Requirements: 8.3, 8.4, 9.1, 9.2_
  
  - [x] 11.4 Implement inline editing in PaymentMethodsModal
    - Edit button per payment method
    - Save/cancel actions
    - _Requirements: 8.5_
  
  - [x] 11.5 Implement activate/deactivate toggle
    - Add toggle button per payment method
    - Show warning when deactivating (expenses will show inactive indicator)
    - Prevent deactivating last active payment method
    - _Requirements: 2.4, 2.5_
  
  - [x] 11.6 Implement delete for zero-expense payment methods
    - Show delete button only for payment methods with zero expenses
    - Confirmation dialog before deletion
    - _Requirements: 2.3, 2.7_

- [x] 12. Frontend Credit Card Features
  - [x] 12.1 Create CreditCardPaymentForm.jsx component
    - Amount, date, notes fields
    - Validation for positive amount
    - _Requirements: 8.7, 8.8, 9.4_
  
  - [x] 12.2 Create CreditCardDetailView.jsx component
    - Display balance, limit, utilization
    - Payment history list
    - Statement upload/list
    - Days until due indicator
    - _Requirements: 3.1, 3.5, 3.8, 3.9, 3.10, 3A.5, 3B.5_
  
  - [x] 12.3 Create CreditCardStatementUpload.jsx component
    - File upload with drag-and-drop
    - Statement period date pickers
    - Reuse patterns from InvoiceUpload component
    - _Requirements: 3B.3_

- [x] 13. Update Expense Form Integration
  - [x] 13.1 Modify ExpenseForm.jsx to fetch payment methods from API
    - Replace hardcoded PAYMENT_METHODS with API call to get active payment methods
    - Group methods by type in dropdown
    - Store payment_method_id instead of method string when creating expenses
    - _Requirements: 4.1, 4.2, 4.5_
  
  - [x] 13.2 Handle empty payment methods state
    - Show prompt to create payment method if none exist
    - _Requirements: 4.4_
  
  - [x] 13.3 Update expense display to show payment method name from ID
    - Join with payment_methods table to get display_name
    - Show inactive indicator for expenses using inactive payment methods
    - _Requirements: 2.8_
  
  - [x] 13.4 Write property test for expense filtering by method
    - **Property 14: Expense Filtering By Method**
    - **Validates: Requirements 7.2**
  
  - [x] 13.5 Update ExpenseList.jsx filter dropdown
    - Replace hardcoded PAYMENT_METHODS in filter dropdown with API call
    - Fetch all payment methods (including inactive) for filtering historical data
    - Show inactive indicator next to inactive payment methods in filter
    - _Requirements: 4.1, 7.2_
  
  - [x] 13.6 Update App.jsx global filter integration
    - Modify handleFilterMethodChange to validate against API-fetched methods
    - Update filterMethod state to store payment_method_id instead of string
    - Ensure filter persists correctly across page navigation
    - _Requirements: 7.2_
  
  - [x] 13.7 Update localStorage payment method persistence
    - Change localStorage to store payment_method_id instead of method string
    - Add migration logic for existing localStorage values (map string to ID)
    - Update lastPaymentMethod storage in ExpenseForm
    - _Requirements: 4.3_
  
  - [x] 13.8 Handle edit mode with inactive payment methods
    - When editing expense with inactive payment method, show it in dropdown (disabled for new selection)
    - Allow saving without changing payment method
    - Show warning that payment method is inactive
    - _Requirements: 2.8, 4.1_

- [x] 14. Update Fixed Expenses Integration
  - [x] 14.1 Modify FixedExpensesModal.jsx to use payment methods API
    - Replace hardcoded payment types with API call
    - Use same dropdown as expense form (active payment methods only)
    - Show warning indicator for fixed expenses using inactive payment methods
    - _Requirements: 5.1, 5.4_
  
  - [x] 14.2 Write property test for inactive payment methods hidden from dropdowns
    - **Property 5: Inactive Payment Methods Hidden From Dropdowns**
    - **Validates: Requirements 2.4, 2.5, 2.8**

- [x] 15. Update Summary Panel and Analytics
  - [x] 15.1 Update SummaryPanel to use payment method display names
    - Ensure spending by method still works with new system
    - _Requirements: 7.1, 7.4_
  
  - [x] 15.2 Update expense filtering to support type filter
    - Add payment method type filter option
    - _Requirements: 7.3_
  
  - [x] 15.3 Verify merchant analytics service compatibility
    - Ensure merchantAnalyticsService works with payment_method_id
    - Update any queries that reference expenses.method directly
    - _Requirements: 7.1_
  
  - [x] 15.4 Verify TaxDeductible.jsx component compatibility
    - Ensure tax deductible view displays payment method names correctly
    - Update any direct references to method string
    - _Requirements: 7.1_

- [x] 16. Payment Due Date Reminders
  - [x] 16.1 Integrate credit card due dates with reminder system
    - Add credit card payment reminders to reminderService
    - Show reminders when payment due within 7 days
    - _Requirements: 3A.3, 3A.4_

- [x] 17. Final Checkpoint
  - Run all tests (unit and property-based)
  - Test full user flow: create payment method → add expense → view balance → log payment
  - Test migration on database with existing expenses
  - Ensure all tests pass, ask the user if questions arise

- [x] 18. Cleanup and Documentation
  - [x] 18.1 Deprecate hardcoded PAYMENT_METHODS constants
    - Add deprecation comment to backend/utils/constants.js PAYMENT_METHODS
    - Add deprecation comment to frontend/src/utils/constants.js PAYMENT_METHODS (if exists)
    - Remove usage from all components (replaced by API calls)
    - _Requirements: 4.1_
  
  - [x] 18.2 Update test data seeding scripts
    - Update backend/scripts/seedTestData.js to create payment_methods records
    - Ensure seeded expenses reference valid payment_method_id values
    - _Requirements: 6A.1_
  
  - [x] 18.3 Update API documentation
    - Add payment methods endpoints to docs/API_DOCUMENTATION.md
    - Document request/response formats for all new endpoints
    - Document migration behavior and backward compatibility
    - _Requirements: 10.3_

## Notes

- All tasks including property-based tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Migration is designed to be non-destructive - existing expense data remains unchanged
- Tasks 13.5-13.8, 15.3-15.4, and 18 were added after gap analysis to ensure complete coverage
- Category suggestion service (categorySuggestionService.js) is out of scope - it uses place names, not payment methods
