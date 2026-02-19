import { useState, useEffect, useRef, useCallback } from 'react';
import { API_ENDPOINTS } from '../config.js';
import { getTabId } from '../utils/tabId.js';

/**
 * Computes the exponential backoff delay for reconnect attempts.
 * Formula: min(3000 * 2^(attempt - 1), 30000)
 * - attempt 1 → 3000ms
 * - attempt 2 → 6000ms
 * - attempt 3 → 12000ms
 * - ...capped at 30000ms
 *
 * @param {number} attempt - Reconnect attempt number (1-based)
 * @returns {number} Delay in milliseconds
 */
export function computeBackoff(attempt) {
  return Math.min(3000 * Math.pow(2, attempt - 1), 30000);
}

/** Toast label mapping by entity type */
const TOAST_LABELS = {
  expense: '↻ Expenses updated',
  budget: '↻ Budget updated',
  people: '↻ People updated',
  payment_method: '↻ Payment methods updated',
  loan: '↻ Loans updated',
  income: '↻ Income updated',
  investment: '↻ Investments updated',
  fixed_expense: '↻ Fixed expenses updated',
};

/** Entity types that call context refresh callbacks */
const CONTEXT_ENTITY_TYPES = new Set(['expense', 'budget', 'people', 'payment_method']);

/** Entity types that dispatch window custom events */
const WINDOW_EVENT_ENTITY_TYPES = new Set(['loan', 'income', 'investment', 'fixed_expense']);

/**
 * useDataSync — subscribes to the SSE sync endpoint and dispatches targeted
 * context refreshes when remote data changes arrive.
 *
 * @param {Object} props
 * @param {Function} props.refreshExpenses
 * @param {Function} props.refreshBudgets
 * @param {Function} props.refreshPeople
 * @param {Function} props.refreshPaymentMethods
 * @returns {{ connectionStatus: string, toastMessages: Array<{id: string, text: string}> }}
 */
export function useDataSync({
  refreshExpenses,
  refreshBudgets,
  refreshPeople,
  refreshPaymentMethods,
} = {}) {
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [toastMessages, setToastMessages] = useState([]);

  // Refs to hold mutable state without triggering re-renders
  const eventSourceRef = useRef(null);
  const debounceTimersRef = useRef({}); // entityType → timer id
  const reconnectTimerRef = useRef(null);
  const attemptRef = useRef(0);
  const unmountedRef = useRef(false);

  /** Add a toast and auto-remove it after 2000ms */
  const addToast = useCallback((entityType) => {
    const text = TOAST_LABELS[entityType];
    if (!text) return;
    const id = crypto.randomUUID();
    setToastMessages((prev) => [...prev, { id, text }]);
    setTimeout(() => {
      setToastMessages((prev) => prev.filter((m) => m.id !== id));
    }, 2000);
  }, []);

  /** Route an entity type to the correct refresh action */
  const routeEntityType = useCallback(
    (entityType) => {
      if (CONTEXT_ENTITY_TYPES.has(entityType)) {
        switch (entityType) {
          case 'expense':
            refreshExpenses?.();
            break;
          case 'budget':
            refreshBudgets?.();
            break;
          case 'people':
            refreshPeople?.();
            break;
          case 'payment_method':
            refreshPaymentMethods?.();
            break;
        }
      } else if (WINDOW_EVENT_ENTITY_TYPES.has(entityType)) {
        window.dispatchEvent(new CustomEvent('syncEvent', { detail: { entityType } }));
      }
      addToast(entityType);
    },
    [refreshExpenses, refreshBudgets, refreshPeople, refreshPaymentMethods, addToast]
  );

  /** Schedule a debounced refresh for the given entity type (500ms window) */
  const scheduleDebounced = useCallback(
    (entityType) => {
      // Clear any existing timer for this entity type
      if (debounceTimersRef.current[entityType]) {
        clearTimeout(debounceTimersRef.current[entityType]);
      }
      debounceTimersRef.current[entityType] = setTimeout(() => {
        delete debounceTimersRef.current[entityType];
        if (!unmountedRef.current) {
          routeEntityType(entityType);
        }
      }, 500);
    },
    [routeEntityType]
  );

  /** Connect to the SSE endpoint */
  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    setConnectionStatus('connecting');
    const es = new EventSource(API_ENDPOINTS.SYNC_EVENTS);
    eventSourceRef.current = es;

    es.onopen = () => {
      if (unmountedRef.current) return;
      attemptRef.current = 0; // reset backoff on successful connection
      setConnectionStatus('connected');
    };

    es.onmessage = (event) => {
      if (unmountedRef.current) return;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return; // malformed JSON — skip
      }

      const { entityType, tabId } = data;

      // Self-update suppression: ignore events from our own tab
      if (tabId === getTabId()) return;

      // Only route known entity types
      if (
        CONTEXT_ENTITY_TYPES.has(entityType) ||
        WINDOW_EVENT_ENTITY_TYPES.has(entityType)
      ) {
        scheduleDebounced(entityType);
      }
    };

    es.onerror = () => {
      if (unmountedRef.current) return;
      setConnectionStatus('disconnected');
      es.close();
      eventSourceRef.current = null;

      // Exponential backoff reconnect
      attemptRef.current += 1;
      const delay = computeBackoff(attemptRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) {
          connect();
        }
      }, delay);
    };
  }, [scheduleDebounced]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;

      // Close EventSource
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // Clear all debounce timers
      Object.values(debounceTimersRef.current).forEach(clearTimeout);
      debounceTimersRef.current = {};

      // Clear reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { connectionStatus, toastMessages };
}

export default useDataSync;
