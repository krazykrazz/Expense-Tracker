import { useState, useEffect, useCallback, useRef } from 'react';
import { getPlaidStatus, getBankConnections, PLAID_SETTINGS_CHANGED_EVENT } from '../services/plaidApi';
import { groupBankLinks } from '../utils/bankAccountLink';
import { useSyncEvent } from './useSyncEvent';

/**
 * Bank accounts (Plaid) linked to something in the app, grouped by the id of what they link to: `paymentMethodId`
 * or `investmentId`. Returns an empty Map, without calling the bank endpoints, while Plaid is not configured, so
 * screens behave the same with or without Plaid. Failures also yield an empty Map (the badge is informational).
 * Reloads when settings change and on every `plaid` sync event (mappings can change in another tab); only the
 * newest load may update the links, so a slower earlier one can't overwrite them.
 * @param {'paymentMethodId'|'investmentId'} key
 * @returns {Map<number, Array<object>>} see toBankLink
 */
export function useBankLinks(key) {
  const [links, setLinks] = useState(() => new Map());
  const requestRef = useRef(0);

  const load = useCallback(async (signal) => {
    const request = ++requestRef.current;
    const current = () => request === requestRef.current && !signal?.aborted;
    try {
      const status = await getPlaidStatus({ signal });
      if (!status || !status.enabled) {
        if (current()) setLinks(new Map());
        return;
      }
      const { items } = await getBankConnections({ signal });
      if (current()) setLinks(groupBankLinks(items, key));
    } catch (err) {
      if (err.name !== 'AbortError' && current()) setLinks(new Map());
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
