import { formatCAD } from '../../utils/formatters';
import './DataReminderBanner.css';

/**
 * Shown when category budgets plus planned savings exceed the month's income.
 */
const OverPlannedBanner = ({ amount, monthName, onDismiss, onClick }) => {
  const handleClick = (e) => {
    if (e.target.closest('.reminder-dismiss-btn')) {
      return;
    }
    onClick();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    onDismiss();
  };

  return (
    <div
      className="data-reminder-banner"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      data-testid="over-planned-banner"
    >
      <div className="reminder-content">
        <span className="reminder-icon">🧭</span>
        <span className="reminder-message">
          {monthName} plan is over by {formatCAD(amount)}: budgets and planned savings exceed income
        </span>
      </div>
      <button className="reminder-dismiss-btn" onClick={handleDismiss} aria-label="Dismiss reminder">
        ×
      </button>
    </div>
  );
};

export default OverPlannedBanner;
