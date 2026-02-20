/**
 * Property-Based Tests for useDataSync — Preservation Properties
 *
 * @invariant
 * Property 2a: Entity Routing — For all entity types from remote tabs, the correct
 *   refresh callback or window event is dispatched and no others.
 * Property 2b: Self-Update Suppression — For all SSE events where tabId matches
 *   getTabId(), zero refresh callbacks are called and zero window events dispatched.
 * Property 2c: Exponential Backoff — For all attempt numbers 1..20,
 *   computeBackoff(attempt) === min(3000 * 2^(attempt-1), 30000).
 * Property 2d: Toast Labels — For all known entity types, a toast with the correct
 *   label text is added when an SSE event is processed.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';
import { computeBackoff, useDataSync } from './useDataSync';

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

// ── MockEventSource ──────────────────────────────────────────────────────────

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

// ── Setup / Teardown ─────────────────────────────────────────────────────────

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

// ── Constants ────────────────────────────────────────────────────────────────

const ALL_ENTITY_TYPES = [
  'expense', 'budget', 'people', 'payment_method',
  'loan', 'income', 'investment', 'fixed_expense',
];

const CONTEXT_ENTITY_TYPES = ['expense', 'budget', 'people', 'payment_method'];
const WINDOW_EVENT_ENTITY_TYPES = ['loan', 'income', 'investment', 'fixed_expense'];

const CALLBACK_MAP = {
  expense: 'refreshExpenses',
  budget: 'refreshBudgets',
  people: 'refreshPeople',
  payment_method: 'refreshPaymentMethods',
};

const EXPECTED_TOAST_LABELS = {
  expense: '↻ Expenses updated',
  budget: '↻ Budget updated',
  people: '↻ People updated',
  payment_method: '↻ Payment methods updated',
  loan: '↻ Loans updated',
  income: '↻ Income updated',
  investment: '↻ Investments updated',
  fixed_expense: '↻ Fixed expenses updated',
};

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

// ── Property 2a — Entity Routing ─────────────────────────────────────────────

describe('Property 2a — Entity Routing', () => {
  test('context entity types call the correct refresh callback and no others', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CONTEXT_ENTITY_TYPES),
        fc.uuid().filter((id) => id !== 'my-tab-id'),
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
          act(() => { vi.advanceTimersByTime(600); });

          // Correct callback called exactly once
          const expectedCb = CALLBACK_MAP[entityType];
          expect(callbacks[expectedCb]).toHaveBeenCalledTimes(1);

          // No other callbacks called
          for (const [type, cbName] of Object.entries(CALLBACK_MAP)) {
            if (type !== entityType) {
              expect(callbacks[cbName]).not.toHaveBeenCalled();
            }
          }

          // No syncEvent window events for context entity types
          expect(dispatchedEvents).toHaveLength(0);

          window.removeEventListener('syncEvent', listener);
          unmount();
          vi.clearAllMocks();
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });

  test('window event entity types dispatch syncEvent with correct entityType and call no callbacks', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...WINDOW_EVENT_ENTITY_TYPES),
        fc.uuid().filter((id) => id !== 'my-tab-id'),
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
          act(() => { vi.advanceTimersByTime(600); });

          // Exactly one syncEvent dispatched with correct entityType
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

// ── Property 2b — Self-Update Suppression ────────────────────────────────────

describe('Property 2b — Self-Update Suppression', () => {
  test('events with own tabId trigger zero callbacks and zero window events', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_ENTITY_TYPES),
        (entityType) => {
          MockEventSource.reset();
          const callbacks = buildCallbacks();

          const dispatchedEvents = [];
          const listener = (e) => dispatchedEvents.push(e);
          window.addEventListener('syncEvent', listener);

          const { unmount } = renderHook(() => useDataSync(callbacks));
          const es = MockEventSource.latest();
          act(() => { es.onopen?.(); });

          // Send event with OUR OWN tab ID
          sendMessage(es, entityType, 'my-tab-id');
          act(() => { vi.advanceTimersByTime(600); });

          // Zero callbacks
          expect(callbacks.refreshExpenses).not.toHaveBeenCalled();
          expect(callbacks.refreshBudgets).not.toHaveBeenCalled();
          expect(callbacks.refreshPeople).not.toHaveBeenCalled();
          expect(callbacks.refreshPaymentMethods).not.toHaveBeenCalled();

          // Zero window events
          expect(dispatchedEvents).toHaveLength(0);

          window.removeEventListener('syncEvent', listener);
          unmount();
          vi.clearAllMocks();
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });
});

// ── Property 2c — Exponential Backoff ────────────────────────────────────────

describe('Property 2c — Exponential Backoff', () => {
  test('computeBackoff(attempt) === min(3000 * 2^(attempt-1), 30000) for attempts 1..20', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (attempt) => {
          const expected = Math.min(3000 * Math.pow(2, attempt - 1), 30000);
          expect(computeBackoff(attempt)).toBe(expected);
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });
});

// ── Property 2d — Toast Labels ───────────────────────────────────────────────

describe('Property 2d — Toast Labels', () => {
  test('SSE event for any known entity type produces a toast with the correct label', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_ENTITY_TYPES),
        fc.uuid().filter((id) => id !== 'my-tab-id'),
        (entityType, tabId) => {
          MockEventSource.reset();
          const callbacks = buildCallbacks();

          const { result, unmount } = renderHook(() => useDataSync(callbacks));
          const es = MockEventSource.latest();
          act(() => { es.onopen?.(); });

          sendMessage(es, entityType, tabId);
          act(() => { vi.advanceTimersByTime(600); });

          // Should have exactly one toast with the correct label
          const toasts = result.current.getToastSnapshot();
          expect(toasts).toHaveLength(1);
          expect(toasts[0].text).toBe(EXPECTED_TOAST_LABELS[entityType]);

          unmount();
          vi.clearAllMocks();
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });
});
