# Estimated Months Left Feature

## Overview
Added an optional `estimated_months_left` field to loans of type "loan" (not applicable to lines of credit). This allows users to track how many months remain until a traditional loan is paid off.

## Changes Made

### Database
- **Migration Script**: `backend/scripts/addEstimatedMonthsLeftColumn.js`
  - Added `estimated_months_left INTEGER` column to `loans` table
  - Column is nullable (optional field)

### Backend

#### Repository Layer (`backend/repositories/loanRepository.js`)
- Updated `create()` method to include `estimated_months_left` in INSERT
- Updated `update()` method to include `estimated_months_left` in UPDATE
- Field is passed through from service layer

#### Service Layer (`backend/services/loanService.js`)
- Added validation for `estimated_months_left`:
  - Must be a non-negative integer if provided
  - Optional field (can be null/undefined)
- Updated `createLoan()` to accept and pass `estimated_months_left`
- Updated `updateLoan()` to accept and pass `estimated_months_left`

### Frontend

#### LoansModal Component (`frontend/src/components/LoansModal.jsx`)
- Added `estimated_months_left` to form state
- Added conditional input field (only shown when `loan_type === 'loan'`)
- Field includes helpful hint text
- Updated create/update handlers to include field value
- Added display of estimated months in loan list items
- Added "LOC" badge for lines of credit to differentiate loan types

#### LoanDetailView Component (`frontend/src/components/LoanDetailView.jsx`)
- Added display of `estimated_months_left` in loan summary section
- Only shown for loans of type "loan" (not lines of credit)
- Styled with green color to indicate positive progress

#### Styling
- **LoansModal.css**: Added styles for:
  - `.loan-type-badge` - Badge for line of credit indicator
  - `.loan-item-months-left` - Display in loan list
  - `.loans-field-hint` - Helper text for form fields
  
- **LoanDetailView.css**: Added styles for:
  - `.loan-months-left` - Display in detail view

## Testing

### Test Script
Created `backend/scripts/testEstimatedMonthsLeft.js` which verifies:
1. ✅ Creating a loan with `estimated_months_left`
2. ✅ Retrieving loan and verifying field persists
3. ✅ Updating `estimated_months_left` value
4. ✅ Creating line of credit without `estimated_months_left` (null)
5. ✅ Retrieving all loans with proper field values

All tests passed successfully.

## Usage

### Creating a Loan with Estimated Months
```javascript
await createLoan({
  name: 'Car Loan',
  initial_balance: 25000,
  start_date: '2024-01-01',
  loan_type: 'loan',
  estimated_months_left: 60,  // Optional
  notes: 'My car loan'
});
```

### UI Behavior
- When creating/editing a **loan** (not line of credit):
  - "Estimated Months Left" field appears in the form
  - Field is optional - can be left blank
  - Accepts whole numbers only (0 or greater)
  
- When creating/editing a **line of credit**:
  - "Estimated Months Left" field is hidden (not applicable)

- In loan lists:
  - Traditional loans show "Est. X months left" if value is set
  - Lines of credit show "LOC" badge
  
- In loan detail view:
  - Shows "Estimated Months Left: X months" for traditional loans
  - Not shown for lines of credit

## Database Schema
```sql
ALTER TABLE loans ADD COLUMN estimated_months_left INTEGER;
```

## Backward Compatibility
- Existing loans will have `estimated_months_left = NULL`
- No data migration needed
- Feature is fully optional
- Lines of credit are unaffected

## Future Enhancements
Potential improvements:
- Auto-calculate based on balance, rate, and payment amount
- Show warning when estimated months don't align with balance trends
- Calculate estimated payoff date based on current month + estimated months
- Track changes to estimated months over time
