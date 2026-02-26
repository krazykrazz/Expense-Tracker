import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock fetchProvider — authAwareFetch delegates to mockFetch
const mockFetch = vi.fn();
vi.mock('../utils/fetchProvider', () => ({
  authAwareFetch: (...args) => mockFetch(...args)
}));

import { useContainerUpdateCheck } from './useContainerUpdateCheck';

// ── Helpers ──

const BASELINE = { version: '5.12.0', startupId: 'abc-123' };
const UPDATED = { version: '5.13.0', startupId: 'def-456' };

function mockFetchSuccess(data) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchFailure(error = 'Network error') {
  mockFetch.mockRejectedValue(new Error(error));
}

describe('useContainerUpdateCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Requirement 1.1: Initial fetch stores baseline ──

  it('should store baseline on successful initial fetch', async () => {
    mockFetchSuccess(BASELINE);

    const { result, unmount } = renderHook(() => useContainerUpdateCheck());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.showBanner).toBe(false);
    expect(result.current.newVersion).toBeNull();

    unmount();
  });

  // ── Requirement 1.2: Retry behavior on init failure ──

  it('should retry up to 3 times with exponential backoff on init failure', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockRejectedValueOnce(new Error('fail 3'))
      .mockRejectedValueOnce(new Error('fail 4'));

    const { result, unmount } = renderHook(() => useContainerUpdateCheck());

    // Initial attempt (attempt 0)
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Retry 1 after 1s (attempt 1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Retry 2 after 2s (attempt 2)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Retry 3 after 4s (attempt 3 — last attempt, MAX_RETRIES reached)
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(mockFetch).toHaveBeenCalledTimes(4);

    // No more retries after that
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(mockFetch).toHaveBeenCalledTimes(4);

    expect(result.current.showBanner).toBe(false);
    unmount();
  });

  it('should succeed on retry after initial failures', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(BASELINE) });

    const { result, unmount } = renderHook(() => useContainerUpdateCheck());

    // Initial attempt fails
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Retry after 1s succeeds
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.showBanner).toBe(false);

    unmount();
  });

  // ── Requirement 1.3: Null baseline adoption ──

  it('should adopt fetched version as baseline when baseline is null', async () => {
    mockFetchFailure();

    const { result, unmount } = renderHook(() => useContainerUpdateCheck());

    // Exhaust all retries
    for (let i = 0; i < 4; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    }

    // Now mock success for reconnect
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(BASELINE),
    });

    act(() => { result.current.onSseReconnect(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5500); });

    // Should adopt, not show banner
    expect(result.current.showBanner).toBe(false);
    expect(result.current.newVersion).toBeNull();

    unmount();
  });

  // ── Requirement 2.2: Mismatch when version differs ──

  it('should detect mismatch when version differs', async () => {
    mockFetchSuccess(BASELINE);

    const { result, unmount } = renderHook(() => useContainerUpdateCheck());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    mockFetch.mockReset().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...BASELINE, version: '6.0.0' }),
    });

    act(() => { result.current.onSseReconnect(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5500); });

    expect(result.current.showBanner).toBe(true);
    expect(result.current.newVersion).toBe('6.0.0');

    unmount();
  });

  // ── Requirement 4.2: Mismatch when startupId differs ──

  it('should detect mismatch when startupId differs', async () => {
    mockFetchSuccess(BASELINE);

    const { result, unmount } = renderHook(() => useContainerUpdateCheck());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    mockFetch.mockReset().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...BASELINE, startupId: 'new-id' }),
    });

    act(() => { result.current.onSseReconnect(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5500); });

    expect(result.current.showBanner).toBe(true);
    expect(result.current.newVersion).toBe(BASELINE.version);

    unmount();
  });

  // ── Requirement 2.3: No mismatch when both match ──

  it('should not trigger mismatch when both fields match', async () => {
    mockFetchSuccess(BASELINE);

    const { result, unmount } = renderHook(() => useContainerUpdateCheck());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    mockFetch.mockReset().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(BASELINE),
    });

    act(() => { result.current.onSseReconnect(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5500); });

    expect(result.current.showBanner).toBe(false);

    unmount();
  });

  // ── Requirement 2.4: Silent skip on reconnect fetch error ──

  it('should silently skip on reconnect fetch error', async () => {
    mockFetchSuccess(BASELINE);

    const { result, unmount } = renderHook(() => useContainerUpdateCheck());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    mockFetch.mockReset().mockRejectedValue(new Error('Network error'));

    act(() => { result.current.onSseReconnect(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5500); });

    expect(result.current.showBanner).toBe(false);
    expect(result.current.newVersion).toBeNull();

    unmount();
  });

  // ── Requirement 5.1: Banner-visible suppression ──

  it('should skip version check while banner is visible', async () => {
    mockFetchSuccess(BASELINE);

    const { result, unmount } = renderHook(() => useContainerUpdateCheck());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    // Trigger mismatch
    mockFetch.mockReset().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(UPDATED),
    });

    act(() => { result.current.onSseReconnect(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5500); });
    expect(result.current.showBanner).toBe(true);

    // Reset fetch mock to track suppression
    mockFetch.mockReset();

    // Fire reconnect while banner visible
    act(() => { result.current.onSseReconnect(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

    expect(mockFetch).not.toHaveBeenCalled();

    unmount();
  });

  // ── Requirement 5.2: Debounce collapses rapid reconnects ──

  it('should debounce rapid reconnects into one fetch', async () => {
    mockFetchSuccess(BASELINE);

    const { result, unmount } = renderHook(() => useContainerUpdateCheck());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    mockFetch.mockReset().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(BASELINE),
    });

    // Fire 5 rapid reconnects
    for (let i = 0; i < 5; i++) {
      act(() => { result.current.onSseReconnect(); });
    }

    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    unmount();
  });

  // ── Requirement 5.3: In-flight dedup ──

  it('should prevent duplicate concurrent requests', async () => {
    mockFetchSuccess(BASELINE);

    const { result, unmount } = renderHook(() => useContainerUpdateCheck());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    // Create a slow fetch that doesn't resolve immediately
    let resolveSlowFetch;
    mockFetch.mockReset().mockImplementation(() =>
      new Promise(resolve => {
        resolveSlowFetch = resolve;
      })
    );

    // First reconnect starts the debounce
    act(() => { result.current.onSseReconnect(); });

    // Advance past debounce to trigger the fetch
    await act(async () => { await vi.advanceTimersByTimeAsync(5500); });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second reconnect while first is in-flight — should be skipped by inFlightRef
    act(() => { result.current.onSseReconnect(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5500); });

    // Resolve the slow fetch
    await act(async () => {
      resolveSlowFetch({ ok: true, json: () => Promise.resolve(BASELINE) });
      await vi.advanceTimersByTimeAsync(0);
    });

    // Only 1 fetch total (the in-flight one blocked the second)
    expect(mockFetch).toHaveBeenCalledTimes(1);

    unmount();
  });

  // ── Requirement 3.3: Dismiss resets banner, subsequent mismatch re-shows ──

  it('should dismiss banner and allow re-show on subsequent mismatch', async () => {
    mockFetchSuccess(BASELINE);

    const { result, unmount } = renderHook(() => useContainerUpdateCheck());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    // Trigger mismatch
    mockFetch.mockReset().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(UPDATED),
    });

    act(() => { result.current.onSseReconnect(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5500); });
    expect(result.current.showBanner).toBe(true);
    expect(result.current.newVersion).toBe(UPDATED.version);

    // Dismiss
    act(() => { result.current.dismissBanner(); });
    expect(result.current.showBanner).toBe(false);
    expect(result.current.newVersion).toBeNull();

    // Trigger another mismatch
    mockFetch.mockReset().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(UPDATED),
    });

    act(() => { result.current.onSseReconnect(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5500); });
    expect(result.current.showBanner).toBe(true);

    unmount();
  });

  // ── Unmount during fetch does not update state ──

  it('should not update state after unmount during fetch', async () => {
    mockFetchSuccess(BASELINE);

    const { result, unmount } = renderHook(() => useContainerUpdateCheck());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    // Set up a slow reconnect fetch
    let resolveReconnect;
    mockFetch.mockReset().mockImplementation(() =>
      new Promise(resolve => { resolveReconnect = resolve; })
    );

    act(() => { result.current.onSseReconnect(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5500); });

    // Unmount while fetch is in-flight
    unmount();

    // Resolve the fetch after unmount — should not throw
    await act(async () => {
      resolveReconnect({ ok: true, json: () => Promise.resolve(UPDATED) });
      await vi.advanceTimersByTimeAsync(0);
    });

    // No error thrown — test passes if we get here
  });

  // ── Malformed response handling ──

  it('should treat malformed response (missing version) as fetch failure', async () => {
    mockFetchSuccess(BASELINE);

    const { result, unmount } = renderHook(() => useContainerUpdateCheck());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    // Reconnect returns response missing startupId
    mockFetch.mockReset().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '6.0.0' }),
    });

    act(() => { result.current.onSseReconnect(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5500); });

    // Should silently skip — no banner
    expect(result.current.showBanner).toBe(false);

    unmount();
  });

  it('should treat malformed response (missing startupId) as fetch failure', async () => {
    mockFetchSuccess(BASELINE);

    const { result, unmount } = renderHook(() => useContainerUpdateCheck());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    // Reconnect returns response missing version
    mockFetch.mockReset().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ startupId: 'new-id' }),
    });

    act(() => { result.current.onSseReconnect(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5500); });

    expect(result.current.showBanner).toBe(false);

    unmount();
  });
});
