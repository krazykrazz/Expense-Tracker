import { bankBalanceOf, bankBalanceText, bankBalanceTitle } from './bankBalanceUtils';
import './BankImport.css';

/**
 * The bank's own balance for a payment method linked to bank accounts (Financial page → Payment Methods).
 * Renders nothing for methods without a linked deposit account or before the bank has sent a balance, so
 * screens look as before without Plaid. Dimmed, and saying so, when the balance may be out of date (the bank needs
 * a login, Plaid has no new data from it, the last sync failed, or the stored balance is over 12 hours old).
 * @param {{accounts?: Array<object>}} props accounts: the links from useBankAccountLinks
 */
const BankBalance = ({ accounts }) => {
  const balance = bankBalanceOf(accounts);
  if (!balance) return null;

  return (
    <span className={`bank-balance${balance.stale ? ' stale' : ''}`} title={bankBalanceTitle(balance)} data-testid="bank-balance">
      {bankBalanceText(balance)}
    </span>
  );
};

export default BankBalance;
