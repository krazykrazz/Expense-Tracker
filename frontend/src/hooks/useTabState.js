import { useState, useEffect } from 'react';

/**
 * Custom hook for managing tab state with localStorage persistence
 * @param {string} storageKey - Key for localStorage persistence
 * @param {string} defaultTab - Default tab to use if no stored value exists
 * @returns {[string, function]} Tuple of [activeTab, setActiveTab]
 */
function useTabState(storageKey, defaultTab) {
  // Load initial tab from localStorage or use default
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored || defaultTab;
    } catch (error) {
      console.error('Failed to load tab state from localStorage:', error);
      return defaultTab;
    }
  });

  // Save tab changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, activeTab);
    } catch (error) {
      console.error('Failed to save tab state to localStorage:', error);
    }
  }, [storageKey, activeTab]);

  return [activeTab, setActiveTab];
}

export default useTabState;
