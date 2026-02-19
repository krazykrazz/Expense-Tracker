/**
 * Unit Tests for useDataSync lifecycle
 *
 * Tests:
 * - EventSource is constructed with API_ENDPOINTS.SYNC_EVENTS URL on mount
 * - EventSource.close() is called on unmount
 * - connectionStatus transitions: 'connecting' → 'connected' → 'disconnected'
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDataSync } from './useDataSync';

vi.mock('../utils/tabId.js', () => ({
  getTabId: () => 'test-tab-id',
  TAB_ID: 'test-tab-id',
  fetchWithTabId: vi.fn(),
}));

// NOTE: vi.mock is hoisted — use string literals, not const references
vi.mock('../config.js', () => ({
  API_ENDPOINTS: {
    SYNC_EVENTS: 'http://localhost/api/sync/events',
  },
}));

// ── MockEventSource ──────────────────────────────────────────────────────────

class MockEventSource {
  constructor(url) {
    this.url = url;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.closed = false;
    MockEventSource._instances.push(this);
  }
  close() {
    this.closed = true;
  }
  static _instances = [];
  static reset() { MockEventSource._instances = []; }
  static latest() { return MockEventSource._instances[MockEventSource._instances.length - 1]; }
}

beforeEach(() => {
  MockEventSource.reset();
  vi.stubGlobal('EventSource', MockEventSource);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const defaultCallbacks = {
  refreshExpenses: vi.fn(),
  refreshBudgets: vi.fn(),
  refreshPeople: vi.fn(),
  refreshPaymentMethods: vi.fn(),
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useDataSync lifecycle', () => {
  test('EventSource is constructed with API_ENDPOINTS.SYNC_EVENTS URL on mount', () => {
    renderHook(() => useDataSync(defaultCallbacks));

    expect(MockEventSource._instances).toHaveLength(1);
    expect(MockEventSource._instances[0].url).toBe('http://localhost/api/sync/events');
  });

  test('EventSource.close() is called on unmount', () => {
    const { unmount } = renderHook(() => useDataSync(defaultCallbacks));

    const es = MockEventSource.latest();
    expect(es.closed).toBe(false);

    unmount();

    expect(es.closed).toBe(true);
  });

  test('connectionStatus starts as "connecting"', () => {
    const { result } = renderHook(() => useDataSync(defaultCallbacks));
    expect(result.current.connectionStatus).toBe('connecting');
  });

  test('connectionStatus becomes "connected" when EventSource opens', () => {
    const { result } = renderHook(() => useDataSync(defaultCallbacks));

    act(() => {
      MockEventSource.latest().onopen?.();
    });

    expect(result.current.connectionStatus).toBe('connected');
  });

  test('connectionStatus becomes "disconnected" on EventSource error', () => {
    const { result } = renderHook(() => useDataSync(defaultCallbacks));

    act(() => {
      MockEventSource.latest().onopen?.();
    });
    expect(result.current.connectionStatus).toBe('connected');

    act(() => {
      MockEventSource.latest().onerror?.();
    });

    expect(result.current.connectionStatus).toBe('disconnected');
  });

  test('full transition: connecting → connected → disconnected', () => {
    const { result } = renderHook(() => useDataSync(defaultCallbacks));

    expect(result.current.connectionStatus).toBe('connecting');

    act(() => { MockEventSource.latest().onopen?.(); });
    expect(result.current.connectionStatus).toBe('connected');

    act(() => { MockEventSource.latest().onerror?.(); });
    expect(result.current.connectionStatus).toBe('disconnected');
  });

  test('reconnects after error with exponential backoff', () => {
    renderHook(() => useDataSync(defaultCallbacks));

    // Trigger error on first connection
    act(() => { MockEventSource.latest().onerror?.(); });
    expect(MockEventSource._instances).toHaveLength(1);

    // Advance past first backoff (3000ms)
    act(() => { vi.advanceTimersByTime(3100); });

    // A new EventSource should have been created
    expect(MockEventSource._instances).toHaveLength(2);
    expect(MockEventSource._instances[1].url).toBe('http://localhost/api/sync/events');
  });

  test('all debounce timers are cleared on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = renderHook(() => useDataSync(defaultCallbacks));

    const es = MockEventSource.latest();
    act(() => { es.onopen?.(); });

    // Trigger a debounced event
    act(() => {
      es.onmessage?.({
        data: JSON.stringify({ entityType: 'expense', tabId: 'other-tab', timestamp: new Date().toISOString() }),
      });
    });

    unmount();

    // clearTimeout should have been called (for debounce timers)
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  test('toastMessages is initially empty', () => {
    const { result } = renderHook(() => useDataSync(defaultCallbacks));
    expect(result.current.toastMessages).toEqual([]);
  });

  test('toast is added after a remote sync event fires', () => {
    const { result } = renderHook(() => useDataSync(defaultCallbacks));
    const es = MockEventSource.latest();

    act(() => { es.onopen?.(); });

    act(() => {
      es.onmessage?.({
        data: JSON.stringify({ entityType: 'expense', tabId: 'other-tab', timestamp: new Date().toISOString() }),
      });
    });

    // Advance past debounce
    act(() => { vi.advanceTimersByTime(600); });

    expect(result.current.toastMessages).toHaveLength(1);
    expect(result.current.toastMessages[0].text).toBe('↻ Expenses updated');
  });

  test('toast is removed after 2000ms', () => {
    const { result } = renderHook(() => useDataSync(defaultCallbacks));
    const es = MockEventSource.latest();

    act(() => { es.onopen?.(); });
    act(() => {
      es.onmessage?.({
        data: JSON.stringify({ entityType: 'budget', tabId: 'other-tab', timestamp: new Date().toISOString() }),
      });
    });

    act(() => { vi.advanceTimersByTime(600); }); // past debounce
    expect(result.current.toastMessages).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(2100); }); // past toast lifetime
    expect(result.current.toastMessages).toHaveLength(0);
  });
});
