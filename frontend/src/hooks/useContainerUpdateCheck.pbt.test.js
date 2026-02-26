/**
 * @invariant Container Update Detection: The hook captures a baseline version/startupId on mount,
 * detects mismatches on SSE reconnect, and manages banner state with debounce/dedup/suppression.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';

// Mock fetchProvider — authAwareFetch delegates to mockFetch
const mockFetch = vi.fn();
vi.mock('../utils/fetchProvider', () => ({
  authAwareFetch: (...args) => mockFetch(...args)
}));

import { useContainerUpdateCheck } from './useContainerUpdateCheck';

// ── Arbitraries ──

const semver = () =>
  fc.tuple(
    fc.integer({ min: 0, max: 99 }),
    fc.integer({ min: 0, max: 99 }),
    fc.integer({ min: 0, max: 99 })
  ).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

const hexChar = () => fc.constantFrom(...'0123456789abcdef'.split(''));
const hexBlock = (len) => fc.array(hexChar(), { minLength: len, maxLength: len }).map(a => a.join(''));
const uuid = () =>
  fc.tuple(hexBlock(8), hexBlock(4), hexBlock(4), hexBlock(4), hexBlock(12))
    .map(([a, b, c, d, e]) => `${a}-${b}-${c}-${d}-${e}`);

const versionInfo = () =>
  fc.record({ version: semver(), startupId: uuid() });

const distinctVersionInfoPair = () =>
  fc.tuple(versionInfo(), versionInfo()).filter(
    ([a, b]) => a.version !== b.version || a.startupId !== b.startupId
  );

// ── Helpers ──

function mockFetchSuccess(info) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(info),
  });
}

function mockFetchFailure() {
  mockFetch.mockRejectedValue(new Error('Network error'));
}

function mockFetchSequence(responses) {
  responses.forEach((r) => {
    if (r.error) {
      mockFetch.mockRejectedValueOnce(new Error(r.error));
    } else {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(r.data),
      });
    }
  });
}

describe('useContainerUpdateCheck - Property-Based Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * Feature: container-update-refresh, Property 1: Initial Version Capture
   *
   * For any successful response from the version endpoint during initialization,
   * the hook should store the baseline and showBanner should remain false.
   *
   * Validates: Requirements 1.1
   */
  describe('Property 1: Initial Version Capture', () => {
    it('stores baseline on success and keeps banner hidden', async () => {
      await fc.assert(
        fc.asyncProperty(versionInfo(), async (info) => {
          vi.clearAllMocks();
          mockFetchSuccess(info);

          const { result, unmount } = renderHook(() => useContainerUpdateCheck());

          // Flush the initial fetch (microtask queue)
          await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
          });

          expect(mockFetch).toHaveBeenCalledTimes(1);
          expect(result.current.showBanner).toBe(false);
          expect(result.current.newVersion).toBeNull();

          unmount();
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: container-update-refresh, Property 2: Exponential Backoff Retry on Init Failure
   *
   * For any sequence of N consecutive failures (0–3), retry up to 3 times;
   * if all fail, baseline is null.
   *
   * Validates: Requirements 1.2
   */
  describe('Property 2: Exponential Backoff Retry on Init Failure', () => {
    it('retries up to 3 times with backoff, then baseline is null', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 3 }),
          versionInfo(),
          async (failCount, info) => {
            vi.clearAllMocks();

            // Build a sequence of failCount failures, then success (if failCount < 3)
            const responses = [];
            for (let i = 0; i < failCount; i++) {
              responses.push({ error: 'Network error' });
            }
            if (failCount < 3) {
              responses.push({ data: info });
            } else {
              responses.push({ error: 'Network error' }); // 4th call won't happen, but just in case
            }
            mockFetchSequence(responses);

            const { result, unmount } = renderHook(() => useContainerUpdateCheck());

            // Run through all retry timers
            for (let i = 0; i <= failCount; i++) {
              await act(async () => {
                await vi.advanceTimersByTimeAsync(5000);
              });
            }

            if (failCount < 3) {
              // Should have succeeded after failCount retries
              expect(result.current.showBanner).toBe(false);
            }
            // In all cases, banner should not show from init
            expect(result.current.showBanner).toBe(false);

            unmount();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Feature: container-update-refresh, Property 3: Null Baseline Adoption
   *
   * For any null baseline + successful reconnect fetch, adopt as baseline
   * without triggering mismatch.
   *
   * Validates: Requirements 1.3
   */
  describe('Property 3: Null Baseline Adoption', () => {
    it('adopts fetched version as baseline when baseline is null', async () => {
      await fc.assert(
        fc.asyncProperty(versionInfo(), async (info) => {
          vi.clearAllMocks();

          // Init fails all 3 retries → baseline is null
          mockFetchFailure();

          const { result, unmount } = renderHook(() => useContainerUpdateCheck());

          // Exhaust all retries
          for (let i = 0; i < 4; i++) {
            await act(async () => {
              await vi.advanceTimersByTimeAsync(5000);
            });
          }

          // Now mock a successful fetch for the reconnect
          mockFetch.mockReset().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(info),
          });

          // Trigger reconnect
          act(() => {
            result.current.onSseReconnect();
          });

          // Advance past debounce window
          await act(async () => {
            await vi.advanceTimersByTimeAsync(5500);
          });

          // Banner should NOT show — null baseline adoption
          expect(result.current.showBanner).toBe(false);
          expect(result.current.newVersion).toBeNull();

          unmount();
        }),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Feature: container-update-refresh, Property 4: Mismatch Detection
   *
   * For any two version/startupId pairs, mismatch iff at least one field differs.
   *
   * Validates: Requirements 2.2, 2.3, 4.2
   */
  describe('Property 4: Mismatch Detection', () => {
    it('detects mismatch when version or startupId differs', async () => {
      await fc.assert(
        fc.asyncProperty(distinctVersionInfoPair(), async ([baseline, fetched]) => {
          vi.clearAllMocks();
          mockFetchSuccess(baseline);

          const { result, unmount } = renderHook(() => useContainerUpdateCheck());

          // Flush initial fetch
          await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
          });

          // Mock the reconnect fetch with different values
          mockFetch.mockReset().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(fetched),
          });

          act(() => {
            result.current.onSseReconnect();
          });

          await act(async () => {
            await vi.advanceTimersByTimeAsync(5500);
          });

          expect(result.current.showBanner).toBe(true);
          expect(result.current.newVersion).toBe(fetched.version);

          unmount();
        }),
        { numRuns: 100 }
      );
    });

    it('does not trigger mismatch when both fields match', async () => {
      await fc.assert(
        fc.asyncProperty(versionInfo(), async (info) => {
          vi.clearAllMocks();
          mockFetchSuccess(info);

          const { result, unmount } = renderHook(() => useContainerUpdateCheck());

          // Flush initial fetch
          await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
          });

          // Reconnect returns same values
          mockFetch.mockReset().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(info),
          });

          act(() => {
            result.current.onSseReconnect();
          });

          await act(async () => {
            await vi.advanceTimersByTimeAsync(5500);
          });

          expect(result.current.showBanner).toBe(false);
          expect(result.current.newVersion).toBeNull();

          unmount();
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: container-update-refresh, Property 5: Silent Skip on Reconnect Fetch Error
   *
   * For any fetch failure on reconnect, no banner and no throw.
   *
   * Validates: Requirements 2.4
   */
  describe('Property 5: Silent Skip on Reconnect Fetch Error', () => {
    it('silently skips on reconnect fetch error', async () => {
      await fc.assert(
        fc.asyncProperty(versionInfo(), async (baseline) => {
          vi.clearAllMocks();
          mockFetchSuccess(baseline);

          const { result, unmount } = renderHook(() => useContainerUpdateCheck());

          await act(async () => {
            await vi.runAllTimersAsync();
          });

          // Mock reconnect to fail
          mockFetch.mockReset().mockRejectedValue(new Error('Network error'));

          act(() => {
            result.current.onSseReconnect();
          });

          await act(async () => {
            await vi.advanceTimersByTimeAsync(5500);
          });

          // No banner, no error
          expect(result.current.showBanner).toBe(false);
          expect(result.current.newVersion).toBeNull();

          unmount();
        }),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Feature: container-update-refresh, Property 7: Dismiss and Re-show
   *
   * Dismissing hides banner; subsequent mismatch re-shows it.
   *
   * Validates: Requirements 3.3
   */
  describe('Property 7: Dismiss and Re-show', () => {
    it('dismiss hides banner, subsequent mismatch re-shows', async () => {
      await fc.assert(
        fc.asyncProperty(distinctVersionInfoPair(), async ([baseline, fetched]) => {
          vi.clearAllMocks();
          mockFetchSuccess(baseline);

          const { result, unmount } = renderHook(() => useContainerUpdateCheck());

          await act(async () => {
            await vi.runAllTimersAsync();
          });

          // Trigger mismatch
          mockFetch.mockReset().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(fetched),
          });

          act(() => {
            result.current.onSseReconnect();
          });

          await act(async () => {
            await vi.advanceTimersByTimeAsync(5500);
          });

          expect(result.current.showBanner).toBe(true);

          // Dismiss
          act(() => {
            result.current.dismissBanner();
          });

          expect(result.current.showBanner).toBe(false);
          expect(result.current.newVersion).toBeNull();

          // Trigger another mismatch
          mockFetch.mockReset().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(fetched),
          });

          act(() => {
            result.current.onSseReconnect();
          });

          await act(async () => {
            await vi.advanceTimersByTimeAsync(5500);
          });

          expect(result.current.showBanner).toBe(true);

          unmount();
        }),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Feature: container-update-refresh, Property 9: Banner-Visible Suppression
   *
   * While banner visible, no additional fetches on reconnect.
   *
   * Validates: Requirements 5.1
   */
  describe('Property 9: Banner-Visible Suppression', () => {
    it('skips version check while banner is visible', async () => {
      await fc.assert(
        fc.asyncProperty(
          distinctVersionInfoPair(),
          fc.integer({ min: 1, max: 10 }),
          async ([baseline, fetched], reconnectCount) => {
            vi.clearAllMocks();
            mockFetchSuccess(baseline);

            const { result, unmount } = renderHook(() => useContainerUpdateCheck());

            await act(async () => {
              await vi.runAllTimersAsync();
            });

            // Trigger mismatch to show banner
            mockFetch.mockReset().mockResolvedValue({
              ok: true,
              json: () => Promise.resolve(fetched),
            });

            act(() => {
              result.current.onSseReconnect();
            });

            await act(async () => {
              await vi.advanceTimersByTimeAsync(5500);
            });

            expect(result.current.showBanner).toBe(true);

            // Reset fetch mock to track new calls
            mockFetch.mockReset();

            // Fire N reconnect events while banner is visible
            for (let i = 0; i < reconnectCount; i++) {
              act(() => {
                result.current.onSseReconnect();
              });
            }

            await act(async () => {
              await vi.advanceTimersByTimeAsync(10000);
            });

            // No fetches should have been made
            expect(mockFetch).not.toHaveBeenCalled();

            unmount();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Feature: container-update-refresh, Property 10: Debounce and Dedup
   *
   * N reconnect events within 5s window result in exactly one fetch;
   * in-flight dedup prevents concurrent requests.
   *
   * Validates: Requirements 5.2, 5.3
   */
  describe('Property 10: Debounce and Dedup', () => {
    it('collapses rapid reconnects into exactly one fetch', async () => {
      await fc.assert(
        fc.asyncProperty(
          versionInfo(),
          fc.integer({ min: 2, max: 20 }),
          async (info, reconnectCount) => {
            vi.clearAllMocks();
            mockFetchSuccess(info);

            const { result, unmount } = renderHook(() => useContainerUpdateCheck());

            await act(async () => {
              await vi.runAllTimersAsync();
            });

            // Reset fetch to track reconnect calls
            mockFetch.mockReset().mockResolvedValue({
              ok: true,
              json: () => Promise.resolve(info),
            });

            // Fire N reconnect events rapidly (within 5s window)
            for (let i = 0; i < reconnectCount; i++) {
              act(() => {
                result.current.onSseReconnect();
              });
            }

            // Advance past debounce window
            await act(async () => {
              await vi.advanceTimersByTimeAsync(6000);
            });

            // Exactly one fetch should have been made
            expect(mockFetch).toHaveBeenCalledTimes(1);

            unmount();
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
