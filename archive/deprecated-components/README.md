# Deprecated Components Archive

This folder contains deprecated frontend components that have been replaced but are kept for rollback purposes.

## Contents

### BudgetAlertBanner (February 2026)
- `BudgetAlertBanner.jsx` - Original budget alert banner component
- `BudgetAlertBanner.css` - Styles for the original banner
- **Replaced by**: `frontend/src/components/BudgetReminderBanner.jsx`
- **Reason**: Standardized to use the unified reminder banner pattern (same as CreditCardReminderBanner, LoanPaymentReminderBanner, etc.)

### BudgetAlertErrorBoundary (February 2026)
- `BudgetAlertErrorBoundary.jsx` - Error boundary for budget alerts
- `BudgetAlertErrorBoundary.css` - Styles for error fallback UI
- **Reason**: No longer needed after BudgetAlertBanner was replaced with BudgetReminderBanner

## Rollback Instructions

If you need to restore these components:

1. Copy the files back to `frontend/src/components/`
2. Update imports in `BudgetAlertManager.jsx` to use `BudgetAlertBanner` instead of `BudgetReminderBanner`
3. Restore the test files from git history if needed

## Note

The test files for these components were not archived as they can be recovered from git history if needed.
