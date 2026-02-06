---
inclusion: manual
---

# Database Migration Best Practices

## Schema Change Checklist

When modifying database schema, ALWAYS update both production and test schemas:

1. Add migration in `backend/database/migrations.js`
2. Update `initializeDatabase()` in `backend/database/db.js`
3. **CRITICAL**: Also update `initializeTestDatabase()` in `backend/database/db.js`
4. Ensure test schema matches production schema exactly

### Common Mistakes
- ❌ Adding column to production schema but not test schema
- ❌ Forgetting migration script for existing deployments

## Test Environment Isolation

- Tests use in-memory SQLite by default when `NODE_ENV === 'test'`
- Some tests (like backup tests) need real files and set `SKIP_TEST_DB = 'true'`
- The `getDatabase()` function checks both conditions
- Set `process.env.SKIP_TEST_DB = 'true'` in beforeAll for tests needing real files
- Clean up test files in afterAll

## Foreign Key Cascade Prevention

When recreating tables that have foreign key references from other tables (with `ON DELETE CASCADE`), you MUST disable foreign keys before dropping the old table.

### The Problem

SQLite's `ON DELETE CASCADE` will automatically delete rows in child tables when the parent table is dropped. This happens even within a transaction.

### The Solution

Use the helper functions in `backend/database/migrations.js`:

```javascript
// At the start of the migration (BEFORE BEGIN TRANSACTION)
await disableForeignKeys(db);

// ... do the table recreation ...

// At the end (after COMMIT or in error handlers)
await enableForeignKeys(db);
```

### Important Notes

1. `PRAGMA foreign_keys = OFF` must be called OUTSIDE of a transaction
2. Always re-enable foreign keys in both success and error paths
3. Use `.catch(() => {})` when calling `enableForeignKeys` in error handlers to prevent masking the original error

### Tables with Foreign Key References

Current tables with CASCADE DELETE foreign keys:
- `loan_balances` → `loans` (loan_id)
- `expense_people` → `expenses` (expense_id)
- `expense_people` → `people` (person_id)
- `expense_invoices` → `expenses` (expense_id)
- `investment_values` → `investments` (investment_id)
- `credit_card_payments` → `payment_methods` (payment_method_id)
- `credit_card_statements` → `payment_methods` (payment_method_id)
- `credit_card_billing_cycles` → `payment_methods` (payment_method_id)
- `mortgage_payments` → `loans` (loan_id)
- `loan_payments` → `loans` (loan_id)

### Template for Safe Table Recreation

```javascript
async function migrateSomeTable(db) {
  const migrationName = 'some_migration_v1';
  
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) return;

  await createBackup();
  
  // CRITICAL: Disable FK before transaction
  await disableForeignKeys(db);

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          enableForeignKeys(db).catch(() => {});
          return reject(err);
        }

        // ... create new table, copy data, drop old, rename ...

        db.run('COMMIT', (err) => {
          enableForeignKeys(db).catch(() => {});
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }
          resolve();
        });
      });
    });
  });
}
```
