/**
 * Database Isolation Helper for Tests
 *
 * Provides isolated SQLite database instances per test suite to prevent
 * SQLITE_BUSY errors during parallel test execution.
 *
 * Usage:
 *   const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('./dbIsolation');
 *
 *   let db;
 *   beforeAll(async () => { db = await createIsolatedTestDb(); });
 *   afterAll(() => { cleanupIsolatedTestDb(db); });
 *
 * Each call to createIsolatedTestDb() creates a unique SQLite file with:
 *   - WAL journal mode enabled for better concurrency
 *   - Foreign keys enabled
 *   - Full schema (all tables, indexes, triggers, default payment methods)
 *
 * @module test/dbIsolation
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ALL_STATEMENTS } = require('../database/schema');

const DB_DIR = path.join(__dirname, '..', 'config', 'database');

// Track all created database paths for global cleanup
const createdDatabases = [];

/**
 * Generate a unique database file path.
 * Uses worker ID + random suffix to guarantee uniqueness even within the same worker.
 */
function generateUniqueDbPath() {
  const workerId = process.env.JEST_WORKER_ID || '0';
  const suffix = crypto.randomBytes(6).toString('hex');
  return path.join(DB_DIR, `isolated-test-w${workerId}-${suffix}.db`);
}

/**
 * Create an isolated SQLite database with the full application schema.
 * Each call returns a new database instance backed by a unique file.
 *
 * @returns {Promise<sqlite3.Database>} The initialized database instance
 */
function createIsolatedTestDb() {
  return new Promise((resolve, reject) => {
    // Ensure the database directory exists
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    const dbPath = generateUniqueDbPath();
    createdDatabases.push(dbPath);

    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);

      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) return reject(err);

        // Enable WAL journal mode for better concurrency
        db.run('PRAGMA journal_mode = WAL', (err) => {
          if (err) {
            // WAL is optional — continue even if it fails
          }

          // Execute all schema statements sequentially
          runStatements(db, ALL_STATEMENTS)
            .then(() => {
              // Attach the path for later cleanup
              db.__isolatedPath = dbPath;
              resolve(db);
            })
            .catch(reject);
        });
      });
    });
  });
}

/**
 * Clean up an isolated test database.
 * Closes the connection and removes the database file and WAL/SHM artifacts.
 *
 * @param {sqlite3.Database} db - The database instance returned by createIsolatedTestDb
 */
function cleanupIsolatedTestDb(db) {
  if (!db) return;

  const dbPath = db.__isolatedPath;

  // Close returns via callback; wrap to ensure file deletion happens after close
  try {
    db.close(() => {
      removeDbFiles(dbPath);
    });
  } catch (_) {
    // If close throws synchronously, still attempt cleanup
    removeDbFiles(dbPath);
  }
}

/**
 * Remove a database file and its WAL/SHM artifacts.
 * Retries once after a short delay to handle Windows file locking.
 */
function removeDbFiles(dbPath) {
  if (!dbPath) return;

  const suffixes = ['', '-wal', '-shm'];
  for (const suffix of suffixes) {
    const p = dbPath + suffix;
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (_) {
      // Retry after a brief delay (Windows file lock release)
      try {
        setTimeout(() => {
          try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) { /* give up */ }
        }, 100);
      } catch (_) { /* ignore */ }
    }
  }
}

/**
 * Clean up all isolated databases created during this process.
 * Useful as a global teardown safety net.
 */
function cleanupAllIsolatedDbs() {
  for (const dbPath of createdDatabases) {
    removeDbFiles(dbPath);
  }
  createdDatabases.length = 0;
}

// ─── Helpers ───

function runStatements(db, statements) {
  return new Promise((resolve, reject) => {
    let i = 0;
    const next = () => {
      if (i >= statements.length) return resolve();
      db.run(statements[i], (err) => {
        if (err) return reject(err);
        i++;
        next();
      });
    };
    next();
  });
}

module.exports = {
  createIsolatedTestDb,
  cleanupIsolatedTestDb,
  cleanupAllIsolatedDbs,
  generateUniqueDbPath
};