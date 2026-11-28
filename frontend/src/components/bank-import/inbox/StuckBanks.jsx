import { useState, useCallback } from 'react';
import { getPlaidStatus } from '../../../services/plaidApi';
import { usePlaidLinkFlow } from '../connections/usePlaidLinkFlow';
import { formatBankTime } from '../bankBalanceUtils';

/**
 * Banks whose new transactions may be missing from the Inbox, at its top: one that needs a login (or was removed),
 * or one Plaid hasn't had new data from for hours (CIBC only sends new data during a login). The fix is a button
 * here, so a payment or charge that hasn't arrived doesn't look like nothing happened.
 * @param {{status: object, onStatusChange?: Function, onReload: Function, onOpenConnections?: Function}} props
 *   `status` from GET /api/plaid/status (needsAttention, staleData)
 */
const StuckBanks = ({ status, onStatusChange, onReload, onOpenConnections }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const refreshStatus = useCallback(async () => {
    try {
      onStatusChange?.(await getPlaidStatus());
    } catch {
      // The strip just stays until the next status refresh
    }
  }, [onStatusChange]);
  const reload = useCallback(() => onReload(), [onReload]);
  const { reconnect, loginAgain } = usePlaidLinkFlow({ trial: null, setBusy, setError, setMessage, reload, refreshStatus });

  const needing = (status?.needsAttention || []).map(bank => ({ ...bank, kind: bank.status }));
  const stale = (status?.staleData || []).filter(bank => !needing.some(n => n.id === bank.id)).map(bank => ({ ...bank, kind: 'stale' }));
  const banks = [...needing, ...stale];
  if (banks.length === 0 && !message && !error) return null;

  return (
    <div className="inbox-stuck-banks" role="status" data-testid="inbox-stuck-banks">
      {banks.map(bank => (
        <div key={bank.id} className="inbox-stuck-bank">
          {bank.kind === 'stale' && (
            <>
              <span>
                <strong>{bank.institutionName}</strong> hasn&apos;t sent anything new
                {bank.bankUpdatedAt ? ` since ${formatBankTime(bank.bankUpdatedAt)}` : ' for a while'}, so recent transactions may be missing.
              </span>
              <button className="bank-import-primary" onClick={() => loginAgain(bank)} disabled={busy}>Log in again</button>
            </>
          )}
          {bank.kind === 'needs_login' && (
            <>
              <span><strong>{bank.institutionName}</strong> needs you to log in again; nothing new arrives until then.</span>
              <button className="bank-import-primary" onClick={() => reconnect(bank)} disabled={busy}>Reconnect</button>
            </>
          )}
          {bank.kind === 'gone' && (
            <>
              <span><strong>{bank.institutionName}</strong>&apos;s connection was removed at the bank or Plaid.</span>
              {onOpenConnections && <button className="bank-import-secondary" onClick={onOpenConnections}>Open Connections</button>}
            </>
          )}
        </div>
      ))}
      {message && <div className="bank-import-muted">{message}</div>}
      {error && <div className="bank-import-error" role="alert">{error}</div>}
    </div>
  );
};

export default StuckBanks;
