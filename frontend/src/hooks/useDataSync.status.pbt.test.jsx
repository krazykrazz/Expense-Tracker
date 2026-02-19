/**
 * Property-Based Tests for useDataSync — connectionStatus Enum
 *
 * @invariant
 * Property 10: connectionStatus is always a valid enum value
 * Feature: real-time-data-sync, Property 10
 * For any sequence of EventSource lifecycle events (open, error, close), the connectionStatus
 * exposed by useDataSync SHALL always be one of 'connecting', 'connected', or 'disconnected'
 * and SHALL never be undefined or any other value.
 * Validates: Requirements 8.3
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';
import { useDataSync } from './useDataSync';

const VALID_STATUSES = new Set(['connecting', 'connected', 'disconnected']);

vi.mock('../utils/tabId.js', () => ({
  getTabId: () => 'test-tab-id',
  TAB_ID: 'test-tab-id',
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
    MockEventSource._instances.push(this);
  }
  close() {}
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

describe('Property 10 — connectionStatus is always a valid enum value', () => {
  test('status is always one of connecting/connected/disconnected after any event sequence', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('open', 'error', 'close'), { minLength: 1, maxLength: 10 }),
        (events) => {
          MockEventSource.reset();

          const { result, unmount } = renderHook(() =>
            useDataSync({
              refreshExpenses: vi.fn(),
              refreshBudgets: vi.fn(),
              refreshPeople: vi.fn(),
              refreshPaymentMethods: vi.fn(),
            })
          );

          // Initial status must be valid
          expect(VALID_STATUSES.has(result.current.connectionStatus)).toBe(true);

          const es = MockEventSource.latest();

          for (const event of events) {
            act(() => {
              if (event === 'open') {
                es.onopen?.();
              } else if (event === 'error') {
                es.onerror?.();
                // Advance past reconnect timer to avoid leaking timers
                vi.advanceTimersByTime(35000);
              } else if (event === 'close') {
                es.onerror?.(); // close triggers same path as error in EventSource
                vi.advanceTimersByTime(35000);
              }
            });

            // After each event, status must still be valid
            expect(VALID_STATUSES.has(result.current.connectionStatus)).toBe(true);
            expect(result.current.connectionStatus).not.toBeUndefined();
          }

          unmount();
          vi.clearAllMocks();
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });
});
