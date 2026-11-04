import { openBankImport } from '../../services/plaidApi';
import './DataReminderBanner.css';

const REASONS = {
  needs_login: 'needs you to log in again',
  gone: 'is no longer connected'
};

/**
 * Main-screen notification when a connected bank needs the user (login expired, or removed at the bank).
 * Automatic sync is paused for such a bank, so new transactions stop arriving until it is fixed.
 * Opens Bank Import on the Connections tab, where Reconnect is.
 * @param {{banks: Array<{id: number, institutionName: string, status: string}>, onDismiss: Function}} props
 */
const BankAttentionBanner = ({ banks, onDismiss }) => {
  if (!banks || banks.length === 0) return null;

  const open = () => openBankImport('connections');
  const message = banks.length === 1
    ? `${banks[0].institutionName} ${REASONS[banks[0].status] || 'needs attention'}: bank transactions stopped syncing`
    : `${banks.map(bank => bank.institutionName).join(', ')} need attention: bank transactions stopped syncing`;

  return (
    <div
      className="data-reminder-banner"
      onClick={(event) => {
        if (!event.target.closest('.reminder-dismiss-btn')) open();
      }}
      onKeyDown={(event) => {
        // Keys from the dismiss button are its own: Enter on × must dismiss, not open
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
      role="button"
      tabIndex={0}
      data-testid="bank-attention-banner"
    >
      <div className="reminder-content">
        <span className="reminder-icon">🏦</span>
        <span className="reminder-message">{message}. Click to reconnect</span>
      </div>
      <button
        className="reminder-dismiss-btn"
        onClick={(event) => {
          event.stopPropagation();
          onDismiss();
        }}
        aria-label="Dismiss reminder"
      >
        ×
      </button>
    </div>
  );
};

export default BankAttentionBanner;
