# Fixed Interest Rate Loans

**Version**: 5.1.0  
**Completed**: February 2026  
**Spec**: `archive/specs/fixed-interest-rate-loans/`

## Overview

Support for locking in interest rates on traditional loans. When a loan has a fixed rate, balance entries automatically use that rate, simplifying monthly tracking.

## Features

### Fixed Rate Configuration

- **Fixed Rate Field**: Set a locked-in interest rate when creating or editing a loan
- **Loan Type Restriction**: Only available for loan type "loan" (not lines of credit)
- **Rate Lock Indicator**: 🔒 icon shows when a loan has a fixed rate
- **Validation**: Rate must be non-negative

### Balance Entry Simplification

- **Auto-Population**: Balance entries automatically use the fixed rate
- **Hidden Rate Field**: Rate input is hidden when loan has fixed rate
- **Rate Display**: Shows "Fixed Rate: X%" indicator in balance form

### Balance History Display

- **Conditional Columns**: "Rate Change" column hidden for fixed-rate loans
- **Fixed Rate Badge**: Visual indicator in loan summary section
- **Consistent Display**: Interest rate column still shows the fixed rate

## Usage

### Setting a Fixed Rate

1. Create a new loan or edit an existing loan
2. Select loan type "Loan" (not Line of Credit)
3. Enter the fixed interest rate percentage
4. Save the loan

### Adding Balance Entries

For fixed-rate loans:
1. Open the loan detail view
2. Add a new balance entry
3. Only enter the balance amount (rate is automatic)
4. Save the entry

For variable-rate loans:
1. Open the loan detail view
2. Add a new balance entry
3. Enter both balance and current interest rate
4. Save the entry

## Technical Details

### Database

- New column: `fixed_interest_rate REAL DEFAULT NULL` on loans table
- Simple column addition migration (no table recreation)

### Validation Rules

- `fixed_interest_rate` must be >= 0 if provided
- Only allowed when `loan_type === 'loan'`
- Variable-rate loans require explicit rate on each balance entry

### Backward Compatibility

- Existing loans continue to work with variable rates
- Existing balance entries are unchanged
- No migration of existing data required

## Components

| Component | Changes |
|-----------|---------|
| `LoansModal.jsx` | Fixed rate input field |
| `LoanDetailView.jsx` | Conditional rate input, fixed rate indicator |

## Testing

Property-based tests validate:
- Loan type restriction
- Non-negative rate validation
- Auto-population round trip
- Variable rate requires explicit rate
- API round trip preservation
- Backward compatibility

---

**Last Updated**: February 2, 2026
