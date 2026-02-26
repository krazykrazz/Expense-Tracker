// Stable per-tab identifier — regenerated on page reload, consistent for the tab's lifetime

import { getFetchFn } from './fetchProvider';

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (HTTP on local network)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const TAB_ID = generateUUID();

export function getTabId() {
  return TAB_ID;
}

/**
 * Thin fetch wrapper that injects the X-Tab-ID header on every request.
 * Use this for mutation requests (POST, PUT, PATCH, DELETE) so the backend
 * can identify the originating tab and suppress self-updates in useDataSync.
 *
 * Uses the auth-aware fetch from fetchProvider so Bearer tokens are attached
 * automatically when Password_Gate is active.
 */
export function fetchWithTabId(url, options = {}) {
  const fn = getFetchFn();
  return fn(url, {
    ...options,
    headers: {
      'X-Tab-ID': TAB_ID,
      ...(options.headers || {}),
    },
  });
}
