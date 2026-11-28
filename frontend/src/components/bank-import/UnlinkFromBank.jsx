import { useState } from 'react';
import { unlinkBankTransaction } from '../../services/plaidApi';
import { formatCurrency, formatDate } from '../../utils/formatters';

/**
 * Unlink from bank: sends the bank transaction back to the Import Inbox and keeps what it was linked to (an expense,
 * a fixed expense or an income source) as it is. For a wrong match or confirmation.
 * @param {{bankTransactionId: number, what: string, summary?: {name?: string, date?: string, amount?: number},
 *   disabled?: boolean, onUnlinked?: Function}} props `what`: "expense", "fixed expense" or "income"
 */
const UnlinkFromBank = ({ bankTransactionId, what, summary, disabled = false, onUnlinked }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!bankTransactionId) return null;

  const unlink = async () => {
    if (!window.confirm(`Unlink this ${what} from the bank transaction? The transaction goes back to the Import Inbox; the ${what} stays as it is.`)) return;
    setBusy(true);
    setError(null);
    try {
      await unlinkBankTransaction(bankTransactionId);
      onUnlinked?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bank-unlink" data-testid="bank-unlink">
      {summary && (
        <small>
          🏦 {[summary.name, summary.date && formatDate(summary.date), summary.amount != null && formatCurrency(Math.abs(summary.amount))].filter(Boolean).join(' · ')}
        </small>
      )}
      {' '}
      <button type="button" onClick={unlink} disabled={disabled || busy} title={`Wrong match? The bank transaction goes back to the Inbox; the ${what} stays as it is`}>
        {busy ? 'Unlinking…' : 'Unlink from bank'}
      </button>
      {error && <div className="insurance-validation-error" role="alert">{error}</div>}
    </div>
  );
};

export default UnlinkFromBank;
