import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import {
  createLinkToken, connectBank, reconnectBank, refreshBank, getBankConnections, disconnectBank, mapBankAccount, syncBanks, getPlaidStatus
} from '../../services/plaidApi';
import { getPaymentMethods } from '../../services/paymentMethodApi';
import { formatDateTime } from '../../utils/formatters';
import { useSyncEvent } from '../../hooks/useSyncEvent';
import AutoSyncSettings from './AutoSyncSettings';
import BankFileImport from './BankFileImport';

const MAPPABLE_TYPES = ['debit', 'credit_card'];

const STATUS_LABELS = {
  needs_login: 'Needs login',
  gone: 'Connection removed',
  error: 'Sync problem',
  stale: 'Not updating'
};

const STATUS_HELP = {
  needs_login: 'The bank needs you to log in again. Reconnect keeps this connection: no new Trial slot, nothing re-imported. Automatic sync is paused until then.',
  gone: 'The bank or Plaid no longer recognises this connection. Disconnect it, then connect the bank again.',
  error: 'Usually temporary at the bank; automatic sync keeps retrying.',
  stale: 'The app syncs fine, but Plaid hasn\'t received new data from this bank for over 12 hours. Some banks (CIBC) only send new data when you log in: use Log in again (same connection, no new Trial slot), or import a file. Don\'t disconnect.'
};

/** Plaid's view of the bank, shown only when it isn't healthy (its status data isn't always reliable). */
const INSTITUTION_STATUS_TEXT = { DOWN: 'down', DEGRADED: 'degraded' };

const formatIso = (iso) => (iso ? formatDateTime(iso) : null);

/** "Bank data updated by Plaid: <time>" plus, when it's unhealthy, Plaid's status for the institution. */
const BankFreshness = ({ item }) => {
  if (!item.bankUpdatedAt && !item.institutionStatus) return null;
  const institution = INSTITUTION_STATUS_TEXT[item.institutionStatus];
  return (
    <div className="bank-import-muted" data-testid="bank-freshness">
      {item.bankUpdatedAt && <>Bank data updated by Plaid: {formatIso(item.bankUpdatedAt)}</>}
      {institution && (
        <span className="bank-connection-error">
          {item.bankUpdatedAt ? ' · ' : ''}Plaid reports {item.institutionName} updates {institution}
          {item.institutionStatusSince ? ` since ${formatIso(item.institutionStatusSince)}` : ''}
        </span>
      )}
    </div>
  );
};

const describeSync = ({ totals, results }) => {
  const parts = [`${totals.added} new, ${totals.updated} updated, ${totals.removed} removed`];
  const failed = results.filter(r => r.error);
  if (failed.length > 0) {
    parts.push(failed.map(r => `${r.institutionName}: ${r.error}`).join('; '));
  }
  if (results.some(r => r.updateStatus === 'NOT_READY')) {
    parts.push('Plaid is still preparing history for a new connection. Try again in a minute.');
  }
  return parts.join(' · ');
};

/**
 * Connections tab: connect banks with Plaid Link, map accounts to payment methods, sync, disconnect.
 */
