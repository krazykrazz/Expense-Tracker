/**
 * Calculate trend direction and percentage change between two values
 * @param {number} current - Current period value
 * @param {number} previous - Previous period value
 * @param {number} threshold - Minimum percentage change to display (default 0.01 = 1%)
 * @returns {Object|null} Trend object with direction, percentChange, and displayText, or null if no trend
 */
export function calculateTrend(current, previous, threshold = 0.01) {
  // Handle edge cases: null or undefined values
  if (current === null || current === undefined) {
    return null;
  }
  
  if (previous === null || previous === undefined) {
    return null;
  }

  // Special case: previous is zero
  if (previous === 0) {
    // If current is also zero, no trend
    if (current === 0) {
      return null;
    }
    
    // If current is positive, show up arrow with "NEW" indicator
    if (current > 0) {
      return {
        direction: 'up',
        percentChange: Infinity,
        displayText: 'NEW'
      };
    }
    
    // If current is negative (shouldn't happen with expenses, but handle it)
    return {
      direction: 'down',
      percentChange: -Infinity,
      displayText: 'NEW'
    };
  }

  // Calculate percentage change
  const percentChange = (current - previous) / previous;

  // Apply threshold filtering - if change is less than threshold, return null
  if (Math.abs(percentChange) < threshold) {
    return null;
  }

  // Determine direction
  const direction = percentChange > 0 ? 'up' : 'down';

  // Format display text with + or - sign and percentage
  const displayText = `${percentChange > 0 ? '+' : ''}${(percentChange * 100).toFixed(1)}%`;

  return {
    direction,
    percentChange,
    displayText
  };
}
