import Icon from '../shared/Icon';
import './BankImport.css';

/**
 * Small green bank badge on a payment method that is mapped to a connected bank account (Bank Import →
 * Connections), so its transactions arrive in the Import Inbox. Renders nothing for unmapped methods.
 * @param {{accounts?: Array<{institutionName: string, accountName: string, mask: string|null}>, name?: string}} props
 */
const BankLinkedBadge = ({ accounts, name }) => {
  if (!accounts || accounts.length === 0) return null;
  const lines = accounts.map(a => `${a.institutionName} · ${a.accountName}${a.mask ? ` ••${a.mask}` : ''}`);
  const text = `Linked to bank: ${lines.join(', ')}. Transactions are imported automatically.`;
  return (
    <span
      className="bank-confirmed-indicator confirmed bank-linked-badge"
      title={text}
      role="img"
      aria-label={name ? `${name} linked to bank: ${lines.join(', ')}` : text}
      data-testid="bank-linked-badge"
    >
      <Icon name="bank" size={13} />
    </span>
  );
};

export default BankLinkedBadge;
