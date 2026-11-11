import { useState, useEffect, useCallback, useRef } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { createLinkToken, connectBank, reconnectBank, refreshBank } from '../../../services/plaidApi';

/**
 * Plaid Link for the Connections tab: connect a new bank, or repair one in update mode (Reconnect, Log in again;
 * same connection, no new Trial slot). The link opens as soon as Plaid hands out a token.
 * @param {{trial: ({limit: number, used: number}|null), setBusy: Function, setError: Function, setMessage: Function,
 *   reload: Function, refreshStatus: Function}} options what the tab shows and reloads around each step
 * @returns {{linkOpen: boolean, connect: Function, reconnect: Function, loginAgain: Function}}
 */
export function usePlaidLinkFlow({ trial, setBusy, setError, setMessage, reload, refreshStatus }) {
  const [linkToken, setLinkToken] = useState(null);
  // Bank being repaired through Plaid update mode (null when connecting a new bank)
  const reconnectItemRef = useRef(null);

  const onSuccess = useCallback(async (publicToken, metadata) => {
    setLinkToken(null);
    const reconnecting = reconnectItemRef.current;
    reconnectItemRef.current = null;
    setBusy(true);
    try {
      if (reconnecting) {
        // Update mode: same connection, nothing to exchange
        const { item, sync } = await reconnectBank(reconnecting.id);
        const verb = reconnecting.loginAgain ? 'Logged in to' : 'Reconnected';
        if (sync && sync.error) {
          setMessage(`${verb} ${item.institutionName}, but the first sync failed: ${sync.error}`);
        } else if (!reconnecting.loginAgain) {
          setMessage(`Reconnected ${item.institutionName}. Transactions are syncing again.`);
        } else {
          const got = sync ? (sync.added || 0) + (sync.updated || 0) : 0;
          setMessage(`Logged in to ${item.institutionName}: ${got > 0 ? `${got} new or updated transaction${got === 1 ? '' : 's'}` : 'nothing new at the bank'}.`);
        }
      } else {
        const item = await connectBank(publicToken, metadata?.institution?.name);
        setMessage(`Connected ${item.institutionName}. Choose a payment method for each account, then Sync now.`);
      }
      await Promise.all([reload(), refreshStatus()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [reload, refreshStatus, setBusy, setError, setMessage]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => {
      reconnectItemRef.current = null;
      setLinkToken(null);
    }
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  /** Run a step with the tab busy and its messages cleared; errors are shown. */
  const step = async (fn) => {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  /** Ask Plaid for a token (for `item` in update mode) and open the link. */
  const openLink = async (item = null) => {
    const { linkToken: token } = await (item ? createLinkToken(item.id) : createLinkToken());
    reconnectItemRef.current = item;
    setLinkToken(token);
  };

  const connect = async () => {
    if (trial && !window.confirm(
      `Connecting a bank uses 1 of ${trial.limit} Plaid Trial connections (${trial.used} used so far). `
      + 'Disconnecting later does not give the slot back. Continue?'
    )) {
      return;
    }
    await step(() => openLink());
  };

  /** Log in to the bank again through Plaid update mode: same connection, no new Trial slot. */
  const reconnect = (item) => step(() => openLink(item));

  /**
   * A bank whose data is stale: ask Plaid to fetch now. Banks such as CIBC only let Plaid fetch during a login,
   * and only when the connection is marked as needing one; the refresh request marks it, then the login opens.
   */
  const loginAgain = (item) => step(async () => {
    const { status } = await refreshBank(item.id);
    if (status === 'needs_login') {
      await openLink({ ...item, loginAgain: true });
    } else {
      setMessage(`Asked Plaid to fetch from ${item.institutionName}. New transactions arrive with the next sync, usually within a few minutes.`);
    }
    await reload();
  });

  return { linkOpen: Boolean(linkToken), connect, reconnect, loginAgain };
}

export default usePlaidLinkFlow;
