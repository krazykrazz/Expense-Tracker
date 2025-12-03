import './TabNavigation.css';

/**
 * TabNavigation Component
 * A reusable horizontal tab bar for switching between content views
 * 
 * @param {Array} tabs - Array of tab objects with { id, label, icon? }
 * @param {string} activeTab - Currently selected tab id
 * @param {function} onTabChange - Callback when tab is selected
 */
const TabNavigation = ({ tabs, activeTab, onTabChange }) => {
  const handleTabClick = (tabId) => {
    if (tabId !== activeTab) {
      onTabChange(tabId);
    }
  };

  const handleKeyDown = (event, tabId, index) => {
    let newIndex = index;
    
    if (event.key === 'ArrowRight') {
      newIndex = (index + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft') {
      newIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      newIndex = 0;
    } else if (event.key === 'End') {
      newIndex = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    onTabChange(tabs[newIndex].id);
  };

  return (
    <div className="tab-navigation" role="tablist" aria-label="Summary sections">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => handleTabClick(tab.id)}
          onKeyDown={(e) => handleKeyDown(e, tab.id, index)}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
          tabIndex={activeTab === tab.id ? 0 : -1}
          type="button"
        >
          {tab.icon && <span className="tab-icon">{tab.icon}</span>}
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

export default TabNavigation;
