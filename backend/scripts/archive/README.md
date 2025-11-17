# Archived Scripts

This directory contains scripts that were used during development but are no longer actively needed.

## Directory Structure

### migrations/
One-time database migration scripts that have already been executed:
- `addChequePaymentMethod.js` - Added "Cheque" payment method
- `addEstimatedMonthsLeftColumn.js` - Added estimated_months_left to loans table
- `addFixedExpensesTable.js` - Created fixed_expenses table
- `addLoansTable.js` - Created loans and loan_balances tables
- `addLoanTypeColumn.js` - Added loan_type column to loans table
- `migrateDatabaseLocation.js` - Moved database to /data directory

### tests/
Test scripts used during feature development:
- Various test scripts for loans, balances, backups, and summaries
- These were used to verify functionality during development
- Kept for reference but not actively maintained

### debug/
One-time debug scripts used to investigate specific issues:
- `debugZeroBalance.js` - Investigated zero balance issue
- `checkMortgageCalculation.js` - Verified mortgage calculations
- `checkDatabaseSchema.js` - Schema verification

## Active Scripts

Scripts still in the main `backend/scripts/` directory are actively used:
- `calculateEstimatedMonthsLeft.js` - Calculate loan payoff estimates
- `setEstimatedMonthsLeft.js` - Set estimated months for a loan
- `updateEstimatedMonthsLeft.js` - Update all loan estimates
- `clearExpenses.js` - Clear expense data (utility)

## Notes

- These archived scripts are kept for historical reference
- They should not be run on production databases
- If you need to reference migration logic, check these files
- Consider deleting after 6-12 months if no longer needed
