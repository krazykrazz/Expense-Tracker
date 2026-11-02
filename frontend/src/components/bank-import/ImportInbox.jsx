import { useState, useEffect, useCallback } from 'react';
import {
  getInbox, addInboxTransaction, matchInboxTransaction, ignoreInboxTransaction, unignoreInboxTransaction
} from '../../services/plaidApi';
import { CATEGORIES } from '../../utils/constants';
import { formatCurrency, formatDate } from '../../utils/formatters';

const EXPECTED_CURRENCY = 'CAD';

const formatSigned = (amount) => (amount < 0 ? `-${formatCurrency(Math.abs(amount))}` : formatCurrency(amount));

const AddForm = ({ txn, onSubmit, onCancel, busy }) => {
  const [fields, setFields] = useState({
    place: txn.place,
    type: txn.suggestedCategory || '',
    date: txn.date,
    notes: ''
  });
  const set = (name) => (event) => setFields(prev => ({ ...prev, [name]: event.target.value }));

  return (
    <form
      className="inbox-add-form"
      onSubmit={(event) => { event.preventDefault(); onSubmit(fields); }}
    >
      <label>Place<input value={fields.place} onChange={set('place')} maxLength={200} /></label>
      <label>
        Category
        <select value={fields.type} onChange={set('type')} required>
          <option value="" disabled>Choose…</option>
          {CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <label>Date<input type="date" value={fields.date} onChange={set('date')} required /></label>
      <label>Notes<input value={fields.notes} onChange={set('notes')} maxLength={200} /></label>
      <div className="inbox-form-actions">
        <button type="submit" className="bank-import-primary" disabled={busy || !fields.type}>Add expense</button>
        <button type="button" className="bank-import-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
};

const MatchPicker = ({ txn, onMatch, onCancel, busy }) => (
  <div className="inbox-match-picker">
    <div className="bank-import-muted">Same payment method and amount, within 3 days:</div>
    <ul>
      {txn.matchCandidates.map(candidate => {
        const reimbursed = candidate.originalCost != null && candidate.originalCost !== candidate.amount;
        return (
          <li key={candidate.id}>
            <span>
              {formatDate(candidate.date)} · {candidate.place || '-'} · {candidate.type} · {formatCurrency(candidate.chargedAmount ?? candidate.amount)}
              {reimbursed && <span className="bank-import-muted"> (you paid {formatCurrency(candidate.amount)} after reimbursement)</span>}
              {candidate.notes ? <span className="bank-import-muted"> — {candidate.notes}</span> : null}
            </span>
            <button className="bank-import-primary" onClick={() => onMatch(candidate.id)} disabled={busy}>Match</button>
          </li>
        );
      })}
    </ul>
    <button className="bank-import-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
  </div>
);

const InboxRow = ({ txn, filter, expanded, onExpand, onAction, busy, error }) => {
  const hasMatches = txn.matchCandidates.length > 0;
  const isOpen = (mode) => expanded === mode;

  return (
    <li className="inbox-row" data-testid="inbox-row">
      <div className="inbox-row-main">
        <div className="inbox-row-date">{formatDate(txn.date)}</div>
        <div className="inbox-row-place">
          <strong>{txn.place || txn.rawName}</strong>
          {txn.rawName && txn.rawName !== txn.place && <div className="bank-import-muted">{txn.rawName}</div>}
          <div className="bank-import-muted">
            {txn.paymentMethodName}{txn.accountMask ? ` · ••${txn.accountMask}` : ''}
          </div>
        </div>
        <div className={`inbox-row-amount ${txn.amount <= 0 ? 'credit' : ''}`}>
          {formatSigned(txn.amount)}
          {txn.isoCurrencyCode && txn.isoCurrencyCode !== EXPECTED_CURRENCY && (
            <span className="inbox-badge warning" title="Not converted">{txn.isoCurrencyCode}</span>
          )}
        </div>
        <div className="inbox-row-badges">
          {filter === 'new' && !txn.canAdd && <span className="inbox-badge">Refund / credit</span>}
          {filter === 'new' && hasMatches && <span className="inbox-badge match">Possible match</span>}
        </div>
        <div className="inbox-row-actions">
          {filter === 'new' ? (
            <>
              {txn.canAdd && (
                <button className="bank-import-secondary" onClick={() => onExpand(isOpen('add') ? null : 'add')} disabled={busy}>Add</button>
              )}
              {hasMatches && (
                <button className="bank-import-secondary" onClick={() => onExpand(isOpen('match') ? null : 'match')} disabled={busy}>Match</button>
              )}
              <button className="bank-import-secondary" onClick={() => onAction('ignore')} disabled={busy}>Ignore</button>
            </>
          ) : (
            <button className="bank-import-secondary" onClick={() => onAction('unignore')} disabled={busy}>Undo ignore</button>
          )}
        </div>
      </div>
      {error && <div className="bank-import-error" role="alert">{error}</div>}
      {isOpen('add') && (
        <AddForm txn={txn} busy={busy} onCancel={() => onExpand(null)} onSubmit={(fields) => onAction('add', fields)} />
      )}
      {isOpen('match') && (
        <MatchPicker txn={txn} busy={busy} onCancel={() => onExpand(null)} onMatch={(expenseId) => onAction('match', expenseId)} />
      )}
    </li>
  );
};

/**
 * Inbox tab: each synced bank transaction is added as a new expense, matched to an existing one, or ignored.
 */
const ImportInbox = ({ onExpensesChanged, onOpenConnections }) => {
  const [filter, setFilter] = useState('new');
  const [data, setData] = useState({ transactions: [], hiddenUnmapped: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [expanded, setExpanded] = useState({ id: null, mode: null });
  const [busyId, setBusyId] = useState(null);
  const [rowErrors, setRowErrors] = useState({});

  const load = useCallback(async (signal) => {
    setLoading(true);
    try {
      setData(await getInbox(filter, { signal }));
      setLoadError(null);
    } catch (err) {
      if (err.name !== 'AbortError') setLoadError(err.message);
    } finally {
      if (!signal || !signal.aborted) setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const handleAction = async (txn, action, payload) => {
    setBusyId(txn.id);
    setRowErrors(prev => ({ ...prev, [txn.id]: null }));
    try {
      if (action === 'add') await addInboxTransaction(txn.id, payload);
      else if (action === 'match') await matchInboxTransaction(txn.id, payload);
      else if (action === 'ignore') await ignoreInboxTransaction(txn.id);
      else if (action === 'unignore') await unignoreInboxTransaction(txn.id);

      setData(prev => ({ ...prev, transactions: prev.transactions.filter(t => t.id !== txn.id) }));
      setExpanded({ id: null, mode: null });
      if (action === 'add' || action === 'match') {
        onExpensesChanged?.();
        // A matched or added expense is no longer a candidate for other rows
        await load();
      }
    } catch (err) {
      setRowErrors(prev => ({ ...prev, [txn.id]: err.message }));
    } finally {
      setBusyId(null);
    }
  };

  const { transactions, hiddenUnmapped } = data;

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

      {!loading && transactions.length === 0 && !loadError ? (
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
            />
          ))}
        </ul>
      )}
    </div>
  );
};

export default ImportInbox;
