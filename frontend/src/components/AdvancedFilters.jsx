import React from 'react';
import './AdvancedFilters.css';

/**
 * AdvancedFilters Component
 * A collapsible section for less frequently used filters
 * 
 * @param {boolean} isExpanded - Whether the section is expanded
 * @param {function} onToggle - Callback when toggle button is clicked
 * @param {number} activeCount - Number of active advanced filters
 * @param {React.ReactNode} children - The filter dropdowns to render when expanded
 */
const AdvancedFilters = ({ isExpanded, onToggle, activeCount, children }) => {
  return (
    <div className="advanced-filters">
      <button
        type="button"
        className={`advanced-filters-toggle ${isExpanded ? 'expanded' : ''}`}
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls="advanced-filters-content"
      >
        <span className="advanced-filters-label">Advanced</span>
        {activeCount > 0 && (
          <span className="advanced-filters-badge" data-testid="advanced-filters-badge">
            {activeCount}
          </span>
        )}
        <span className={`advanced-filters-icon ${isExpanded ? 'expanded' : ''}`}>
          ▼
        </span>
      </button>
      
      <div
        id="advanced-filters-content"
        className={`advanced-filters-content ${isExpanded ? 'expanded' : ''}`}
        aria-hidden={!isExpanded}
      >
        {children}
      </div>
    </div>
  );
};

export default AdvancedFilters;
