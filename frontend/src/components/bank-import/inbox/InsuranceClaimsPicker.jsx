import { useEffect, useMemo, useState } from 'react';
import { getInsuranceCandidates } from '../../../services/plaidApi';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { claimAfter, prefillSplit, toCents } from './insuranceSplit';

const STATUS_LABELS = { in_progress: 'In progress', not_claimed: 'Not claimed', paid: 'Paid' };
const RANK_LABELS = {
  exact: { text: 'Exact', title: 'Its expected payout (original cost − out-of-pocket) equals the deposit' },
  combination: { text: 'Adds up', title: 'Together with the other claims marked "Adds up", its expected payout adds up to the deposit' }
};

/**
 * Apply a deposit to insurance claims: pick one or more claims, set what this deposit reimbursed on each (pre-filled,
 * must add up to the deposit to the cent), and preview each claim's out-of-pocket and per-person shares afterwards.
 * @param {{txn: object, busy: boolean, onCancel: Function, onApply: (claims: Array<{expenseId: number, amount: number}>) => void}} props
 */
const InsuranceClaimsPicker = ({ txn, busy, onCancel, onApply }) => {
  const [includePaid, setIncludePaid] = useState(false);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [amounts, setAmounts] = useState({});
  const depositCents = Math.abs(toCents(txn.amount));

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    getInsuranceCandidates(txn.id, { includePaid, signal: controller.signal })
      .then(result => {
        setData(result);
        // First load: start from the suggested claims (an exact match or the one combination that adds up)
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
  }, [txn.id, includePaid]);

  const candidates = useMemo(() => data?.candidates ?? [], [data]);
  const picked = candidates.filter(claim => selected.includes(claim.expenseId));

  const toggle = (claim) => {
    const next = selected.includes(claim.expenseId)
      ? selected.filter(id => id !== claim.expenseId)
      : [...selected, claim.expenseId];
    setSelected(next);
    const split = prefillSplit(depositCents, candidates.filter(c => next.includes(c.expenseId)));
    setAmounts(Object.fromEntries(Object.entries(split).map(([id, amount]) => [id, amount.toFixed(2)])));
  };

  const amountOf = (claim) => amounts[claim.expenseId] ?? '';
  const totalCents = picked.reduce((sum, claim) => sum + (toCents(amountOf(claim)) || 0), 0);
  const rows = picked.map(claim => {
    const value = amountOf(claim);
    const valid = value !== '' && Number(value) > 0 && /^\d+(\.\d{1,2})?$/.test(String(value));
    return { claim, value, valid, after: claimAfter(claim, valid ? Number(value) : 0) };
  });
  const allValid = rows.length > 0 && rows.every(row => row.valid && !row.after.over);
  const remainingCents = depositCents - totalCents;
  const canApply = allValid && remainingCents === 0 && !busy;

  const apply = () => onApply(rows.map(row => ({ expenseId: row.claim.expenseId, amount: Number(row.value) })));

  return (
    <div className="inbox-match-picker insurance-picker" data-testid="insurance-picker">
      <div className="bank-import-muted">
        Claims from the 180 days before this deposit. Out-of-pocket becomes the original cost minus everything the insurer
        paid, and each person&apos;s share drops in proportion.
      </div>
      {loadError && <div className="bank-import-error" role="alert">{loadError}</div>}
      {!data && !loadError && <div className="bank-import-muted">Loading claims…</div>}
      {data && candidates.length === 0 && (
        <div className="bank-import-muted">No open insurance claims in the 180 days before this deposit.</div>
      )}
      {candidates.length > 0 && (
        <ul>
          {candidates.map(claim => {
            const isPicked = selected.includes(claim.expenseId);
            const row = rows.find(r => r.claim.expenseId === claim.expenseId);
            const rank = RANK_LABELS[claim.rank];
            return (
              <li key={claim.expenseId} data-testid="insurance-candidate" className="insurance-candidate">
                <label className="inbox-inline-check">
                  <input type="checkbox" checked={isPicked} onChange={() => toggle(claim)} disabled={busy} />
                  {' '}{formatDate(claim.date)} · {claim.place || 'Unknown'} · {STATUS_LABELS[claim.claimStatus] || claim.claimStatus}
                  {' '}· original {formatCurrency(claim.originalCost)} · out-of-pocket {formatCurrency(claim.outOfPocket)}
                  {claim.expectedPayout > 0 && <> · expected {formatCurrency(claim.expectedPayout)}</>}
                  {rank && <span className="inbox-badge match" title={rank.title}>{rank.text}</span>}
                </label>
                {isPicked && row && (
                  <div className="insurance-claim-split">
                    <label>
                      Reimbursed{' '}
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={row.value}
                        aria-label={`Reimbursed on ${claim.place || 'claim'} ${claim.date}`}
                        onChange={(event) => setAmounts(prev => ({ ...prev, [claim.expenseId]: event.target.value }))}
                        disabled={busy}
                      />
                    </label>
                    {row.after.over ? (
                      <span className="bank-import-error">More than is left to reimburse on this claim</span>
                    ) : (
                      <span className="bank-import-muted" data-testid="insurance-preview">
                        Out-of-pocket after: {formatCurrency(row.after.outOfPocket)}
                        {row.after.people.length > 0 && ` (${row.after.people.map(p => `${p.name} ${formatCurrency(p.amount)}`).join(', ')})`}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {data && !includePaid && data.paidAvailable > 0 && (
        <button className="bank-import-link" onClick={() => setIncludePaid(true)} disabled={busy}>
          Show paid claims ({data.paidAvailable}), for a second plan paying the rest
        </button>
      )}
      <div className="insurance-total" data-testid="insurance-total">
        Applied {formatCurrency(totalCents / 100)} of {formatCurrency(depositCents / 100)}
        {picked.length > 0 && remainingCents !== 0 && (
          <span className="bank-import-error">
            {' '}· {remainingCents > 0 ? `${formatCurrency(remainingCents / 100)} left to apply` : `${formatCurrency(-remainingCents / 100)} too much`}
          </span>
        )}
      </div>
      <div className="inbox-form-actions">
        <button className="bank-import-primary" onClick={apply} disabled={!canApply}>Apply to claims</button>
        <button className="bank-import-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
};

export default InsuranceClaimsPicker;
