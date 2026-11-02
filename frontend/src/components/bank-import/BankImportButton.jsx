import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import Icon from '../shared/Icon';
import ErrorBoundary from '../shared/ErrorBoundary';
import { getPlaidStatus, syncBanksIfStale, PLAID_SETTINGS_CHANGED_EVENT } from '../../services/plaidApi';
import { useExpenseContext } from '../../contexts/ExpenseContext';

const BankImportModal = lazy(() => import('./BankImportModal'));

/** Sync banks not synced for this long whenever the app is opened or comes back into view. */
const SYNC_ON_OPEN_MINUTES = 30;
/** Don't re-ask the server on every quick tab switch. */
const MIN_CHECK_GAP_MS = 5 * 60 * 1000;

/**
 * Header entry point for Plaid bank import. Renders nothing until Plaid is configured
 * (Settings → Bank Import, or PLAID_* environment variables), and re-checks when settings change.
 * While Plaid is enabled it also starts an automatic sync of stale banks when the app is opened, when the
 * tab becomes visible again and when the modal opens, so nobody has to know about Sync now.
 */
const BankImportButton = () => {
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const { refreshExpenses } = useExpenseContext();
  const lastCheckRef = useRef(0);
  const enabled = Boolean(status && status.enabled);

  const syncIfStale = useCallback((force = false) => {
    if (!force && Date.now() - lastCheckRef.current < MIN_CHECK_GAP_MS) return;
    lastCheckRef.current = Date.now();
    // Silent: failures show as the bank's last error on the Connections tab
    syncBanksIfStale(SYNC_ON_OPEN_MINUTES).catch(() => {});
  }, []);

  useEffect(() => {
    let controller = new AbortController();
    const load = () => {
      controller.abort();
      controller = new AbortController();
      getPlaidStatus({ signal: controller.signal })
        .then(setStatus)
        .catch((err) => {
          if (err.name !== 'AbortError') setStatus(null);
        });
    };
    load();
    window.addEventListener(PLAID_SETTINGS_CHANGED_EVENT, load);
    return () => {
      window.removeEventListener(PLAID_SETTINGS_CHANGED_EVENT, load);
      controller.abort();
    };
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

  if (!enabled) return null;

  return (
    <>
      <button
        className="header-icon-button"
        onClick={() => {
          syncIfStale(true);
          setOpen(true);
        }}
        aria-label="Bank import"
        title="Bank connections and import inbox"
      >
        <Icon name="bank" />
      </button>
      {open && (
        <Suspense fallback={null}>
          <ErrorBoundary name="BankImportModal">
            <BankImportModal
              status={status}
              onStatusChange={setStatus}
              onExpensesChanged={refreshExpenses}
              onClose={() => setOpen(false)}
            />
          </ErrorBoundary>
        </Suspense>
      )}
    </>
  );
};

export default BankImportButton;
