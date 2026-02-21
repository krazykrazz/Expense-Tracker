/**
 * Property-Based Tests for useDataSync — Visibility Optimization
 *
 * @invariant
 * Property 1: Full disconnect on hide
 *   For any active hook state (connecting, connected, backoff), when document.hidden
 *   becomes true, all EventSource instances are closed, no pending timers remain,
 *   and connectionStatus is 'disconnected'.
 *   Validates: Requirements 1.1, 1.2, 1.3, 1.4
 *
 * Property 2: Reconnect on visible
 *   For any hook disconnected due to tab-hidden, when document.hidden becomes false,
 *   exactly one new EventSource is created.
 *   Validates: Requirements 2.1
 *
 * Property 3: Backoff reset on visibility reconnect
 *   For any accumulated backoff from prior SSE errors, hiding then showing the tab
 *   resets the backoff counter to 0.
 *   Validates: Requirements 2.2
 *
 * Property 4: At most one EventSource (idempotence)
 *   For any random sequence of visibility changes, at most one active EventSource
 *   exists at any point.
 *   Validates: Requirements 5.1, 5.2, 5.3
 *
 * Property 5: Full data refresh on visibility reconnect
 *   On visibility reconnect onopen, all 4 context callbacks and all 4 window events
 *   fire. On initial mount onopen, they do not.
 *   Validates: Requirements 6.1, 6.2, 6.3, 6.4
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';
import { useDataSync, computeBackoff } from './useDataSync';

vi.mock('../utils/tabId.js', () => ({
  getTabId: () => 'my-tab-id',
  TAB_ID: 'my-tab-id',
  fetchWithTabId: vi.fn(),
}));

vi.mock('../config.js', () => ({
  API_ENDPOINTS: {
    SYNC_EVENTS: 'http://localhost/api/sync/events',
  },
}));

class MockEventSource {
  constructor() {
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.closed = false;
    MockEventSource._instances.push(this);
  }
  close() { this.closed = true; }
  static _instances = [];
  static reset() { MockEventSource._instances = []; }
  static latest() { return MockEventSource._instances[MockEventSource._instances.length - 1]; }
}

beforeEach(() => {
  MockEventSource.reset();
  vi.stubGlobal('EventSource', MockEventSource);
  vi.useFakeTimers();
  Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
});

const defaultCallbacks = {
  refreshExpenses: vi.fn(),
  refreshBudgets: vi.fn(),
  refreshPeople: vi.fn(),
  refreshPaymentMethods: vi.fn(),
};

function makeCallbacks() {
  return {
    refreshExpenses: vi.fn(),
    refreshBudgets: vi.fn(),
    refreshPeople: vi.fn(),
    refreshPaymentMethods: vi.fn(),
  };
}

function simulateHide() {
  Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

function simulateShow() {
  Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('Feature: sse-visibility-optimization, Property 1: Full disconnect on hide', () => {
  test('for any hook state (connecting, connected, backoff), hiding the tab fully disconnects', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('connecting', 'connected', 'backoff'),
        (initialState) => {
          MockEventSource.reset();
          const callbacks = makeCallbacks();

          const { result, unmount } = renderHook(() => useDataSync(callbacks));

          const es = MockEventSource.latest();

          // Bring the hook into the desired initial state
          if (initialState === 'connected') {
            act(() => { es.onopen?.(); });
          } else if (initialState === 'backoff') {
            act(() => { es.onopen?.(); });
            act(() => { es.onerror?.(); });
            // Now in backoff — there's a reconnect timer pending
          }
          // 'connecting' — just leave it as-is after render (onopen not fired)

          // Simulate tab hidden
          act(() => { simulateHide(); });

          // Assert: all EventSource instances are closed
          expect(MockEventSource._instances.every(instance => instance.closed)).toBe(true);

          // Assert: no non-closed instances remain (eventSourceRef.current is null)
          const activeInstances = MockEventSource._instances.filter(instance => !instance.closed);
          expect(activeInstances).toHaveLength(0);

          // Assert: no pending timers — advancing time should not create new EventSource instances
          const instanceCountBefore = MockEventSource._instances.length;
          act(() => { vi.advanceTimersByTime(60000); });
          const instanceCountAfter = MockEventSource._instances.length;
          expect(instanceCountAfter).toBe(instanceCountBefore);

          // Assert: connectionStatus is 'disconnected'
          expect(result.current.connectionStatus).toBe('disconnected');

          unmount();
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });
});


describe('Feature: sse-visibility-optimization, Property 2: Reconnect on visible', () => {
  test('after hide, showing the tab creates exactly one new EventSource', () => {
    /**
     * Validates: Requirements 2.1
     *
     * For any hook that was disconnected due to tab-hidden, when document.hidden
     * becomes false, exactly one new EventSource is created and it is not closed.
     */
    fc.assert(
      fc.property(
        fc.constantFrom('connecting', 'connected'),
        (initialState) => {
          MockEventSource.reset();
          const callbacks = makeCallbacks();
          const { result, unmount } = renderHook(() => useDataSync(callbacks));

          const es = MockEventSource.latest();
          if (initialState === 'connected') {
            act(() => { es.onopen?.(); });
          }

          // Hide
          act(() => { simulateHide(); });
          expect(result.current.connectionStatus).toBe('disconnected');

          const instanceCountAfterHide = MockEventSource._instances.length;

          // Show
          act(() => { simulateShow(); });

          // A new EventSource should have been created
          expect(MockEventSource._instances.length).toBe(instanceCountAfterHide + 1);

          // The new instance should not be closed
          const newEs = MockEventSource.latest();
          expect(newEs.closed).toBe(false);

          unmount();
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });
});


