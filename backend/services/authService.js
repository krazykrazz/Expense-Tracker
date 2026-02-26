const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/userRepository');
const settingsRepository = require('../repositories/settingsRepository');
const logger = require('../config/logger');

// Lazy require to avoid circular dependency
let _activityLogService = null;
function getActivityLogService() {
  if (!_activityLogService) {
    _activityLogService = require('./activityLogService');
  }
  return _activityLogService;
}

// ─── Constants ───

const BCRYPT_COST_FACTOR = 10;
const MIN_PASSWORD_LENGTH = 4;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const JWT_SECRET_KEY = 'jwt_secret';

// Dummy hash for constant-time comparison when no user found
const DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012';

// ─── In-memory auth state cache ───

let _authStateCache = {
  passwordGateActive: false,
  initialized: false
};

// ─── JWT Secret Management ───

/**
 * Get or generate the JWT signing secret from the settings table.
 * @returns {Promise<string>} 128-char hex string
 */
async function getJwtSecret() {
  let secret = await settingsRepository.getSetting(JWT_SECRET_KEY);
  if (!secret) {
    secret = crypto.randomBytes(64).toString('hex');
    await settingsRepository.setSetting(JWT_SECRET_KEY, secret);
    logger.info('Auth: Generated new JWT signing secret');
  }
  return secret;
}

// ─── Auth State Cache ───

/**
 * Check if Password_Gate is active (synchronous, cached).
 * @returns {boolean}
 */
function isPasswordGateActive() {
  return _authStateCache.passwordGateActive;
}

/**
 * Invalidate the in-memory auth state cache.
 * Forces next middleware check to re-read from DB.
 */
function invalidateAuthCache() {
  _authStateCache.initialized = false;
}

/**
 * Refresh the auth state cache from the database.
 * Called by middleware on first request and after cache invalidation.
 * @returns {Promise<void>}
 */
async function refreshAuthCache() {
  const state = await userRepository.getAuthState();
  _authStateCache.passwordGateActive = state.hasPassword;
  _authStateCache.initialized = true;
}

/**
 * Ensure the auth cache is initialized. Called by middleware.
 * @returns {Promise<void>}
 */
async function ensureCacheInitialized() {
  if (!_authStateCache.initialized) {
    await refreshAuthCache();
  }
}

// ─── User Initialization ───

/**
 * Initialize the default admin user on startup.
 * Creates the user if not exists, preserves existing records.
 * @returns {Promise<void>}
 */
async function initializeDefaultUser() {
  try {
    const existing = await userRepository.findByUsername('admin');
    if (!existing) {
      await userRepository.createUser('admin', '');
      logger.info('Auth: Default admin user created');
      try {
        getActivityLogService().logEvent(
          'auth_user_initialized',
          'auth',
          null,
          "Default admin user created during startup",
          { username: 'admin' }
        );
      } catch (logError) {
        logger.error('Auth: Failed to log user initialization event', logError);
      }
    } else {
      logger.debug('Auth: Default admin user already exists');
    }
    // Initialize the cache
    await refreshAuthCache();
  } catch (error) {
    logger.error('Auth: Failed to initialize default user', error);
    throw error;
  }
}

// ─── Auth Status ───

/**
 * Get the current authentication status.
 * @returns {Promise<{passwordRequired: boolean, username: string}>}
 */
async function getAuthStatus() {
  await ensureCacheInitialized();
  return {
    passwordRequired: _authStateCache.passwordGateActive,
    username: 'admin'
  };
}

// ─── Password Management ───

/**
 * Set or change the admin password.
 * @param {string|null} currentPassword - Current password (required when Password_Gate active)
 * @param {string} newPassword - New password (min 4 chars)
 * @returns {Promise<void>}
 */
async function setPassword(currentPassword, newPassword) {
  // Validate new password length
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    const err = new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    err.statusCode = 400;
    throw err;
  }

  const user = await userRepository.findByUsername('admin');
  if (!user) {
    const err = new Error('Admin user not found');
    err.statusCode = 500;
    throw err;
  }

  const wasPasswordGateActive = user.password_hash && user.password_hash.length > 0;

  // If Password_Gate is active, verify current password
  if (wasPasswordGateActive) {
    if (!currentPassword) {
      const err = new Error('Current password is required');
      err.statusCode = 401;
      throw err;
    }
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      const err = new Error('Current password is incorrect');
      err.statusCode = 401;
      throw err;
    }
  }

  // Hash and store new password
  const hash = await bcrypt.hash(newPassword, BCRYPT_COST_FACTOR);
  await userRepository.updatePasswordHash(user.id, hash);
  invalidateAuthCache();
  await refreshAuthCache();

  logger.info('Auth: Password updated for admin user');

  // Log activity events
  try {
    if (!wasPasswordGateActive) {
      // Transitioning Open_Mode → Password_Gate
      getActivityLogService().logEvent(
        'auth_password_gate_enabled',
        'auth',
        null,
        "Authentication enabled for user 'admin'",
        { username: 'admin' }
      );
    }
    getActivityLogService().logEvent(
      'auth_password_changed',
      'auth',
      null,
      "Password changed for user 'admin'",
      { username: 'admin' }
    );
  } catch (logError) {
    logger.error('Auth: Failed to log password change event', logError);
  }
}

