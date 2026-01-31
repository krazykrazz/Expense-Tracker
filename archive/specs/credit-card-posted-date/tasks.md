# Implementation Plan: Credit Card Posted Date

## Overview

This implementation adds an optional `posted_date` field to expenses for distinguishing between transaction date and credit card posting date. The implementation follows the existing layered architecture and maintains full backward compatibility.

## Tasks

- [x] 1. Database schema and migration
  - [x] 1.1 Add migration function `migrateAddPostedDate` to `backend/database/migrations.js`
    - Add `posted_date TEXT DEFAULT NULL` column to expenses table
    - Create index `idx_expenses_posted_date` on the new column
    - Use ALTER TABLE (no table recreation needed since just adding nullable column)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [x] 1.2 Update `initializeTestDatabase()` in `backend/database/db.js` to include posted_date column
    - Ensure test schema matches production schema
    - _Requirements: 3.1_
  
  - [x] 1.3 Write property test for migration data preservation
    - **Property 5: Migration Data Preservation**
    - **Validates: Requirements 3.2, 3.3, 5.2**

- [x] 2. Backend service layer updates
  - [x] 2.1 Add `validatePostedDate` method to `backend/services/expenseService.js`
    - Validate format is YYYY-MM-DD or NULL
    - Validate posted_date >= date (transaction date)
    - Return descriptive error messages
    - _Requirements: 4.4, 4.5, 4.6, 4.7_
  
  - [x] 2.2 Update `_createSingleExpense` and `updateExpense` methods to handle posted_date
    - Call validatePostedDate before creating/updating
    - Include posted_date in expense object passed to repository
    - _Requirements: 4.1, 4.2_
  
  - [x] 2.3 Write property test for posted date validation
    - **Property 9: Posted Date Ordering Validation**
    - **Validates: Requirements 4.5, 4.6**

- [x] 3. Credit card balance calculation update
  - [x] 3.1 Update `_calculateDynamicBalance` in `backend/services/paymentMethodService.js`
    - Change query from `date <= ?` to `COALESCE(posted_date, date) <= ?`
    - _Requirements: 2.1, 2.2_
  
  - [x] 3.2 Update `recalculateBalance` method to use same COALESCE logic
    - Ensure consistency between dynamic and recalculated balance
    - _Requirements: 2.1, 2.2_
  
  - [x] 3.3 Write property test for balance COALESCE behavior
    - **Property 2: Balance Calculation Uses Effective Posting Date**
    - **Validates: Requirements 1.2, 1.3, 2.1, 5.1, 5.3**
  
  - [x] 3.4 Write property test for balance date filtering
    - **Property 3: Balance Date Filtering**
    - **Validates: Requirements 2.2, 2.3, 2.4**

- [x] 4. Repository layer updates
  - [x] 4.1 Update `backend/repositories/expenseRepository.js` create method
    - Include posted_date in INSERT statement
    - _Requirements: 4.1_
  
  - [x] 4.2 Update expenseRepository update method
    - Include posted_date in UPDATE statement
    - _Requirements: 4.2_
  
  - [x] 4.3 Verify findById and findAll return posted_date
    - Ensure SELECT statements include posted_date column
    - _Requirements: 4.3_
  
  - [x] 4.4 Write property test for API round-trip
    - **Property 6 & 7: API Posted Date Acceptance and Response**
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 5. Checkpoint - Backend complete
  - Ensure all backend tests pass, ask the user if questions arise.

- [x] 6. Frontend ExpenseForm updates
  - [x] 6.1 Add posted_date state and handler to `frontend/src/components/ExpenseForm.jsx`
    - Initialize from expense prop when editing
    - Add onChange handler for posted_date input
    - _Requirements: 1.5, 6.3_
  
  - [x] 6.2 Add conditional rendering for posted_date field
    - Show field only when selected payment method type is 'credit_card'
    - Hide field when switching away from credit card
    - _Requirements: 1.1, 6.1, 6.4, 6.5_
  
  - [x] 6.3 Add client-side validation for posted_date
    - Validate posted_date >= date before submission
    - Show inline error message if invalid
    - _Requirements: 4.5_
  
  - [x] 6.4 Include posted_date in form submission
    - Add to expenseFormData object
    - Send to API in create/update calls
    - _Requirements: 4.1, 4.2_
  
  - [x] 6.5 Add placeholder text and styling for posted_date field
    - Display "Uses transaction date" as placeholder
    - Add form-hint text explaining the field
    - _Requirements: 6.2_
  
  - [x] 6.6 Write property test for posted date field visibility
    - **Property 1: Posted Date Field Visibility**
    - **Validates: Requirements 1.1, 6.1, 6.4, 6.5**

- [x] 7. Frontend API integration
  - [x] 7.1 Update `frontend/src/services/expenseApi.js` to include posted_date
    - Add posted_date to createExpense request body
    - Add posted_date to updateExpense request body
    - _Requirements: 4.1, 4.2_

- [x] 8. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including property-based tests are required
- Each task references specific requirements for traceability
- The migration uses ALTER TABLE (not table recreation) since we're only adding a nullable column
- No changes needed to expense list display - posted_date is only used for balance calculation
- Property tests use fast-check library with minimum 100 iterations
