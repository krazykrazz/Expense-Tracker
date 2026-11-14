import { PendingTurnoverMarker } from '../../expenses/PostedTurnoverMarker';
import {
  CardPaymentBadge, CardPaymentButtons, CardPaymentHint, CardPaymentPanel, isCardPaymentRow
} from '../CardPaymentActions';
import { formatDate } from '../../../utils/formatters';
import AddExpenseForm from './AddExpenseForm';
import AddIncomeForm from './AddIncomeForm';
import InsuranceClaimsPicker from './InsuranceClaimsPicker';
import MatchPicker from './MatchPicker';
import { EXPECTED_CURRENCY, formatSigned, isCloseFixed, isCloseIncome } from './inboxFormat';

const CARD_PAYMENT_MODES = ['card-payment', 'link-payment', 'record-to-card'];
const KIND_LABELS = { card_payment: 'Card payment', transfer: 'Transfer', loan_payment: 'Loan payment' };

/**
 * One bank transaction in the Inbox: what it is (badges), the actions it allows, and the form or picker of the
 * action that is open (`expanded`). Decisions go to `onAction(action, payload)` (see inboxActions).
 * Rows in Not expenses (`txn.bucket`) keep every action and can be moved back to To review, and the other way.
 * @param {{txn: object, filter: 'new'|'ignored', expanded: (string|null), onExpand: Function, onAction: Function,
 *   busy: boolean, error?: string, unconnectedCards?: Array}} props
 */
const InboxRow = ({ txn, filter, expanded, onExpand, onAction, busy, error, unconnectedCards = [] }) => {
  const incomeCandidates = txn.incomeCandidates || [];
  const hasCandidates = txn.matchCandidates.length > 0 || txn.fixedCandidates.length > 0 || incomeCandidates.length > 0;
  const closeFixed = txn.fixedCandidates.filter(fixed => isCloseFixed(txn, fixed));
  const closeIncome = incomeCandidates.filter(isCloseIncome);
  const isOpen = (mode) => expanded === mode;
  const toggle = (mode) => onExpand(isOpen(mode) ? null : mode);
  const notExpense = txn.bucket === 'not_expense';
  // CardPaymentBadge already names a card payment it knows about
  const kindLabel = notExpense && !(txn.kind === 'card_payment' && txn.cardPayment?.kind) ? KIND_LABELS[txn.kind] : null;

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
          {filter === 'new' && txn.paymentMethodType === 'credit_card' && (
            <PendingTurnoverMarker date={txn.date} pending={txn.pending} billingCycleDay={txn.billingCycleDay} />
          )}
          {txn.source === 'file' && (
            <span className="inbox-badge" title="Imported from a file downloaded from the bank. Plaid takes it over when it catches up.">From file</span>
          )}
          {filter === 'new' && !txn.canAdd && !txn.cardPayment?.kind && <span className="inbox-badge">{txn.isDeposit ? 'Deposit' : 'Refund / credit'}</span>}
          {filter === 'new' && <CardPaymentBadge txn={txn} />}
          {filter === 'new' && kindLabel && <span className="inbox-badge" data-testid="inbox-kind-badge">{kindLabel}</span>}
          {filter === 'new' && txn.insurance?.suggested && (
            <span className="inbox-badge match" title="Looks like an insurance payout: apply it to the claims it reimburses">Insurance</span>
          )}
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
              {txn.canAdd && <button className="bank-import-secondary" onClick={() => toggle('add')} disabled={busy}>Add</button>}
              {hasCandidates && <button className="bank-import-secondary" onClick={() => toggle('match')} disabled={busy}>Match</button>}
              {txn.isDeposit && <button className="bank-import-secondary" onClick={() => toggle('add-income')} disabled={busy}>Add income</button>}
              {txn.isDeposit && !txn.pending && (
                <button
                  className={txn.insurance?.suggested ? 'bank-import-primary' : 'bank-import-secondary'}
                  onClick={() => toggle('insurance')}
                  disabled={busy}
                >
                  Apply to insurance
                </button>
              )}
              <CardPaymentButtons txn={txn} unconnectedCards={unconnectedCards} expanded={expanded} onExpand={onExpand} busy={busy} />
              <button className="bank-import-secondary" onClick={() => onAction('ignore')} disabled={busy}>Ignore</button>
              {notExpense ? (
                <button className="bank-import-secondary" onClick={() => onAction('bucket', 'spending')} disabled={busy}>Move to To review</button>
              ) : (
                <button
                  className="bank-import-link"
                  title="A card payment or a transfer between accounts: move it to Not expenses"
                  onClick={() => onAction('bucket', 'not_expense')}
                  disabled={busy}
                >
                  Not an expense
                </button>
              )}
            </>
          ) : (
            <button className="bank-import-secondary" onClick={() => onAction('unignore')} disabled={busy}>Undo ignore</button>
          )}
        </div>
      </div>
      {filter === 'new' && <CardPaymentHint txn={txn} unconnectedCards={unconnectedCards} />}
      {error && <div className="bank-import-error" role="alert">{error}</div>}
      {isOpen('add') && (
        <AddExpenseForm txn={txn} busy={busy} warnCardPayment={isCardPaymentRow(txn)} onCancel={() => onExpand(null)} onSubmit={(fields) => onAction('add', fields)} />
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
      {isOpen('insurance') && (
        <InsuranceClaimsPicker txn={txn} busy={busy} onCancel={() => onExpand(null)} onApply={(claims) => onAction('insurance', claims)} />
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

export default InboxRow;
