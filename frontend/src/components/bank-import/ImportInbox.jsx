import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getInbox, addInboxTransaction, matchInboxTransaction, matchInboxTransactionToFixed,
  matchInboxTransactionToIncome, addInboxTransactionAsIncome, cardPaymentInboxTransaction, resolveCancelledPending,
  ignoreInboxTransaction, unignoreInboxTransaction
} from '../../services/plaidApi';
import { CATEGORIES, INCOME_CATEGORIES } from '../../utils/constants';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useSyncEvent } from '../../hooks/useSyncEvent';
import {
  CardPaymentBadge, CardPaymentButtons, CardPaymentHint, CardPaymentPanel, isCardPaymentRow
} from './CardPaymentActions';

const CARD_PAYMENT_MODES = ['card-payment', 'link-payment', 'record-to-card'];

const EXPECTED_CURRENCY = 'CAD';

const formatSigned = (amount) => (amount < 0 ? `-${formatCurrency(Math.abs(amount))}` : formatCurrency(amount));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dueLabel = (fixed) => (fixed.expectedDate ? `due ${formatDate(fixed.expectedDate)}` : `${MONTHS[fixed.month - 1]} ${fixed.year}, no due day`);

/** A fixed expense "closely" matches when the amounts are within 10% (or exactly equal). */
const isCloseFixed = (txn, fixed) => !fixed.amountDiffers || Math.abs(fixed.amount - txn.amount) <= Math.abs(fixed.amount) * 0.1;

/** Expected income is a likely match when its name fits the deposit or the amount is exact. */
const isCloseIncome = (income) => income.nameMatch || !income.amountDiffers;

