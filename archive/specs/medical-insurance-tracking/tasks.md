# Implementation Plan: Medical Insurance Tracking

## Overview

This implementation plan adds insurance tracking capabilities to medical expenses. The work is organized into database migration, backend API extensions, frontend components, and testing phases. Each task builds incrementally on previous work.

## Tasks

- [x] 1. Database Schema Migration
  - [x] 1.1 Create migration for expenses table insurance fields
    - Add `insurance_eligible` INTEGER DEFAULT 0
    - Add `claim_status` TEXT DEFAULT NULL with CHECK constraint
    - Add `original_cost` REAL DEFAULT NULL
    - Set existing medical expenses: insurance_eligible=0, original_cost=amount
    - Include backup creation before migration
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [x] 1.2 Create migration for expense_people table
    - Add `original_amount` REAL DEFAULT NULL column
    - Set existing allocations: original_amount=amount
    - _Requirements: 4.2, 8.1_

- [x] 2. Backend Repository Layer
  - [x] 2.1 Extend ExpenseRepository with insurance methods
    - Add `updateInsuranceFields(id, insuranceData)` method
    - Extend `getTaxDeductibleExpenses` to include insurance fields
    - Add `getExpensesByClaimStatus(year, status)` method
    - _Requirements: 1.3, 2.3, 6.5, 7.4_
  
  - [x] 2.2 Write property test for insurance data persistence
    - **Property 3: Insurance Data Persistence Round-Trip**
    - **Validates: Requirements 1.3, 2.3, 5.4**
  
  - [x] 2.3 Extend ExpensePeopleRepository for original_amount
    - Update `createAssociations` to accept original_amount
    - Update `updateExpenseAllocations` to handle original_amount
    - Update `getPeopleForExpense` to return original_amount
    - _Requirements: 4.1, 4.2_

- [x] 3. Backend Service Layer
  - [x] 3.1 Add insurance validation to ExpenseService
    - Add `validateInsuranceData(insuranceData, expenseAmount)` method
    - Validate claim_status enum values
    - Validate amount <= original_cost
    - Validate person allocations
    - _Requirements: 2.2, 3.5, 4.4_
  
  - [x] 3.2 Write property test for claim status enum validation
    - **Property 4: Claim Status Enum Validation**
    - **Validates: Requirements 2.2**
  
  - [x] 3.3 Write property test for amount validation invariant
    - **Property 5: Amount Validation Invariant**
    - **Validates: Requirements 3.5, 4.4**
  
  - [x] 3.4 Extend ExpenseService for insurance operations
    - Add `updateInsuranceStatus(id, status)` method for quick updates
    - Add `updateInsuranceEligibility(id, eligible, originalCost)` method
    - Extend `createExpense` to handle insurance fields
    - Extend `updateExpense` to handle insurance fields
    - Apply defaults when insurance_eligible is set to true
    - _Requirements: 1.2, 1.3, 2.3, 2.4, 2.5, 5.4_
  
  - [x] 3.5 Write property test for insurance data defaults
    - **Property 2: Insurance Data Defaults**
    - **Validates: Requirements 1.2, 2.4, 2.5**
  
  - [x] 3.6 Extend getTaxDeductibleSummary for insurance totals
    - Calculate total original costs
    - Calculate total out-of-pocket amounts
    - Calculate total reimbursements
    - Group by claim status
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  
  - [x] 3.7 Write property test for reimbursement calculation
    - **Property 6: Reimbursement Calculation**
    - **Validates: Requirements 3.6**
  
  - [x] 3.8 Write property test for insurance totals aggregation
    - **Property 8: Insurance Totals Aggregation**
    - **Validates: Requirements 6.3, 6.4**

- [x] 4. Checkpoint - Backend Complete
  - Ensure all backend tests pass, ask the user if questions arise.

- [x] 5. Backend Controller Layer
  - [x] 5.1 Add insurance status update endpoint
    - Create PATCH `/api/expenses/:id/insurance-status` endpoint
    - Accept `{ status: string }` body
    - Return updated expense
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [x] 5.2 Extend expense endpoints for insurance fields
    - Update POST `/api/expenses` to accept insurance fields
    - Update PUT `/api/expenses/:id` to accept insurance fields
    - Update GET `/api/expenses/tax-deductible` response to include insurance data
    - _Requirements: 1.3, 1.5, 6.1, 6.2_
  
  - [x] 5.3 Write property test for claim status filtering
    - **Property 9: Claim Status Filtering**
    - **Validates: Requirements 6.5, 7.4**

