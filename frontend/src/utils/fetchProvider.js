/**
 * Fetch Provider
 * 
 * Holds a module-level reference to the fetch implementation used across the app.
 * Defaults to native fetch. When Password_Gate is active, AuthContext replaces
 * this with an authFetch wrapper that attaches Bearer tokens and handles
 * TOKEN_EXPIRED with silent refresh + retry.
 * 
 * Separated into its own module to avoid circular dependencies between
 * apiClient.js and tabId.js.
 */

// Capture the original native fetch before anything can override it.
// authFetch.js must use this to avoid infinite recursion.
const _nativeFetch = window.fetch.bind(window);

let _fetch = _nativeFetch;

/**
 * Replace the fetch implementation used by apiClient and fetchWithTabId.
 * @param {Function} fn - A fetch-compatible function (e.g. authFetch)
 */
export function setFetchFn(fn) {
  _fetch = fn;
}

/**
 * Get the current fetch implementation.
 * @returns {Function}
 */
export function getFetchFn() {
  return _fetch;
}

/**
 * Get the original native fetch (for use by authFetch.js to avoid recursion).
 * @returns {Function}
 */
export function getNativeFetch() {
  return _nativeFetch;
}

/**
 * Auth-aware fetch — convenience wrapper that calls the current fetch implementation.
 * Drop-in replacement for `fetch()` in components and hooks.
 * @param  {...any} args - Same arguments as native fetch
 * @returns {Promise<Response>}
 */
export function authAwareFetch(...args) {
  return _fetch(...args);
}
