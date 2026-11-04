import { useState, useEffect, useCallback } from 'react';
import { getPlaidStatus, PLAID_SETTINGS_CHANGED_EVENT } from '../services/plaidApi';
import { useSyncEvent } from './useSyncEvent';

/**
 * Plaid status for UI that reacts to bank connections: `null` until loaded or when the request fails,
 * `{ enabled: false }` when Plaid isn't configured. Reloads when Plaid settings change and on any `plaid`
 * sync event (sync results, sync failures, reconnects), so a bank that needs the user shows up without a reload.
 * @returns {[object|null, (status: object) => void]} status and a setter for callers that just fetched it
 */
export function usePlaidStatus() {
  const [status, setStatus] = useState(null);

  const load = useCallback((signal) => {
    getPlaidStatus(signal ? { signal } : {})
      .then(setStatus)
      .catch((err) => {
        if (err.name !== 'AbortError') setStatus(null);
      });
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

  useSyncEvent('plaid', () => load());

  return [status, setStatus];
}

/** Banks the user has to act on (log in again, or removed at the bank); empty without Plaid. */
export const banksNeedingAttention = (status) => (status && status.enabled && status.needsAttention) || [];

/** Banks Plaid has had no new data from for hours (nothing for the user to do); empty without Plaid. */
export const banksWithStaleData = (status) => (status && status.enabled && status.staleData) || [];

export default usePlaidStatus;
