const { queryOne, execute } = require('../utils/dbHelper');
const logger = require('../config/logger');

/**
 * User Repository
 * Data access for the users table (authentication infrastructure).
 *
 * @module repositories/userRepository
 */

/**
 * Find a user by username.
 * @param {string} username
 * @returns {Promise<{id: number, username: string, password_hash: string, created_at: string, updated_at: string}|null>}
 */
async function findByUsername(username) {
  logger.debug('Finding user by username:', username);
  return queryOne('SELECT * FROM users WHERE username = ?', [username]);
}

/**
 * Update the password hash for a user.
 * @param {number} id - User ID
 * @param {string} hash - New bcrypt password hash (or empty string to clear)
 * @returns {Promise<void>}
 */
async function updatePasswordHash(id, hash) {
  logger.debug('Updating password hash for user ID:', id);
  await execute(
    'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [hash, id]
  );
}

/**
 * Create a user if one with the same username does not already exist.
 * Uses INSERT OR IGNORE to ensure idempotence.
 * @param {string} username
 * @param {string} hash - bcrypt password hash (or empty string)
 * @returns {Promise<{id: number, username: string}>}
 */
async function createUser(username, hash) {
  logger.debug('Creating user (if not exists):', username);
  await execute(
    'INSERT OR IGNORE INTO users (username, password_hash) VALUES (?, ?)',
    [username, hash]
  );
  const user = await findByUsername(username);
  return { id: user.id, username: user.username };
}

/**
 * Get the current authentication state.
 * @returns {Promise<{hasPassword: boolean}>}
 */
async function getAuthState() {
  const user = await queryOne(
    "SELECT password_hash FROM users WHERE username = 'admin'"
  );
  return { hasPassword: !!(user && user.password_hash && user.password_hash.length > 0) };
}

module.exports = {
  findByUsername,
  updatePasswordHash,
  createUser,
  getAuthState
};
