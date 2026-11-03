import { useState } from 'react';
import { formatCAD as formatCurrency } from '../../utils/formatters';
import { applyBankCreditLimit, openBankImport } from '../../services/plaidApi';
import { bankAsOfLabel, describeCause, describeDifference } from './cardBalanceCheck';
import { useCardBalanceChecks } from '../../hooks/useCardBalanceChecks';
import './BankImport.css';

/**
 * Credit card detail view: the card's balance checked against its bank, with the likely causes of a
 * difference and the bank's credit limit. Nothing is changed automatically; the user fixes the causes.
 * @param {{check?: object, onLimitChanged?: Function}} props one card from GET /api/plaid/card-balances
 */
const CardBankBalanceDetails = ({ check, onLimitChanged }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!check) return null;

  const { bank, limit } = check;
  const differs = check.status === 'differs';
  const hasInboxCause = (check.causes || []).some(cause => cause.type === 'bank_only');
  const limitDiffers = limit?.bank != null && limit.bank !== limit.tracker;

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
    <section className={`card-bank-panel ${check.status}`} data-testid="card-bank-panel" aria-label="Bank balance check">
      <div className="card-bank-panel-header">
        <span className="card-bank-panel-title">Bank balance check</span>
        <span className={`card-balance-mark ${differs ? 'differs' : check.status === 'match' ? 'match' : ''}`}>
          {describeDifference(check.difference)}
        </span>
      </div>
      {check.bankError && <div className="card-bank-panel-warning">{check.bankError}</div>}

      <dl className="card-bank-panel-numbers">
        <dt>Bank</dt>
        <dd>
          {bank ? formatCurrency(bank.owed) : '—'}
          <span className="bank-import-muted">
            {bank
              ? bank.includesPending ? ' includes pending charges' : ' may not include charges still pending'
              : ' not received yet; it arrives with the next sync'}
          </span>
        </dd>
        <dt>Tracker</dt>
        <dd>{formatCurrency(check.tracker)}<span className="bank-import-muted"> as of today</span></dd>
        {check.futureDated?.count > 0 && (
          <>
            <dt>Not counted</dt>
            <dd>
              {formatCurrency(check.futureDated.amount)}
              <span className="bank-import-muted"> dated after today ({check.futureDated.count})</span>
            </dd>
          </>
        )}
      </dl>
      {bankAsOfLabel(check) && <div className="bank-import-muted card-bank-panel-asof">{bankAsOfLabel(check)}</div>}

      {differs && (
        <div className="card-bank-panel-causes">
          <div className="card-bank-panel-subtitle">Likely causes</div>
          <ul>
            {(check.causes || []).map(cause => (
              <li key={`${cause.type}-${cause.transactionId ?? cause.kind}-${cause.id ?? cause.expenseId ?? ''}`}>{describeCause(cause)}</li>
            ))}
            {Math.abs(check.unexplained || 0) >= 0.005 && (
              <li>
                {formatCurrency(Math.abs(check.unexplained))} isn&apos;t explained by the bank&apos;s recent transactions.
                Check the last statement balance entered, or older entries.
              </li>
            )}
          </ul>
          {hasInboxCause && (
            <button type="button" className="bank-import-secondary" onClick={() => openBankImport('inbox')}>Open Inbox</button>
          )}
        </div>
      )}

      {check.awaitingMatch > 0 && (
        <div className="bank-import-muted">
          {check.awaitingMatch} Inbox {check.awaitingMatch === 1 ? 'transaction matches an entry' : 'transactions match entries'} already in the tracker: Match {check.awaitingMatch === 1 ? 'it' : 'them'} in Bank Import.
        </div>
      )}

      {limit?.bank != null && (
        <div className="card-bank-panel-limit">
          <span>Bank credit limit {formatCurrency(limit.bank)}</span>
          {limitDiffers && (
            <button type="button" className="bank-import-secondary" onClick={handleUseLimit} disabled={busy}>
              {limit.tracker ? `Use bank limit (was ${formatCurrency(limit.tracker)})` : 'Use bank limit'}
            </button>
          )}
        </div>
      )}
      {error && <div className="bank-import-error" role="alert">{error}</div>}
    </section>
  );
};

/**
 * Loads the check for one card. Renders nothing without Plaid or when the card isn't linked to a bank.
 * @param {{paymentMethodId: number, refreshKey?: *, onLimitChanged?: Function}} props refreshKey: reload when it changes
 */
const CardBankBalancePanel = ({ paymentMethodId, refreshKey, onLimitChanged }) => {
  const checks = useCardBalanceChecks(refreshKey);
  return <CardBankBalanceDetails check={checks.get(paymentMethodId)} onLimitChanged={onLimitChanged} />;
};

export { CardBankBalanceDetails };
export default CardBankBalancePanel;
