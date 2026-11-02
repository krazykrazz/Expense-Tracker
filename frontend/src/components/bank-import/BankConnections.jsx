import { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import {
  createLinkToken, connectBank, getBankConnections, disconnectBank, mapBankAccount, syncBanks, getPlaidStatus
} from '../../services/plaidApi';
import { getPaymentMethods } from '../../services/paymentMethodApi';
import { formatDate } from '../../utils/formatters';

const MAPPABLE_TYPES = ['debit', 'credit_card'];

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

  const refreshStatus = useCallback(async () => {
    try {
      onStatusChange(await getPlaidStatus());
    } catch {
      // Status only feeds the Trial counter; a stale value is harmless
    }
  }, [onStatusChange]);

  const onSuccess = useCallback(async (publicToken, metadata) => {
    setLinkToken(null);
    setBusy(true);
    try {
      const item = await connectBank(publicToken, metadata?.institution?.name);
      setMessage(`Connected ${item.institutionName}. Choose a payment method for each account, then Sync now.`);
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
    onExit: () => setLinkToken(null)
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
    try {
      const { linkToken: token } = await createLinkToken();
      setLinkToken(token);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await syncBanks();
      setMessage(`Sync complete: ${describeSync(result)}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleMap = async (accountId, value) => {
    setError(null);
    try {
      const updated = await mapBankAccount(accountId, value === '' ? null : Number(value));
      setItems(prev => prev.map(item => ({
        ...item,
        accounts: item.accounts.map(account => (account.id === accountId ? { ...account, ...updated } : account))
      })));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDisconnect = async (item) => {
    const trialNote = item.environment === 'production'
      ? ' The Plaid Trial connection slot is not given back.'
      : '';
    if (!window.confirm(
      `Disconnect ${item.institutionName}? Unreviewed and ignored transactions from it are removed; expenses already added are kept.${trialNote}`
    )) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await disconnectBank(item.id);
      setMessage(`Disconnected ${item.institutionName}.`);
      await load();
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

      {items.length === 0 ? (
        <div className="bank-import-empty">No banks connected yet.</div>
      ) : (
        items.map(item => (
          <section key={item.id} className="bank-connection">
            <div className="bank-connection-header">
              <div>
                <strong>{item.institutionName}</strong>
                <div className="bank-import-muted">
                  {item.lastSyncedAt ? `Last synced ${formatDate(item.lastSyncedAt.replace(' ', 'T') + 'Z')}` : 'Never synced'}
                  {item.lastError && <span className="bank-connection-error"> · Last error: {item.lastError}</span>}
                </div>
              </div>
              <button className="bank-import-link-danger" onClick={() => handleDisconnect(item)} disabled={busy}>
                Disconnect
              </button>
            </div>
            <ul className="bank-account-list">
              {item.accounts.map(account => (
                <li key={account.id} className="bank-account">
                  <span>
                    {account.name}{account.mask ? ` ••${account.mask}` : ''}
                    <span className="bank-import-muted"> {account.subtype || account.type}</span>
                  </span>
                  <select
                    className="bank-account-mapping"
                    value={account.paymentMethodId ?? ''}
                    onChange={(event) => handleMap(account.id, event.target.value)}
                    aria-label={`Payment method for ${account.name}`}
                  >
                    <option value="">Don&apos;t import</option>
                    {paymentMethods.map(method => (
                      <option key={method.id} value={method.id}>{method.display_name}</option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
};

export default BankConnections;
