import React from 'react';
import './CollapsibleSection.css';

const CollapsibleSection = ({
  title,
  isExpanded,
  onToggle,
  badge,
  hasError,
  children,
  helpText,
  className = ''
}) => {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  const contentId = `collapsible-content-${title.replace(/\s+/g, '-').toLowerCase()}`;
  const headerId = `collapsible-header-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className={`collapsible-section ${className}`}>
      <div
        id={headerId}
        className="collapsible-header"
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-controls={contentId}
      >
        <div className="collapsible-header-left">
          <span className={`collapsible-icon ${isExpanded ? 'expanded' : 'collapsed'}`}>
            {isExpanded ? '▼' : '▶'}
          </span>
          <span className="collapsible-title">{title}</span>
          {badge && <span className="collapsible-badge">{badge}</span>}
          {hasError && <span className="collapsible-error-indicator" title="Contains errors">⚠</span>}
        </div>
        {helpText && (
          <span className="collapsible-help-icon" title={helpText}>
            ⓘ
          </span>
        )}
      </div>
      {isExpanded && (
        <div
          id={contentId}
          className="collapsible-content"
          role="region"
          aria-labelledby={headerId}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSection;
