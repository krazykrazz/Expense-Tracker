/**
 * Shared test helpers for activity log integration tests.
 *
 * Extracts common patterns found across all activityLog.integration.test.js files:
 * - Promise-wrapped db.run calls
 * - Activity log cleanup between tests
 * - Event finding and metadata parsing
 * - Fire-and-forget logging delay
 */

/**
 * Run a SQL statement wrapped in a promise.
 * Replaces the repeated `new Promise((resolve, reject) => { db.run(...) })` pattern.
 *
 * @param {object} db - SQLite database instance
 * @param {string} sql - SQL statement to execute
 * @param {Array} [params=[]] - Bind parameters
 * @returns {Promise<{lastID: number, changes: number}>} Run result context
 */
function runSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/**
 * Delete activity logs matching a given column filter.
 * Handles the most common cleanup patterns:
 * - By entity_type: `clearActivityLogs(db, 'entity_type', 'credit_card_payment')`
 * - By event_type: `clearActivityLogs(db, 'event_type', 'auto_payment_logged')`
 * - Multiple entity types: `clearActivityLogs(db, 'entity_type', ['loan_balance', 'loan'])`
 *
 * @param {object} db - SQLite database instance
 * @param {string} column - Column to filter on ('entity_type' or 'event_type')
 * @param {string|string[]} value - Value(s) to match
 */
async function clearActivityLogs(db, column, value) {
  if (Array.isArray(value)) {
    const placeholders = value.map(() => '?').join(', ');
    await runSql(db, `DELETE FROM activity_logs WHERE ${column} IN (${placeholders})`, value);
  } else {
    await runSql(db, `DELETE FROM activity_logs WHERE ${column} = ?`, [value]);
  }
}

/**
 * Find a specific activity log event from a list of recent events.
 *
 * @param {Array} events - Array of activity log events (from findRecent)
 * @param {string} eventType - Expected event_type value
 * @param {number|null} [entityId] - Expected entity_id (omit to match by event_type only)
 * @returns {object|undefined} The matching event, or undefined
 */
function findEvent(events, eventType, entityId) {
  return events.find(e => {
    if (e.event_type !== eventType) return false;
    if (entityId !== undefined) return e.entity_id === entityId;
    return true;
  });
}

/**
 * Find an activity log event and parse its metadata in one step.
 * Returns both the event and parsed metadata, or nulls if not found.
 *
 * @param {Array} events - Array of activity log events
 * @param {string} eventType - Expected event_type value
 * @param {number|null} [entityId] - Expected entity_id
 * @returns {{ event: object|null, metadata: object|null }}
 */
function findEventWithMetadata(events, eventType, entityId) {
  const event = findEvent(events, eventType, entityId);
  if (!event) return { event: null, metadata: null };
  const metadata = JSON.parse(event.metadata);
  return { event, metadata };
}

/**
 * Wait for fire-and-forget activity logging to complete.
 * Replaces the repeated `await new Promise(r => setTimeout(r, 100))` pattern.
 *
 * @param {number} [ms=100] - Milliseconds to wait
 */
function waitForLogging(ms = 100) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = {
  runSql,
  clearActivityLogs,
  findEvent,
  findEventWithMetadata,
  waitForLogging
};
