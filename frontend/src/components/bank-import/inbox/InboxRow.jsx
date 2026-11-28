import { useState } from 'react';
import { PendingTurnoverMarker } from '../../expenses/PostedTurnoverMarker';
import {
  CardPaymentBadge, CardPaymentButtons, CardPaymentHint, CardPaymentPanel, isCardPaymentRow
} from '../CardPaymentActions';
import { formatDate } from '../../../utils/formatters';
import AddExpenseForm from './AddExpenseForm';
import AddIncomeForm from './AddIncomeForm';
import InsuranceClaimsPicker from './InsuranceClaimsPicker';
import ReimbursementPicker from './ReimbursementPicker';
import MatchPicker from './MatchPicker';
import SplitPicker from '../SplitPicker';
import { EXPECTED_CURRENCY, formatSigned, isCloseFixed, isCloseIncome } from './inboxFormat';

const CARD_PAYMENT_MODES = ['card-payment', 'link-payment', 'record-to-card'];
const ACTION_LABELS = { match: 'Match', 'add-income': 'Add income', insurance: 'Apply to insurance', reimbursement: 'Apply to an expense' };
const KIND_LABELS = { card_payment: 'Card payment', transfer: 'Transfer', loan_payment: 'Loan payment' };

/**
 * One bank transaction in the Inbox: what it is (badges), the actions it allows, and the form or picker of the
 * action that is open (`expanded`). Decisions go to `onAction(action, payload)` (see inboxActions).
 * Rows in Not expenses (`txn.bucket`) keep every action and can be moved back to To review, and the other way.
 * @param {{txn: object, filter: 'new'|'ignored', expanded: (string|null), onExpand: Function, onAction: Function,
 *   busy: boolean, error?: string, creditCards?: Array}} props
 */
