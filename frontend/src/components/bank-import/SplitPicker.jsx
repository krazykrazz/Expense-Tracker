import { useEffect, useMemo, useState } from 'react';
import { getSplitCandidates } from '../../services/plaidApi';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { toCents } from '../../utils/money';

/**
 * Link one bank charge to several expenses that were entered for it (spec 3.9): a charge to review is matched to a
 * set that adds up to it to the cent (at least two expenses); a charge already linked to an expense takes more
 * expenses, as long as they fit in what is left. Used by the Import Inbox and by the Edit Expense form.
 * @param {{transactionId: number, busy: boolean, onCancel: Function, onApply: (expenseIds: number[]) => void}} props
 */
const SplitPicker = ({ transactionId, busy, onCancel, onApply }) => {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    getSplitCandidates(transactionId, { signal: controller.signal })
      .then(result => {
        setData(result);
        setLoadError(null);
        // First load: start from the one combination that adds up, when there is one
        setSelected(prev => (prev.length > 0 ? prev : (result.suggestion || [])));
      })
      .catch(err => { if (err.name !== 'AbortError') setLoadError(err.message); });
    return () => controller.abort();
  }, [transactionId]);

  const candidates = useMemo(() => data?.candidates ?? [], [data]);
  const picked = candidates.filter(candidate => selected.includes(candidate.expenseId));
  const remainingCents = data ? toCents(data.remaining) : 0;
  const totalCents = picked.reduce((sum, candidate) => sum + toCents(candidate.charged), 0);
  const leftCents = remainingCents - totalCents;
  const exact = data?.mode === 'match';
  const canApply = Boolean(data) && !busy && picked.length >= data.minExpenses && leftCents >= 0 && (exact ? leftCents === 0 : totalCents > 0);

  const toggle = (candidate) => setSelected(prev => (
    prev.includes(candidate.expenseId) ? prev.filter(id => id !== candidate.expenseId) : [...prev, candidate.expenseId]
  ));

  return (
    <div className="inbox-match-picker insurance-picker" data-testid="split-picker">
      {loadError && <div className="bank-import-error" role="alert">{loadError}</div>}
      {!data && !loadError && <div className="bank-import-muted">Loading expenses…</div>}
      {data && (
        <>
          <div className="bank-import-muted">
            {exact
              ? `Pick the expenses you entered for this ${formatCurrency(data.bankAmount)} charge. Together they must add up to it. Nothing about them changes.`
              : `${formatCurrency(data.partsTotal)} of this ${formatCurrency(data.bankAmount)} charge is linked to ${data.parts.length === 1 ? 'one expense' : `${data.parts.length} expenses`}. Pick the expenses that make up the other ${formatCurrency(data.remaining)}.`}
          </div>
          {data.parts.length > 0 && (
            <ul data-testid="split-linked-parts">
              {data.parts.map(part => (
                <li key={part.expenseId} className="insurance-candidate">
                  <span className="bank-import-muted">
                    Linked: {formatDate(part.date)} · {part.place || 'Unknown'} · {formatCurrency(part.charged)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {candidates.length === 0 && (
            <div className="bank-import-muted">
              No other expense on this payment method with an amount that fits, dated within a few days of the charge.
            </div>
          )}
          {candidates.length > 0 && (
            <ul>
              {candidates.map(candidate => {
                const reimbursed = candidate.originalCost != null && candidate.originalCost !== candidate.amount;
                return (
                  <li key={candidate.expenseId} data-testid="split-candidate" className="insurance-candidate">
                    <label className="inbox-inline-check">
                      <input
                        type="checkbox"
                        checked={selected.includes(candidate.expenseId)}
                        onChange={() => toggle(candidate)}
                        disabled={busy}
                      />
                      {' '}{formatDate(candidate.date)} · {candidate.place || 'Unknown'} · {candidate.type} · {formatCurrency(candidate.charged)}
                      {reimbursed && <span className="bank-import-muted"> (you paid {formatCurrency(candidate.amount)} after reimbursement)</span>}
                      {candidate.notes ? <span className="bank-import-muted"> — {candidate.notes}</span> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="insurance-total" data-testid="split-total">
            Selected {formatCurrency(totalCents / 100)} of {formatCurrency(remainingCents / 100)}
            {picked.length > 0 && leftCents !== 0 && (
              <span className={exact || leftCents < 0 ? 'bank-import-error' : 'bank-import-muted'}>
                {' '}· {leftCents > 0 ? `${formatCurrency(leftCents / 100)} left` : `${formatCurrency(-leftCents / 100)} too much`}
              </span>
            )}
          </div>
        </>
      )}
      <div className="inbox-form-actions">
        <button className="bank-import-primary" onClick={() => onApply(picked.map(candidate => candidate.expenseId))} disabled={!canApply}>
          {exact || !data ? 'Match expenses' : 'Add to this charge'}
        </button>
        <button className="bank-import-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
};

export default SplitPicker;
