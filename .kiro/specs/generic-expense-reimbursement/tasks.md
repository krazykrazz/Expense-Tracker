# Implementation Plan: Generic Expense Reimbursement Tracking

## Overview

This implementation extends the existing expense reimbursement capability to all expense types by adding a reimbursement field to the expense form and a visual indicator in the expense list. The implementation leverages the existing `original_cost` database column, requiring no schema changes.

## Tasks

- [ ] 1. Backend: Add reimbursement validation and data transformation
  - [ ] 1.1 Add validateReimbursement method to ExpenseService
    - Add validation that reimbursement is non-negative
    - Add validation that reimbursement does not exceed expense amount
    - _Requirements: 1.3_
  
  - [ ] 1.2 Write property test for reimbursement validation
    - **Property 1: Reimbursement Validation**
    - Generate random amounts and reimbursements
    - Verify validation rejects reimbursement > amount
    - **Validates: Requirements 1.3**
  
  - [ ] 1.3 Modify createExpense to handle reimbursement field
    - When reimbursement > 0: set original_cost = amount, amount = amount - reimbursement
    - When reimbursement = 0 or null: leave original_cost as NULL
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [ ] 1.4 Modify updateExpense to handle reimbursement field
    - Support adding, modifying, and removing reimbursements
    - When clearing reimbursement: set original_cost = NULL
    - _Requirements: 2.4, 6.2, 6.3_
  
  - [ ] 1.5 Write property test for data storage consistency
    - **Property 2: Data Storage Consistency**
    - Create expense with reimbursement, verify original_cost and amount are correct
    - **Validates: Requirements 2.1, 2.2, 2.3**

- [ ] 2. Checkpoint - Backend validation complete
  - Ensure all backend tests pass, ask the user if questions arise.

- [ ] 3. Frontend: Create ReimbursementIndicator component
  - [ ] 3.1 Create ReimbursementIndicator.jsx component
    - Display 💰 icon when original_cost is set and differs from amount
    - Show tooltip with breakdown (Charged, Reimbursed, Net)
    - Support small and medium sizes
    - _Requirements: 5.1, 5.2_
  
  - [ ] 3.2 Create ReimbursementIndicator.css styles
    - Style indicator similar to InsuranceStatusIndicator
    - Add hover effects for tooltip
    - _Requirements: 5.1_
  
  - [ ] 3.3 Write property test for indicator display logic
    - **Property 5: Reimbursement Indicator Display**
    - Generate expenses with and without original_cost
    - Verify indicator shows only when original_cost differs from amount
    - **Validates: Requirements 5.1, 7.2**

- [ ] 4. Frontend: Add reimbursement field to ExpenseForm
  - [ ] 4.1 Add reimbursement state and handlers to ExpenseForm
    - Add reimbursementAmount state variable
    - Add handleReimbursementChange handler
    - Calculate reimbursement from original_cost - amount when editing
    - _Requirements: 1.1, 6.1_
  
  - [ ] 4.2 Add reimbursement UI section to ExpenseForm
    - Show reimbursement input field for non-medical expenses (or medical without insurance)
    - Hide for medical expenses with insurance tracking enabled
    - Add preview showing Charged/Reimbursed/Net breakdown
    - _Requirements: 1.1, 1.2, 1.4, 1.5_
  
  - [ ] 4.3 Add reimbursement validation to form submission
    - Validate reimbursement does not exceed amount
    - Transform data before API call (calculate original_cost and net amount)
    - _Requirements: 1.3_
  
  - [ ] 4.4 Update expenseApi.js to include reimbursement in requests
    - Add reimbursement field to createExpense and updateExpense API calls
    - _Requirements: 2.1, 2.2_
  
  - [ ] 4.5 Write property test for edit round-trip consistency
    - **Property 6: Edit Round-Trip Consistency**
    - Create expense with reimbursement, edit and save without changes
    - Verify original_cost and amount are preserved
    - **Validates: Requirements 6.1, 6.2**

- [ ] 5. Frontend: Integrate ReimbursementIndicator into ExpenseList
  - [ ] 5.1 Add ReimbursementIndicator to expense row in ExpenseList
    - Show indicator for non-medical expenses with original_cost set
    - Position in expense-indicators div alongside other indicators
    - _Requirements: 5.1, 5.3_
  
  - [ ] 5.2 Write unit tests for ExpenseList reimbursement display
    - Test indicator appears for reimbursed expenses
    - Test indicator hidden for non-reimbursed expenses
    - Test correct amount displayed (net amount)
    - _Requirements: 5.1, 5.3, 7.2_

- [ ] 6. Checkpoint - Core functionality complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Add CSS styles for reimbursement UI
  - [ ] 7.1 Add reimbursement section styles to ExpenseForm.css
    - Style reimbursement input field
    - Style preview breakdown display
    - _Requirements: 1.4_
  
  - [ ] 7.2 Add reimbursement indicator styles to ExpenseList.css
    - Style indicator positioning in expense row
    - _Requirements: 5.1_

- [ ] 8. Final checkpoint - All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including property-based tests are required
- No database migration required - uses existing `original_cost` column
- Credit card balance calculation already uses `COALESCE(original_cost, amount)` pattern
- Medical expenses with insurance tracking enabled use their own specialized UI
