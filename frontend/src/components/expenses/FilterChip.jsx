import React from 'react';
import './FilterChip.css';

/**
 * FilterChip Component
 * Displays an active filter as a removable chip/badge
 * 
 * @param {string} label - Filter type label (e.g., "Type", "Method")
 * @param {string} value - Filter value (e.g., "Groceries", "Visa")
 * @param {function} onRemove - Callback when chip is removed
 */
const FilterChip = ({ label, value, onRemove }) => {
  return (
    <span className="filter-chip" title={`${label}: ${value}`}>
      <span className="filter-chip-text">
        {label}: {value}
      </span>
      <button
        type="button"
        className="filter-chip-remove"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
      >
        ×
      </button>
    </span>
  );
};

export default FilterChip;
