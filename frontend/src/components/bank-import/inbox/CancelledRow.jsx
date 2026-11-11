import { formatCurrency, formatDate } from '../../../utils/formatters';
import { formatSigned } from './inboxFormat';

/**
 * A pending charge that was added as an expense and then dropped by the bank: link it to the settled
 * transaction (when one looks like it), keep the expense, or delete it (cancelled hold).
 * @param {{row: object, busy: boolean, error?: string, onDecide: Function}} props
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

export default CancelledRow;
