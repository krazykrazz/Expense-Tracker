---
description: "Use when changing the SQLite schema, adding tables/columns/indexes, writing migrations, or rebuilding tables with foreign keys."
applyTo: "backend/database/**"
---
# Schema Changes and Migrations

Background: `docs/DATABASE_MIGRATIONS.md`, `docs/DATABASE_SCHEMA.md`.

## Checklist

1. Update `backend/database/schema.js` (`ALL_STATEMENTS`) with the end-state definition. This covers fresh production DBs and every test DB.
2. If existing databases need the change, append `{ name, async apply(db) }` to `MIGRATIONS` in `backend/database/migrations.js`. Never edit or rename a released migration.
3. Make the migration idempotent — it also runs on fresh DBs that already have the end state (`IF NOT EXISTS`, tolerate `duplicate column name`).
4. Update `EXPECTED_TABLES` in `backend/database/schema.test.js` / `schema.pbt.test.js` (and `schemaConsistency.test.js` if relevant).
5. Update `docs/DATABASE_SCHEMA.md`.

## Pitfalls

- Column only in `schema.js`: `CREATE TABLE IF NOT EXISTS` never alters existing tables, so deployed DBs never get it.
- Migration only: test DBs never run migrations, so tests won't see it.
- Index on a migration-added column in `schema.js`: `ALL_STATEMENTS` runs before `runMigrations()`, so startup fails on old DBs. Create that index inside the migration.
- `runMigrations()` does not wrap migrations in a transaction and records the name only after `apply()` resolves.

## Rebuilding a Referenced Table

With `foreign_keys = ON`, `DROP TABLE` does an implicit `DELETE`: CASCADE children are deleted, SET NULL children are nulled, and no-action children make the drop fail. `PRAGMA foreign_keys` is a no-op inside a transaction, so toggle it outside:

```javascript
{
  name: 'some_table_rebuild_v1',
  async apply(db) {
    await runSql(db, 'PRAGMA foreign_keys = OFF');
    try {
      await runSql(db, 'BEGIN TRANSACTION');
      try {
        await runSql(db, 'CREATE TABLE some_table_new ( ... )');
        await runSql(db, 'INSERT INTO some_table_new (...) SELECT ... FROM some_table');
        await runSql(db, 'DROP TABLE some_table');
        await runSql(db, 'ALTER TABLE some_table_new RENAME TO some_table');
        await runSql(db, 'CREATE INDEX IF NOT EXISTS ... ON some_table(...)');
        await runSql(db, 'COMMIT');
      } catch (err) {
        await runSql(db, 'ROLLBACK').catch(() => {});
        throw err;
      }
    } finally {
      await runSql(db, 'PRAGMA foreign_keys = ON');
    }
  }
}
```

Recreate indexes and triggers after the rename. Foreign keys: CASCADE from `loans` (loan_balances, loan_payments, mortgage_payments), `investments` (investment_values), `expenses` (expense_people, expense_invoices, dismissed_anomalies), `people` (expense_people), `payment_methods` (credit_card_payments, credit_card_statements, credit_card_billing_cycles); SET NULL for `fixed_expenses.linked_loan_id` and `expense_invoices.person_id`; no action for `expenses.payment_method_id` and `fixed_expenses.payment_method_id`.
