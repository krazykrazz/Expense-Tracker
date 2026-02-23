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
 * Run all pending migrations.
 *
 * After the schema consolidation every table is created declaratively
 * by `schema.js`.  This function simply records the
 * `consolidated_schema_v1` marker so future migration checks know the
 * consolidated schema is in place.
 *
 * @param {object} db - SQLite database instance
 * @returns {Promise<void>}
 */
async function runMigrations(db) {
  const MIGRATION_NAME = 'consolidated_schema_v1';

  const isApplied = await checkMigrationApplied(db, MIGRATION_NAME);
  if (isApplied) {
    logger.info('Consolidated schema already applied, no migrations to run');
    return;
  }

  await markMigrationApplied(db, MIGRATION_NAME);
  logger.info('Marked consolidated_schema_v1 as applied');
}

module.exports = {
  runMigrations,
  checkMigrationApplied,
  markMigrationApplied
};
