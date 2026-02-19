/**
 * Property-Based Tests for useDataSync — Self-Update Suppression
 *
 * @invariant
 * Property 7: Self-update suppression
 * Feature: real-time-data-sync, Property 7
 * For any Sync_Event whose tabId exactly matches the current tab's Tab_ID, the useDataSync
 * hook SHALL call zero refresh callbacks and dispatch zero window events.
 * Validates: Requirements 4.6, 5.3
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';
import { useDataSync } from './useDataSync';

// NOTE: vi.mock is hoisted — use string literals, not const references
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

const ALL_ENTITY_TYPES = [
  'expense', 'budget', 'people', 'payment_method',
  'loan', 'income', 'investment', 'fixed_expense',
];

describe('Property 7 — self-update suppression', () => {
  test('no callbacks called and no window events dispatched when tabId matches own tab', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_ENTITY_TYPES),
        (entityType) => {
          MockEventSource.reset();

          const refreshExpenses = vi.fn();
          const refreshBudgets = vi.fn();
          const refreshPeople = vi.fn();
          const refreshPaymentMethods = vi.fn();

          const dispatchedEvents = [];
          const listener = (e) => dispatchedEvents.push(e);
          window.addEventListener('syncEvent', listener);

          const { unmount } = renderHook(() =>
            useDataSync({ refreshExpenses, refreshBudgets, refreshPeople, refreshPaymentMethods })
          );

          const es = MockEventSource.latest();
          act(() => { es.onopen?.(); });

          // Send event with OUR OWN tab ID — should be suppressed
          act(() => {
            es.onmessage?.({
              data: JSON.stringify({
                entityType,
                tabId: 'my-tab-id',
                timestamp: new Date().toISOString(),
              }),
            });
          });

          // Advance past debounce window
          act(() => { vi.advanceTimersByTime(600); });

          // Zero callbacks
          expect(refreshExpenses).not.toHaveBeenCalled();
          expect(refreshBudgets).not.toHaveBeenCalled();
          expect(refreshPeople).not.toHaveBeenCalled();
          expect(refreshPaymentMethods).not.toHaveBeenCalled();

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
