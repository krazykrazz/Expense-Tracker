# Implementation Plan: Recurring Expenses v2 (Add to Future Months)

## Overview

This implementation adds an "Add to future months" feature to the expense form, allowing users to create duplicate expense entries in future months when creating or editing an expense. The implementation follows the existing layered architecture (Controller → Service → Repository) and integrates with the existing expense and budget systems.

## Tasks

- [x] 1. Implement backend date calculation utility
  - [x] 1.1 Create `_calculateFutureDate` function in expenseService.js
    - Implement date calculation that preserves day of month
    - Handle month-end edge cases (day 31 → shorter months)
    - Handle leap year edge cases (Feb 29)
    - _Requirements: 1.5, 1.6_
  
  - [x] 1.2 Write property test for date calculation
    - **Property 3: Date Calculation Correctness**
    - **Validates: Requirements 1.5, 1.6**

- [x] 2. Implement backend future expense creation logic
  - [x] 2.1 Modify `createExpense` in expenseService.js to accept `futureMonths` parameter
    - Add futureMonths validation (0-12)
    - Create source expense first
    - Loop to create future expenses with calculated dates
    - Copy people allocations for medical expenses
    - Do NOT copy invoices
    - Trigger budget recalculation for each future expense
    - Return response with source expense and futureExpenses array
    - _Requirements: 1.3, 1.4, 1.8, 1.9, 5.1, 5.2_
  
  - [x] 2.2 Write property test for future expense count
    - **Property 1: Future Expense Count**
    - **Validates: Requirements 1.3**
  
  - [x] 2.3 Write property test for field consistency
    - **Property 2: Field Consistency**
    - **Validates: Requirements 1.4, 2.4**
  
  - [x] 2.4 Write property test for budget integration
    - **Property 7: Budget Integration**
    - **Validates: Requirements 5.1, 5.2**

- [x] 3. Implement backend update with future months
  - [x] 3.1 Modify `updateExpense` in expenseService.js to accept `futureMonths` parameter
    - Update existing expense with new values
    - Create new future expenses with updated values (not modify existing)
    - Copy people allocations for medical expenses
    - Do NOT copy invoices
    - _Requirements: 2.3, 2.4_
  
  - [x] 3.2 Write property test for edit creates new futures
    - **Property 4: Edit Creates New Future Expenses**
    - **Validates: Requirements 2.3**

- [x] 4. Checkpoint - Backend logic complete
  - Ensure all backend tests pass, ask the user if questions arise.

- [x] 5. Update expense controller
  - [x] 5.1 Modify `createExpense` in expenseController.js
    - Extract `futureMonths` from request body
    - Pass to service layer
    - Format response with futureExpenses array and success message
    - _Requirements: 1.3, 4.1, 4.2_
  
  - [x] 5.2 Modify `updateExpense` in expenseController.js
    - Extract `futureMonths` from request body
    - Pass to service layer
    - Format response with futureExpenses array and success message
    - _Requirements: 2.3, 4.1, 4.2_
  
  - [x] 5.3 Write unit tests for controller changes
    - Test futureMonths parameter handling
    - Test response format with futureExpenses
    - Test success message generation
    - _Requirements: 4.1, 4.2_

- [x] 6. Update frontend expense API
  - [x] 6.1 Modify `createExpense` in expenseApi.js
    - Add `futureMonths` parameter to request
    - Handle new response format with futureExpenses
    - _Requirements: 1.3_
  
  - [x] 6.2 Modify `updateExpense` in expenseApi.js
    - Add `futureMonths` parameter to request
    - Handle new response format with futureExpenses
    - _Requirements: 2.3_

- [x] 7. Update ExpenseForm component
  - [x] 7.1 Add "Add to future months" dropdown to ExpenseForm.jsx
    - Add `futureMonths` state (default 0)
    - Create dropdown with options 0-12
    - Show date range preview when > 0 selected
    - Reset to 0 after successful submission
    - _Requirements: 1.1, 1.2, 1.7, 2.1, 2.2_
  
  - [x] 7.2 Add CSS styling for the new dropdown
    - Style consistent with existing form elements
    - Style date range preview text
    - _Requirements: 1.1, 2.1_
  
  - [x] 7.3 Implement success message display
    - Show count of future expenses created
    - Show date range (e.g., "through September 2025")
    - _Requirements: 4.1, 4.2_
  
  - [x] 7.4 Write unit tests for ExpenseForm changes
    - Test dropdown renders with correct options
    - Test default value is 0
    - Test date range preview display
    - Test reset after submission
    - _Requirements: 1.1, 1.2, 1.7_

- [x] 8. Checkpoint - Feature complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement atomicity and independence tests
  - [x] 9.1 Write property test for expense independence
    - **Property 5: Expense Independence**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
  
  - [x] 9.2 Write property test for creation atomicity
    - **Property 6: Creation Atomicity**
    - **Validates: Requirements 4.3**

- [x] 10. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including property-based tests are required
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- No database schema changes required - future expenses use existing expenses table
- People allocations are copied for medical expenses, invoices are not
