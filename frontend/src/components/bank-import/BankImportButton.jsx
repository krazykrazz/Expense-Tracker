import { useState, useEffect, lazy, Suspense } from 'react';
import Icon from '../shared/Icon';
import ErrorBoundary from '../shared/ErrorBoundary';
import { getPlaidStatus, PLAID_SETTINGS_CHANGED_EVENT } from '../../services/plaidApi';
import { useExpenseContext } from '../../contexts/ExpenseContext';

const BankImportModal = lazy(() => import('./BankImportModal'));

/**
 * Header entry point for Plaid bank import. Renders nothing until Plaid is configured
 * (Settings → Bank Import, or PLAID_* environment variables), and re-checks when settings change.
 */
const BankImportButton = () => {
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const { refreshExpenses } = useExpenseContext();

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

  if (!status || !status.enabled) return null;

  return (
    <>
      <button
        className="header-icon-button"
        onClick={() => setOpen(true)}
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
