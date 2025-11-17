# Loan Type Feature Implementation Summary

## Overview

Added support for distinguishing between traditional loans and lines of credit. This addresses the issue where paydown progress doesn't make sense for lines of credit (which can have balances that go up and down).

## Feature Details

### Loan Types

1. **Loan** (default)
   - Traditional loans where balance only decreases
   - Examples: Mortgages, car loans, student loans, personal loans
   - Shows paydown progress indicator

2. **Line of Credit**
   - Revolving credit where balance can fluctuate
   - Examples: Credit cards, HELOCs, business lines of credit
   - Hides paydown progress indicator (not applicable)

## Changes Made

### Database

**Migration Script**: `backend/scripts/addLoanTypeColumn.js`
- Adds `loan_type` column to `loans` table
- Default value: `'loan'`
- Constraint: CHECK(loan_type IN ('loan', 'line_of_credit'))
- Creates backup before migration
- Migrated 3 existing loans to default type 'loan'

**Schema Update**: `backend/database/db.js`
- Updated table creation to include `loan_type` column for new installations

### Backend

**Service Layer**: `backend/services/loanService.js`
- Added validation for loan_type field
- Updated `createLoan()` to accept and default loan_type
- Updated `updateLoan()` to handle loan_type changes

**Repository Layer**: `backend/repositories/loanRepository.js`
- Updated `create()` to insert loan_type
- Updated `update()` to modify loan_type

### Frontend

**LoansModal Component**: `frontend/src/components/LoansModal.jsx`
- Added loan type selector dropdown in create/edit form
- Options: "Loan (balance decreases only)" and "Line of Credit (balance can fluctuate)"
- Added helpful hint text explaining the difference
- Updated form state to include loan_type

**LoanDetailView Component**: `frontend/src/components/LoanDetailView.jsx`
- Added loan type display in summary section
- Conditionally shows/hides paydown progress based on loan type
- Progress bar only displays for traditional loans

**Styling**: `frontend/src/components/LoansModal.css`
- Added styles for select dropdown
- Added styles for hint text (.loans-field-hint)

## Testing

**Test Script**: `backend/scripts/testLoanTypes.js`

All tests pass:
- ✓ Create traditional loan with default type
- ✓ Create line of credit with explicit type
- ✓ Create traditional loan with explicit type
- ✓ Reject invalid loan types
- ✓ Update loan type
- ✓ Retrieve all loans with types

## User Experience

### Creating a Loan

Users now see a "Loan Type" dropdown when creating or editing a loan:
- **Loan (balance decreases only)** - For traditional loans
- **Line of Credit (balance can fluctuate)** - For revolving credit

A hint explains: "Choose 'Loan' for mortgages, car loans, etc. Choose 'Line of Credit' for credit cards, HELOCs, etc."

### Viewing Loan Details

- Traditional loans show the paydown progress bar
- Lines of credit do NOT show the paydown progress bar
- Loan type is displayed in the summary section

## Backward Compatibility

- Existing loans are automatically set to type 'loan' during migration
- Default value ensures all new loans without explicit type are 'loan'
- Frontend gracefully handles loans without loan_type (treats as 'loan')

## Migration Instructions

1. **Backup**: Migration script automatically creates backup
2. **Run**: `node backend/scripts/addLoanTypeColumn.js`
3. **Verify**: Check that existing loans are set to 'loan' type
4. **Restart**: Restart backend server to load updated code

## Files Modified

### Backend
- `backend/database/db.js` - Schema update
- `backend/services/loanService.js` - Validation and business logic
- `backend/repositories/loanRepository.js` - Data access layer
- `backend/scripts/addLoanTypeColumn.js` - Migration script (new)
- `backend/scripts/testLoanTypes.js` - Test script (new)

### Frontend
- `frontend/src/components/LoansModal.jsx` - Form UI
- `frontend/src/components/LoansModal.css` - Form styling
- `frontend/src/components/LoanDetailView.jsx` - Detail view UI

## Future Enhancements

Potential improvements:
- Add visual indicators (icons) for loan types in the list view
- Filter loans by type in the modal
- Different color schemes for different loan types
- Analytics/reports separated by loan type
