const { AsyncLocalStorage } = require('async_hooks');
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

/** Transactions waiting for the one open on the shared connection give up after this long. */
const TRANSACTION_WAIT_MS = 30000;

/** Tail of the queue of transactions: each one starts when the previous one has finished. */
let transactionQueue = Promise.resolve();

/** The transaction open in the current async flow, so a nested runInTransaction joins it instead of waiting for itself. */
const openTransaction = new AsyncLocalStorage();

/**
 * Run an async callback inside a database transaction.
 * Unlike `transaction()` which takes pre-defined SQL arrays, this accepts
 * an arbitrary async function, allowing complex multi-step operations
 * (e.g., SELECT then UPDATE) to be atomic.
 *
 * The app has one shared connection and SQLite can't nest `BEGIN`, so transactions run one at a time: a second
 * caller (a bank sync while a payment is recorded) waits for the first instead of failing with "cannot start a
 * transaction within a transaction". A call made from inside a running callback joins that transaction.
 * Plain queries from other requests still share the connection, so keep callbacks short.
 *
 * @param {Function} fn - Async function to execute within the transaction.
 *   Receives `{ run, get, all }`; use them for every statement that belongs to the transaction.
 * @returns {Promise<*>} The return value of fn
 */
async function runInTransaction(fn) {
  const joined = openTransaction.getStore();
  if (joined && joined.active) {
    return fn(joined.tx);
  }

  const previous = transactionQueue;
  let release;
  transactionQueue = new Promise((resolve) => { release = resolve; });
  try {
    await waitForTurn(previous);
    return await runExclusiveTransaction(fn);
  } finally {
    release();
  }
}

async function waitForTurn(previous) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('The database is busy with another transaction. Try again.')), TRANSACTION_WAIT_MS);
  });
  try {
    await Promise.race([previous, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function runExclusiveTransaction(fn) {
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

  const tx = { run: runSql, get: getSql, all: allSql };
  const context = { tx, active: true };

  await runSql('BEGIN TRANSACTION');
  try {
    const result = await openTransaction.run(context, () => fn(tx));
    await runSql('COMMIT');
    return result;
  } catch (err) {
    try {
      await runSql('ROLLBACK');
    } catch (rollbackErr) {
      logger.error('Transaction rollback failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    // Work the callback left running (not awaited) must not join a transaction that has ended
    context.active = false;
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