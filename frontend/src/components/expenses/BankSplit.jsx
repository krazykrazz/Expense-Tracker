import { useState } from 'react';
import { splitBankTransaction, removeSplitExpense } from '../../services/plaidApi';
import { formatCurrency, formatDate } from '../../utils/formatters';
import SplitPicker from '../bank-import/SplitPicker';
import { toCents } from '../../utils/money';

/**
 * A bank charge entered as several expenses (spec 3.9), on the Edit Expense form of one of them: how much of the
 * charge its linked expenses cover, **Add another expense to this charge** while some is left, and **Remove from
 * this charge** for an expense that belongs to a split (a pending charge too). Renders nothing for an expense without a bank link, or
 * one that is the whole charge. The form then holds stale links, so `onChanged` closes it and the list reloads.
 * @param {{expense?: object, disabled?: boolean, onChanged?: Function}} props
 */
const BankSplit = ({ expense, disabled = false, onChanged }) => {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const link = expense?.bankLink;
  if (!link || link.removed || link.disconnected || !['added', 'matched'].includes(link.status) || !(link.amount > 0)) return null;

  const covered = link.split ? link.split.total : (expense.original_cost ?? expense.amount);
  const leftCents = toCents(link.amount) - toCents(covered);
  const parts = link.split ? link.split.parts : 1;
  if (leftCents <= 0 && parts < 2) return null;

  const changed = () => {
    window.dispatchEvent(new Event('expensesUpdated'));
    onChanged?.();
  };

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      changed();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bank-split" data-testid="bank-split">
      <div className={`insurance-status-note${leftCents > 0 ? '' : ' insurance-status-paid'}`}>
        <small data-testid="bank-split-summary">
          🏦 {link.name || link.rawName || 'Bank charge'} · {formatDate(link.date)} · {formatCurrency(link.amount)}
          {parts > 1
            ? ` · split across ${parts} expenses (${formatCurrency(covered)}${leftCents > 0 ? `, ${formatCurrency(leftCents / 100)} left` : ''})`
            : ` · this expense covers ${formatCurrency(covered)}; ${formatCurrency(leftCents / 100)} is left`}
        </small>
        {' '}
        {leftCents > 0 && !picking && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            disabled={disabled || busy}
            title="This charge was entered as several expenses: link the others to it"
          >
            Add another expense to this charge
          </button>
        )}
        {parts > 1 && (
          <button
            type="button"
            onClick={() => run(() => removeSplitExpense(link.bankTransactionId, expense.id))}
            disabled={disabled || busy}
            title="Unlink this expense from the bank charge; the other expenses stay linked"
          >
            Remove from this charge
          </button>
        )}
      </div>
      {picking && (
        <SplitPicker
          transactionId={link.bankTransactionId}
          busy={busy}
          onCancel={() => setPicking(false)}
          onApply={(expenseIds) => run(() => splitBankTransaction(link.bankTransactionId, expenseIds))}
        />
      )}
      {error && <div className="insurance-validation-error" role="alert">{error}</div>}
    </div>
  );
};

export default BankSplit;
