const { getDatabase } = require('../database/db');
const logger = require('../config/logger');

/**
 * Database Helper Utility
 * Provides consistent database query patterns and error handling
 */

/**
 * Execute a query that returns multiple rows
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Array of rows
 */
async function queryAll(sql, params = []) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        logger.error('Database query failed:', { sql, params, error: err.message });
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Execute a query that returns a single row
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Object|null>} Single row or null
 */
async function queryOne(sql, params = []) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        logger.error('Database query failed:', { sql, params, error: err.message });
        reject(err);
      } else {
        resolve(row || null);
      }
    });
  });
}

/**
 * Execute a query that modifies data (INSERT, UPDATE, DELETE)
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Result with lastID and changes
 */
async function execute(sql, params = []) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        logger.error('Database execution failed:', { sql, params, error: err.message });
        reject(err);
      } else {
        resolve({ 
          lastID: this.lastID, 
          changes: this.changes 
        });
      }
    });
  });
}

/**
 * Execute multiple queries in a transaction
 * @param {Array} queries - Array of {sql, params} objects
 * @returns {Promise<Array>} Array of results
 */
async function transaction(queries) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          logger.error('Transaction begin failed:', err.message);
          return reject(err);
        }

        const results = [];
        let completed = 0;

        queries.forEach((query, index) => {
          db.run(query.sql, query.params || [], function(err) {
            if (err) {
              logger.error('Transaction query failed:', { 
                index, 
                sql: query.sql, 
                params: query.params, 
                error: err.message 
              });
              db.run('ROLLBACK');
              return reject(err);
            }

            results[index] = {
              lastID: this.lastID,
              changes: this.changes
            };

            completed++;
            if (completed === queries.length) {
              db.run('COMMIT', (err) => {
                if (err) {
                  logger.error('Transaction commit failed:', err.message);
                  db.run('ROLLBACK');
                  return reject(err);
                }
                resolve(results);
              });
            }
          });
        });
      });
    });
  });
}

/**
 * Get count of rows matching a condition
 * @param {string} table - Table name
 * @param {string} whereClause - WHERE clause (without WHERE keyword)
 * @param {Array} params - Query parameters
 * @returns {Promise<number>} Count of rows
 */
async function count(table, whereClause = '', params = []) {
  const sql = whereClause 
    ? `SELECT COUNT(*) as count FROM ${table} WHERE ${whereClause}`
    : `SELECT COUNT(*) as count FROM ${table}`;
  
  const result = await queryOne(sql, params);
  return result ? result.count : 0;
}

/**
 * Check if a record exists
 * @param {string} table - Table name
 * @param {string} whereClause - WHERE clause (without WHERE keyword)
 * @param {Array} params - Query parameters
 * @returns {Promise<boolean>} True if record exists
 */
async function exists(table, whereClause, params = []) {
  const sql = `SELECT 1 FROM ${table} WHERE ${whereClause} LIMIT 1`;
  const result = await queryOne(sql, params);
  return !!result;
}

/**
 * Run an async callback inside a database transaction.
 * Unlike `transaction()` which takes pre-defined SQL arrays, this accepts
 * an arbitrary async function, allowing complex multi-step operations
 * (e.g., SELECT then UPDATE) to be atomic.
 *
 * @param {Function} fn - Async function to execute within the transaction.
 *   Receives the db instance as its argument. Use db.run/db.get/db.all directly.
 * @returns {Promise<*>} The return value of fn
 */
async function runInTransaction(fn) {
  const db = await getDatabase();

  const runSql = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });

  const getSql = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });

  const allSql = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

  await runSql('BEGIN TRANSACTION');
  try {
    const result = await fn({ run: runSql, get: getSql, all: allSql });
    await runSql('COMMIT');
    return result;
  } catch (err) {
    try {
      await runSql('ROLLBACK');
    } catch (rollbackErr) {
      logger.error('Transaction rollback failed:', rollbackErr.message);
    }
    throw err;
  }
}

module.exports = {
  queryAll,
  queryOne,
  execute,
  transaction,
  runInTransaction,
  count,
  exists
};