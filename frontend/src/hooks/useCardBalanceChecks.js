import { useState, useEffect, useCallback } from 'react';
import { getPlaidStatus, getCardBalanceChecks, PLAID_SETTINGS_CHANGED_EVENT } from '../services/plaidApi';
import { useSyncEvent } from './useSyncEvent';

const EMPTY = new Map();

/**
 * Bank vs tracker balance check for each credit card linked to a bank account (Plaid), keyed by payment
 * method id. Empty without calling the bank endpoints while Plaid is not configured, and on failure, so
 * screens behave the same with or without Plaid.
 * Reloads after bank syncs and credit card changes in any tab, and whenever `refreshKey` changes (pass the
 * data the screen already reloads, e.g. its payment method list, so a new expense or payment re-checks).
 * @param {*} [refreshKey]
 * @param {boolean} [enabled=true] false: no requests, empty Map (e.g. a view that is mounted but closed)
 * @returns {Map<number, object>}
 */
export function useCardBalanceChecks(refreshKey, enabled = true) {
  const [checks, setChecks] = useState(() => new Map());

  const load = useCallback(async (signal) => {
    try {
      const status = await getPlaidStatus({ signal });
      if (!status || !status.enabled) {
        setChecks(new Map());
        return;
      }
      const { cards } = await getCardBalanceChecks({ signal });
      if (!signal || !signal.aborted) setChecks(new Map((cards || []).map(card => [card.paymentMethodId, card])));
    } catch (err) {
      if (err.name !== 'AbortError') setChecks(new Map());
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const reload = () => load();
    window.addEventListener(PLAID_SETTINGS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(PLAID_SETTINGS_CHANGED_EVENT, reload);
  }, [load, enabled]);

  useSyncEvent(['plaid', 'credit_card'], () => { if (enabled) load(); });

  return enabled ? checks : EMPTY;
}

export default useCardBalanceChecks;
