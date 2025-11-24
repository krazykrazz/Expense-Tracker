# Recurring Expenses Feature Removal - v4.0.0

## Overview
The recurring expenses feature has been removed from the Expense Tracker application as of version 4.0.0. This document outlines what was removed and provides migration guidance for existing users.

## What Was Removed

### Backend Components
- ✅ `backend/controllers/recurringExpenseController.js` - API controller
- ✅ `backend/services/recurringExpenseService.js` - Business logic
- ✅ `backend/repositories/recurringExpenseRepository.js` - Data access layer
- ✅ `backend/routes/recurringExpenseRoutes.js` - API routes
- ✅ `backend/services/recurringExpenseService.pbt.test.js` - Property-based tests
- ✅ Route registration removed from `backend/server.js`

### Frontend Components
- ✅ `frontend/src/components/RecurringExpensesManager.jsx` - Main management UI
- ✅ `frontend/src/components/RecurringExpensesManager.css` - Manager styles
- ✅ `frontend/src/components/RecurringExpenseForm.jsx` - Form component
- ✅ `frontend/src/components/RecurringExpenseForm.css` - Form styles

### Database Changes
The migration script `backend/scripts/removeRecurringExpenses.js` will:
- Drop the `recurring_expenses` table
- Remove `recurring_id` column from `expenses` table
- Remove `is_generated` column from `expenses` table

**Note**: All existing expense data is preserved. Only the recurring template data and tracking columns are removed.

## Migration Instructions

### For Existing Users

1. **Backup Your Database First!**
   ```bash
   # The migration script creates a backup automatically, but it's good to have your own
   cp backend/database/expense-tracker.db backend/database/expense-tracker-backup.db
   ```

2. **Run the Migration Script**
   ```bash
   node backend/scripts/removeRecurringExpenses.js
   ```

3. **Update to v4.0.0**
   ```bash
   # Pull the latest version
   docker-compose pull
   docker-compose up -d
   ```

### What Happens to Existing Data

- **Recurring Templates**: All recurring expense templates will be permanently deleted
- **Generated Expenses**: Expenses that were generated from templates will be **converted to regular expenses** and remain in your expense list
- **Manual Expenses**: All manually entered expenses are completely unaffected
- **Data Preservation**: No expense data is lost - all expenses remain in the system as regular expenses

### Alternative: Fixed Expenses Feature

If you were using recurring expenses for monthly bills, consider using the **Fixed Expenses** feature instead:
- Access via "View/Edit" button next to "Fixed Expenses" in the summary panel
- Better suited for predictable monthly costs (rent, utilities, subscriptions)
- Included in monthly summaries and net balance calculations
- Can be copied forward month-to-month

## Rationale for Removal

The recurring expenses feature was removed because:
1. **Low Utility**: The feature wasn't providing significant value over manual entry
2. **Overlap**: Fixed Expenses feature better serves the use case of predictable monthly costs
3. **Complexity**: Maintaining the template system added unnecessary complexity
4. **User Feedback**: Feature wasn't being actively used

## Files Created

- `backend/scripts/removeRecurringExpenses.js` - Migration script to safely remove database components
- `RECURRING_EXPENSES_REMOVAL.md` - This documentation file

## Version Impact

This is a **MAJOR version change** (3.8.1 → 4.0.0) because:
- It removes existing functionality (breaking change)
- It requires database migration
- API endpoints are removed

## Rollback Instructions

If you need to rollback:

1. Restore your database backup:
   ```bash
   cp backend/database/expense-tracker-backup.db backend/database/expense-tracker.db
   ```

2. Downgrade to v3.8.1:
   ```bash
   docker pull localhost:5000/expense-tracker:3.8.1
   docker-compose down
   docker-compose up -d
   ```

## Support

If you encounter issues during migration, please:
1. Check that you have a backup of your database
2. Review the migration script output for errors
3. Restore from backup if needed

---

**Migration Date**: November 24, 2025  
**Version**: 4.0.0  
**Breaking Change**: Yes
