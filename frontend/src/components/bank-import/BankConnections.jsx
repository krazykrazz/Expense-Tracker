import { useState, useEffect, useCallback } from 'react';
import { getBankConnections, disconnectBank, mapBankAccount, syncBanks, getPlaidStatus } from '../../services/plaidApi';
import { getPaymentMethods } from '../../services/paymentMethodApi';
import { useSyncEvent } from '../../hooks/useSyncEvent';
import AutoSyncSettings from './AutoSyncSettings';
import BankConnectionCard from './connections/BankConnectionCard';
import { usePlaidLinkFlow } from './connections/usePlaidLinkFlow';
import { MAPPABLE_TYPES, describeSync } from './connections/connectionStatus';

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
  // Bank account whose "Import file" panel is open (one at a time)
  const [importAccountId, setImportAccountId] = useState(null);
  // Account whose payment-method mapping is being saved (its select is locked so changes can't race)
  const [mappingId, setMappingId] = useState(null);

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

  const reload = useCallback(() => load(), [load]);
  const trial = status.trial;
  const { linkOpen, connect, reconnect, loginAgain } = usePlaidLinkFlow({
    trial, setBusy, setError, setMessage, reload, refreshStatus
  });

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
        <button className="bank-import-primary" onClick={connect} disabled={busy || linkOpen}>
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
          <BankConnectionCard
            key={item.id}
            item={item}
            paymentMethods={paymentMethods}
            busy={busy}
            linkOpen={linkOpen}
            mappingId={mappingId}
            importAccountId={importAccountId}
            onImportAccount={setImportAccountId}
            onReconnect={reconnect}
            onLoginAgain={loginAgain}
            onDisconnect={handleDisconnect}
            onMap={handleMap}
            onImported={(text) => {
              setMessage(text);
              load();
            }}
          />
        ))
      )}
    </div>
  );
};

export default BankConnections;
