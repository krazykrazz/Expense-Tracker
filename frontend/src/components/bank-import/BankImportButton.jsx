import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import Icon from '../shared/Icon';
import ErrorBoundary from '../shared/ErrorBoundary';
import { syncBanksIfStale, OPEN_BANK_IMPORT_EVENT } from '../../services/plaidApi';
import { usePlaidStatus, banksNeedingAttention, banksWithStaleData } from '../../hooks/usePlaidStatus';
import { useExpenseContext } from '../../contexts/ExpenseContext';
import './BankImport.css';

const BankImportModal = lazy(() => import('./BankImportModal'));

/** Sync banks not synced for this long whenever the app is opened or comes back into view. */
const SYNC_ON_OPEN_MINUTES = 30;
/** Don't re-ask the server on every quick tab switch. */
const MIN_CHECK_GAP_MS = 5 * 60 * 1000;

/**
 * Header entry point for Plaid bank import. Renders nothing until Plaid is configured
 * (Settings → Bank Import, or PLAID_* environment variables), and re-checks when settings change.
 * - Starts an automatic sync of stale banks when the app is opened, when the tab becomes visible again and
 *   when the modal opens, so nobody has to know about Sync now.
 * - Shows a warning dot when a bank needs the user (login expired, removed at the bank); the modal then opens
 *   on Connections. Other components open it with `openBankImport(tab)`.
 */
const BankImportButton = () => {
  const [status, setStatus] = usePlaidStatus();
  const [openTab, setOpenTab] = useState(null);
  const { refreshExpenses } = useExpenseContext();
  const lastCheckRef = useRef(0);
  const enabled = Boolean(status && status.enabled);
  const attention = banksNeedingAttention(status);
  // Not updating at Plaid: shown in amber, and only when nothing needs the user (red wins)
  const stale = attention.length > 0 ? [] : banksWithStaleData(status);

  const syncIfStale = useCallback((force = false) => {
    if (!force && Date.now() - lastCheckRef.current < MIN_CHECK_GAP_MS) return;
    lastCheckRef.current = Date.now();
    // Silent: failures show as the bank's status (header dot, Connections tab)
    syncBanksIfStale(SYNC_ON_OPEN_MINUTES).catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    syncIfStale(true);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') syncIfStale();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled, syncIfStale]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onOpenRequest = (event) => setOpenTab(event.detail?.tab || 'inbox');
    window.addEventListener(OPEN_BANK_IMPORT_EVENT, onOpenRequest);
    return () => window.removeEventListener(OPEN_BANK_IMPORT_EVENT, onOpenRequest);
  }, [enabled]);

  if (!enabled) return null;

  const attentionText = attention.length > 0
    ? `${attention.map(bank => bank.institutionName).join(', ')} ${attention.length === 1 ? 'needs' : 'need'} your attention: open to reconnect`
    : stale.length > 0
      ? `${stale.map(bank => bank.institutionName).join(', ')}: no new data from Plaid for over 12 hours (a Plaid or bank delay; nothing to do)`
      : null;

  return (
    <>
      <button
        className="header-icon-button bank-import-header-button"
        onClick={() => {
          syncIfStale(true);
          setOpenTab(attention.length > 0 ? 'connections' : 'inbox');
        }}
        aria-label={attentionText ? `Bank import: ${attentionText}` : 'Bank import'}
        title={attentionText || 'Bank connections and import inbox'}
      >
        <Icon name="bank" />
        {attention.length > 0 && <span className="bank-attention-dot" data-testid="bank-attention-dot" aria-hidden="true" />}
        {stale.length > 0 && <span className="bank-attention-dot stale" data-testid="bank-stale-dot" aria-hidden="true" />}
      </button>
      {openTab && (
        <Suspense fallback={null}>
          <ErrorBoundary name="BankImportModal">
            <BankImportModal
              status={status}
              initialTab={openTab}
              onStatusChange={setStatus}
              onExpensesChanged={refreshExpenses}
              onClose={() => setOpenTab(null)}
            />
          </ErrorBoundary>
        </Suspense>
      )}
    </>
  );
};

export default BankImportButton;