const InboxRow = ({ txn, filter, expanded, onExpand, onAction, busy, error, creditCards = [] }) => {
  const [showMore, setShowMore] = useState(false);
  const incomeCandidates = txn.incomeCandidates || [];
  const hasCandidates = txn.matchCandidates.length > 0 || txn.fixedCandidates.length > 0 || incomeCandidates.length > 0 || Boolean(txn.split);
  const closeFixed = txn.fixedCandidates.filter(fixed => isCloseFixed(txn, fixed));
  const closeIncome = incomeCandidates.filter(isCloseIncome);
  const isOpen = (mode) => expanded === mode;
  // Positive actions this row offers, best guess first. A deposit can be several things (expected income, an
  // insurance payout, someone paying you back, other income): the best guess is the main button, the rest are
  // under More… so the row reads as one suggestion. Other rows show their actions as before.
  const actions = [
    closeIncome.length > 0 && 'match',
    txn.insurance?.suggested && 'insurance',
    txn.reimbursement?.suggested && 'reimbursement',
    hasCandidates && 'match',
    txn.isDeposit && 'add-income',
    txn.isDeposit && !txn.pending && 'insurance',
    txn.reimbursement && 'reimbursement'
  ].filter(Boolean).filter((action, index, list) => list.indexOf(action) === index);
  const primary = txn.isDeposit ? actions[0] : null;
  const moreActions = txn.isDeposit ? actions.slice(1) : [];
  const showAction = (action) => actions.includes(action) && (!txn.isDeposit || action === primary || showMore || isOpen(action));
  const btnClass = (action) => {
    if (txn.isDeposit) return action === primary ? 'bank-import-primary' : 'bank-import-secondary';
    if (action === 'insurance') return txn.insurance?.suggested ? 'bank-import-primary' : 'bank-import-secondary';
    if (action === 'reimbursement') return txn.reimbursement?.suggested && !txn.insurance?.suggested ? 'bank-import-primary' : 'bank-import-secondary';
    return 'bank-import-secondary';
  };
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
        <div className={`inbox-row-amount ${txn.amount <= 0 ? 'credit' : ''}`} title={txn.amount < 0 ? 'Money in' : 'Money out'}>
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
            <span className="inbox-badge" title="Imported from a file downloaded from the bank. When Plaid sends the same transaction it takes this row over, keeping what you did with it (the expense it was added or matched to).">From file</span>
          )}
          {filter === 'new' && !txn.canAdd && !txn.cardPayment?.kind && <span className="inbox-badge">{txn.isDeposit ? 'Deposit' : 'Refund / credit'}</span>}
          {filter === 'new' && <CardPaymentBadge txn={txn} />}
          {filter === 'new' && kindLabel && <span className="inbox-badge" data-testid="inbox-kind-badge">{kindLabel}</span>}
          {filter !== 'new' && notExpense && <span className="inbox-badge" data-testid="inbox-done-badge">Not an expense</span>}
          {filter === 'new' && txn.insurance?.suggested && (
            <span className="inbox-badge match" title="Looks like an insurance payout: apply it to the claims it reimburses">Insurance</span>
          )}
          {filter === 'new' && txn.reimbursement?.suggested && (
            <span className="inbox-badge match" title="Something you bought looks like what this repays: apply it so spending is right">
              {txn.reimbursement.kind === 'refund' ? 'Refund' : 'Repays an expense'}
            </span>
          )}
          {filter === 'new' && closeIncome.length > 0 && (
            <span className="inbox-badge match" title="Matches expected income: confirm it to record when it landed">
              Income: {closeIncome[0].name}
            </span>
          )}
          {filter === 'new' && txn.matchCandidates.length > 0 && <span className="inbox-badge match">Possible match</span>}
          {filter === 'new' && txn.split?.suggested && (
            <span className="inbox-badge match" title="Expenses you entered add up to this charge: match them all to it">Adds up: several expenses</span>
          )}
          {filter === 'new' && closeFixed.length > 0 && (
            <span className="inbox-badge match" title="Matches a planned fixed expense: confirm it instead of adding, to avoid counting it twice">
              Fixed: {closeFixed[0].name}
            </span>
          )}
        </div>
        <div className="inbox-row-actions">
          {filter === 'new' ? (
            <>
              {txn.canAdd && <button className="bank-import-secondary" onClick={() => toggle('add')} disabled={busy} aria-expanded={isOpen('add')}>Add</button>}
              {showAction('match') && (
                <button className={btnClass('match')} onClick={() => toggle('match')} disabled={busy} aria-expanded={isOpen('match') || isOpen('split')}>Match</button>
              )}
              {showAction('add-income') && (
                <button className={btnClass('add-income')} onClick={() => toggle('add-income')} disabled={busy} aria-expanded={isOpen('add-income')}>Add income</button>
              )}
              {showAction('insurance') && (
                <button className={btnClass('insurance')} onClick={() => toggle('insurance')} disabled={busy} aria-expanded={isOpen('insurance')}>
                  Apply to insurance
                </button>
              )}
              {showAction('reimbursement') && (
                <button
                  className={btnClass('reimbursement')}
                  onClick={() => toggle('reimbursement')}
                  disabled={busy}
                  aria-expanded={isOpen('reimbursement')}
                  title={txn.reimbursement.kind === 'refund'
                    ? 'A refund for a purchase on this card: lowers what it cost and records the credit on the card'
                    : 'Someone paid you back for an expense: lowers what it cost you'}
                >
                  Apply to an expense
                </button>
              )}
              {moreActions.length > 0 && !showMore && (
                <button className="bank-import-link" onClick={() => setShowMore(true)} disabled={busy} title={`Also: ${moreActions.map(a => ACTION_LABELS[a]).join(', ')}`}>
                  More…
                </button>
              )}
              <CardPaymentButtons txn={txn} creditCards={creditCards} expanded={expanded} onExpand={onExpand} busy={busy} />
              {notExpense ? (
                <>
                  <button
                    className="bank-import-secondary"
                    title="Nothing to do for it: it leaves the Inbox (Done & ignored has Undo)"
                    onClick={() => onAction('bucket', 'not_expense')}
                    disabled={busy}
                  >
                    Done
                  </button>
                  <button
                    className="bank-import-link"
                    title="Spending after all: move it to To review"
                    onClick={() => onAction('bucket', 'spending')}
                    disabled={busy}
                  >
                    Move to To review
                  </button>
                </>
              ) : (
                <>
                  <button className="bank-import-secondary" onClick={() => onAction('ignore')} disabled={busy}>Ignore</button>
                  <button
                    className="bank-import-link"
                    title="Money that isn't spending (a transfer between your accounts, say): it leaves the Inbox (Done & ignored has Undo)"
                    onClick={() => onAction('bucket', 'not_expense')}
                    disabled={busy}
                  >
                    Not an expense
                  </button>
                </>
              )}
            </>
          ) : (
            <button
              className="bank-import-secondary"
              title={notExpense ? 'Back to To review' : 'Back to the Inbox'}
              onClick={() => onAction('unignore')}
              disabled={busy}
            >
              {notExpense ? 'Undo not an expense' : 'Undo ignore'}
            </button>
          )}
        </div>
      </div>
      {filter === 'new' && <CardPaymentHint txn={txn} creditCards={creditCards} />}
      {error && <div className="bank-import-error" role="alert">{error}</div>}
      {isOpen('add') && (
        <AddExpenseForm txn={txn} busy={busy} warnCardPayment={isCardPaymentRow(txn)} onCancel={() => onExpand(null)} onSubmit={(fields) => onAction('add', fields)} />
      )}
      {CARD_PAYMENT_MODES.includes(expanded) && (
        <CardPaymentPanel
          txn={txn}
          mode={expanded}
          creditCards={creditCards}
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
      {isOpen('reimbursement') && (
        <ReimbursementPicker txn={txn} busy={busy} onCancel={() => onExpand(null)} onApply={(expenses) => onAction('reimbursement', expenses)} />
      )}
      {isOpen('match') && (
        <MatchPicker
          txn={txn}
          busy={busy}
          onCancel={() => onExpand(null)}
          onMatch={(expenseId, options) => onAction('match', options ? { expenseId, ...options } : expenseId)}
          onMatchFixed={(fixedExpenseId, options) => onAction('match-fixed', options ? { fixedExpenseId, ...options } : fixedExpenseId)}
          onMatchIncome={(payload) => onAction('match-income', payload)}
          onSplit={() => onExpand('split')}
        />
      )}
      {isOpen('split') && (
        <SplitPicker transactionId={txn.id} busy={busy} onCancel={() => onExpand(null)} onApply={(expenseIds) => onAction('split', expenseIds)} />
      )}
    </li>
  );
};

export default InboxRow;
