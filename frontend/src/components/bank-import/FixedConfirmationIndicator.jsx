import Icon from '../shared/Icon';
import { formatCurrency, formatDate } from '../../utils/formatters';
import './BankImport.css';

const toCents = (amount) => Math.round(Number(amount) * 100);

const landedText = ({ landedDate, daysFromDue }) => {
  const when = `landed ${formatDate(landedDate)}`;
  if (daysFromDue == null) return when;
  if (daysFromDue === 0) return `${when} (on the due date)`;
  const days = Math.abs(daysFromDue);
  return `${when} (${days} day${days === 1 ? '' : 's'} ${daysFromDue > 0 ? 'after' : 'before'} the due date)`;
};

/**
 * Bank icon on a fixed expense confirmed by a bank transaction (Import Inbox → Match → Confirm),
 * with when the payment actually landed. Amber when the planned amount no longer equals the bank amount.
 */
const FixedConfirmationIndicator = ({ fixedExpense }) => {
  const confirmation = fixedExpense && fixedExpense.bankConfirmation;
  if (!confirmation) return null;

  const differs = toCents(fixedExpense.amount) !== toCents(confirmation.amount);
  const lines = [
    `Confirmed by bank: ${confirmation.name || 'bank transaction'}`,
    `${landedText(confirmation)} · ${formatCurrency(confirmation.amount)}`
  ];
  if (confirmation.plannedAmount != null && toCents(confirmation.plannedAmount) !== toCents(confirmation.amount)) {
    lines.push(`Planned ${formatCurrency(confirmation.plannedAmount)}, updated to the bank amount`);
  }
  if (differs) {
    lines.unshift(`Amount differs from bank: ${formatCurrency(confirmation.amount)}`);
  }
  const text = lines.join('\n');

  return (
    <span
      className={`bank-confirmed-indicator ${differs ? 'differs' : 'confirmed'}`}
      title={text}
      role="img"
      aria-label={text.replace(/\n/g, '. ')}
      data-testid="fixed-confirmation-indicator"
    >
      <Icon name="bank" size={14} />
      {differs && <span className="bank-confirmed-warning" aria-hidden="true">!</span>}
    </span>
  );
};

export default FixedConfirmationIndicator;
