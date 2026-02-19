// Stable per-tab identifier — regenerated on page reload, consistent for the tab's lifetime
export const TAB_ID = crypto.randomUUID();

export function getTabId() {
  return TAB_ID;
}

/**
 * Thin fetch wrapper that injects the X-Tab-ID header on every request.
 * Use this for mutation requests (POST, PUT, PATCH, DELETE) so the backend
 * can identify the originating tab and suppress self-updates in useDataSync.
 */
export function fetchWithTabId(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'X-Tab-ID': TAB_ID,
      ...(options.headers || {}),
    },
  });
}
