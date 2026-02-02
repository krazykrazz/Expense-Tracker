# Implementation Plan: Fixed Interest Rate Loans

## Overview

This implementation plan adds fixed interest rate support for loans of type "loan". The work is organized to build incrementally: database schema first, then backend logic, then frontend UI, with testing integrated throughout.

## Tasks

- [x] 1. Database schema and migration
  - [x] 1.1 Add migration for fixed_interest_rate column
    - Create migration in `backend/database/migrations.js` to add `fixed_interest_rate REAL DEFAULT NULL` column to loans table
    - Use `ALTER TABLE loans ADD COLUMN` approach (simple column addition, no table recreation needed)
    - Follow migration pattern with `checkMigrationApplied()` and `recordMigration()`
    - _Requirements: 1.1, 1.5_
  
  - [x] 1.2 Update test database schema
    - Update `createTestDatabase()` in `backend/database/db.js` to include `fixed_interest_rate` column in loans table
    - Ensure test schema matches production schema
    - _Requirements: 1.1_

- [x] 2. Backend repository layer
  - [x] 2.1 Update loanRepository.js for fixed_interest_rate
    - Modify `create()` to include `fixed_interest_rate` in INSERT statement
    - Modify `update()` to include `fixed_interest_rate` in UPDATE statement
    - Modify `getAllWithCurrentBalances()` to include `fixed_interest_rate` in SELECT
    - Modify `getLoansForMonth()` to include `fixed_interest_rate` in SELECT
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [x] 2.2 Write property test for loan type restriction
    - **Property 1: Loan Type Restriction**
    - **Validates: Requirements 1.2, 1.3, 4.5**

- [x] 3. Backend service layer
  - [x] 3.1 Update loanService.js validation
    - Add validation in `validateLoan()` for `fixed_interest_rate`:
      - Must be >= 0 if provided
      - Only allowed when `loan_type === 'loan'`
    - Update `createLoan()` to include `fixed_interest_rate` (only for loan_type='loan')
    - Update `updateLoan()` to include `fixed_interest_rate` (only for loan_type='loan')
    - _Requirements: 1.2, 1.3, 1.4, 4.3_
  
  - [x] 3.2 Write property test for non-negative rate validation
    - **Property 2: Non-Negative Rate Validation**
    - **Validates: Requirements 1.4, 4.3**

- [x] 4. Balance entry auto-population
  - [x] 4.1 Update balance entry creation to support auto-population
    - Modify balance creation endpoint in `backend/controllers/loanController.js` to:
      - Fetch the loan to check for `fixed_interest_rate`
      - If loan has `fixed_interest_rate` and no rate provided, use `fixed_interest_rate`
      - If loan has no `fixed_interest_rate` and no rate provided, return validation error
    - _Requirements: 2.2, 5.4, 5.5_
  
  - [x] 4.2 Write property test for auto-population round trip
    - **Property 3: Auto-Population Round Trip**
    - **Validates: Requirements 2.2, 5.4**
  
  - [x] 4.3 Write property test for variable rate requires explicit rate
    - **Property 4: Variable Rate Requires Explicit Rate**
    - **Validates: Requirements 2.3, 5.5, 6.3**

- [x] 5. Checkpoint - Backend complete
  - Ensure all backend tests pass, ask the user if questions arise.

- [x] 6. Frontend loan form updates
  - [x] 6.1 Update LoansModal.jsx for fixed rate input
    - Add `fixed_interest_rate` to form state (default empty string)
    - Add conditional input field for fixed interest rate (only when `loan_type === 'loan'`)
    - Add validation for non-negative number
    - Include `fixed_interest_rate` in create/update API calls (convert to number or null)
    - _Requirements: 4.1, 4.2, 4.4, 4.5_
  
  - [x] 6.2 Write unit test for LoansModal fixed rate field
    - Test conditional rendering based on loan_type
    - Test validation of fixed rate input
    - _Requirements: 4.1, 4.5_

- [x] 7. Frontend balance entry form updates
  - [x] 7.1 Update LoanDetailView.jsx balance entry form
    - Modify balance entry form to conditionally hide rate input when loan has `fixed_interest_rate`
    - Display "Fixed Rate: X%" indicator when rate is fixed
    - Remove rate validation requirement when loan has fixed rate
    - Update `handleAddBalance()` to not send rate when loan has fixed rate
    - _Requirements: 2.1, 2.4, 2.5_
  
  - [x] 7.2 Write unit test for balance entry form
    - Test conditional rendering of rate input
    - Test fixed rate indicator display
    - _Requirements: 2.1, 2.5_

- [x] 8. Frontend balance history display updates
  - [x] 8.1 Update LoanDetailView.jsx balance history table
    - Conditionally hide "Rate Change" column when loan has `fixed_interest_rate`
    - Keep "Interest Rate" column visible (showing the fixed rate)
    - Add "Fixed Rate" badge/indicator in the loan summary section
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [x] 8.2 Write unit test for balance history display
    - Test conditional column visibility
    - Test fixed rate indicator
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 9. Checkpoint - Frontend complete
  - Ensure all frontend tests pass, ask the user if questions arise.

- [x] 10. Integration and backward compatibility
  - [x] 10.1 Write property test for API round trip preservation
    - **Property 5: API Round Trip Preservation**
    - **Validates: Requirements 5.1, 5.2, 5.3**
  
  - [x] 10.2 Write property test for existing balance entries unchanged
    - **Property 6: Existing Balance Entries Unchanged**
    - **Validates: Requirements 4.6, 6.2**
  
  - [x] 10.3 Write property test for backward compatibility
    - **Property 7: Backward Compatibility**
    - **Validates: Requirements 6.1, 6.4**

- [x] 11. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required including property-based tests and unit tests
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The migration is a simple column addition (no table recreation needed), so foreign key cascade issues don't apply
