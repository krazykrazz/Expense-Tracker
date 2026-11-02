import Icon from '../shared/Icon';
import { formatCurrency, formatDate } from '../../utils/formatters';
import './BankImport.css';

const toCents = (amount) => Math.round(Number(amount) * 100);

/**
 * Bank icon on an income source received in the bank (Import Inbox → Confirm income or Add income),
 * with the date it landed. Amber when the income amount no longer equals the deposit.
 */
const IncomeConfirmationIndicator = ({ incomeSource }) => {
  const confirmation = incomeSource && incomeSource.bankConfirmation;
  if (!confirmation) return null;

  const differs = toCents(incomeSource.amount) !== toCents(confirmation.amount);
  const lines = [
    `Received in bank: ${confirmation.name || 'bank deposit'}`,
    `landed ${formatDate(confirmation.landedDate)} · ${formatCurrency(confirmation.amount)}`
  ];
  if (confirmation.plannedAmount != null && toCents(confirmation.plannedAmount) !== toCents(confirmation.amount) && !differs) {
    lines.push(`Expected ${formatCurrency(confirmation.plannedAmount)}, updated to the deposit amount`);
  }
  if (differs) {
    lines.unshift(`Amount differs from deposit: ${formatCurrency(confirmation.amount)}`);
  }
  const text = lines.join('\n');

  return (
    <span
      className={`bank-confirmed-indicator ${differs ? 'differs' : 'confirmed'}`}
      title={text}
      role="img"
      aria-label={text.replace(/\n/g, '. ')}
      data-testid="income-confirmation-indicator"
    >
      <Icon name="bank" size={14} />
      {differs && <span className="bank-confirmed-warning" aria-hidden="true">!</span>}
    </span>
  );
};

export default IncomeConfirmationIndicator;
