import { useState } from 'react';
import { undoInsuranceReimbursement, undoReimbursement } from '../../services/plaidApi';
import { formatCurrency, formatDate } from '../../utils/formatters';

const VERBS = { refund: 'Refunded', deposit: 'Repaid' };

/**
 * Bank rows applied to this expense in Bank Import, one line each, with Undo: the row returns to the Inbox and the
 * expense goes back to what it was (out-of-pocket, and its original cost when nothing else reimburses it), or to
 * what the remaining rows leave; a refund's card payment is deleted. Insurer deposits on a claim (no `kind`) and
 * refunds and deposits on other expenses (`kind` 'refund' | 'deposit') use their own undo. The form then holds stale
 * values, so `onUndone` closes it and the list reloads.
 * @param {{reimbursements?: Array<{plaidTransactionId: number, amount: number, date: string, name?: string, kind?: string}>,
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
      await (reimbursement.kind ? undoReimbursement : undoInsuranceReimbursement)(reimbursement.plaidTransactionId);
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
            🏦 {VERBS[reimbursement.kind] || 'Reimbursed'} {formatCurrency(reimbursement.amount)} on {formatDate(reimbursement.date)} (bank
            {reimbursement.name ? `: ${reimbursement.name}` : ''})
          </small>
          {' '}
          <button
            type="button"
            onClick={() => undo(reimbursement)}
            disabled={disabled || busyId !== null}
            title={reimbursement.kind
              ? `Return the ${reimbursement.kind === 'refund' ? 'refund' : 'deposit'} to the Bank Import Inbox and restore this expense`
              : 'Return the deposit to the Bank Import Inbox and restore this claim'}
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
