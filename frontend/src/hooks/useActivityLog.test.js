import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authAwareFetch } from '../utils/fetchProvider';
import useActivityLog from './useActivityLog';

vi.mock('../utils/fetchProvider', () => ({
  authAwareFetch: vi.fn()
}));

vi.mock('../config', () => ({
  API_ENDPOINTS: {
    ACTIVITY_LOGS: '/api/activity-logs',
    ACTIVITY_LOGS_STATS: '/api/activity-logs/stats'
  }
}));

function jsonResponse(body, { ok = true, statusText = '' } = {}) {
  return {
    ok,
    statusText,
    json: vi.fn().mockResolvedValue(body)
  };
}

describe('useActivityLog', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads events and stats using the persisted display limit', async () => {
    localStorage.setItem('activityLogDisplayLimit', '25');
    authAwareFetch.mockImplementation((url) => {
      if (url.includes('/stats')) {
        return Promise.resolve(jsonResponse({ totalEvents: 2 }));
      }
      return Promise.resolve(jsonResponse({
        events: [{ id: 1 }, { id: 2 }],
        hasMore: true
      }));
    });

    const { result } = renderHook(() => useActivityLog());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.current.stats).toEqual({ totalEvents: 2 });
    expect(result.current.displayLimit).toBe(25);
    expect(result.current.hasMore).toBe(true);
    expect(authAwareFetch).toHaveBeenCalledWith('/api/activity-logs?offset=0&limit=25');
    expect(authAwareFetch).toHaveBeenCalledWith('/api/activity-logs/stats');
  });

  it('appends the next page when loadMore is available', async () => {
    authAwareFetch.mockImplementation((url) => {
      if (url.includes('/stats')) {
        return Promise.resolve(jsonResponse({ totalEvents: 3 }));
      }
      const offset = new URL(url, 'http://expense-tracker.test.invalid').searchParams.get('offset');
      return Promise.resolve(jsonResponse({
        events: offset === '0' ? [{ id: 1 }] : [{ id: 2 }, { id: 3 }],
        hasMore: offset === '0'
      }));
    });

    const { result } = renderHook(() => useActivityLog(10));
    await waitFor(() => expect(result.current.events).toEqual([{ id: 1 }]));

    act(() => result.current.loadMore());

    await waitFor(() => {
      expect(result.current.events).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });
    expect(authAwareFetch).toHaveBeenCalledWith('/api/activity-logs?offset=10&limit=10');
    expect(result.current.hasMore).toBe(false);
  });

  it('surfaces event errors without making stats failures fatal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    authAwareFetch.mockImplementation((url) => {
      if (url.includes('/stats')) return Promise.reject(new Error('stats unavailable'));
      return Promise.resolve(jsonResponse({}, { ok: false, statusText: 'Service Unavailable' }));
    });

    const { result } = renderHook(() => useActivityLog());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to fetch activity logs: Service Unavailable');
    expect(result.current.events).toEqual([]);
    expect(result.current.stats).toBeNull();
  });

  it('persists a changed display limit and refetches from the beginning', async () => {
    authAwareFetch.mockImplementation((url) => {
      if (url.includes('/stats')) return Promise.resolve(jsonResponse({ totalEvents: 0 }));
      return Promise.resolve(jsonResponse({ events: [], hasMore: false }));
    });
    const { result } = renderHook(() => useActivityLog(10));
    await waitFor(() => expect(authAwareFetch).toHaveBeenCalledTimes(2));

    act(() => result.current.setDisplayLimit(100));

    await waitFor(() => {
      expect(authAwareFetch).toHaveBeenCalledWith('/api/activity-logs?offset=0&limit=100');
    });
    expect(localStorage.getItem('activityLogDisplayLimit')).toBe('100');
    expect(result.current.displayLimit).toBe(100);
  });
});
