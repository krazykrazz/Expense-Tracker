import Icon from '../shared/Icon';
import { formatDate } from '../../utils/formatters';
import './BankImport.css';

/** "Chequing ••5070 debit, Oct 30" for the bank transaction on one side of a payment. */
export const describeBankLink = (link) => {
  const account = [link.accountName, link.accountMask ? `••${link.accountMask}` : null].filter(Boolean).join(' ') || link.name || 'Bank';
  return `${account} ${link.side === 'card' ? 'credit' : 'debit'}, ${formatDate(link.date)}`;
};

/**
 * Bank icon on a credit card payment that was recorded from, or linked to, bank transactions (Bank Import →
 * Inbox). Renders nothing for a payment entered by hand.
 * @param {{links?: Array<{side: 'card'|'funding', date: string, name: string, accountName: string|null, accountMask: string|null}>}} props
 */
const CardPaymentBankBadge = ({ links }) => {
  if (!links || links.length === 0) return null;
  const text = `From the bank: ${links.map(describeBankLink).join('; ')}`;
  return (
    <span className="bank-confirmed-indicator confirmed bank-linked-badge" title={text} role="img" aria-label={text} data-testid="payment-bank-badge">
      <Icon name="bank" size={13} />
    </span>
  );
};

export default CardPaymentBankBadge;