- [x] 6. Frontend Insurance Components
  - [x] 6.1 Create InsuranceStatusIndicator component
    - Display visual indicator based on claim_status
    - Support 'small' and 'medium' sizes
    - Handle click events for quick status update
    - Show no indicator when not insurance eligible
    - Create InsuranceStatusIndicator.jsx and InsuranceStatusIndicator.css
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [x] 6.2 Create QuickStatusUpdate component
    - Dropdown/popover for status changes
    - Support transitions: not_claimed → in_progress → paid/denied
    - Call PATCH endpoint on selection
    - Create QuickStatusUpdate.jsx and QuickStatusUpdate.css
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [x] 6.3 Create insurance API service functions
    - Add `updateInsuranceStatus(expenseId, status)` function
    - Extend `createExpense` to include insurance fields
    - Extend `updateExpense` to include insurance fields
    - Add to frontend/src/services/expenseApi.js
    - _Requirements: 1.3, 2.3, 5.4_

- [x] 7. Frontend ExpenseForm Integration
  - [x] 7.1 Add insurance section to ExpenseForm
    - Add insurance eligibility checkbox (shown for Tax - Medical only)
    - Add original cost input field (shown when eligible)
    - Add claim status dropdown (shown when eligible)
    - Display calculated reimbursement
    - _Requirements: 1.1, 1.4, 2.1, 3.1, 3.2, 3.3, 3.4, 3.6_
  
  - [x] 7.2 Add insurance validation to ExpenseForm
    - Validate amount <= original_cost
    - Show validation error messages
    - _Requirements: 3.5_
  
  - [x] 7.3 Integrate insurance with people allocation
    - Use original_cost for allocation base
    - Track both original_amount and amount per person
    - Update PersonAllocationModal for insurance expenses
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 8. Frontend ExpenseList Integration
  - [x] 8.1 Add InsuranceStatusIndicator to ExpenseList
    - Show indicator for insurance-eligible medical expenses
    - Integrate QuickStatusUpdate on indicator click
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [x] 8.2 Add insurance status filter to ExpenseList
    - Add filter dropdown for claim status
    - Filter expenses by selected status
    - _Requirements: 7.4_

- [x] 9. Frontend TaxDeductible Integration
  - [x] 9.1 Extend TaxDeductible view with insurance data
    - Display insurance eligibility status per expense
    - Show claim status with visual indicators
    - Display original cost and out-of-pocket columns
    - _Requirements: 6.1, 6.2_
  
  - [x] 9.2 Add insurance summary to TaxDeductible
    - Show total original costs
    - Show total out-of-pocket (deductible) amount
    - Show total reimbursements
    - Show breakdown by claim status
    - _Requirements: 6.3, 6.4_
  
  - [x] 9.3 Add claim status filter to TaxDeductible
    - Add filter dropdown for claim status
    - Filter displayed expenses by status
    - _Requirements: 6.5_
  
  - [x] 9.4 Update person-grouped view for insurance
    - Show both original cost and out-of-pocket per person
    - Display reimbursement amounts
    - _Requirements: 4.5_

- [x] 10. Checkpoint - Frontend Complete
  - Ensure all frontend components render correctly, ask the user if questions arise.

- [x] 11. Migration and Backup Integration
  - [x] 11.1 Integrate migration with startup
    - Add migration to database initialization
    - Ensure migration runs on container start
    - _Requirements: 8.1, 8.4, 8.5_
  
  - [x] 11.2 Write property test for migration data preservation
    - **Property 10: Migration Data Preservation**
    - **Validates: Requirements 8.1, 8.4**
  
  - [x] 11.3 Write property test for migration defaults
    - **Property 11: Migration Defaults**
    - **Validates: Requirements 8.2, 8.3**
  
  - [x] 11.4 Extend backup service for insurance fields
    - Ensure insurance fields included in backup
    - Ensure insurance fields restored from backup
    - _Requirements: 9.1, 9.2_
  
  - [x] 11.5 Write property test for backup/restore round-trip
    - **Property 12: Backup/Restore Round-Trip**
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [x] 12. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including property-based tests are required
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation uses JavaScript/Node.js for backend and React for frontend
- Property-based testing uses fast-check library
