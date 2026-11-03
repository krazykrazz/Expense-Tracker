import { useState, useEffect, useCallback } from 'react';
import { getPlaidStatus, getCardBalanceChecks, PLAID_SETTINGS_CHANGED_EVENT } from '../services/plaidApi';
import { useSyncEvent } from './useSyncEvent';

/**
 * Bank vs tracker balance check for each credit card linked to a bank account (Plaid), keyed by payment
 * method id. Empty without calling the bank endpoints while Plaid is not configured, and on failure, so
 * screens behave the same with or without Plaid.
 * Reloads after bank syncs and credit card changes in any tab, and whenever `refreshKey` changes (pass the
 * data the screen already reloads, e.g. its payment method list, so a new expense or payment re-checks).
 * @param {*} [refreshKey]
 * @returns {Map<number, object>}
 */
export function useCardBalanceChecks(refreshKey) {
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
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  useEffect(() => {
    const reload = () => load();
    window.addEventListener(PLAID_SETTINGS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(PLAID_SETTINGS_CHANGED_EVENT, reload);
  }, [load]);

  useSyncEvent(['plaid', 'credit_card'], () => { load(); });

  return checks;
}

export default useCardBalanceChecks;
