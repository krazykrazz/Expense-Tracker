/**
 * Auth Fetch Wrapper
 * 
 * Wraps the native fetch API to attach Bearer tokens and handle
 * TOKEN_EXPIRED responses with a single silent refresh + retry.
 * Uses a shared refresh promise to prevent concurrent refresh requests.
 * 
 * Requirements: 8.4, 8.5
 */

import { getNativeFetch } from './fetchProvider';

let refreshPromise = null;

/**
 * Perform a single token refresh, deduplicating concurrent calls.
 * @param {Function} refreshFn - Async function that refreshes the token
 * @returns {Promise<boolean>} Whether the refresh succeeded
 */
async function doRefresh(refreshFn) {
  if (!refreshPromise) {
    refreshPromise = refreshFn().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

/**
 * Create an auth-aware fetch wrapper.
 * 
 * @param {Function} getToken - Returns the current access token (or null)
 * @param {Function} refreshToken - Async function that refreshes the token; returns true on success
 * @param {Function} onAuthFailure - Called when refresh fails (e.g., redirect to login)
 * @returns {Function} authFetch(url, options?) — drop-in replacement for fetch
 */
export function createAuthFetch(getToken, refreshToken, onAuthFailure) {
  return async function authFetch(url, options = {}) {
    const nativeFetch = getNativeFetch();
    const token = getToken();
    const headers = { ...options.headers };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response = await nativeFetch(url, { ...options, headers, credentials: 'include' });

    // On TOKEN_EXPIRED, attempt one silent refresh then retry
    if (response.status === 401) {
      const body = await response.json().catch(() => ({}));

      if (body.code === 'TOKEN_EXPIRED') {
        const refreshed = await doRefresh(refreshToken);

        if (refreshed) {
          const newToken = getToken();
          const retryHeaders = { ...options.headers };
          if (newToken) {
            retryHeaders['Authorization'] = `Bearer ${newToken}`;
          }
          response = await nativeFetch(url, { ...options, headers: retryHeaders, credentials: 'include' });
        } else {
          onAuthFailure();
          return response;
        }
      }
    }

    return response;
  };
}
