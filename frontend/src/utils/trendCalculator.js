/**
 * Calculate trend direction and percentage change between two values
 * @param {number} current - Current period value
 * @param {number} previous - Previous period value
 * @param {number} threshold - Minimum percentage change to display (default 0.01 = 1%)
 * @returns {Object|null} Trend object with direction, percentChange, and displayText, or null if no trend
 */
export function calculateTrend(current, previous, threshold = 0.01) {
  // Handle edge cases: null, undefined, or zero previous values
  if (previous === null || previous === undefined || previous === 0) {
    return null;
  }

  // Handle edge cases: null or undefined current values
  if (current === null || current === undefined) {
    return null;
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
