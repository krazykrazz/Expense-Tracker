const { getDatabase } = require('../database/db');
const logger = require('../config/logger');

/**
 * Get a setting value by key
 * @param {string} key - Setting key
 * @returns {Promise<string|null>} - Setting value or null if not found
 */
async function getSetting(key) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT value FROM settings WHERE key = ?',
      [key],
      (err, row) => {
        if (err) {
          logger.error('Error getting setting:', err);
          reject(err);
        } else {
          resolve(row ? row.value : null);
        }
      }
    );
  });
}

/**
 * Set a setting value
 * @param {string} key - Setting key
 * @param {string} value - Setting value (stored as string)
 * @returns {Promise<void>}
 */
async function setSetting(key, value) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO settings (key, value, updated_at) 
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET 
         value = excluded.value,
         updated_at = CURRENT_TIMESTAMP`,
      [key, value],
      (err) => {
        if (err) {
          logger.error('Error setting setting:', err);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Get multiple settings at once
 * @param {string[]} keys - Array of setting keys
 * @returns {Promise<Object>} - Map of key -> value
 */
async function getMultiple(keys) {
  if (!keys || keys.length === 0) {
    return {};
  }

  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const placeholders = keys.map(() => '?').join(',');
    db.all(
      `SELECT key, value FROM settings WHERE key IN (${placeholders})`,
      keys,
      (err, rows) => {
        if (err) {
          logger.error('Error getting multiple settings:', err);
          reject(err);
        } else {
          const result = {};
          rows.forEach(row => {
            result[row.key] = row.value;
          });
          resolve(result);
        }
      }
    );
  });
}

module.exports = {
  getSetting,
  setSetting,
  getMultiple
};
