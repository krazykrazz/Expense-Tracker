import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDataSync, normalizeEntityType, ENTITY_TYPE_ALIASES } from './useDataSync';

vi.mock('../utils/tabId.js', () => ({
  getTabId: () => 'test-tab-id',
  TAB_ID: 'test-tab-id',
}));

vi.mock('../config.js', () => ({
  API_ENDPOINTS: { SYNC_EVENTS: 'http://localhost/api/sync/events' },
}));

class MockEventSource {
  constructor() {
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    MockEventSource.instance = this;
  }
  close() {}
}

const callbacks = () => ({
  refreshExpenses: vi.fn(),
  refreshBudgets: vi.fn(),
  refreshPeople: vi.fn(),
  refreshPaymentMethods: vi.fn(),
});

const send = (entityType, tabId = 'other-tab') => {
  act(() => {
    MockEventSource.instance.onmessage({ data: JSON.stringify({ entityType, tabId }) });
  });
  act(() => { vi.advanceTimersByTime(600); });
};

beforeEach(() => {
  vi.stubGlobal('EventSource', MockEventSource);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('backend entity type aliases', () => {
  test('normalizeEntityType maps backend names and leaves routed names alone', () => {
    expect(normalizeEntityType('person')).toBe('people');
    expect(normalizeEntityType('income_source')).toBe('income');
    expect(normalizeEntityType('expense')).toBe('expense');
    expect(normalizeEntityType('settings')).toBe('settings');
  });

  test('a person event refreshes people (the backend never sends "people")', () => {
    const cb = callbacks();
    renderHook(() => useDataSync(cb));

    send('person');

    expect(cb.refreshPeople).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['income_source', 'income'],
    ['loan_payment', 'loan'],
    ['loan_balance', 'loan'],
    ['mortgage_payment', 'loan'],
    ['investment_value', 'investment'],
    ['credit_card_payment', 'credit_card'],
    ['credit_card_statement', 'credit_card'],
    ['billing_cycle', 'credit_card'],
  ])('%s is dispatched to window listeners as %s', (backendType, routedType) => {
    const events = [];
    const listener = (e) => events.push(e.detail.entityType);
    window.addEventListener('syncEvent', listener);
    renderHook(() => useDataSync(callbacks()));

    send(backendType);

    window.removeEventListener('syncEvent', listener);
    expect(events).toEqual([routedType]);
  });

  test('events of related backend types in one window coalesce into one refresh', () => {
    const events = [];
    const listener = (e) => events.push(e.detail.entityType);
    window.addEventListener('syncEvent', listener);
    renderHook(() => useDataSync(callbacks()));

    act(() => {
      MockEventSource.instance.onmessage({ data: JSON.stringify({ entityType: 'loan_payment', tabId: 'other-tab' }) });
      MockEventSource.instance.onmessage({ data: JSON.stringify({ entityType: 'loan_balance', tabId: 'other-tab' }) });
      MockEventSource.instance.onmessage({ data: JSON.stringify({ entityType: 'loan', tabId: 'other-tab' }) });
    });
    act(() => { vi.advanceTimersByTime(600); });

    window.removeEventListener('syncEvent', listener);
    expect(events).toEqual(['loan']);
  });

  test('own-tab events are still ignored after normalization', () => {
    const cb = callbacks();
    renderHook(() => useDataSync(cb));

    send('person', 'test-tab-id');

    expect(cb.refreshPeople).not.toHaveBeenCalled();
  });

  test('entity types with nothing to refresh are ignored', () => {
    const cb = callbacks();
    const events = [];
    const listener = (e) => events.push(e);
    window.addEventListener('syncEvent', listener);
    renderHook(() => useDataSync(cb));

    send('settings');
    send('system');

    window.removeEventListener('syncEvent', listener);
    expect(events).toHaveLength(0);
    Object.values(cb).forEach(fn => expect(fn).not.toHaveBeenCalled());
  });

  test('every alias targets a type that useDataSync routes', () => {
    const routed = new Set(['expense', 'budget', 'people', 'payment_method', 'invoice', 'loan', 'income', 'investment', 'fixed_expense', 'credit_card']);
    for (const target of Object.values(ENTITY_TYPE_ALIASES)) {
      expect(routed.has(target)).toBe(true);
    }
  });
});
