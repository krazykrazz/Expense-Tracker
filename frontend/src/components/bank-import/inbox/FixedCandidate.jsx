import { useState } from 'react';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { dueLabel } from './inboxFormat';

/**
 * One planned fixed expense a bank payment could confirm. When it is linked to a loan (`fixed.loanPayment`) the
 * payment can also become the loan's payment: linked to the one already logged for it, or recorded at the bank's
 * date and amount (spec 3.5). The first is preselected when there is a logged payment near the date.
 * @param {{fixed: object, txn: object, busy: boolean,
 *   onConfirm: (loanChoice?: {loanPayment: 'link'|'log', loanPaymentId?: number}) => void}} props
 */
const FixedCandidate = ({ fixed, txn, busy, onConfirm }) => {
  const offer = fixed.loanPayment;
  const [choice, setChoice] = useState(offer?.existing ? 'link' : 'log');

  const confirm = () => {
    if (!offer || choice === 'none') return onConfirm();
    return onConfirm(choice === 'link' ? { loanPayment: 'link', loanPaymentId: offer.existing.id } : { loanPayment: 'log' });
  };

  return (
    <li data-testid="fixed-candidate">
      <span>
        {fixed.name} · {dueLabel(fixed)} · {formatCurrency(fixed.amount)}
        {fixed.amountDiffers && (
          <span className="bank-import-muted"> (planned amount will be updated to {formatCurrency(txn.amount)})</span>
        )}
      </span>
      <button className="bank-import-primary" onClick={confirm} disabled={busy}>Confirm</button>
      {offer && (
        <div className="inbox-loan-payment" data-testid="loan-payment-choice">
          <div className="bank-import-muted">{offer.loanName} payment history:</div>
          {offer.existing && (
            <label className="inbox-inline-check">
              <input type="radio" name={`loan-payment-${txn.id}-${fixed.id}`} checked={choice === 'link'} onChange={() => setChoice('link')} disabled={busy} />
              {' '}It is the payment already logged: {formatDate(offer.existing.date)} · {formatCurrency(offer.existing.amount)}
            </label>
          )}
          <label className="inbox-inline-check">
            <input type="radio" name={`loan-payment-${txn.id}-${fixed.id}`} checked={choice === 'log'} onChange={() => setChoice('log')} disabled={busy} />
            {' '}Record a payment of {formatCurrency(txn.amount)} on {formatDate(txn.postedDate || txn.date)}
          </label>
          <label className="inbox-inline-check">
            <input type="radio" name={`loan-payment-${txn.id}-${fixed.id}`} checked={choice === 'none'} onChange={() => setChoice('none')} disabled={busy} />
            {' '}Leave the payment history alone
          </label>
        </div>
      )}
    </li>
  );
};

export default FixedCandidate;
