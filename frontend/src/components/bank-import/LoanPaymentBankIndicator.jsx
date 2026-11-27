import Icon from '../shared/Icon';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { toCents } from '../../utils/money';
import './BankImport.css';

/**
 * Bank icon on a loan payment that the bank confirmed (Import Inbox → Confirm a fixed expense linked to the loan),
 * with the date it landed. Amber when the payment's amount is not what the bank paid. Renders nothing for a payment
 * the bank did not confirm.
 * @param {{payment: {amount: number, bankConfirmation?: ({landedDate: string, amount: number, plannedAmount: (number|null),
 *   name: string, fixedExpenseName: string}|null)}}} props
 */
const LoanPaymentBankIndicator = ({ payment }) => {
  const confirmation = payment && payment.bankConfirmation;
  if (!confirmation) return null;

  const differs = toCents(payment.amount) !== toCents(confirmation.amount);
  const lines = [
    `Confirmed by bank: ${confirmation.name || 'bank transaction'}`,
    `landed ${formatDate(confirmation.landedDate)} · ${formatCurrency(confirmation.amount)}`,
    `Fixed expense: ${confirmation.fixedExpenseName}`
  ];
  if (differs) lines.unshift(`Amount differs from bank: ${formatCurrency(confirmation.amount)}`);
  const text = lines.join('\n');

  return (
    <span
      className={`bank-confirmed-indicator ${differs ? 'differs' : 'confirmed'} bank-linked-badge`}
      title={text}
      role="img"
      aria-label={text.replace(/\n/g, '. ')}
      data-testid="loan-payment-bank-indicator"
    >
      <Icon name="bank" size={13} />
      {differs && <span className="bank-confirmed-warning" aria-hidden="true">!</span>}
    </span>
  );
};

export default LoanPaymentBankIndicator;
