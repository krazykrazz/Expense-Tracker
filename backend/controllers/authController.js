/**
 * Auth Controller
 * 
 * Handles HTTP requests for authentication operations.
 * Provides endpoints for login, logout, token refresh, auth status,
 * and password management.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.10
 */

const authService = require('../services/authService');
const activityLogService = require('../services/activityLogService');
const logger = require('../config/logger');

const REFRESH_TOKEN_COOKIE = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict',
  path: '/'
};

/**
 * Login with password
 * POST /api/auth/login
 * Body: { password }
 * Returns: { accessToken }
 * Sets refreshToken as HTTP-only cookie
 * 
 * Requirements: 4.1, 4.2
 */
async function login(req, res) {
  try {
    const { password } = req.body;

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required' });
    }

    const { accessToken, refreshToken } = await authService.login(password);

    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, COOKIE_OPTIONS);
    res.json({ accessToken });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error('Auth: Login error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
}


/**
 * Refresh access token
 * POST /api/auth/refresh
 * Reads refreshToken from HTTP-only cookie
 * Returns: { accessToken }
 * Sets new refreshToken cookie
 * 
 * Requirements: 4.4, 4.5
 */
async function refresh(req, res) {
  try {
    const token = req.cookies && req.cookies[REFRESH_TOKEN_COOKIE];

    if (!token) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const { accessToken, refreshToken } = await authService.refreshAccessToken(token);

    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, COOKIE_OPTIONS);
    res.json({ accessToken });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error('Auth: Refresh error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Logout — clear refresh token cookie
 * POST /api/auth/logout
 * 
 * Requirements: 4.6, 4.10
 */
async function logout(req, res) {
  try {
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });

    // Log logout event (fire-and-forget)
    try {
      activityLogService.logEvent(
        'auth_logout',
        'auth',
        null,
        "User 'admin' logged out",
        { username: 'admin' }
      );
    } catch (logError) {
      logger.error('Auth: Failed to log logout event', logError);
    }

    res.json({ message: 'Logged out' });
  } catch (error) {
    logger.error('Auth: Logout error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get auth status
 * GET /api/auth/status
 * Returns: { passwordRequired, username }
 * 
 * Requirements: 4.3
 */
async function getStatus(req, res) {
  try {
    const status = await authService.getAuthStatus();
    res.json(status);
  } catch (error) {
    logger.error('Auth: Status error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Set or change password
 * PUT /api/auth/password
 * Body: { currentPassword?, newPassword }
 * 
 * Requirements: 4.1 (via authService)
 */
async function setPassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'New password is required' });
    }

    await authService.setPassword(currentPassword || null, newPassword);
    res.json({ message: 'Password updated' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error('Auth: Set password error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Remove password (return to Open_Mode)
 * DELETE /api/auth/password
 * Body: { currentPassword }
 * 
 * Requirements: 4.1 (via authService)
 */
async function removePassword(req, res) {
  try {
    const { currentPassword } = req.body;

    if (!currentPassword || typeof currentPassword !== 'string') {
      return res.status(400).json({ error: 'Current password is required' });
    }

    await authService.removePassword(currentPassword);
    res.json({ message: 'Password removed' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error('Auth: Remove password error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  login,
  refresh,
  logout,
  getStatus,
  setPassword,
  removePassword
};
