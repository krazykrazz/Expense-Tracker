import { describe, it, expect } from 'vitest';

import { TAB_ID, getTabId } from './tabId.js';

describe('tabId utility', () => {
  describe('TAB_ID', () => {
    it('is a non-empty string', () => {
      expect(typeof TAB_ID).toBe('string');
      expect(TAB_ID.length).toBeGreaterThan(0);
    });

    it('getTabId returns the same TAB_ID constant', () => {
      expect(getTabId()).toBe(TAB_ID);
    });
  });

  // fetchWithTabId removed — X-Tab-ID injection now handled solely by apiClient.js
});
