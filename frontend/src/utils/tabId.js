// Stable per-tab identifier — regenerated on page reload, consistent for the tab's lifetime
// fetchWithTabId removed — X-Tab-ID injection now handled solely by apiClient.js

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
