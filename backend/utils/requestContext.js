const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

/**
 * Express middleware: remembers the originating tab (X-Tab-ID header) for the rest of the
 * request, so activity-log events can carry it without threading it through every service.
 */
function requestContextMiddleware(req, res, next) {
  const header = req.headers['x-tab-id'];
  storage.run({ tabId: typeof header === 'string' && header ? header : null }, next);
}

/**
 * @returns {string|null} tab id of the request currently being handled, or null outside a request
 */
function getTabId() {
  return storage.getStore()?.tabId ?? null;
}

/**
 * Run fn with a tab id as if it were an incoming request (tests, scripts).
 */
function runWithTabId(tabId, fn) {
  return storage.run({ tabId }, fn);
}

module.exports = { requestContextMiddleware, getTabId, runWithTabId };
