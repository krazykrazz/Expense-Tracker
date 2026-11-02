import Icon from '../shared/Icon';
import { formatCurrency, formatDate } from '../../utils/formatters';
import './BankImport.css';

const toCents = (amount) => Math.round(Number(amount) * 100);

/**
 * @returns {'confirmed'|'differs'|null} how an expense compares to its linked bank transaction.
 * Reimbursed expenses are charged their original cost, so that is what the bank saw.
 */
export const bankLinkState = (expense) => {
  const link = expense && expense.bankLink;
  if (!link) return null;
  const charged = expense.original_cost ?? expense.amount;
  return toCents(charged) === toCents(link.amount) ? 'confirmed' : 'differs';
};

/**
 * Small bank icon on expenses that were added from, or matched to, a bank transaction.
 * Expenses without a link render nothing.
 */
const BankConfirmedIndicator = ({ expense }) => {
  const state = bankLinkState(expense);
  if (!state) return null;

  const { bankLink } = expense;
  const origin = bankLink.status === 'added' ? 'Added from bank' : 'Matched to bank transaction';
  const lines = [
    `Confirmed by bank: ${bankLink.name || bankLink.rawName || 'Unknown'}`,
    `${formatDate(bankLink.date)} · ${formatCurrency(bankLink.amount)}`,
    origin
  ];
  if (state === 'differs') {
    lines.unshift(`Amount differs from bank: ${formatCurrency(bankLink.amount)}`);
  }
  const text = lines.join('\n');

  return (
    <span
      className={`bank-confirmed-indicator ${state}`}
      title={text}
      role="img"
      aria-label={text.replace(/\n/g, '. ')}
      data-testid="bank-confirmed-indicator"
    >
      <Icon name="bank" size={14} />
      {state === 'differs' && <span className="bank-confirmed-warning" aria-hidden="true">!</span>}
    </span>
  );
};

export default BankConfirmedIndicator;
