# Database Migrations

## Current Model

The project uses a consolidated schema-first approach (introduced in v1.0.0, replacing ~50 sequential migration functions):

1. `backend/database/schema.js` is the single declarative source of truth for table, trigger, index and seed statements (`ALL_STATEMENTS`).
2. `backend/database/db.js` executes `ALL_STATEMENTS` during initialization. Every statement is idempotent (`CREATE ... IF NOT EXISTS`, `INSERT OR IGNORE`).
3. `backend/database/migrations.js` holds a small `MIGRATIONS` array of incremental changes for databases created before the change was added to `schema.js`.

## Startup Flow

`initializeDatabase()` in `backend/database/db.js`:

1. Ensures config directories exist (`ensureDirectories()`), initializes invoice storage, and copies a legacy `backend/database/expenses.db` to the config path if needed (`migrateOldDatabase()`).
2. Opens `<CONFIG_DIR>/database/expenses.db` and runs `PRAGMA foreign_keys = ON`.
3. Executes every statement in `ALL_STATEMENTS` sequentially. Any error here rejects `initializeDatabase()` (server does not start).
4. Calls `runMigrations(db)`. Migration errors are logged and **swallowed** — the app still starts; the failed migration is not marked applied and will be retried on the next start.

`backend/server.js` then enables `PRAGMA journal_mode = WAL` on the returned connection and calls `authService.initializeDefaultUser()`.

`initializeDatabase()` is also re-run by `backupService` after a backup restore, so restored (older) databases are brought up to the current schema and migrations.

Test databases (`createTestDatabase()` in `db.js` and `createIsolatedTestDb()` in `backend/test/dbIsolation.js`) execute `ALL_STATEMENTS` only — they do **not** call `runMigrations()`.

## Migration Tracking

Migration state is recorded in `schema_migrations` (`migration_name` is UNIQUE).

Exports of `backend/database/migrations.js`:

- `checkMigrationApplied(db, migrationName)`
- `markMigrationApplied(db, migrationName)` (`INSERT OR IGNORE`)
- `runMigrations(db)`

`runMigrations()` first records the `consolidated_schema_v1` marker if missing, then iterates `MIGRATIONS` in order, skipping any already recorded. Each entry is `{ name, async apply(db) }`; the name is recorded only after `apply()` resolves. Migrations are not wrapped in a transaction.

Current migrations (in run order):

| Name | Effect |
|------|--------|
| `consolidated_schema_v1` | Marker only (schema baseline) |
| `auth_infrastructure_v1` | Seeds the default `admin` user with an empty password hash |
| `dismissed_anomalies_nullable_expense_id_v1` | Recreates `dismissed_anomalies` with nullable `expense_id` and `UNIQUE(expense_id, anomaly_type)`, copies rows, adds `idx_dismissed_anomalies_expense_id` and `idx_dismissed_anomalies_anomaly_type` |
| `performance_compound_indexes_v1` | Adds `idx_expenses_date_type`, `idx_expenses_date_method`, `idx_expenses_week`, `idx_expenses_place_type`, `idx_expenses_date_place` |
| `analytics_hub_revamp_v1` | Adds `anomaly_type`/`action` columns to `dismissed_anomalies` if missing; creates `anomaly_suppression_rules` and its indexes |

Because migrations also run on brand-new production databases (immediately after `schema.js`), every migration must be idempotent against a database that already has the end-state schema.

## What To Do For New Schema Changes

1. Update `backend/database/schema.js` so fresh databases (production and test) get the end-state structure.
2. If existing databases need the change, append a new entry (new unique `name`, e.g. `feature_name_v1`) to the `MIGRATIONS` array in `backend/database/migrations.js`. Never rename or edit an already-released migration.
3. Make the migration idempotent: `CREATE ... IF NOT EXISTS`, and catch `duplicate column name` around `ALTER TABLE ... ADD COLUMN` (see `analytics_hub_revamp_v1`).
4. `CREATE TABLE IF NOT EXISTS` in `schema.js` does not alter existing tables. New columns on existing tables need an `ALTER TABLE` migration.
5. Do not add a `schema.js` index on a column that existing databases only receive via a migration: `ALL_STATEMENTS` runs **before** `runMigrations()`, so the `CREATE INDEX` would fail on an old database and abort startup. Create such indexes inside the migration.
6. Anything tests depend on must be in `schema.js` — test databases do not run migrations.
7. Update the schema tests: `EXPECTED_TABLES` in `backend/database/schema.test.js` and `backend/database/schema.pbt.test.js`, and `backend/database/schemaConsistency.test.js` where relevant. Add `DELETE FROM` for new tables to `resetTestDatabase()` in `db.js` if tests rely on it.
8. Update [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

When recreating a table, follow the foreign-key guidance in [database.instructions.md](../.github/instructions/database.instructions.md).

## Operational Notes

- Database files use path resolution from `backend/config/paths.js` (`CONFIG_DIR` env var overrides).
- Containerized deployments persist data in `/config`.
- Local development uses backend config paths under `backend/config/`.
- `getDatabase()` returns a memoised, process-wide connection. Never call `db.close()` on it in request code; `closeDatabase()` (WAL checkpoint + close) is reserved for backup restore.

## Related Docs

- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
- [TECH-DEBT.md](TECH-DEBT.md)
- [Schema change instructions](../.github/instructions/database.instructions.md)
