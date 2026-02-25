/**
 * Unit Tests for useDataSync — onReconnect Callback
 *
 * Tests that the onReconnect callback is called only on reconnections
 * (not initial connect), covering both error-based and visibility-based reconnects.
 *
 * Validates: Requirements 2.1
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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

function simulateHide() {
  Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

function simulateShow() {
  Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

function makeCallbacks(onReconnect) {
  return {
    refreshExpenses: vi.fn(),
    refreshBudgets: vi.fn(),
    refreshPeople: vi.fn(),
    refreshPaymentMethods: vi.fn(),
    onReconnect,
  };
}

describe('useDataSync onReconnect callback', () => {
  test('onReconnect is NOT called on initial connection', () => {
    const onReconnect = vi.fn();
    const { unmount } = renderHook(() => useDataSync(makeCallbacks(onReconnect)));

    // Fire onopen for initial connection
    act(() => { MockEventSource.latest().onopen?.(); });

    expect(onReconnect).not.toHaveBeenCalled();
    unmount();
  });

  test('onReconnect IS called on SSE reconnection after disconnect', () => {
    const onReconnect = vi.fn();
    const { unmount } = renderHook(() => useDataSync(makeCallbacks(onReconnect)));

    // Initial connection
    act(() => { MockEventSource.latest().onopen?.(); });
    expect(onReconnect).not.toHaveBeenCalled();

    // Trigger error → reconnect
    act(() => { MockEventSource.latest().onerror?.(); });
    act(() => { vi.advanceTimersByTime(computeBackoff(1) + 100); });

    // Fire onopen on the new EventSource (reconnection)
    act(() => { MockEventSource.latest().onopen?.(); });

    expect(onReconnect).toHaveBeenCalledTimes(1);
    unmount();
  });

  test('onReconnect IS called on visibility-based reconnection', () => {
    const onReconnect = vi.fn();
    const { unmount } = renderHook(() => useDataSync(makeCallbacks(onReconnect)));

    // Initial connection
    act(() => { MockEventSource.latest().onopen?.(); });
    expect(onReconnect).not.toHaveBeenCalled();

    // Hide then show tab
    act(() => { simulateHide(); });
    act(() => { simulateShow(); });

    // Fire onopen on the new EventSource (visibility reconnection)
    act(() => { MockEventSource.latest().onopen?.(); });

    expect(onReconnect).toHaveBeenCalledTimes(1);
    unmount();
  });

  test('onReconnect is called on each subsequent reconnection', () => {
    const onReconnect = vi.fn();
    const { unmount } = renderHook(() => useDataSync(makeCallbacks(onReconnect)));

    // Initial connection
    act(() => { MockEventSource.latest().onopen?.(); });

    // First error reconnect
    act(() => { MockEventSource.latest().onerror?.(); });
    act(() => { vi.advanceTimersByTime(computeBackoff(1) + 100); });
    act(() => { MockEventSource.latest().onopen?.(); });
    expect(onReconnect).toHaveBeenCalledTimes(1);

    // Second error reconnect
    act(() => { MockEventSource.latest().onerror?.(); });
    act(() => { vi.advanceTimersByTime(computeBackoff(1) + 100); });
    act(() => { MockEventSource.latest().onopen?.(); });
    expect(onReconnect).toHaveBeenCalledTimes(2);

    unmount();
  });

  test('onReconnect works when not provided (no error thrown)', () => {
    // Pass no onReconnect callback
    const callbacks = {
      refreshExpenses: vi.fn(),
      refreshBudgets: vi.fn(),
      refreshPeople: vi.fn(),
      refreshPaymentMethods: vi.fn(),
    };
    const { unmount } = renderHook(() => useDataSync(callbacks));

    // Initial connection
    act(() => { MockEventSource.latest().onopen?.(); });

    // Trigger reconnect — should not throw
    act(() => { MockEventSource.latest().onerror?.(); });
    act(() => { vi.advanceTimersByTime(computeBackoff(1) + 100); });
    act(() => { MockEventSource.latest().onopen?.(); });

    // No error thrown — test passes
    unmount();
  });
});
