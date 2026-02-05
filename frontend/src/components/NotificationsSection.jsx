import React, { useState } from 'react';
import './NotificationsSection.css';

/**
 * Wrapper component for all reminder banners
 * Displays a "Notifications" header with count badge and collapsible functionality
 * Only renders when notifications exist
 * _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
 */
const NotificationsSection = ({ children, notificationCount }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Don't render if no notifications - Requirements: 7.3
  if (!notificationCount || notificationCount === 0) {
    return null;
  }

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <div 
      className="notifications-section" 
      data-testid="notifications-section"
    >
      {/* Header with icon, title, badge, and toggle - Requirements: 7.1, 7.2 */}
      <div 
        className="notifications-header"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`Notifications section, ${notificationCount} notification${notificationCount !== 1 ? 's' : ''}, click to ${isExpanded ? 'collapse' : 'expand'}`}
        data-testid="notifications-header"
      >
        <span className="notifications-icon" aria-hidden="true">🔔</span>
        <span className="notifications-title">Notifications</span>
        <span 
          className="notifications-badge" 
          data-testid="notifications-badge"
          aria-label={`${notificationCount} notification${notificationCount !== 1 ? 's' : ''}`}
        >
          {notificationCount}
        </span>
        <span 
          className={`notifications-toggle ${isExpanded ? 'expanded' : 'collapsed'}`}
          aria-hidden="true"
        >
          {isExpanded ? '▼' : '▶'}
        </span>
      </div>

      {/* Collapsible content area - Requirements: 7.4, 7.5 */}
      {isExpanded && (
        <div 
          className="notifications-content"
          data-testid="notifications-content"
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default NotificationsSection;
