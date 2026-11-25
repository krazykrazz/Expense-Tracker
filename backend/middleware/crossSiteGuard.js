const logger = require('../config/logger');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Refuse state-changing API requests that a browser sent from another site (cross-site request forgery).
 * In open mode (no password) every endpoint accepts requests without credentials, and CORS does not stop a
 * page elsewhere from submitting a plain form to this app: it would connect, refresh or disconnect banks, send
 * notifications or change data. Browsers mark such a request `Sec-Fetch-Site: cross-site`; the app's own pages
 * send `same-origin` whatever the host or reverse proxy, so only the header the browser sets is trusted.
 * A browser on the origin configured in CORS_ORIGIN is still allowed. Requests without the header (older
 * browsers, curl, scripts) pass, as before.
 */
function crossSiteGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method) || req.get('sec-fetch-site') !== 'cross-site') return next();
  const allowedOrigin = process.env.CORS_ORIGIN;
  if (allowedOrigin && req.get('origin') === allowedOrigin) return next();
  logger.warn('Refused a cross-site request', { method: req.method, path: req.originalUrl, origin: req.get('origin') || null });
  return res.status(403).json({ error: 'Cross-site requests are not allowed' });
}

module.exports = crossSiteGuard;
