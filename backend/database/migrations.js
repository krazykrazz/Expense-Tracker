const logger = require('../config/logger');

/**
 * Minimal migration module (post-consolidation)
 *
 * All ~50 incremental migration functions have been replaced by the
 * declarative schema in `backend/database/schema.js`.  This module
 * retains only the utilities needed to track migration state and a
 * single `runMigrations` entry-point that marks the consolidated
 * schema as applied.
 *
 * @module database/migrations
 */

/**
 * Check if a migration has been applied
 * @param {object} db - SQLite database instance
 * @param {string} migrationName - Name of the migration to check
 * @returns {Promise<boolean>} True if the migration has been applied
 */
function checkMigrationApplied(db, migrationName) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT 1 FROM schema_migrations WHERE migration_name = ?',
      [migrationName],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(!!row);
      }
    );
  });
}

/**
 * Mark a migration as applied
 * @param {object} db - SQLite database instance
 * @param {string} migrationName - Name of the migration to record
 * @returns {Promise<void>}
 */
function markMigrationApplied(db, migrationName) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR IGNORE INTO schema_migrations (migration_name) VALUES (?)',
      [migrationName],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });
}

/**
 * Run a SQL statement against the database.
 * @param {object} db - SQLite database instance
 * @param {string} sql - SQL statement to execute
 * @param {Array} params - Query parameters
 * @returns {Promise<void>}
 */
function runSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Individual migration definitions.
 * Each entry has a unique name and an async apply function.
 */
const MIGRATIONS = [
  {
    name: 'auth_infrastructure_v1',
    async apply(db) {
      await runSql(db, "INSERT OR IGNORE INTO users (username, password_hash) VALUES ('admin', '')");
      logger.info('Seeded default admin user');
    }
  }
];

/**
 * Run all pending migrations.
 *
 * After the schema consolidation every table is created declaratively
 * by `schema.js`.  This function records the `consolidated_schema_v1`
 * marker and then runs any incremental migrations that haven't been
 * applied yet.
 *
 * @param {object} db - SQLite database instance
 * @returns {Promise<void>}
 */
async function runMigrations(db) {
  const CONSOLIDATED_NAME = 'consolidated_schema_v1';

  const isConsolidatedApplied = await checkMigrationApplied(db, CONSOLIDATED_NAME);
  if (!isConsolidatedApplied) {
    await markMigrationApplied(db, CONSOLIDATED_NAME);
    logger.info('Marked consolidated_schema_v1 as applied');
  }

  // Run incremental migrations
  for (const migration of MIGRATIONS) {
    const applied = await checkMigrationApplied(db, migration.name);
    if (applied) continue;

    logger.info(`Running migration: ${migration.name}`);
    await migration.apply(db);
    await markMigrationApplied(db, migration.name);
    logger.info(`Migration ${migration.name} applied`);
  }
}

module.exports = {
  runMigrations,
  checkMigrationApplied,
  markMigrationApplied
};
