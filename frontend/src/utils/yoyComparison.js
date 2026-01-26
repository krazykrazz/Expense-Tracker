/**
 * Year-over-Year Comparison Utilities
 * Provides functions for calculating and displaying YoY changes in tax deductible expenses
 */

/**
 * Calculate percentage change between two values
 * @param {number} current - Current year value
 * @param {number} previous - Previous year value
 * @returns {{ change: number|null, direction: 'up'|'down'|'same'|'new', formatted: string }}
 */
export const calculatePercentageChange = (current, previous) => {
  // Both values are zero - no change
  if (previous === 0 && current === 0) {
    return { change: 0, direction: 'same', formatted: '—' };
  }
  
  // Previous is zero but current has data - new data
  if (previous === 0 && current > 0) {
    return { change: null, direction: 'new', formatted: 'New' };
  }
  
  // Calculate percentage change: ((current - previous) / previous) * 100
  const change = ((current - previous) / previous) * 100;
  
  // Determine direction based on change value
  let direction;
  if (change > 0) {
    direction = 'up';
  } else if (change < 0) {
    direction = 'down';
  } else {
    direction = 'same';
  }
  
  // Format the percentage with sign and one decimal place
  const formatted = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
  
  return { change, direction, formatted };
};

/**
 * Get indicator symbol for change direction
 * @param {string} direction - 'up', 'down', 'same', or 'new'
 * @returns {string} Indicator symbol
 */
export const getChangeIndicator = (direction) => {
  switch (direction) {
    case 'up':
      return '↑';
    case 'down':
      return '↓';
    case 'new':
      return '✦';
    case 'same':
    default:
      return '—';
  }
};
