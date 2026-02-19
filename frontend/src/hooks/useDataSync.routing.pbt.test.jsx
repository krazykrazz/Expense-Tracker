/**
 * Property-Based Tests for useDataSync — Entity Type Routing
 *
 * @invariant
 * Property 5: Entity type to refresh mapping
 * Feature: real-time-data-sync, Property 5
 * For any Sync_Event whose tabId does not match the current Tab_ID, the useDataSync hook
 * SHALL call exactly the refresh callback that corresponds to the event's entityType
 * (expense → refreshExpenses, budget → refreshBudgets, people → refreshPeople,
 * payment_method → refreshPaymentMethods) and no other refresh callbacks.
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4
 *
 * Property 6: Non-context entity types dispatch window events
 * Feature: real-time-data-sync, Property 6
 * For any Sync_Event with entityType in {loan, income, investment, fixed_expense} whose
 * tabId does not match the current Tab_ID, the useDataSync hook SHALL dispatch a syncEvent
 * CustomEvent on window with the correct entityType in its detail, and SHALL NOT call any
 * context refresh callback.
 * Validates: Requirements 4.5
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';
import { useDataSync } from './useDataSync';

// Mock getTabId to return a fixed value
vi.mock('../utils/tabId.js', () => ({
  getTabId: () => 'test-tab-id',
  TAB_ID: 'test-tab-id',
  fetchWithTabId: vi.fn(),
}));

// Mock config
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
    MockEventSource._instances.push(this);
  }
  close() {
    this._closed = true;
  }
  static _instances = [];
  static reset() {
    MockEventSource._instances = [];
  }
  static latest() {
    return MockEventSource._instances[MockEventSource._instances.length - 1];
  }
}

// ── Test Setup ───────────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildCallbacks() {
  return {
    refreshExpenses: vi.fn(),
    refreshBudgets: vi.fn(),
    refreshPeople: vi.fn(),
    refreshPaymentMethods: vi.fn(),
  };
}

function sendMessage(es, entityType, tabId) {
  act(() => {
    es.onmessage?.({
      data: JSON.stringify({ entityType, tabId, timestamp: new Date().toISOString() }),
    });
  });
}

function advancePast500ms() {
  act(() => {
    vi.advanceTimersByTime(600);
  });
}

// ── Property 5: Context entity type routing ──────────────────────────────────

describe('Property 5 — entity type to refresh mapping', () => {
  const CONTEXT_ENTITY_TYPES = ['expense', 'budget', 'people', 'payment_method'];

  const CALLBACK_MAP = {
    expense: 'refreshExpenses',
    budget: 'refreshBudgets',
    people: 'refreshPeople',
    payment_method: 'refreshPaymentMethods',
  };

  test('correct callback is called exactly once, no other callbacks called', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CONTEXT_ENTITY_TYPES),
        fc.uuid().filter((id) => id !== 'test-tab-id'),
        (entityType, tabId) => {
          MockEventSource.reset();
          const callbacks = buildCallbacks();
          const { unmount } = renderHook(() => useDataSync(callbacks));

          const es = MockEventSource.latest();
          act(() => { es.onopen?.(); });

          sendMessage(es, entityType, tabId);
          advancePast500ms();

          const expectedCallback = CALLBACK_MAP[entityType];
          expect(callbacks[expectedCallback]).toHaveBeenCalledTimes(1);

          // All other callbacks must NOT have been called
          for (const [type, cbName] of Object.entries(CALLBACK_MAP)) {
            if (type !== entityType) {
              expect(callbacks[cbName]).not.toHaveBeenCalled();
            }
          }

          unmount();
          // Reset mocks for next iteration
          vi.clearAllMocks();
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });
});

// ── Property 6: Window-event entity types ────────────────────────────────────

describe('Property 6 — non-context entity types dispatch window events', () => {
  const WINDOW_ENTITY_TYPES = ['loan', 'income', 'investment', 'fixed_expense'];

  test('dispatches syncEvent on window with correct entityType, no callbacks called', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...WINDOW_ENTITY_TYPES),
        fc.uuid().filter((id) => id !== 'test-tab-id'),
        (entityType, tabId) => {
          MockEventSource.reset();
          const callbacks = buildCallbacks();
          const dispatchedEvents = [];
          const listener = (e) => dispatchedEvents.push(e);
          window.addEventListener('syncEvent', listener);

          const { unmount } = renderHook(() => useDataSync(callbacks));
          const es = MockEventSource.latest();
          act(() => { es.onopen?.(); });

          sendMessage(es, entityType, tabId);
          advancePast500ms();

          // Exactly one window event dispatched with correct entityType
          expect(dispatchedEvents).toHaveLength(1);
          expect(dispatchedEvents[0].detail.entityType).toBe(entityType);

          // No context callbacks called
          expect(callbacks.refreshExpenses).not.toHaveBeenCalled();
          expect(callbacks.refreshBudgets).not.toHaveBeenCalled();
          expect(callbacks.refreshPeople).not.toHaveBeenCalled();
          expect(callbacks.refreshPaymentMethods).not.toHaveBeenCalled();

          window.removeEventListener('syncEvent', listener);
          unmount();
          vi.clearAllMocks();
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });
});
