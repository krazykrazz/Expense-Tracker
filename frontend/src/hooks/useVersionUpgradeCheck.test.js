import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Mock fetchProvider — authAwareFetch delegates to mockFetch
const mockFetch = vi.fn();
vi.mock('../utils/fetchProvider', () => ({
  authAwareFetch: (...args) => mockFetch(...args)
}));

import useVersionUpgradeCheck from './useVersionUpgradeCheck';

// Mock the logger to suppress output in tests
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const LAST_SEEN_VERSION_KEY = 'last_seen_version';

const sampleChangelog = [
  {
    version: '2.0.0',
    date: 'March 1, 2026',
    added: ['New feature'],
    changed: [],
    fixed: [],
    removed: []
  },
  {
    version: '1.0.0',
    date: 'February 23, 2026',
    added: ['Initial release'],
    changed: [],
    fixed: [],
    removed: []
  }
];

describe('useVersionUpgradeCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should not show modal for first-time user (no localStorage)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '2.0.0' })
    });

    const { result } = renderHook(() =>
      useVersionUpgradeCheck({ changelogEntries: sampleChangelog })
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    expect(result.current.showModal).toBe(false);
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe('2.0.0');
  });

  it('should not show modal when version matches localStorage', async () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '2.0.0');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '2.0.0' })
    });

    const { result } = renderHook(() =>
      useVersionUpgradeCheck({ changelogEntries: sampleChangelog })
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    expect(result.current.showModal).toBe(false);
  });

  it('should show modal when version differs from localStorage', async () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '1.0.0');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '2.0.0' })
    });

    const { result } = renderHook(() =>
      useVersionUpgradeCheck({ changelogEntries: sampleChangelog })
    );

    await waitFor(() => {
      expect(result.current.showModal).toBe(true);
    });

    expect(result.current.newVersion).toBe('2.0.0');
    expect(result.current.changelogEntries).toHaveLength(1);
    expect(result.current.changelogEntries[0].version).toBe('2.0.0');
  });

  it('should update localStorage and close modal on handleClose', async () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '1.0.0');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '2.0.0' })
    });

    const { result } = renderHook(() =>
      useVersionUpgradeCheck({ changelogEntries: sampleChangelog })
    );

    await waitFor(() => {
      expect(result.current.showModal).toBe(true);
    });

    act(() => {
      result.current.handleClose();
    });

    expect(result.current.showModal).toBe(false);
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe('2.0.0');
  });

  it('should not show modal on API failure', async () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '1.0.0');
    mockFetch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() =>
      useVersionUpgradeCheck({ changelogEntries: sampleChangelog })
    );

    // Wait for the effect to complete
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    expect(result.current.showModal).toBe(false);
  });

  it('should not show modal on non-ok HTTP response', async () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '1.0.0');
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({})
    });

    const { result } = renderHook(() =>
      useVersionUpgradeCheck({ changelogEntries: sampleChangelog })
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    expect(result.current.showModal).toBe(false);
  });

  it('should defer modal when no changelog entry matches (stale bundle)', async () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '1.0.0');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '3.0.0' })
    });

    const { result } = renderHook(() =>
      useVersionUpgradeCheck({ changelogEntries: sampleChangelog })
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Modal should NOT show — no matching changelog entry means stale JS bundle
    expect(result.current.showModal).toBe(false);
    // localStorage should NOT be updated so the check retries after refresh
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe('1.0.0');
  });

  it('should handle missing version in API response', async () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '1.0.0');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });

    const { result } = renderHook(() =>
      useVersionUpgradeCheck({ changelogEntries: sampleChangelog })
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    expect(result.current.showModal).toBe(false);
  });

  it('should defer modal with default empty changelogEntries', async () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '1.0.0');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '2.0.0' })
    });

    const { result } = renderHook(() => useVersionUpgradeCheck());

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // No changelog entries at all — defer modal
    expect(result.current.showModal).toBe(false);
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe('1.0.0');
  });
});