/**
 * Remove the admin password, returning to Open_Mode.
 * @param {string} currentPassword - Current password (required)
 * @returns {Promise<void>}
 */
async function removePassword(currentPassword) {
  const user = await userRepository.findByUsername('admin');
  if (!user) {
    const err = new Error('Admin user not found');
    err.statusCode = 500;
    throw err;
  }

  if (!user.password_hash || user.password_hash.length === 0) {
    const err = new Error('No password is currently set');
    err.statusCode = 400;
    throw err;
  }

  if (!currentPassword) {
    const err = new Error('Current password is required');
    err.statusCode = 401;
    throw err;
  }

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) {
    const err = new Error('Current password is incorrect');
    err.statusCode = 401;
    throw err;
  }

  // Clear password hash
  await userRepository.updatePasswordHash(user.id, '');
  invalidateAuthCache();
  await refreshAuthCache();

  logger.info('Auth: Password removed for admin user, returning to Open_Mode');

  // Log Password_Gate disabled event
  try {
    getActivityLogService().logEvent(
      'auth_password_gate_disabled',
      'auth',
      null,
      "Authentication disabled for user 'admin'",
      { username: 'admin' }
    );
  } catch (logError) {
    logger.error('Auth: Failed to log password gate disabled event', logError);
  }
}

// ─── Login & Token Lifecycle ───

/**
 * Authenticate with password and issue token pair.
 * @param {string} password
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 */
async function login(password) {
  const user = await userRepository.findByUsername('admin');

  // Constant-time comparison even when no user found
  const hashToCompare = user && user.password_hash ? user.password_hash : DUMMY_HASH;
  const valid = await bcrypt.compare(password || '', hashToCompare);

  if (!user || !valid || !user.password_hash) {
    // Log failed login attempt
    try {
      getActivityLogService().logEvent(
        'auth_login_failed',
        'auth',
        null,
        "Failed login attempt for user 'admin'",
        { username: 'admin' }
      );
    } catch (logError) {
      logger.error('Auth: Failed to log login failure event', logError);
    }

    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  const secret = await getJwtSecret();

  const accessToken = jwt.sign(
    { sub: user.id, username: user.username },
    secret,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const refreshToken = jwt.sign(
    { sub: user.id, username: user.username, type: 'refresh' },
    secret,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  // Log successful login
  try {
    getActivityLogService().logEvent(
      'auth_login',
      'auth',
      null,
      "User 'admin' logged in",
      { username: 'admin' }
    );
  } catch (logError) {
    logger.error('Auth: Failed to log login event', logError);
  }

  return { accessToken, refreshToken };
}

/**
 * Refresh an access token using a valid refresh token.
 * @param {string} refreshToken
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 */
async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    const err = new Error('Invalid refresh token');
    err.statusCode = 401;
    throw err;
  }

  const secret = await getJwtSecret();
  let payload;

  try {
    payload = jwt.verify(refreshToken, secret);
  } catch (jwtError) {
    const err = new Error('Invalid refresh token');
    err.statusCode = 401;
    throw err;
  }

  if (payload.type !== 'refresh') {
    const err = new Error('Invalid refresh token');
    err.statusCode = 401;
    throw err;
  }

  // Issue new token pair
  const newAccessToken = jwt.sign(
    { sub: payload.sub, username: payload.username },
    secret,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const newRefreshToken = jwt.sign(
    { sub: payload.sub, username: payload.username, type: 'refresh' },
    secret,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

// ─── Exports ───

module.exports = {
  initializeDefaultUser,
  login,
  refreshAccessToken,
  setPassword,
  removePassword,
  getAuthStatus,
  getJwtSecret,
  isPasswordGateActive,
  invalidateAuthCache,
  ensureCacheInitialized,
  refreshAuthCache,
  // Exposed for testing
  _getAuthStateCache: () => _authStateCache,
  _resetAuthStateCache: () => {
    _authStateCache = { passwordGateActive: false, initialized: false };
  }
};
