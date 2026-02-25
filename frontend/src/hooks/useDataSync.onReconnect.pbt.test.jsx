/**
 * Property-Based Tests for useDataSync — onReconnect Callback
 *
 * @invariant
 * Feature: container-update-refresh, Property 11: Reconnect Triggers Version Check
 *   For any sequence of connect/reconnect events, `onReconnect` is called only
 *   on reconnections (not initial connect).
 *   Validates: Requirements 2.1
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

function makeCallbacks(onReconnect) {
  return {
    refreshExpenses: vi.fn(),
    refreshBudgets: vi.fn(),
    refreshPeople: vi.fn(),
    refreshPaymentMethods: vi.fn(),
    onReconnect,
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

describe('Feature: container-update-refresh, Property 11: Reconnect Triggers Version Check', () => {
  test('onReconnect is NOT called on initial connection', () => {
    // Feature: container-update-refresh, Property 11: Reconnect Triggers Version Check
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          MockEventSource.reset();
          const onReconnect = vi.fn();
          const callbacks = makeCallbacks(onReconnect);

          const { unmount } = renderHook(() => useDataSync(callbacks));

          // Fire onopen for initial connection
          act(() => { MockEventSource.latest().onopen?.(); });

          expect(onReconnect).not.toHaveBeenCalled();

          unmount();
        }
      ),
      { ...pbtOptions(), numRuns: 50 }
    );
  });

  test('onReconnect IS called on SSE error-based reconnection', () => {
    // Feature: container-update-refresh, Property 11: Reconnect Triggers Version Check
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (errorCount) => {
          MockEventSource.reset();
          const onReconnect = vi.fn();
          const callbacks = makeCallbacks(onReconnect);

          const { unmount } = renderHook(() => useDataSync(callbacks));

          // Initial connection — onReconnect should NOT fire
          act(() => { MockEventSource.latest().onopen?.(); });
          expect(onReconnect).not.toHaveBeenCalled();

          // Trigger error-based reconnections
          for (let i = 0; i < errorCount; i++) {
            act(() => { MockEventSource.latest().onerror?.(); });
            const delay = computeBackoff(i + 1);
            act(() => { vi.advanceTimersByTime(delay + 100); });
            // New EventSource created, fire onopen — this IS a reconnection
            act(() => { MockEventSource.latest().onopen?.(); });
          }

          // onReconnect should have been called once per reconnection
          expect(onReconnect).toHaveBeenCalledTimes(errorCount);

          unmount();
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });

  test('onReconnect IS called on visibility-based reconnection', () => {
    // Feature: container-update-refresh, Property 11: Reconnect Triggers Version Check
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (cycleCount) => {
          MockEventSource.reset();
          const onReconnect = vi.fn();
          const callbacks = makeCallbacks(onReconnect);

          const { unmount } = renderHook(() => useDataSync(callbacks));

          // Initial connection
          act(() => { MockEventSource.latest().onopen?.(); });
          expect(onReconnect).not.toHaveBeenCalled();

          // Perform hide/show cycles
          for (let i = 0; i < cycleCount; i++) {
            act(() => { simulateHide(); });
            act(() => { simulateShow(); });
            act(() => { MockEventSource.latest().onopen?.(); });
          }

          // onReconnect should have been called once per visibility reconnect
          expect(onReconnect).toHaveBeenCalledTimes(cycleCount);

          unmount();
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });

  test('onReconnect fires for both error-based and visibility-based reconnections in mixed sequences', () => {
    // Feature: container-update-refresh, Property 11: Reconnect Triggers Version Check
    // Sequence: true = visibility reconnect, false = error reconnect
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }),
        (reconnectTypes) => {
          MockEventSource.reset();
          const onReconnect = vi.fn();
          const callbacks = makeCallbacks(onReconnect);

          const { unmount } = renderHook(() => useDataSync(callbacks));

          // Initial connection
          act(() => { MockEventSource.latest().onopen?.(); });
          expect(onReconnect).not.toHaveBeenCalled();

          let expectedCalls = 0;

          for (const isVisibility of reconnectTypes) {
            if (isVisibility) {
              // Visibility-based reconnect
              act(() => { simulateHide(); });
              act(() => { simulateShow(); });
              act(() => { MockEventSource.latest().onopen?.(); });
            } else {
              // Error-based reconnect
              act(() => { MockEventSource.latest().onerror?.(); });
              const delay = computeBackoff(1); // attemptRef resets after each successful connect
              act(() => { vi.advanceTimersByTime(delay + 100); });
              act(() => { MockEventSource.latest().onopen?.(); });
            }
            expectedCalls++;
          }

          expect(onReconnect).toHaveBeenCalledTimes(expectedCalls);

          unmount();
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });
});