const BankConnections = ({ status, onStatusChange }) => {
  const [items, setItems] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [linkToken, setLinkToken] = useState(null);
  // Bank account whose "Import file" panel is open
  const [importAccountId, setImportAccountId] = useState(null);
  // Account whose payment-method mapping is being saved (its select is locked so changes can't race)
  const [mappingId, setMappingId] = useState(null);
  // Bank being repaired through Plaid update mode (null when connecting a new bank)
  const reconnectItemRef = useRef(null);

  const load = useCallback(async (signal) => {
    try {
      const [{ items: loaded }, methods] = await Promise.all([
        getBankConnections({ signal }),
        getPaymentMethods({ activeOnly: true, withCounts: false })
      ]);
      if (signal?.aborted) return;
      setItems(loaded);
      setPaymentMethods(methods.filter(m => MAPPABLE_TYPES.includes(m.type)));
      setError(null);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Automatic sync finished (new "Last synced" times, errors)
  useSyncEvent('plaid', () => { load(); });

  const refreshStatus = useCallback(async () => {
    try {
      onStatusChange(await getPlaidStatus());
    } catch {
      // Status only feeds the Trial counter; a stale value is harmless
    }
  }, [onStatusChange]);

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
      await Promise.all([load(), refreshStatus()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [load, refreshStatus]);

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

  const trial = status.trial;

  const handleConnect = async () => {
    if (trial && !window.confirm(
      `Connecting a bank uses 1 of ${trial.limit} Plaid Trial connections (${trial.used} used so far). `
      + 'Disconnecting later does not give the slot back. Continue?'
    )) {
      return;
    }
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      reconnectItemRef.current = null;
      const { linkToken: token } = await createLinkToken();
      setLinkToken(token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * A bank whose data is stale: ask Plaid to fetch now. Banks such as CIBC only let Plaid fetch during a login,
   * and only when the connection is marked as needing one; the refresh request marks it, then the login opens.
   */
  const handleLoginAgain = async (item) => {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const { status: refreshStatusResult } = await refreshBank(item.id);
      if (refreshStatusResult === 'needs_login') {
        const { linkToken: token } = await createLinkToken(item.id);
        reconnectItemRef.current = { ...item, loginAgain: true };
        setLinkToken(token);
      } else {
        setMessage(`Asked Plaid to fetch from ${item.institutionName}. New transactions arrive with the next sync, usually within a few minutes.`);
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  /** Log in to the bank again through Plaid update mode: same connection, no new Trial slot. */
  const handleReconnect = async (item) => {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const { linkToken: token } = await createLinkToken(item.id);
      reconnectItemRef.current = item;
      setLinkToken(token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await syncBanks();
      setMessage(`Sync complete: ${describeSync(result)}`);
      // A failure may have changed a bank's status (header dot, Reconnect)
      await Promise.all([load(), refreshStatus()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleMap = async (accountId, value) => {
    setError(null);
    setMappingId(accountId);
    try {
      const updated = await mapBankAccount(accountId, value === '' ? null : Number(value));
      setItems(prev => prev.map(item => ({
        ...item,
        accounts: item.accounts.map(account => (account.id === accountId ? { ...account, ...updated } : account))
      })));
    } catch (err) {
      setError(err.message);
    } finally {
      setMappingId(null);
    }
  };

  const handleDisconnect = async (item) => {
    const trialNote = item.environment === 'production'
      ? ' The Plaid Trial connection slot is not given back, and connecting the bank again uses a new one.'
      : '';
    const loginNote = item.status === 'needs_login'
      ? 'This bank only needs you to log in again: use Reconnect instead.\n\n'
      : '';
    if (!window.confirm(
      `${loginNote}Disconnect ${item.institutionName}? Unreviewed and ignored transactions from it are removed; expenses already added are kept.${trialNote}`
    )) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await disconnectBank(item.id);
      setMessage(`Disconnected ${item.institutionName}.`);
      await Promise.all([load(), refreshStatus()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="bank-import-empty">Loading connections…</div>;
  }

  return (
    <div className="bank-connections">
      <div className="bank-import-toolbar">
        <button className="bank-import-primary" onClick={handleConnect} disabled={busy || Boolean(linkToken)}>
          Connect a bank
        </button>
        <button className="bank-import-secondary" onClick={handleSync} disabled={busy || items.length === 0}>
          {busy ? 'Working…' : 'Sync now'}
        </button>
        {trial && (
          <span className="bank-import-muted" data-testid="trial-usage">
            Trial connections used: {trial.used} / {trial.limit}
          </span>
        )}
      </div>

      {error && <div className="bank-import-error" role="alert">{error}</div>}
      {message && <div className="bank-import-message" role="status">{message}</div>}

      {items.length > 0 && <AutoSyncSettings />}

      {items.length === 0 ? (
        <div className="bank-import-empty">No banks connected yet.</div>
      ) : (
        items.map(item => (
          <section key={item.id} className="bank-connection">
            <div className="bank-connection-header">
              <div>
                <strong>{item.institutionName}</strong>
                {STATUS_LABELS[item.status] && (
                  <span className={`bank-connection-status ${item.status}`} data-testid="bank-connection-status">
                    {STATUS_LABELS[item.status]}
                  </span>
                )}
                <div className="bank-import-muted">
                  {item.lastSyncedAt ? `Last synced ${formatDateTime(item.lastSyncedAt.replace(' ', 'T') + 'Z')}` : 'Never synced'}
                  {item.lastError && <span className="bank-connection-error"> · Last error: {item.lastError}</span>}
                </div>
                <BankFreshness item={item} />
                {STATUS_HELP[item.status] && <div className="bank-import-muted">{STATUS_HELP[item.status]}</div>}
              </div>
              <div className="bank-connection-actions">
                {item.status === 'needs_login' && (
                  <button className="bank-import-primary" onClick={() => handleReconnect(item)} disabled={busy || Boolean(linkToken)}>
                    Reconnect
                  </button>
                )}
                {item.status === 'stale' && (
                  <button
                    className="bank-import-primary"
                    onClick={() => handleLoginAgain(item)}
                    disabled={busy || Boolean(linkToken)}
                    title="Ask Plaid to fetch new transactions now. If the bank needs a login for that (CIBC does), the login opens: same connection, no new Trial slot."
                  >
                    Log in again
                  </button>
                )}
                <button className="bank-import-link-danger" onClick={() => handleDisconnect(item)} disabled={busy}>
                  Disconnect
                </button>
              </div>
            </div>
            <ul className="bank-account-list">
              {item.accounts.map(account => (
                <Fragment key={account.id}>
                <li className="bank-account">
                  <span>
                    {account.name}{account.mask ? ` ••${account.mask}` : ''}
                    <span className="bank-import-muted"> {account.subtype || account.type}</span>
                  </span>
                  <span className="bank-account-controls">
                    {account.paymentMethodId != null && importAccountId !== account.id && (
                      <button
                        type="button"
                        className="bank-import-link"
                        onClick={() => setImportAccountId(account.id)}
                        disabled={busy}
                        title="Import a CSV downloaded from the bank's website, for when Plaid isn't getting new data"
                      >
                        Import file
                      </button>
                    )}
                    <select
                      className="bank-account-mapping"
                      value={account.paymentMethodId ?? ''}
                      onChange={(event) => handleMap(account.id, event.target.value)}
                      disabled={mappingId === account.id}
                      aria-label={`Payment method for ${account.name}`}
                    >
                      <option value="">Don&apos;t import</option>
                      {paymentMethods.map(method => (
                        <option key={method.id} value={method.id}>{method.display_name}</option>
                      ))}
                    </select>
                  </span>
                </li>
                {importAccountId === account.id && (
                  <li className="bank-account-import">
                    <BankFileImport
                      account={account}
                      onClose={() => setImportAccountId(null)}
                      onImported={(text) => {
                        setImportAccountId(null);
                        setMessage(text);
                        load();
                      }}
                    />
                  </li>
                )}
                </Fragment>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
};

export default BankConnections;
