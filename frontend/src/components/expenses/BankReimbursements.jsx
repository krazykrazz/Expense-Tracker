import { useState } from 'react';
import { undoInsuranceReimbursement } from '../../services/plaidApi';
import { formatCurrency, formatDate } from '../../utils/formatters';

/**
 * Insurer deposits applied to this claim in Bank Import, one line each, with Undo: the deposit returns to the
 * Inbox and the claim goes back to what it was (out-of-pocket, status and people), or to what the remaining
 * deposits leave. The form then holds stale values, so `onUndone` closes it and the list reloads.
 * @param {{reimbursements?: Array<{plaidTransactionId: number, amount: number, date: string, name?: string}>,
 *   disabled?: boolean, onUndone?: Function}} props
 */
const BankReimbursements = ({ reimbursements = [], disabled = false, onUndone }) => {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  if (!reimbursements || reimbursements.length === 0) return null;

  const undo = async (reimbursement) => {
    setBusyId(reimbursement.plaidTransactionId);
    setError(null);
    try {
      await undoInsuranceReimbursement(reimbursement.plaidTransactionId);
      window.dispatchEvent(new Event('expensesUpdated'));
      onUndone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="insurance-bank-reimbursements" data-testid="bank-reimbursements">
      {reimbursements.map(reimbursement => (
        <div key={reimbursement.plaidTransactionId} className="insurance-status-note insurance-status-paid">
          <small>
            🏦 Reimbursed {formatCurrency(reimbursement.amount)} on {formatDate(reimbursement.date)} (bank
            {reimbursement.name ? `: ${reimbursement.name}` : ''})
          </small>
          {' '}
          <button
            type="button"
            onClick={() => undo(reimbursement)}
            disabled={disabled || busyId !== null}
            title="Return the deposit to the Bank Import Inbox and restore this claim"
          >
            {busyId === reimbursement.plaidTransactionId ? 'Undoing…' : 'Undo'}
          </button>
        </div>
      ))}
      {error && <div className="insurance-validation-error" role="alert">{error}</div>}
    </div>
  );
};

export default BankReimbursements;
