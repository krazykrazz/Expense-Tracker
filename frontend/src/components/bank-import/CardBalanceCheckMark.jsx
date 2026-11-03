import { formatCAD as formatCurrency } from '../../utils/formatters';
import { balanceCheckTitle, describeDifference } from './cardBalanceCheck';
import './BankImport.css';

/**
 * Small mark next to a credit card's current balance: ✓ when it matches its bank, "Δ $x" when it doesn't.
 * Hover text gives both balances and the likely causes. Renders nothing for cards not linked to a bank or
 * before the bank has sent a balance.
 * @param {{check?: object}} props one card from GET /api/plaid/card-balances
 */
const CardBalanceCheckMark = ({ check }) => {
  if (!check || check.status === 'unknown') return null;
  const matches = check.status === 'match';
  const title = balanceCheckTitle(check);
  return (
    <span
      className={`card-balance-mark ${matches ? 'match' : 'differs'}${check.bankError ? ' stale' : ''}`}
      title={title}
      role="img"
      aria-label={`${describeDifference(check.difference)}${check.bankError ? `. ${check.bankError}` : ''}`}
      data-testid="card-balance-mark"
    >
      {matches ? '✓' : `Δ ${formatCurrency(Math.abs(check.difference))}`}
    </span>
  );
};

export default CardBalanceCheckMark;
