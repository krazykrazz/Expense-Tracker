# Database Migration Guide

## Overview
This guide covers database migrations for adding new tables to your existing database. The application automatically creates all required tables on initialization, but if you're upgrading from an older version, you may need to run migration scripts.

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

The migration script creates the `fixed_expenses` table with the following schema:
- `id`: Auto-incrementing primary key
- `year`: Year (INTEGER, NOT NULL)
- `month`: Month 1-12 (INTEGER, NOT NULL)
- `name`: Name of the fixed expense (TEXT, NOT NULL)
- `amount`: Amount (REAL, NOT NULL, must be >= 0)
- `created_at`: Timestamp when created
- `updated_at`: Timestamp when last updated

It also creates an index on `(year, month)` for faster queries and verifies the table was created successfully.

## Other Available Tables

The application includes these additional tables that are automatically created on initialization:

### Loans Table
Tracks outstanding loans with balance history:
- `id`: Auto-incrementing primary key
- `name`: Loan name (TEXT, NOT NULL)
- `initial_balance`: Original loan amount (REAL, NOT NULL, >= 0)
- `start_date`: When loan started (TEXT, NOT NULL)
- `notes`: Additional notes (TEXT)
- `loan_type`: Type of loan (TEXT, NOT NULL, DEFAULT 'loan', CHECK: 'loan' or 'line_of_credit')
- `is_paid_off`: Whether loan is paid off (INTEGER, 0 or 1)
- `created_at`, `updated_at`: Timestamps

### Loan Balances Table
Tracks monthly balance and interest rate updates for each loan:
- `id`: Auto-incrementing primary key
- `loan_id`: Foreign key to loans table (INTEGER, NOT NULL, CASCADE DELETE)
- `year`, `month`: Month identifier (INTEGER, NOT NULL)
- `remaining_balance`: Outstanding balance (REAL, NOT NULL, >= 0)
- `rate`: Interest rate percentage (REAL, NOT NULL, >= 0)
- `created_at`, `updated_at`: Timestamps
- Unique constraint on (loan_id, year, month)

### Loan Type Migration (v3.2.0)
If upgrading from v3.1.x to v3.2.0, the `loan_type` column needs to be added to existing loans:

```bash
cd backend
node scripts/addLoanTypeColumn.js
```

This migration:
- Backs up the database before making changes
- Adds the `loan_type` column with CHECK constraint
- Defaults existing loans to 'loan' type
- Enables foreign keys for cascade delete support

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

Before running any migration, you should backup your database. The application includes an automated backup feature:

### Using the Application Backup Feature
1. Open the application in your browser
2. Click the "💾 Backup" button
3. The backup will be saved to your configured backup location

### Manual Backup
You can also manually copy the database file:

```bash
# On Windows
copy backend\database\expenses.db backend\database\expenses.db.backup

# On Mac/Linux
cp backend/database/expenses.db backend/database/expenses.db.backup
```

**Note:** All backups include all tables (expenses, income_sources, fixed_expenses, loans, loan_balances, etc.) and preserve data integrity.

## Notes

- This migration is safe to run multiple times (uses `CREATE TABLE IF NOT EXISTS`)
- Existing data in other tables will not be affected
- The migration only adds the new table, it doesn't modify existing tables
