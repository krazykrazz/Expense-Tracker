import React from 'react';
import './DataReminderBanner.css';

const DataReminderBanner = ({ type, count, monthName, onDismiss, onClick }) => {
  const icon = type === 'investment' ? '💡' : '💳';
  const itemType = type === 'investment' ? 'investment' : 'loan';
  const plural = count !== 1 ? 's' : '';
  const verb = count !== 1 ? 'values' : 'value';
  
  const message = type === 'investment'
    ? `Update ${count} ${itemType} ${verb} for ${monthName}`
    : `Update ${count} ${itemType} balance${plural} for ${monthName}`;

  const handleClick = (e) => {
    // Don't trigger onClick if the dismiss button was clicked
    if (e.target.closest('.reminder-dismiss-btn')) {
      return;
    }
    onClick();
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    onDismiss();
  };

  return (
    <div className="data-reminder-banner" onClick={handleClick} role="button" tabIndex={0}>
      <div className="reminder-content">
        <span className="reminder-icon">{icon}</span>
        <span className="reminder-message">{message}</span>
      </div>
      <button 
        className="reminder-dismiss-btn" 
        onClick={handleDismiss}
        aria-label="Dismiss reminder"
      >
        ×
      </button>
    </div>
  );
};

export default DataReminderBanner;