describe('Feature: sse-visibility-optimization, Property 3: Backoff reset on visibility reconnect', () => {
  test('visibility reconnect resets backoff counter to 0', () => {
    /**
     * Validates: Requirements 2.2
     *
     * For any accumulated backoff from prior SSE errors, hiding then showing
     * the tab resets the backoff counter to 0 — meaning the next error after
     * the visibility-triggered reconnect uses the initial backoff delay (3000ms).
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (errorCount) => {
          MockEventSource.reset();
          const callbacks = makeCallbacks();
          const { result, unmount } = renderHook(() => useDataSync(callbacks));

          // Get connected
          act(() => { MockEventSource.latest().onopen?.(); });

          // Accumulate errors to build up backoff
          for (let i = 0; i < errorCount; i++) {
            act(() => { MockEventSource.latest().onerror?.(); });
            // Advance past the backoff delay to trigger reconnect
            const delay = computeBackoff(i + 1);
            act(() => { vi.advanceTimersByTime(delay + 100); });
            // New EventSource created, fire onopen
            act(() => { MockEventSource.latest().onopen?.(); });
          }

          // Now we're connected with accumulated backoff history
          // Hide the tab
          act(() => { simulateHide(); });

          // Show the tab — this should reset attemptRef to 0
          act(() => { simulateShow(); });

          // Fire onopen on the new connection
          act(() => { MockEventSource.latest().onopen?.(); });
          expect(result.current.connectionStatus).toBe('connected');

          // Now trigger an error on this new connection
          const instanceCountBeforeError = MockEventSource._instances.length;
          act(() => { MockEventSource.latest().onerror?.(); });

          // The backoff should use attempt 1 (3000ms), not the accumulated value
          // Advance by exactly 3000ms + small buffer
          act(() => { vi.advanceTimersByTime(3100); });

          // A new EventSource should have been created (proving delay was ~3000ms)
          expect(MockEventSource._instances.length).toBe(instanceCountBeforeError + 1);

          unmount();
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });
});


describe('Feature: sse-visibility-optimization, Property 4: At most one EventSource', () => {
  test('for any sequence of visibility changes, at most one active EventSource exists', () => {
    /**
     * Validates: Requirements 5.1, 5.2, 5.3
     *
     * For any random sequence of visibility changes (including consecutive duplicates),
     * the hook maintains at most one active EventSource connection at any point.
     * Consecutive hides are no-ops (no errors), consecutive shows do not create duplicates.
     */
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
        (visibilitySequence) => {
          MockEventSource.reset();
          const callbacks = makeCallbacks();
          const { unmount } = renderHook(() => useDataSync(callbacks));

          // Start connected
          act(() => { MockEventSource.latest().onopen?.(); });

          for (const isHidden of visibilitySequence) {
            act(() => {
              if (isHidden) {
                simulateHide();
              } else {
                simulateShow();
                // If a new EventSource was created, fire onopen to complete the connection
                const latest = MockEventSource.latest();
                if (latest && !latest.closed && latest.onopen) {
                  latest.onopen();
                }
              }
            });

            // Count active (non-closed) EventSource instances
            const activeCount = MockEventSource._instances.filter(es => !es.closed).length;
            expect(activeCount).toBeLessThanOrEqual(1);
          }

          unmount();
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });
});


describe('Feature: sse-visibility-optimization, Property 5: Full data refresh on visibility reconnect', () => {
  test('visibility reconnect onopen triggers full data refresh', () => {
    /**
     * Validates: Requirements 6.1, 6.2, 6.3, 6.4
     *
     * For any hook that was disconnected due to tab-hidden, when the tab becomes
     * visible and the EventSource onopen fires, all 4 context refresh callbacks
     * are called exactly once, all 4 syncEvent window events are dispatched,
     * and no toast notifications are shown.
     */
    fc.assert(
      fc.property(
        fc.constantFrom('connecting', 'connected'),
        (initialState) => {
          MockEventSource.reset();
          const callbacks = makeCallbacks();
          const syncEvents = [];
          const syncListener = (e) => syncEvents.push(e.detail.entityType);
          window.addEventListener('syncEvent', syncListener);

          const { result, unmount } = renderHook(() => useDataSync(callbacks));

          const es = MockEventSource.latest();
          if (initialState === 'connected') {
            act(() => { es.onopen?.(); });
          }

          // Reset callback call counts after initial setup
          callbacks.refreshExpenses.mockClear();
          callbacks.refreshBudgets.mockClear();
          callbacks.refreshPeople.mockClear();
          callbacks.refreshPaymentMethods.mockClear();
          syncEvents.length = 0;

          // Hide then show
          act(() => { simulateHide(); });
          act(() => { simulateShow(); });

          // Fire onopen on the new EventSource (visibility reconnect)
          act(() => { MockEventSource.latest().onopen?.(); });

          // All 4 context refresh callbacks should be called exactly once
          expect(callbacks.refreshExpenses).toHaveBeenCalledTimes(1);
          expect(callbacks.refreshBudgets).toHaveBeenCalledTimes(1);
          expect(callbacks.refreshPeople).toHaveBeenCalledTimes(1);
          expect(callbacks.refreshPaymentMethods).toHaveBeenCalledTimes(1);

          // 4 syncEvent window events dispatched
          expect(syncEvents).toHaveLength(4);
          expect(syncEvents).toContain('loan');
          expect(syncEvents).toContain('income');
          expect(syncEvents).toContain('investment');
          expect(syncEvents).toContain('fixed_expense');

          // No toast notifications
          expect(result.current.getToastSnapshot()).toHaveLength(0);

          window.removeEventListener('syncEvent', syncListener);
          unmount();
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });

  test('initial mount onopen does NOT trigger full data refresh', () => {
    /**
     * Validates: Requirements 6.4
     *
     * On initial mount (not a visibility reconnect), the onopen handler
     * does NOT trigger a full data refresh — none of the 4 context refresh
     * callbacks are called and no syncEvent window events are dispatched.
     */
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          MockEventSource.reset();
          const callbacks = makeCallbacks();
          const syncEvents = [];
          const syncListener = (e) => syncEvents.push(e.detail.entityType);
          window.addEventListener('syncEvent', syncListener);

          const { unmount } = renderHook(() => useDataSync(callbacks));

          // Fire onopen (initial mount — NOT a visibility reconnect)
          act(() => { MockEventSource.latest().onopen?.(); });

          // None of the context refresh callbacks should be called
          expect(callbacks.refreshExpenses).not.toHaveBeenCalled();
          expect(callbacks.refreshBudgets).not.toHaveBeenCalled();
          expect(callbacks.refreshPeople).not.toHaveBeenCalled();
          expect(callbacks.refreshPaymentMethods).not.toHaveBeenCalled();

          // No syncEvent window events
          expect(syncEvents).toHaveLength(0);

          window.removeEventListener('syncEvent', syncListener);
          unmount();
        }
      ),
      { ...pbtOptions(), numRuns: 50 }
    );
  });
});
