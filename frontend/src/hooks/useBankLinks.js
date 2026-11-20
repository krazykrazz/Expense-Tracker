import { useState, useEffect, useCallback } from 'react';
import { getPlaidStatus, getBankConnections, PLAID_SETTINGS_CHANGED_EVENT } from '../services/plaidApi';
import { groupBankLinks } from '../utils/bankAccountLink';
import { useSyncEvent } from './useSyncEvent';

/**
 * Bank accounts (Plaid) linked to something in the app, grouped by the id of what they link to: `paymentMethodId`
 * or `investmentId`. Returns an empty Map, without calling the bank endpoints, while Plaid is not configured, so
 * screens behave the same with or without Plaid. Failures also yield an empty Map (the badge is informational).
 * Reloads when settings change and on every `plaid` sync event (mappings can change in another tab).
 * @param {'paymentMethodId'|'investmentId'} key
 * @returns {Map<number, Array<object>>} see toBankLink
 */
export function useBankLinks(key) {
  const [links, setLinks] = useState(() => new Map());

  const load = useCallback(async (signal) => {
    try {
      const status = await getPlaidStatus({ signal });
      if (!status || !status.enabled) {
        setLinks(new Map());
        return;
      }
      const { items } = await getBankConnections({ signal });
      const next = groupBankLinks(items, key);
      if (!signal || !signal.aborted) setLinks(next);
    } catch (err) {
      if (err.name !== 'AbortError') setLinks(new Map());
    }
  }, [key]);

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

  useSyncEvent('plaid', () => { load(); });

  return links;
}

export default useBankLinks;
