import { useState } from 'react';
import './CollapsibleSection.css';

/**
 * CollapsibleSection Component
 * A reusable component for expandable/collapsible content areas
 * 
 * @param {string} title - Section header title
 * @param {string} summaryValue - Value shown when collapsed (e.g., total)
 * @param {string} icon - Optional emoji/icon for the section
 * @param {boolean} defaultExpanded - Initial expanded state (default: false)
 * @param {React.ReactNode} children - Content to show when expanded
 */
const CollapsibleSection = ({ 
  title, 
  summaryValue, 
  icon, 
  defaultExpanded = false, 
  children 
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleToggle = () => {
    setIsExpanded(prev => !prev);
  };

  return (
    <div className={`collapsible-section ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <button 
        className="collapsible-header"
        onClick={handleToggle}
        aria-expanded={isExpanded}
        type="button"
      >
        <div className="collapsible-header-left">
          {icon && <span className="collapsible-icon">{icon}</span>}
          <span className="collapsible-title">{title}</span>
        </div>
        <div className="collapsible-header-right">
          {!isExpanded && summaryValue && (
            <span className="collapsible-summary">{summaryValue}</span>
          )}
          <span className={`collapsible-chevron ${isExpanded ? 'rotated' : ''}`}>
            ▶
          </span>
        </div>
      </button>
      <div className={`collapsible-content ${isExpanded ? 'visible' : 'hidden'}`}>
        {children}
      </div>
    </div>
  );
};

export default CollapsibleSection;
