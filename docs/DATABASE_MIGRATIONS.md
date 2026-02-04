# Database Migrations

## Overview

The expense tracker uses an automatic migration system to update the database schema when needed. Migrations run automatically when the application starts.

## How It Works

1. **Automatic Execution**: When the backend server starts, it calls `initializeDatabase()` which runs all pending migrations
2. **Migration Tracking**: Each migration is tracked in the `schema_migrations` table to prevent duplicate execution
3. **Automatic Backups**: Before each migration runs, an automatic backup is created in `/config/backups/`
4. **Transaction Safety**: All migrations run within database transactions and rollback on error

## Migration Files

Migrations are defined in `backend/database/migrations.js`:

- `migrateExpandCategories` - Expands expense categories from 5 to 14 categories
- `migrateAddClothingCategory` - Adds "Clothing" and "Gifts" categories
- `migrateRemoveRecurringExpenses` - Removes recurring expenses feature
- `migrateFixCategoryConstraints` - Ensures all tables have correct category constraints
- `migrateAddPersonalCareCategory` - Adds "Personal Care" category
- `migrateEnhanceFixedExpenses` - Adds category and payment_type fields to fixed_expenses table
- `migrateAddIncomeCategoryColumn` - Adds category field to income_sources table
- `migrateMultiInvoiceSupport` - Enables multiple invoices per expense with person linking (v4.13.0)
- `migrateAddBillingCycleDay` - Adds billing_cycle_day column for statement balance calculation (v4.21.0)
- `migrateBillingCycleHistory` - Creates billing_cycle_history table for tracking billing cycles (v5.4.0)

## Container Startup

When the Docker container starts:

1. The container runs `node server.js`
2. `server.js` calls `initializeDatabase()`
3. `initializeDatabase()` calls `runMigrations()`
4. Each migration checks if it has been applied
5. Pending migrations run automatically with backups
6. The server starts after migrations complete

## Manual Migration

If you need to run migrations manually:

```bash
# Run all pending migrations
node backend/scripts/runMigration.js

# Check current database schema
node backend/scripts/checkSchema.js

# Fix category constraints (if needed)
node backend/scripts/fixCategoryConstraint.js
```

## Adding New Migrations

To add a new migration:

1. Create a new migration function in `backend/database/migrations.js`
2. Give it a unique migration name (e.g., `add_new_feature_v1`)
3. Use `checkMigrationApplied()` to check if already applied
4. Create a backup with `createBackup()`
5. Wrap changes in a transaction
6. Mark as applied with `markMigrationApplied()`
7. Add the migration to `runMigrations()` function

### ⚠️ CRITICAL: Foreign Key Cascade Prevention

When recreating tables that have foreign key references from other tables (with `ON DELETE CASCADE`), you **MUST** disable foreign keys before dropping the old table. Otherwise, SQLite will cascade delete all related data.

**Tables with CASCADE DELETE foreign keys:**
- `loan_balances` → `loans` (loan_id)
- `expense_people` → `expenses` (expense_id)
- `expense_people` → `people` (person_id)
- `expense_invoices` → `expenses` (expense_id)
- `investment_values` → `investments` (investment_id)

Use the helper functions:
```javascript
// BEFORE BEGIN TRANSACTION
await disableForeignKeys(db);

// ... do the table recreation ...

// After COMMIT (and in all error handlers)
await enableForeignKeys(db);
```

See `.kiro/steering/database-migrations.md` for the full template.

Example:

```javascript
async function migrateAddNewFeature(db) {
  const migrationName = 'add_new_feature_v1';
  
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    console.log(`✓ Migration "${migrationName}" already applied, skipping`);
    return;
  }

  console.log(`Running migration: ${migrationName}`);
  await createBackup();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) return reject(err);
        
        // Your migration code here
        
        markMigrationApplied(db, migrationName).then(() => {
          db.run('COMMIT', (err) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }
            console.log(`✓ Migration "${migrationName}" completed successfully`);
            resolve();
          });
        }).catch(reject);
      });
    });
  });
}
```

## Troubleshooting

### Migration Marked as Applied But Schema Not Updated

This can happen if a migration was interrupted. Use the fix script:

```bash
node backend/scripts/fixCategoryConstraint.js
```

### Check Migration Status

Query the migrations table:

```sql
SELECT * FROM schema_migrations;
```

### Reset a Migration (Advanced)

If you need to re-run a migration:

```sql
DELETE FROM schema_migrations WHERE migration_name = 'migration_name_here';
```

Then restart the server or run the migration script.

## Category Updates

The current category list is maintained in `backend/utils/categories.js`:

- **All Categories**: 17 categories including Clothing, Gifts, Personal Care, etc.
- **Budgetable Categories**: 15 categories (excludes tax-deductible)
- **Tax-Deductible Categories**: Tax - Medical, Tax - Donation

When categories are updated in code, a migration must be created to update the database CHECK constraints.
