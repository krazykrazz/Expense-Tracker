import { useState, useEffect, useCallback, useRef } from 'react';
import { getInbox, resolveCancelledPending } from '../../services/plaidApi';
import { useSyncEvent } from '../../hooks/useSyncEvent';
import InboxRow from './inbox/InboxRow';
import CancelledRow from './inbox/CancelledRow';
import { INBOX_ACTIONS } from './inbox/inboxActions';

/**
 * Inbox tab: each synced bank transaction is added as a new expense, matched to an existing one, or ignored.
 */
const ImportInbox = ({ onExpensesChanged, onInboxChanged, onOpenConnections }) => {
  const [filter, setFilter] = useState('new');
  const [data, setData] = useState({ transactions: [], hiddenUnmapped: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [expanded, setExpanded] = useState({ id: null, mode: null });
  const [busyId, setBusyId] = useState(null);
  const [rowErrors, setRowErrors] = useState({});
  // Background reloads (sync events, after actions) can overlap a filter switch; only the latest may apply
  const latestLoadRef = useRef(0);

  const load = useCallback(async (signal) => {
    const loadId = ++latestLoadRef.current;
    const isCurrent = () => loadId === latestLoadRef.current && !(signal && signal.aborted);
    setLoading(true);
    try {
      const result = await getInbox(filter, { signal });
      if (!isCurrent()) return;
      setData(result);
      setLoadError(null);
    } catch (err) {
      if (err.name !== 'AbortError' && isCurrent()) setLoadError(err.message);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // A sync, or an inbox decision in another tab, changed the inbox. A card payment recorded or deleted elsewhere
  // does too: it adds or removes the payments a row can be linked to, and deleting one returns bank rows here.
  useSyncEvent(['plaid', 'credit_card'], () => { load(); });

  const handleAction = async (txn, action, payload) => {
    const { run, changesData } = INBOX_ACTIONS[action];
    setBusyId(txn.id);
    setRowErrors(prev => ({ ...prev, [txn.id]: null }));
    try {
      await run(txn.id, payload);

      setData(prev => ({ ...prev, transactions: prev.transactions.filter(t => t.id !== txn.id) }));
      setExpanded({ id: null, mode: null });
      // The header badge counts what is waiting here
      onInboxChanged?.();
      if (changesData) {
        // Also refreshes the summary, whose fixed-expense and income totals change when an amount is updated
        onExpensesChanged?.();
        // A matched expense, fixed expense or income is no longer a candidate for other rows
        await load();
      }
    } catch (err) {
      setRowErrors(prev => ({ ...prev, [txn.id]: err.message }));
    } finally {
      setBusyId(null);
    }
  };

  const { transactions, hiddenUnmapped } = data;
  const cancelled = filter === 'new' ? (data.cancelled || []) : [];

  const handleCancelled = async (row, decision) => {
    setBusyId(`c-${row.id}`);
    setRowErrors(prev => ({ ...prev, [`c-${row.id}`]: null }));
    try {
      await resolveCancelledPending(row.id, decision);
      onInboxChanged?.();
      onExpensesChanged?.();
      await load();
    } catch (err) {
      setRowErrors(prev => ({ ...prev, [`c-${row.id}`]: err.message }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="import-inbox">
      <div className="bank-import-toolbar">
        <div className="inbox-filter" role="group" aria-label="Inbox filter">
          {[['new', 'To review'], ['ignored', 'Ignored']].map(([value, label]) => (
            <button
              key={value}
              className={`inbox-filter-button ${filter === value ? 'active' : ''}`}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="bank-import-muted">{loading ? 'Loading…' : `${transactions.length} transaction${transactions.length === 1 ? '' : 's'}`}</span>
      </div>

      {hiddenUnmapped > 0 && (
        <div className="bank-import-message">
          {hiddenUnmapped} new transaction{hiddenUnmapped === 1 ? ' is' : 's are'} hidden because the account has no payment method.{' '}
          <button className="bank-import-link" onClick={onOpenConnections}>Map accounts</button>
        </div>
      )}
      {loadError && <div className="bank-import-error" role="alert">{loadError}</div>}

      {cancelled.length > 0 && (
        <section className="inbox-cancelled" aria-label="Pending charges dropped by the bank">
          <div className="bank-import-muted">
            Pending charges you added that the bank dropped: a cancelled hold, or a charge that settled under a new reference.
          </div>
          <ul className="inbox-list">
            {cancelled.map(row => (
              <CancelledRow
                key={`c-${row.id}`}
                row={row}
                busy={busyId === `c-${row.id}`}
                error={rowErrors[`c-${row.id}`]}
                onDecide={(decision) => handleCancelled(row, decision)}
              />
            ))}
          </ul>
        </section>
      )}

      {!loading && transactions.length === 0 && cancelled.length === 0 && !loadError ? (
        <div className="bank-import-empty">
          {filter === 'new' ? 'Nothing to review. Use Sync now on the Connections tab to pull new transactions.' : 'No ignored transactions.'}
        </div>
      ) : (
        <ul className="inbox-list">
          {transactions.map(txn => (
            <InboxRow
              key={txn.id}
              txn={txn}
              filter={filter}
              expanded={expanded.id === txn.id ? expanded.mode : null}
              onExpand={(mode) => setExpanded({ id: mode ? txn.id : null, mode })}
              onAction={(action, payload) => handleAction(txn, action, payload)}
              busy={busyId === txn.id}
              error={rowErrors[txn.id]}
              unconnectedCards={data.unconnectedCards || []}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

export default ImportInbox;
