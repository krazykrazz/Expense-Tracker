/**
 * Authentication middleware for Express
 *
 * Enforces JWT-based authentication when Password_Gate is active.
 * In Open_Mode (no password set), all requests pass through.
 */

const jwt = require('jsonwebtoken');
const authService = require('../services/authService');
const logger = require('../config/logger');

// ─── Public endpoints (exempt from auth) ───

const PUBLIC_ENDPOINTS = [
  { method: 'GET', path: '/api/health' },
  { method: 'GET', path: '/api/auth/status' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/auth/refresh' }
];

/**
 * Check if a request matches a public endpoint.
 * @param {string} method - HTTP method
 * @param {string} path - Request path
 * @returns {boolean}
 */
function isPublicEndpoint(method, path) {
  return PUBLIC_ENDPOINTS.some(
    ep => ep.method === method.toUpperCase() && ep.path === path
  );
}

/**
 * Extract Bearer token from Authorization header.
 * @param {string|undefined} authHeader
 * @returns {string|null}
 */
function extractBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Verify a JWT token and return the decoded payload.
 * @param {string} token
 * @returns {Promise<Object>} decoded payload
 * @throws {Error} with statusCode and code properties
 */
async function verifyToken(token) {
  const secret = await authService.getJwtSecret();
  try {
    return jwt.verify(token, secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      const error = new Error('Token expired');
      error.statusCode = 401;
      error.code = 'TOKEN_EXPIRED';
      throw error;
    }
    const error = new Error('Authentication required');
    error.statusCode = 401;
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
}

// ─── Main auth middleware ───

/**
 * Express middleware that enforces authentication when Password_Gate is active.
 * - Open_Mode: all requests pass through
 * - Password_Gate: validates Bearer token from Authorization header
 * - Public endpoints always pass through
 */
async function authMiddleware(req, res, next) {
  try {
    // Ensure auth cache is initialized
    await authService.ensureCacheInitialized();

    // Open_Mode — no auth required
    if (!authService.isPasswordGateActive()) {
      return next();
    }

    // Public endpoints — always accessible
    if (isPublicEndpoint(req.method, req.path)) {
      return next();
    }

    // Password_Gate active — validate Bearer token
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      logger.debug('Auth middleware: missing token for', req.path);
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const decoded = await verifyToken(token);
    req.user = decoded;
    return next();
  } catch (err) {
    if (err.code === 'TOKEN_EXPIRED') {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    if (err.code === 'AUTH_REQUIRED') {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }
    logger.error('Auth middleware error:', err);
    return next(err);
  }
}

// ─── SSE auth middleware ───

/**
 * SSE-specific middleware that reads the token from a query parameter.
 * EventSource API doesn't support custom headers, so JWT is passed as ?token=<jwt>.
 * Tokens are validated at connection time only.
 */
async function sseAuthMiddleware(req, res, next) {
  try {
    await authService.ensureCacheInitialized();

    // Open_Mode — no auth required
    if (!authService.isPasswordGateActive()) {
      return next();
    }

    const token = req.query.token || null;
    if (!token) {
      logger.debug('SSE auth: missing token query parameter');
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const decoded = await verifyToken(token);
    req.user = decoded;
    return next();
  } catch (err) {
    if (err.code === 'TOKEN_EXPIRED') {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    if (err.code === 'AUTH_REQUIRED') {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }
    logger.error('SSE auth middleware error:', err);
    return next(err);
  }
}

module.exports = { authMiddleware, sseAuthMiddleware };
