import { useState, useEffect, useCallback, useRef } from 'react';
import { getPlaidStatus, PLAID_SETTINGS_CHANGED_EVENT } from '../services/plaidApi';
import { useSyncEvent } from './useSyncEvent';

/**
 * Plaid status for UI that reacts to bank connections: `null` until loaded or when the request fails,
 * `{ enabled: false }` when Plaid isn't configured. Reloads when Plaid settings change and on any `plaid`
 * sync event (sync results, sync failures, reconnects), so a bank that needs the user shows up without a reload.
 * @returns {[object|null, (status: object) => void, () => void]} status, a setter for callers that just fetched it,
 *   and a reload for changes made in this tab (the server doesn't send a tab its own sync events)
 */
export function usePlaidStatus() {
  const [status, setStatus] = useState(null);
  // Reloads can overlap (a sync event during a reload): only the newest response may apply
  const latestRef = useRef(0);

  const load = useCallback((signal) => {
    const request = ++latestRef.current;
    getPlaidStatus(signal ? { signal } : {})
      .then((next) => { if (request === latestRef.current) setStatus(next); })
      .catch((err) => {
        if (err.name !== 'AbortError' && request === latestRef.current) setStatus(null);
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

  const reload = useCallback(() => load(), [load]);

  return [status, setStatus, reload];
}

/** Rows waiting in the Inbox (To review); 0 without Plaid. */
export const inboxToReviewCount = (status) => (status && status.enabled && status.toReview > 0 ? status.toReview : 0);

/** Banks the user has to act on (log in again, or removed at the bank); empty without Plaid. */
export const banksNeedingAttention = (status) => (status && status.enabled && status.needsAttention) || [];

/** Banks Plaid has had no new data from for hours (nothing for the user to do); empty without Plaid. */
export const banksWithStaleData = (status) => (status && status.enabled && status.staleData) || [];

export default usePlaidStatus;
