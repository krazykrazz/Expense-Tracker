@echo off
REM Navigate to project root (two levels up from scripts/windows/)
cd /d "%~dp0..\.."

echo ========================================
echo Recurring Expenses Removal Migration
echo ========================================
echo.
echo This will:
echo 1. Create a backup of your database
echo 2. Remove recurring_expenses table
echo 3. Convert all generated expenses to regular expenses
echo 4. Remove recurring_id and is_generated columns
echo.
echo Press Ctrl+C to cancel, or
pause

cd backend
node scripts/removeRecurringExpenses.js

echo.
echo Migration complete!
echo.
pause