const AddIncomeForm = ({ txn, onSubmit, onCancel, busy }) => {
  const [fields, setFields] = useState({
    name: txn.incomeSuggestion?.name || txn.place || '',
    category: txn.incomeSuggestion?.category || 'Other'
  });
  const set = (name) => (event) => setFields(prev => ({ ...prev, [name]: event.target.value }));
  const month = `${MONTHS[Number(txn.postedDate.slice(5, 7)) - 1]} ${txn.postedDate.slice(0, 4)}`;

  return (
    <form
      className="inbox-add-form"
      onSubmit={(event) => { event.preventDefault(); onSubmit(fields); }}
    >
      <label>Income name<input value={fields.name} onChange={set('name')} maxLength={100} required /></label>
      <label>
        Category
        <select value={fields.category} onChange={set('category')}>
          {INCOME_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <div className="bank-import-muted">Adds {formatCurrency(Math.abs(txn.amount))} to {month} income</div>
      <div className="inbox-form-actions">
        <button type="submit" className="bank-import-primary" disabled={busy || !fields.name.trim()}>Add income</button>
        <button type="button" className="bank-import-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
};

const IncomeCandidates = ({ txn, onMatchIncome, busy }) => {
  const [updateAmount, setUpdateAmount] = useState({});
  const deposit = Math.abs(txn.amount);
  return (
    <>
      <div className="bank-import-muted">Expected income: this month, or the next/previous month within 3 days</div>
      <ul>
        {txn.incomeCandidates.map(income => {
          const update = updateAmount[income.id] ?? true;
          return (
            <li key={`i-${income.id}`} data-testid="income-candidate">
              <span>
                {income.name} · {MONTHS[income.month - 1]} {income.year} · {formatCurrency(income.amount)}
                {income.amountDiffers && (
                  <label className="inbox-inline-check">
                    <input
                      type="checkbox"
                      checked={update}
                      onChange={(event) => setUpdateAmount(prev => ({ ...prev, [income.id]: event.target.checked }))}
                    />
                    {' '}Update to {formatCurrency(deposit)}
                  </label>
                )}
              </span>
              <button
                className="bank-import-primary"
                onClick={() => onMatchIncome({ incomeSourceId: income.id, updateAmount: income.amountDiffers ? update : true })}
                disabled={busy}
              >
                Confirm
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
};

const AddForm = ({ txn, onSubmit, onCancel, busy, warnCardPayment = false }) => {
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
      {warnCardPayment && (
        <div className="inbox-form-note" role="note">
          This looks like a credit card payment. Adding it as an expense counts the spending twice (it is already on the
          card). Use Record payment or Link to card payment instead.
        </div>
      )}
      <div className="inbox-form-actions">
        <button type="submit" className="bank-import-primary" disabled={busy || !fields.type}>Add expense</button>
        <button type="button" className="bank-import-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
};

const MatchPicker = ({ txn, onMatch, onMatchFixed, onMatchIncome, onCancel, busy }) => (
  <div className="inbox-match-picker">
    {(txn.incomeCandidates || []).length > 0 && <IncomeCandidates txn={txn} onMatchIncome={onMatchIncome} busy={busy} />}
    {txn.matchCandidates.length > 0 && (
      <>
        <div className="bank-import-muted">Expenses: same payment method and amount, within 3 days</div>
        <ul>
          {txn.matchCandidates.map(candidate => {
            const reimbursed = candidate.originalCost != null && candidate.originalCost !== candidate.amount;
            return (
              <li key={`e-${candidate.id}`}>
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
      </>
    )}
    {txn.fixedCandidates.length > 0 && (
      <>
        <div className="bank-import-muted">Fixed expenses: same payment method, due within 3 days before to 10 days after</div>
        <ul>
          {txn.fixedCandidates.map(fixed => (
            <li key={`f-${fixed.id}`} data-testid="fixed-candidate">
              <span>
                {fixed.name} · {dueLabel(fixed)} · {formatCurrency(fixed.amount)}
                {fixed.amountDiffers && (
                  <span className="bank-import-muted"> (planned amount will be updated to {formatCurrency(txn.amount)})</span>
                )}
              </span>
              <button className="bank-import-primary" onClick={() => onMatchFixed(fixed.id)} disabled={busy}>Confirm</button>
            </li>
          ))}
        </ul>
      </>
    )}
    <button className="bank-import-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
  </div>
);

/**
 * A pending charge that was added as an expense and then dropped by the bank: link it to the settled
 * transaction (when one looks like it), keep the expense, or delete it (cancelled hold).
 */
const CancelledRow = ({ row, busy, error, onDecide }) => (
  <li className="inbox-row cancelled" data-testid="cancelled-row">
    <div className="inbox-row-main">
      <div className="inbox-row-date">{formatDate(row.date)}</div>
      <div className="inbox-row-place">
        <strong>{row.place}</strong>
        <div className="bank-import-muted">
          {row.paymentMethodName}{row.accountMask ? ` · ••${row.accountMask}` : ''} · expense {row.expense.place || '-'} {formatCurrency(row.expense.amount)}
        </div>
      </div>
      <div className="inbox-row-amount">{formatSigned(row.amount)}</div>
      <div className="inbox-row-badges"><span className="inbox-badge cancelled">Cancelled at bank</span></div>
      <div className="inbox-row-actions">
        <button className="bank-import-secondary" onClick={() => onDecide({ action: 'keep' })} disabled={busy}>Keep expense</button>
        <button className="bank-import-secondary" onClick={() => onDecide({ action: 'delete_expense' })} disabled={busy}>Delete expense</button>
      </div>
    </div>
    {row.settledCandidates.length > 0 && (
      <div className="inbox-match-picker">
        <div className="bank-import-muted">Settled as one of these?</div>
        <ul>
          {row.settledCandidates.map(candidate => (
            <li key={candidate.id}>
              <span>{formatDate(candidate.date)} · {candidate.place} · {formatSigned(candidate.amount)}</span>
              <button className="bank-import-primary" onClick={() => onDecide({ action: 'link', postedId: candidate.id })} disabled={busy}>
                Link
              </button>
            </li>
          ))}
        </ul>
      </div>
    )}
    {error && <div className="bank-import-error" role="alert">{error}</div>}
  </li>
);

const InboxRow = ({ txn, filter, expanded, onExpand, onAction, busy, error, unconnectedCards = [] }) => {
  const incomeCandidates = txn.incomeCandidates || [];
  const hasCandidates = txn.matchCandidates.length > 0 || txn.fixedCandidates.length > 0 || incomeCandidates.length > 0;
  const closeFixed = txn.fixedCandidates.filter(fixed => isCloseFixed(txn, fixed));
  const closeIncome = incomeCandidates.filter(isCloseIncome);
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
          {filter === 'new' && txn.pending && (
            <span className="inbox-badge pending" title="Not settled yet. Add it now; the expense updates when it settles.">Pending</span>
          )}
          {txn.source === 'file' && (
            <span className="inbox-badge" title="Imported from a file downloaded from the bank. Plaid takes it over when it catches up.">From file</span>
          )}
          {filter === 'new' && !txn.canAdd && !txn.cardPayment?.kind && <span className="inbox-badge">{txn.isDeposit ? 'Deposit' : 'Refund / credit'}</span>}
          {filter === 'new' && <CardPaymentBadge txn={txn} />}
          {filter === 'new' && closeIncome.length > 0 && (
            <span className="inbox-badge match" title="Matches expected income: confirm it to record when it landed">
              Income: {closeIncome[0].name}
            </span>
          )}
          {filter === 'new' && txn.matchCandidates.length > 0 && <span className="inbox-badge match">Possible match</span>}
          {filter === 'new' && closeFixed.length > 0 && (
            <span className="inbox-badge match" title="Matches a planned fixed expense: confirm it instead of adding, to avoid counting it twice">
              Fixed: {closeFixed[0].name}
            </span>
          )}
        </div>
        <div className="inbox-row-actions">
          {filter === 'new' ? (
            <>
              {txn.canAdd && (
                <button className="bank-import-secondary" onClick={() => onExpand(isOpen('add') ? null : 'add')} disabled={busy}>Add</button>
              )}
              {hasCandidates && (
                <button className="bank-import-secondary" onClick={() => onExpand(isOpen('match') ? null : 'match')} disabled={busy}>Match</button>
              )}
              {txn.isDeposit && (
                <button className="bank-import-secondary" onClick={() => onExpand(isOpen('add-income') ? null : 'add-income')} disabled={busy}>Add income</button>
              )}
              <CardPaymentButtons txn={txn} unconnectedCards={unconnectedCards} expanded={expanded} onExpand={onExpand} busy={busy} />
              <button className="bank-import-secondary" onClick={() => onAction('ignore')} disabled={busy}>Ignore</button>
            </>
          ) : (
            <button className="bank-import-secondary" onClick={() => onAction('unignore')} disabled={busy}>Undo ignore</button>
          )}
        </div>
      </div>
      {filter === 'new' && <CardPaymentHint txn={txn} unconnectedCards={unconnectedCards} />}
      {error && <div className="bank-import-error" role="alert">{error}</div>}
      {isOpen('add') && (
        <AddForm txn={txn} busy={busy} warnCardPayment={isCardPaymentRow(txn)} onCancel={() => onExpand(null)} onSubmit={(fields) => onAction('add', fields)} />
      )}
      {CARD_PAYMENT_MODES.includes(expanded) && (
        <CardPaymentPanel
          txn={txn}
          mode={expanded}
          unconnectedCards={unconnectedCards}
          busy={busy}
          onCancel={() => onExpand(null)}
          onSubmit={(body) => onAction('card-payment', body)}
        />
      )}
      {isOpen('add-income') && (
        <AddIncomeForm txn={txn} busy={busy} onCancel={() => onExpand(null)} onSubmit={(fields) => onAction('add-income', fields)} />
      )}
      {isOpen('match') && (
        <MatchPicker
          txn={txn}
          busy={busy}
          onCancel={() => onExpand(null)}
          onMatch={(expenseId) => onAction('match', expenseId)}
          onMatchFixed={(fixedExpenseId) => onAction('match-fixed', fixedExpenseId)}
          onMatchIncome={(payload) => onAction('match-income', payload)}
        />
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
    setBusyId(txn.id);
    setRowErrors(prev => ({ ...prev, [txn.id]: null }));
    try {
      if (action === 'add') await addInboxTransaction(txn.id, payload);
      else if (action === 'match') await matchInboxTransaction(txn.id, payload);
      else if (action === 'match-fixed') await matchInboxTransactionToFixed(txn.id, payload);
      else if (action === 'match-income') await matchInboxTransactionToIncome(txn.id, payload);
      else if (action === 'add-income') await addInboxTransactionAsIncome(txn.id, payload);
      else if (action === 'card-payment') await cardPaymentInboxTransaction(txn.id, payload);
      else if (action === 'ignore') await ignoreInboxTransaction(txn.id);
      else if (action === 'unignore') await unignoreInboxTransaction(txn.id);

      setData(prev => ({ ...prev, transactions: prev.transactions.filter(t => t.id !== txn.id) }));
      setExpanded({ id: null, mode: null });
      if (action !== 'ignore' && action !== 'unignore') {
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
