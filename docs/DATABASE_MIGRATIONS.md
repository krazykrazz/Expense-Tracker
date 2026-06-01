# Database Migrations

## Current Model

The project now uses a consolidated schema-first approach:

1. `backend/database/schema.js` is the single declarative source of truth for table/index/trigger creation.
2. `backend/database/db.js` executes `ALL_STATEMENTS` from `schema.js` during initialization.
3. `backend/database/migrations.js` applies only incremental follow-up migrations that cannot be represented as an initial schema declaration for existing deployments.

This replaced the old large list of sequential historical migration functions.

## Startup Flow

On server startup:

1. `initializeDatabase()` ensures config directories exist.
2. The SQLite database is opened and foreign keys are enabled.
3. Consolidated schema statements are executed.
4. `runMigrations(db)` applies any pending incremental migrations.

## Migration Tracking

Migration state is recorded in `schema_migrations`.

Key helpers in `backend/database/migrations.js`:

- `checkMigrationApplied(db, migrationName)`
- `markMigrationApplied(db, migrationName)`
- `runMigrations(db)`

The consolidation marker `consolidated_schema_v1` is used to track the schema-baseline rollout.

## What To Do For New Schema Changes

When adding a schema change:

1. Update `backend/database/schema.js` so fresh databases get the new structure.
2. Add or update an incremental migration in `backend/database/migrations.js` for existing databases.
3. Ensure test DB initialization paths still align with the same schema source.
4. Add or update tests covering migration behavior where needed.

## Operational Notes

- Database files use path resolution from `backend/config/paths.js`.
- Containerized deployments persist data in `/config`.
- Local development uses backend config paths under `backend/config/`.

## Related Docs

- `docs/DATABASE_SCHEMA.md`
- `docs/TECH-DEBT.md`
- `docs/development/ARCHITECTURE_ANALYSIS.md`
- `docs/steering/database-migrations.md`
