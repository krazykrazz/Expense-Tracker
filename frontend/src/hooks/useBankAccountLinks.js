import { useState, useEffect, useCallback } from 'react';
import { getPlaidStatus, getBankConnections, PLAID_SETTINGS_CHANGED_EVENT } from '../services/plaidApi';
import { useSyncEvent } from './useSyncEvent';

/**
 * Bank accounts (Plaid) mapped to each payment method, for showing "linked to bank" in the UI.
 * Returns an empty Map, without calling the bank endpoints, while Plaid is not configured, so screens
 * behave the same with or without Plaid. Failures also yield an empty Map (the badge is informational).
 *
 * @returns {Map<number, Array<{institutionName: string, accountName: string, mask: string|null}>>}
 */
export function useBankAccountLinks() {
  const [links, setLinks] = useState(() => new Map());

  const load = useCallback(async (signal) => {
    try {
      const status = await getPlaidStatus({ signal });
      if (!status || !status.enabled) {
        setLinks(new Map());
        return;
      }
      const { items } = await getBankConnections({ signal });
      const next = new Map();
      for (const item of items || []) {
        for (const account of item.accounts || []) {
          if (account.paymentMethodId == null) continue;
          const list = next.get(account.paymentMethodId) || [];
          list.push({ institutionName: item.institutionName, accountName: account.name, mask: account.mask ?? null });
          next.set(account.paymentMethodId, list);
        }
      }
      if (!signal || !signal.aborted) setLinks(next);
    } catch (err) {
      if (err.name !== 'AbortError') setLinks(new Map());
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const reload = () => load();
    window.addEventListener(PLAID_SETTINGS_CHANGED_EVENT, reload);
    return () => {
      controller.abort();
      window.removeEventListener(PLAID_SETTINGS_CHANGED_EVENT, reload);
    };
  }, [load]);

  // Account mappings can change in another tab's Bank Import modal; a sync event is a good moment to re-check
  useSyncEvent('plaid', () => { load(); });

  return links;
}

export default useBankAccountLinks;
