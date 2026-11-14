import { useState } from 'react';
import { formatCAD as formatCurrency } from '../../utils/formatters';
import { applyBankCreditLimit, openBankImport } from '../../services/plaidApi';
import { balanceCheckTitle, describeCause } from './cardBalanceCheck';
import './BankImport.css';

/**
 * Bank balance check pieces for the credit card detail view. Each takes one card from
 * GET /api/plaid/card-balances (`check`) and renders nothing without it, so cards not linked to a bank, and
 * installs without Plaid, look exactly as before. Nothing is changed automatically.
 */

/** One line in the Current Balance card: the bank's balance, coloured like the expense list's bank pill. */
export const CardBankBalanceLine = ({ check }) => {
  if (!check) return null;
  const { bank } = check;
  const state = check.status === 'match' ? 'confirmed' : check.status === 'differs' ? 'differs' : null;
  return (
    <div
      className={`cc-bank-line${state ? ` bank-pill-${state}` : ''}${check.bankError ? ' bank-pill-stale' : ''}`}
      title={balanceCheckTitle(check)}
      data-testid="card-bank-line"
    >
      {bank ? (
        <>
          Bank {formatCurrency(bank.owed)}
          {!bank.includesPending && <span className="cc-bank-line-note"> excl. pending</span>}
          {' · '}{check.status === 'match' ? 'matches' : `differs by ${formatCurrency(Math.abs(check.difference))}`}
        </>
      ) : 'Bank balance arrives with the next sync'}
      {check.bankError && <span className="cc-bank-line-note"> · bank not syncing</span>}
    </div>
  );
};

/** Shown only when the balances differ: the likely causes, each with its amount. */
export const CardBankBalanceCauses = ({ check }) => {
  if (!check || check.status !== 'differs') return null;
  const causes = check.causes || [];
  const hasInboxCause = causes.some(cause => cause.type === 'bank_only' || cause.type === 'cancelled');
  const unexplained = Math.abs(check.unexplained || 0) >= 0.005;
  return (
    <section className="card-bank-causes" data-testid="card-bank-causes" aria-label="Why the balance differs from the bank">
      <div className="card-bank-causes-header">
        <span className="card-bank-causes-title">Why it differs from the bank</span>
        {hasInboxCause && (
          <button type="button" className="bank-import-secondary" onClick={() => openBankImport('inbox')}>Open Inbox</button>
        )}
      </div>
      <ul>
        {causes.map(cause => (
          <li key={`${cause.type}-${cause.transactionId ?? cause.kind ?? ''}-${cause.id ?? cause.expenseId ?? ''}`}>{describeCause(cause, check)}</li>
        ))}
        {unexplained && (
          <li>
            {formatCurrency(Math.abs(check.unexplained))} isn&apos;t explained by the bank&apos;s recent transactions.
            Check the last statement balance entered, or older entries.
          </li>
        )}
      </ul>
    </section>
  );
};

/**
 * "Use bank limit" when the bank reports a different credit limit (or the card has none).
 * @param {{check?: object, onLimitChanged?: Function}} props
 */
export const CardBankLimitAction = ({ check, onLimitChanged }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const limit = check?.limit;
  if (!limit || limit.bank == null || limit.bank === limit.tracker) return null;

  const handleUseLimit = async () => {
    setBusy(true);
    setError(null);
    try {
      await applyBankCreditLimit(check.paymentMethodId);
      if (onLimitChanged) await onLimitChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cc-bank-limit">
      <span>Bank limit {formatCurrency(limit.bank)}</span>
      <button type="button" className="bank-import-secondary" onClick={handleUseLimit} disabled={busy}>Use bank limit</button>
      {error && <div className="bank-import-error" role="alert">{error}</div>}
    </div>
  );
};
