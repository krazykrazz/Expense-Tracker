import React from 'react';
import { calculateTrend } from '../utils/trendCalculator';
import './TrendIndicator.css';

/**
 * TrendIndicator Component
 * Displays a visual trend indicator (arrow) showing month-over-month changes
 * 
 * @param {number} currentValue - Current period value
 * @param {number} previousValue - Previous period value
 * @param {number} threshold - Minimum percentage change to display (default 0.01 = 1%)
 */
const TrendIndicator = ({ currentValue, previousValue, threshold = 0.01 }) => {
  const trend = calculateTrend(currentValue, previousValue, threshold);

  // If no trend (below threshold or invalid data), render nothing
  if (!trend) {
    return null;
  }

  const { direction, displayText } = trend;

  return (
    <span 
      className={`trend-indicator trend-${direction}`}
      title={displayText}
      aria-label={`Trend ${direction} by ${displayText}`}
    >
      {direction === 'up' ? '▲' : '▼'}
    </span>
  );
};

export default TrendIndicator;
