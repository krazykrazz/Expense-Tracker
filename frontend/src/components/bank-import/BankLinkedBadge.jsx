import Icon from '../shared/Icon';
import './BankImport.css';

/**
 * Small green bank badge on a payment method that is mapped to a connected bank account (Bank Import →
 * Connections), so its transactions arrive in the Import Inbox, or on an investment linked to one, so the bank's
 * balance shows next to it. Renders nothing for unlinked ones.
 * @param {{accounts?: Array<{institutionName: string, accountName: string, mask: string|null}>, name?: string,
 *   balanceOnly?: boolean}} props balanceOnly: for an investment, no transactions are imported
 */
const BankLinkedBadge = ({ accounts, name, balanceOnly = false }) => {
  if (!accounts || accounts.length === 0) return null;
  const lines = accounts.map(a => `${a.institutionName} · ${a.accountName}${a.mask ? ` ••${a.mask}` : ''}`);
  const text = `Linked to bank: ${lines.join(', ')}. ${balanceOnly ? 'Its balance is shown from the bank.' : 'Transactions are imported automatically.'}`;
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
