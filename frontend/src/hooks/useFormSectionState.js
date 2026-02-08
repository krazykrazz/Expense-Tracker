import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for managing collapsible section expansion states with sessionStorage persistence
 * 
 * @param {string} mode - 'create' or 'edit' mode
 * @param {Object} initialStates - Initial expansion states for each section
 * @returns {Object} - { sectionStates, toggleSection, resetStates }
 */
export function useFormSectionState(mode, initialStates = {}) {
  const storageKey = `expenseForm_expansion_${mode}`;
  
  // Initialize state from sessionStorage or use provided initial states
  const [sectionStates, setSectionStates] = useState(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to parse section states from sessionStorage:', error);
    }
    return initialStates;
  });

  // Persist state changes to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(sectionStates));
    } catch (error) {
      console.error('Failed to save section states to sessionStorage:', error);
    }
  }, [sectionStates, storageKey]);

  // Toggle a specific section
  const toggleSection = useCallback((sectionName) => {
    setSectionStates(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }));
  }, []);

  // Reset all states to initial values
  const resetStates = useCallback(() => {
    setSectionStates(initialStates);
  }, [initialStates]);

  return {
    sectionStates,
    toggleSection,
    resetStates
  };
}
