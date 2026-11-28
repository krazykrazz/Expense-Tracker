import { useState } from 'react';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { dueLabel, updatesPlanByDefault } from './inboxFormat';

/**
 * One planned fixed expense a bank payment could confirm. When it is linked to a loan (`fixed.loanPayment`) the
 * payment can also become the loan's payment: linked to the one already logged for it, or recorded at the bank's
 * date and amount (spec 3.5). The first is preselected when there is a logged payment near the date.
 * When the bank amount differs, "Update to <bank amount>" changes the planned amount (ticked when the difference is small).
 * @param {{fixed: object, txn: object, busy: boolean,
 *   onConfirm: (options: {updateAmount: boolean, loanPayment?: 'link'|'log', loanPaymentId?: number}) => void}} props
 */
const FixedCandidate = ({ fixed, txn, busy, onConfirm }) => {
  const offer = fixed.loanPayment;
  const [choice, setChoice] = useState(offer?.existing ? 'link' : 'log');
  const [updateAmount, setUpdateAmount] = useState(() => updatesPlanByDefault(fixed.amount, txn.amount));

  const confirm = () => {
    const update = { updateAmount: fixed.amountDiffers ? updateAmount : true };
    if (!offer || choice === 'none') return onConfirm(update);
    return onConfirm({ ...update, ...(choice === 'link' ? { loanPayment: 'link', loanPaymentId: offer.existing.id } : { loanPayment: 'log' }) });
  };

  return (
    <li data-testid="fixed-candidate">
      <span>
        {fixed.name} · {dueLabel(fixed)} · {formatCurrency(fixed.amount)}
        {fixed.amountDiffers && (
          <label className="inbox-inline-check">
            <input type="checkbox" checked={updateAmount} onChange={(event) => setUpdateAmount(event.target.checked)} disabled={busy} />
            {' '}Update to {formatCurrency(txn.amount)}
          </label>
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
