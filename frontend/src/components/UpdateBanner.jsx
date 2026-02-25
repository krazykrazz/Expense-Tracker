import React from 'react';
import './UpdateBanner.css';

/**
 * Fixed banner at the top of the viewport indicating a new version is available.
 * Renders nothing when show is false.
 * _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
 *
 * @param {{ show: boolean, version: string|null, onRefresh: () => void, onDismiss: () => void }}
 */
const UpdateBanner = ({ show, version, onRefresh, onDismiss }) => {
  if (!show) {
    return null;
  }

  return (
    <div className="update-banner" role="alert" data-testid="update-banner">
      <div className="update-banner-content">
        <span className="update-banner-icon">🔄</span>
        <span className="update-banner-message">
          A new version{version ? ` (${version})` : ''} is available. Refresh to get the latest updates.
        </span>
      </div>
      <div className="update-banner-actions">
        <button
          className="update-banner-refresh-btn"
          onClick={onRefresh}
          type="button"
        >
          Refresh Now
        </button>
        <button
          className="update-banner-dismiss-btn"
          onClick={onDismiss}
          aria-label="Dismiss update notification"
          type="button"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default UpdateBanner;
