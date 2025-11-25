# Implementation Plan

- [x] 1. Create database migration for category and payment_type fields





  - Add migration function to `backend/database/migrations.js`
  - Add category column with default value 'Other'
  - Add payment_type column with default value 'Debit'
  - Check for existing columns before adding
  - Register migration in migrations array
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 1.1 Write property test for migration data preservation


  - **Property 5: Migration preserves existing data**
  - **Validates: Requirements 3.4**

- [x] 2. Update backend repository layer






  - [x] 2.1 Update FixedExpenseRepository to handle new fields

    - Modify `getFixedExpenses` to select category and payment_type
    - Modify `createFixedExpense` to insert category and payment_type
    - Modify `updateFixedExpense` to update category and payment_type
    - _Requirements: 1.3, 2.3_


  - [x] 2.2 Add category and payment type query methods

    - Implement `getFixedExpensesByCategory` method
    - Implement `getFixedExpensesByPaymentType` method
    - Implement `getCategoryTotals` method
    - Implement `getPaymentTypeTotals` method
    - _Requirements: 7.1, 7.2, 8.1, 8.2_


- [x] 2.3 Write property tests for repository operations

  - **Property 2: Fixed expense storage round trip preserves category**
  - **Validates: Requirements 1.3**
  - **Property 4: Fixed expense storage round trip preserves payment type**
  - **Validates: Requirements 2.3**

- [x] 3. Update backend service layer





  - [x] 3.1 Update FixedExpenseService validation


    - Add category validation (required, must be in CATEGORIES list)
    - Add payment_type validation (required, must be in valid payment types)
    - Update error messages for new validations
    - _Requirements: 1.2, 2.2, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 3.2 Update service methods to pass new fields


    - Update `createFixedExpense` to pass category and payment_type
    - Update `updateFixedExpense` to pass category and payment_type
    - Ensure carry forward includes new fields
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 3.3 Write property tests for validation


  - **Property 1: Category validation rejects invalid categories**
  - **Validates: Requirements 1.2**
  - **Property 3: Payment type validation rejects invalid payment types**
  - **Validates: Requirements 2.2**
  - **Property 11: Validation requires non-empty category**
  - **Validates: Requirements 6.1, 6.3**
  - **Property 12: Validation requires non-empty payment type**
  - **Validates: Requirements 6.2, 6.4**

- [x] 3.4 Write property test for carry forward


  - **Property 6: Carry forward copies all fields**
  - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 4. Update ExpenseService for aggregation





  - [x] 4.1 Update category aggregation methods


    - Modify `getExpensesByCategory` to include fixed expenses
    - Update `getMonthlySummary` to include fixed expenses in category totals
    - Return separate regular and fixed expense arrays with combined total
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 4.2 Update payment type aggregation methods


    - Modify `getExpensesByPaymentMethod` to include fixed expenses
    - Update `getMonthlySummary` to include fixed expenses in payment type totals
    - Return separate regular and fixed expense arrays with combined total
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 4.3 Write property tests for aggregation


  - **Property 7: Category totals include fixed expenses**
  - **Validates: Requirements 7.1, 7.2**
  - **Property 8: Payment type totals include fixed expenses**
  - **Validates: Requirements 8.1, 8.2**
  - **Property 9: Adding fixed expense updates category totals**
  - **Validates: Requirements 7.5**
  - **Property 10: Adding fixed expense updates payment type totals**
  - **Validates: Requirements 8.5**

- [x] 5. Update frontend constants and utilities





  - Add PAYMENT_METHODS constant to `frontend/src/utils/constants.js` if not present
  - Ensure CATEGORIES is exported and available
  - _Requirements: 1.5, 2.5_

- [x] 6. Update FixedExpensesModal component





  - [x] 6.1 Add state for new fields


    - Add state for newExpenseCategory and newExpensePaymentType
    - Add state for editCategory and editPaymentType
    - _Requirements: 1.1, 2.1_

  - [x] 6.2 Update add form UI


    - Add category dropdown with CATEGORIES options
    - Add payment type dropdown with PAYMENT_METHODS options
    - Update form layout to accommodate new fields
    - _Requirements: 1.1, 2.1_

  - [x] 6.3 Update list display


    - Display category for each fixed expense item
    - Display payment type for each fixed expense item
    - Update CSS grid layout for new columns
    - _Requirements: 4.1, 4.2, 4.5_

  - [x] 6.4 Update edit mode UI


    - Add category dropdown in edit form
    - Add payment type dropdown in edit form
    - Pre-populate dropdowns with current values
    - _Requirements: 1.1, 2.1_

  - [x] 6.5 Update validation logic


    - Validate category is selected before adding
    - Validate payment type is selected before adding
    - Display error messages for missing fields
    - _Requirements: 6.1, 6.2, 6.5_

  - [x] 6.6 Update API calls

    - Include category and payment_type in create requests
    - Include category and payment_type in update requests
    - Handle new fields in response data
    - _Requirements: 1.3, 2.3_

- [x] 7. Update FixedExpensesModal styling





  - Update CSS grid layout for 5-column display (name, category, payment, amount, actions)
  - Style category and payment type fields consistently
  - Ensure responsive design works with new fields
  - Add styles for dropdown selects
  - _Requirements: 4.3, 4.4_

- [x] 8. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Integration testing





  - Test creating fixed expense with category and payment type via API
  - Test fixed expenses appear in category breakdowns
  - Test fixed expenses appear in payment type breakdowns
  - Test carry forward preserves all fields
  - Test migration with existing data
  - Test UI displays and edits new fields correctly
