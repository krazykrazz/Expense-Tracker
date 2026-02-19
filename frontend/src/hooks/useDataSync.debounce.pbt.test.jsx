/**
 * Property-Based Tests for useDataSync — Debounce Coalescing
 *
 * @invariant
 * Property 8: Debounce coalesces same-entity events independently per entity type
 * Feature: real-time-data-sync, Property 8
 * For any sequence of N Sync_Events for the same entityType arriving within a 500ms window,
 * the corresponding refresh callback SHALL be called exactly once after the window closes.
 * For any two different entity types receiving events in the same window, each SHALL be
 * debounced independently (both refresh callbacks are eventually called, each exactly once).
 * Validates: Requirements 6.1, 6.2
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';
import { useDataSync } from './useDataSync';

const REMOTE_TAB_ID = 'remote-tab-id';

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

function sendMessage(es, entityType) {
  act(() => {
    es.onmessage?.({
      data: JSON.stringify({
        entityType,
        tabId: REMOTE_TAB_ID,
        timestamp: new Date().toISOString(),
      }),
    });
  });
}

// Context entity types only (have direct callbacks we can count)
const CONTEXT_ENTITY_TYPES = ['expense', 'budget', 'people', 'payment_method'];

const CALLBACK_MAP = {
  expense: 'refreshExpenses',
  budget: 'refreshBudgets',
  people: 'refreshPeople',
  payment_method: 'refreshPaymentMethods',
};

describe('Property 8 — debounce coalesces same-entity events', () => {
  test('N events for same entityType within 500ms → callback called exactly once', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.constantFrom(...CONTEXT_ENTITY_TYPES),
        (n, entityType) => {
          MockEventSource.reset();

          const callbacks = {
            refreshExpenses: vi.fn(),
            refreshBudgets: vi.fn(),
            refreshPeople: vi.fn(),
            refreshPaymentMethods: vi.fn(),
          };

          const { unmount } = renderHook(() => useDataSync(callbacks));
          const es = MockEventSource.latest();
          act(() => { es.onopen?.(); });

          // Fire N events for the same entity type within the 500ms window
          for (let i = 0; i < n; i++) {
            sendMessage(es, entityType);
            // Advance time but stay within the 500ms debounce window
            act(() => { vi.advanceTimersByTime(50); });
          }

          // Advance past the debounce window
          act(() => { vi.advanceTimersByTime(600); });

          const cbName = CALLBACK_MAP[entityType];
          expect(callbacks[cbName]).toHaveBeenCalledTimes(1);

          unmount();
          vi.clearAllMocks();
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });

  test('two different entity types debounced independently — each called exactly once', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        // Pick two distinct entity types
        fc.tuple(
          fc.constantFrom(...CONTEXT_ENTITY_TYPES),
          fc.constantFrom(...CONTEXT_ENTITY_TYPES)
        ).filter(([a, b]) => a !== b),
        (n, [typeA, typeB]) => {
          MockEventSource.reset();

          const callbacks = {
            refreshExpenses: vi.fn(),
            refreshBudgets: vi.fn(),
            refreshPeople: vi.fn(),
            refreshPaymentMethods: vi.fn(),
          };

          const { unmount } = renderHook(() => useDataSync(callbacks));
          const es = MockEventSource.latest();
          act(() => { es.onopen?.(); });

          // Fire N events for each type, interleaved, within the 500ms window
          for (let i = 0; i < n; i++) {
            sendMessage(es, typeA);
            sendMessage(es, typeB);
            act(() => { vi.advanceTimersByTime(40); });
          }

          // Advance past the debounce window
          act(() => { vi.advanceTimersByTime(600); });

          expect(callbacks[CALLBACK_MAP[typeA]]).toHaveBeenCalledTimes(1);
          expect(callbacks[CALLBACK_MAP[typeB]]).toHaveBeenCalledTimes(1);

          unmount();
          vi.clearAllMocks();
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });
});
