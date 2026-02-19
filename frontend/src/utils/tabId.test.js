import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TAB_ID, getTabId, fetchWithTabId } from './tabId.js';

describe('tabId utility', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('TAB_ID', () => {
    it('is a non-empty string', () => {
      expect(typeof TAB_ID).toBe('string');
      expect(TAB_ID.length).toBeGreaterThan(0);
    });

    it('getTabId returns the same TAB_ID constant', () => {
      expect(getTabId()).toBe(TAB_ID);
    });
  });

  describe('fetchWithTabId', () => {
    it('calls fetch with X-Tab-ID header set to the module-level TAB_ID', async () => {
      await fetchWithTabId('/api/expenses', { method: 'POST', body: '{}' });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/expenses');
      expect(options.headers['X-Tab-ID']).toBe(TAB_ID);
    });

    it('preserves existing headers in options.headers alongside X-Tab-ID', async () => {
      await fetchWithTabId('/api/expenses', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token123',
        },
      });

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['X-Tab-ID']).toBe(TAB_ID);
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Authorization']).toBe('Bearer token123');
    });

    it('works with no options argument', async () => {
      await fetchWithTabId('/api/loans');

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/loans');
      expect(options.headers['X-Tab-ID']).toBe(TAB_ID);
    });

    it('passes through other options (method, body) unchanged', async () => {
      const body = JSON.stringify({ amount: 42 });
      await fetchWithTabId('/api/budgets', { method: 'DELETE', body });

      const [, options] = fetchMock.mock.calls[0];
      expect(options.method).toBe('DELETE');
      expect(options.body).toBe(body);
    });
  });
});
