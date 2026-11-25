import { useEffect, useMemo, useState } from 'react';
import { getReimbursementCandidates } from '../../../services/plaidApi';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { afterRepaying, allocateDeposit } from './reimbursementSplit';
import { toCents } from '../../../utils/money';

const TAG_LABELS = {
  learned: { text: 'Same sender before', title: 'An earlier deposit with this description was applied to an expense with this place' },
  entered: { text: 'Entered by hand', title: 'You already entered a reimbursement on the expense that covers this amount' },
  exact: { text: 'Exact', title: 'What the expense cost you equals this amount' },
  half: { text: 'Half', title: 'What the expense cost you is twice this amount (a split bill)' },
  name: { text: 'Name', title: 'The description shares a name with the place or notes' },
  merchant: { text: 'Same merchant', title: 'Same merchant as the refund' }
};

const validAmount = (value) => value !== '' && Number(value) > 0 && /^\d+(\.\d{1,2})?$/.test(String(value));

/**
 * Apply a refund or a deposit to the expenses it repays. A refund on a card repays one purchase on that card, for the
 * whole credit; it is also recorded as a payment on the card. A deposit can repay several expenses (any payment
 * method): the amounts must add up to the deposit to the cent. Either way the expense becomes a reimbursement: its
 * original cost is what was charged and its amount what it cost out of pocket.
 * @param {{txn: object, busy: boolean, onCancel: Function,
 *   onApply: (expenses: Array<{expenseId: number, amount: number, alreadyEntered?: boolean}>) => void}} props
 */
