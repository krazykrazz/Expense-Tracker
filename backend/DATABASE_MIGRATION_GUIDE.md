# Database Migration Guide - Fixed Expenses Table

## Problem
The running application doesn't have the `fixed_expenses` table in the database schema, which causes errors when trying to read or add fixed expenses.

## Solution
Run the migration script to add the missing table to your existing database.

## Steps to Fix

### 1. Stop the Backend Server
If your backend server is currently running, stop it first:
- Press `Ctrl+C` in the terminal where the server is running

### 2. Check Current Database Schema (Optional)
To see what tables currently exist in your database:

```bash
cd backend
npm run db:check
```

This will show you:
- All existing tables and their schemas
- Row counts for each table
- All indexes
- Which required tables are missing

### 3. Run the Migration Script
Add the `fixed_expenses` table to your database:

```bash
cd backend
npm run db:migrate
```

You should see output like:
```
Starting migration: Adding fixed_expenses table...
Connected to database
✓ fixed_expenses table created successfully
✓ Index idx_fixed_expenses_year_month created successfully
✓ Verification successful: fixed_expenses table exists

Table schema:
  - id (INTEGER)
  - year (INTEGER)
  - month (INTEGER)
  - name (TEXT)
  - amount (REAL)
  - created_at (TEXT)
  - updated_at (TEXT)

✓ Migration completed successfully!
You can now restart your backend server.
```

### 4. Restart the Backend Server
Start your backend server again:

```bash
cd backend
npm start
```

### 5. Verify the Fix
1. Open your application in the browser
2. Navigate to the Summary Panel
3. Click "👁️ View/Edit" next to "Total Fixed Expenses"
4. Try adding a new fixed expense
5. The modal should now work without errors

## What the Migration Does

The migration script:
1. Creates the `fixed_expenses` table with the following schema:
   - `id`: Auto-incrementing primary key
   - `year`: Year (INTEGER, NOT NULL)
   - `month`: Month 1-12 (INTEGER, NOT NULL)
   - `name`: Name of the fixed expense (TEXT, NOT NULL)
   - `amount`: Amount (REAL, NOT NULL, must be >= 0)
   - `created_at`: Timestamp when created
   - `updated_at`: Timestamp when last updated

2. Creates an index on `(year, month)` for faster queries

3. Verifies the table was created successfully

## Troubleshooting

### If the migration fails:
1. Check that the database file exists at `backend/database/expenses.db`
2. Make sure you have write permissions to the database file
3. Check the error message for specific details

### If you still see errors after migration:
1. Run `npm run db:check` to verify the table exists
2. Check the backend server console for error messages
3. Check the browser console (F12) for frontend errors
4. Verify the backend server is running on port 2424

### To manually verify the table exists:
You can use a SQLite browser tool like:
- DB Browser for SQLite (https://sqlitebrowser.org/)
- Open `backend/database/expenses.db`
- Check if `fixed_expenses` table exists

## Database Backup (Recommended)

Before running the migration, you may want to backup your database:

```bash
# On Windows
copy backend\database\expenses.db backend\database\expenses.db.backup

# On Mac/Linux
cp backend/database/expenses.db backend/database/expenses.db.backup
```

## Notes

- This migration is safe to run multiple times (uses `CREATE TABLE IF NOT EXISTS`)
- Existing data in other tables will not be affected
- The migration only adds the new table, it doesn't modify existing tables
