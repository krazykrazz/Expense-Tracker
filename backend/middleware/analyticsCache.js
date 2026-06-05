/**
 * Simple in-memory cache for expensive analytics endpoints.
 * Caches responses with a configurable TTL and invalidates on expense mutations.
 */

const logger = require('../config/logger');

class AnalyticsCache {
  constructor() {
    this._cache = new Map();
    this._defaultTtl = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get a cached value if still valid
   * @param {string} key - Cache key
   * @returns {*|null} Cached value or null
   */
  get(key) {
    const entry = this._cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this._cache.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Set a cached value
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} [ttl] - TTL in milliseconds
   */
  set(key, value, ttl) {
    this._cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl || this._defaultTtl)
    });
  }

  /**
   * Invalidate all cached analytics (called on expense create/update/delete)
   */
  invalidate() {
    if (this._cache.size > 0) {
      logger.debug(`Analytics cache invalidated (${this._cache.size} entries cleared)`);
      this._cache.clear();
    }
  }
}

const analyticsCache = new AnalyticsCache();

/**
 * Express middleware factory that caches endpoint responses.
 * @param {number} [ttl] - TTL in ms (default 5 min)
 * @returns {Function} Express middleware
 */
function cacheMiddleware(ttl) {
  return (req, res, next) => {
    const key = req.originalUrl || req.url;
    const cached = analyticsCache.get(key);
    if (cached) {
      return res.json(cached);
    }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        analyticsCache.set(key, body, ttl);
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = { analyticsCache, cacheMiddleware };