const ReimbursementPicker = ({ txn, busy, onCancel, onApply }) => {
  const isRefund = txn.reimbursement?.kind === 'refund';
  const [all, setAll] = useState(false);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [amounts, setAmounts] = useState({});
  const [entered, setEntered] = useState({});
  const bankCents = Math.abs(toCents(txn.amount));

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    getReimbursementCandidates(txn.id, { all, signal: controller.signal })
      .then(result => {
        setData(result);
        // First load: start from the suggestion (the purchase a refund is for, or the expense a deposit most likely repays)
        setSelected(prev => {
          if (prev.length > 0) return prev.filter(id => result.candidates.some(c => c.expenseId === id));
          return (result.suggestion || []).map(entry => entry.expenseId);
        });
        if (result.suggestion) {
          setAmounts(prev => (Object.keys(prev).length > 0 ? prev
            : Object.fromEntries(result.suggestion.map(entry => [entry.expenseId, entry.amount.toFixed(2)]))));
        }
      })
      .catch(err => { if (err.name !== 'AbortError') setLoadError(err.message); });
    return () => controller.abort();
  }, [txn.id, all]);

  const candidates = useMemo(() => data?.candidates ?? [], [data]);
  // Counting against a reimbursement entered by hand: the person's choice, else what the server suggests
  const withMode = (candidate) => ({ ...candidate, alreadyEntered: entered[candidate.expenseId] ?? candidate.alreadyEntered });
  const picked = selected.map(id => candidates.find(c => c.expenseId === id)).filter(Boolean).map(withMode);

  const reallocate = (ids, modes) => {
    const split = allocateDeposit(bankCents, ids
      .map(id => candidates.find(c => c.expenseId === id)).filter(Boolean)
      .map(candidate => ({ ...candidate, alreadyEntered: modes[candidate.expenseId] ?? candidate.alreadyEntered })));
    setAmounts(Object.fromEntries(Object.entries(split).map(([id, amount]) => [id, amount.toFixed(2)])));
  };

  const toggle = (candidate) => {
    if (isRefund) {
      setSelected([candidate.expenseId]);
      setAmounts({ [candidate.expenseId]: (bankCents / 100).toFixed(2) });
      return;
    }
    const next = selected.includes(candidate.expenseId)
      ? selected.filter(id => id !== candidate.expenseId)
      : [...selected, candidate.expenseId];
    setSelected(next);
    reallocate(next, entered);
  };

  const setMode = (candidate, value) => {
    const modes = { ...entered, [candidate.expenseId]: value };
    setEntered(modes);
    if (!isRefund) reallocate(selected, modes);
  };

  const rows = picked.map(candidate => {
    const value = amounts[candidate.expenseId] ?? '';
    const valid = validAmount(value);
    return {
      candidate, value, valid,
      after: afterRepaying(candidate, valid ? Number(value) : 0, candidate.alreadyEntered)
    };
  });
  const totalCents = rows.reduce((sum, row) => sum + (row.valid ? toCents(row.value) : 0), 0);
  const remainingCents = bankCents - totalCents;
  const canApply = rows.length > 0 && rows.every(row => row.valid && !row.after.over) && remainingCents === 0 && !busy;

  const apply = () => onApply(rows.map(({ candidate, value }) => ({
    expenseId: candidate.expenseId,
    amount: Number(value),
    ...(candidate.alreadyEntered ? { alreadyEntered: true } : {})
  })));

  return (
    <div className="inbox-match-picker insurance-picker" data-testid="reimbursement-picker">
      <div className="bank-import-muted">
        {isRefund
          ? `Purchases on ${txn.paymentMethodName} from the 90 days before this refund. The purchase's cost drops by the refund and ${formatCurrency(bankCents / 100)} is recorded as a payment on the card, so its balance matches the bank.`
          : 'Expenses from the 90 days before this deposit, on any payment method. Their out-of-pocket drops by what was repaid; a card keeps the full charge.'}
      </div>
      {loadError && <div className="bank-import-error" role="alert">{loadError}</div>}
      {!data && !loadError && <div className="bank-import-muted">Loading expenses…</div>}
      {data && candidates.length === 0 && (
        <div className="bank-import-muted">
          {isRefund ? 'No purchase at this merchant on this card in the 90 days before the refund.' : 'No expenses with something left to repay in the 90 days before this deposit.'}
        </div>
      )}
      {candidates.length > 0 && (
        <ul>
          {candidates.map(candidate => {
            const isPicked = selected.includes(candidate.expenseId);
            const row = rows.find(r => r.candidate.expenseId === candidate.expenseId);
            return (
              <li key={candidate.expenseId} data-testid="reimbursement-candidate" className="insurance-candidate">
                <label className="inbox-inline-check">
                  <input
                    type={isRefund ? 'radio' : 'checkbox'}
                    name="reimbursement-expense"
                    checked={isPicked}
                    onChange={() => toggle(candidate)}
                    disabled={busy}
                  />
                  {' '}{formatDate(candidate.date)} · {candidate.place || 'Unknown'}
                  {!isRefund && candidate.method ? ` · ${candidate.method}` : ''}
                  {' '}· {formatCurrency(candidate.amount)}
                  {candidate.reimbursed > 0 && <span className="bank-import-muted"> (charged {formatCurrency(candidate.charged)}, {formatCurrency(candidate.reimbursed)} reimbursed)</span>}
                  {candidate.tags.map(tag => TAG_LABELS[tag] && (
                    <span key={tag} className="inbox-badge match" title={TAG_LABELS[tag].title}>{TAG_LABELS[tag].text}</span>
                  ))}
                </label>
                {isPicked && row && (
                  <div className="insurance-claim-split">
                    {candidate.enteredPool > 0 && (
                      <label className="inbox-inline-check">
                        <input
                          type="checkbox"
                          checked={row.candidate.alreadyEntered}
                          onChange={(event) => setMode(candidate, event.target.checked)}
                          disabled={busy}
                        />
                        {' '}Count against the {formatCurrency(candidate.enteredPool)} reimbursement I entered
                      </label>
                    )}
                    {!isRefund && (
                      <label>
                        Repaid{' '}
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={row.value}
                          aria-label={`Repaid on ${candidate.place || 'expense'} ${candidate.date}`}
                          onChange={(event) => setAmounts(prev => ({ ...prev, [candidate.expenseId]: event.target.value }))}
                          disabled={busy}
                        />
                      </label>
                    )}
                    {row.after.over ? (
                      <span className="bank-import-error">
                        {row.candidate.alreadyEntered
                          ? `More than the ${formatCurrency(row.candidate.enteredPool)} entered as reimbursed`
                          : 'More than is left to repay on this expense'}
                      </span>
                    ) : (
                      <span className="bank-import-muted" data-testid="reimbursement-preview">
                        {row.after.unchanged
                          ? 'Counted against the reimbursement you entered: the expense stays as it is'
                          : `Out of pocket after: ${formatCurrency(row.after.outOfPocket)}`}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {data && !all && data.moreAvailable && (
        <button className="bank-import-link" onClick={() => setAll(true)} disabled={busy}>
          {isRefund ? 'Show purchases at other merchants' : 'Show more expenses'}
        </button>
      )}
      {!isRefund && (
        <div className="insurance-total" data-testid="reimbursement-total">
          Applied {formatCurrency(totalCents / 100)} of {formatCurrency(bankCents / 100)}
          {picked.length > 0 && remainingCents !== 0 && (
            <span className="bank-import-error">
              {' '}· {remainingCents > 0 ? `${formatCurrency(remainingCents / 100)} left to apply` : `${formatCurrency(-remainingCents / 100)} too much`}
            </span>
          )}
        </div>
      )}
      <div className="inbox-form-actions">
        <button className="bank-import-primary" onClick={apply} disabled={!canApply}>
          {isRefund ? 'Apply refund' : 'Apply to expenses'}
        </button>
        <button className="bank-import-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
};

export default ReimbursementPicker;
