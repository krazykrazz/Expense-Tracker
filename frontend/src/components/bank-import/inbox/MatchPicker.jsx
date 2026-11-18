import { formatCurrency, formatDate } from '../../../utils/formatters';
import IncomeCandidates from './IncomeCandidates';
import { dueLabel } from './inboxFormat';

/**
 * What a bank transaction could be: expected income (deposits), an expense already entered, or a planned fixed
 * expense, each with its own confirm button.
 * @param {{txn: object, onMatch: Function, onMatchFixed: Function, onMatchIncome: Function, onCancel: Function, busy: boolean}} props
 */
const MatchPicker = ({ txn, onMatch, onMatchFixed, onMatchIncome, onCancel, busy }) => (
  <div className="inbox-match-picker">
    {(txn.incomeCandidates || []).length > 0 && <IncomeCandidates txn={txn} onMatchIncome={onMatchIncome} busy={busy} />}
    {txn.matchCandidates.length > 0 && (
      <>
        <div className="bank-import-muted">Expenses: same payment method, an amount within $1.00 or 1% of the bank&apos;s (exact first), and a close date</div>
        {txn.paymentMethodType === 'credit_card' && !txn.pending && (
          <div className="bank-import-muted">Matching sets the expense&apos;s posted date to the bank&apos;s ({formatDate(txn.postedDate)}); its purchase date stays.</div>
        )}
        <ul>
          {txn.matchCandidates.map(candidate => {
            const reimbursed = candidate.originalCost != null && candidate.originalCost !== candidate.amount;
            const differs = candidate.amountDiff != null && candidate.amountDiff !== 0;
            return (
              <li key={`e-${candidate.id}`}>
                <span>
                  {formatDate(candidate.date)} · {candidate.place || '-'} · {candidate.type} · {formatCurrency(candidate.chargedAmount ?? candidate.amount)}
                  {differs && (
                    <span className="inbox-amount-differs" data-testid="amount-differs">
                      {' '}· the bank charged {formatCurrency(txn.amount)} ({formatCurrency(Math.abs(candidate.amountDiff))} {candidate.amountDiff > 0 ? 'more' : 'less'})
                    </span>
                  )}
                  {reimbursed && <span className="bank-import-muted"> (you paid {formatCurrency(candidate.amount)} after reimbursement)</span>}
                  {candidate.notes ? <span className="bank-import-muted"> — {candidate.notes}</span> : null}
                </span>
                <button className="bank-import-primary" onClick={() => onMatch(candidate.id)} disabled={busy}>Match</button>
                {differs && candidate.canUseBankAmount && (
                  <button
                    className="bank-import-secondary"
                    onClick={() => onMatch(candidate.id, { updateAmount: true })}
                    disabled={busy}
                    title={`Match and change the expense's amount to ${formatCurrency(txn.amount)}`}
                  >
                    Match &amp; use {formatCurrency(txn.amount)}
                  </button>
                )}
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

export default MatchPicker;
