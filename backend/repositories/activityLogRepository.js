const { getDatabase } = require('../database/db');
const logger = require('../config/logger');

/**
 * Insert a new activity log event
 * @param {object} event - Event data with event_type, entity_type, entity_id, user_action, metadata, timestamp
 * @returns {Promise<number>} - Inserted event ID
 */
async function insert(event) {
  const db = await getDatabase();
  const { event_type, entity_type, entity_id, user_action, metadata, timestamp } = event;
  
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO activity_logs (event_type, entity_type, entity_id, user_action, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    db.run(sql, [
      event_type,
      entity_type,
      entity_id,
      user_action,
      metadata,
      timestamp || new Date().toISOString()
    ], function(err) {
      if (err) {
        logger.error('Error inserting activity log:', err);
        reject(err);
        return;
      }
      resolve(this.lastID);
    });
  });
}

/**
 * Find recent events with pagination
 * @param {number} limit - Maximum number of events
 * @param {number} offset - Number of events to skip
 * @returns {Promise<Array>} - Array of event objects
 */
async function findRecent(limit, offset) {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT id, event_type, entity_type, entity_id, user_action, metadata, timestamp
      FROM activity_logs
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;
    
    db.all(sql, [limit, offset], (err, rows) => {
      if (err) {
        logger.error('Error finding recent activity logs:', err);
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

/**
 * Count total events
 * @returns {Promise<number>} - Total event count
 */
async function count() {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    const sql = `SELECT COUNT(*) as count FROM activity_logs`;
    
    db.get(sql, [], (err, result) => {
      if (err) {
        logger.error('Error counting activity logs:', err);
        reject(err);
        return;
      }
      resolve(result.count);
    });
  });
}

/**
 * Delete events older than a specific date
 * @param {Date} date - Cutoff date
 * @returns {Promise<number>} - Number of deleted events
 */
async function deleteOlderThan(date) {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    const sql = `DELETE FROM activity_logs WHERE timestamp < ?`;
    
    db.run(sql, [date.toISOString()], function(err) {
      if (err) {
        logger.error('Error deleting old activity logs:', err);
        reject(err);
        return;
      }
      resolve(this.changes);
    });
  });
}

/**
 * Delete excess events beyond max count (keeps newest)
 * @param {number} maxCount - Maximum events to keep
 * @returns {Promise<number>} - Number of deleted events
 */
async function deleteExcessEvents(maxCount) {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    const sql = `
      DELETE FROM activity_logs
      WHERE id NOT IN (
        SELECT id FROM activity_logs
        ORDER BY timestamp DESC
        LIMIT ?
      )
    `;
    
    db.run(sql, [maxCount], function(err) {
      if (err) {
        logger.error('Error deleting excess activity logs:', err);
        reject(err);
        return;
      }
      resolve(this.changes);
    });
  });
}

/**
 * Get timestamp of oldest event
 * @returns {Promise<string|null>} - ISO timestamp or null
 */
async function getOldestEventTimestamp() {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT timestamp
      FROM activity_logs
      ORDER BY timestamp ASC
      LIMIT 1
    `;
    
    db.get(sql, [], (err, result) => {
      if (err) {
        logger.error('Error getting oldest activity log timestamp:', err);
        reject(err);
        return;
      }
      resolve(result ? result.timestamp : null);
    });
  });
}

module.exports = {
  insert,
  findRecent,
  count,
  deleteOlderThan,
  deleteExcessEvents,
  getOldestEventTimestamp
};
