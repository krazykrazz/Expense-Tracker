/**
 * EquityChart Component
 * 
 * SVG line chart showing equity buildup over time for mortgages.
 * Displays current equity amount and percentage.
 * 
 * Requirements: 4.2, 4.3, 8.3
 */

import { useState, useEffect } from 'react';
import './EquityChart.css';
import { formatCurrency } from '../utils/formatters';
import { getEquityHistory } from '../services/loanApi';
import { createLogger } from '../utils/logger';

const logger = createLogger('EquityChart');

/**
 * Calculate equity from property value and balance
 * @param {number} propertyValue - Estimated property value
 * @param {number} balance - Remaining mortgage balance
 * @returns {Object} { equityAmount, equityPercentage }
 */
const calculateEquity = (propertyValue, balance) => {
  if (!propertyValue || propertyValue <= 0) {
    return { equityAmount: 0, equityPercentage: 0 };
  }
  const equityAmount = propertyValue - (balance || 0);
  const equityPercentage = (equityAmount / propertyValue) * 100;
  return { equityAmount, equityPercentage };
};

const EquityChart = ({ loanId, estimatedPropertyValue, currentBalance }) => {
  const [equityHistory, setEquityHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Calculate current equity
  const currentEquity = calculateEquity(estimatedPropertyValue, currentBalance);

  useEffect(() => {
    const fetchEquityHistory = async () => {
      if (!loanId || !estimatedPropertyValue) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const data = await getEquityHistory(loanId);
        setEquityHistory(data?.history || []);
      } catch (err) {
        logger.error('Error fetching equity history:', err);
        setError('Failed to load equity history');
      } finally {
        setLoading(false);
      }
    };

    fetchEquityHistory();
  }, [loanId, estimatedPropertyValue]);

  // Don't render if no property value
  if (!estimatedPropertyValue) {
    return (
      <div className="equity-chart-section">
        <h4>Equity Tracking</h4>
        <div className="equity-no-data">
          <p>Add an estimated property value to track your equity.</p>
        </div>
      </div>
    );
  }

  // Chart dimensions
  const chartWidth = 600;
  const chartHeight = 250;
  const padding = { top: 30, right: 60, bottom: 50, left: 80 };
  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;

  // Prepare chart data
  const chartData = equityHistory.length > 0 
    ? equityHistory.map(entry => ({
        ...entry,
        equity: calculateEquity(entry.propertyValue || estimatedPropertyValue, entry.balance)
      }))
    : [];

  // Calculate scales
  const maxEquity = chartData.length > 0 
    ? Math.max(...chartData.map(d => d.equity.equityAmount), currentEquity.equityAmount)
    : currentEquity.equityAmount;
  const minEquity = chartData.length > 0
    ? Math.min(...chartData.map(d => d.equity.equityAmount), 0)
    : 0;
  const equityRange = maxEquity - minEquity || 1;

  // Generate path for equity line
  const generatePath = () => {
    if (chartData.length === 0) return '';
    
    return chartData.map((point, index) => {
      const x = padding.left + (index / (chartData.length - 1 || 1)) * graphWidth;
      const y = padding.top + graphHeight - ((point.equity.equityAmount - minEquity) / equityRange) * graphHeight;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  // Generate area path (for gradient fill)
  const generateAreaPath = () => {
    if (chartData.length === 0) return '';
    
    const linePath = generatePath();
    const lastX = padding.left + graphWidth;
    const firstX = padding.left;
    const bottomY = padding.top + graphHeight;
    
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  return (
    <div className="equity-chart-section">
      <div className="equity-chart-header">
        <h4>Equity Tracking</h4>
        <div className="equity-current-summary">
          <div className="equity-stat">
            <span className="equity-stat-label">Current Equity</span>
            <span className="equity-stat-value positive">
              {formatCurrency(currentEquity.equityAmount)}
            </span>
          </div>
          <div className="equity-stat">
            <span className="equity-stat-label">Equity %</span>
            <span className="equity-stat-value">
              {currentEquity.equityPercentage.toFixed(1)}%
            </span>
          </div>
          <div className="equity-stat">
            <span className="equity-stat-label">Property Value</span>
            <span className="equity-stat-value">
              {formatCurrency(estimatedPropertyValue)}
            </span>
          </div>
        </div>
      </div>

      {/* Equity Progress Bar */}
      <div className="equity-progress-section">
        <div className="equity-progress-labels">
          <span>Mortgage: {formatCurrency(currentBalance)}</span>
          <span>Equity: {formatCurrency(currentEquity.equityAmount)}</span>
        </div>
        <div className="equity-progress-bar">
          <div 
            className="equity-progress-mortgage"
            style={{ width: `${100 - currentEquity.equityPercentage}%` }}
          />
          <div 
            className="equity-progress-equity"
            style={{ width: `${currentEquity.equityPercentage}%` }}
          />
        </div>
      </div>

      {/* Equity History Chart */}
      {loading ? (
        <div className="equity-chart-loading">Loading equity history...</div>
      ) : error ? (
        <div className="equity-chart-error">{error}</div>
      ) : chartData.length > 1 ? (
        <div className="equity-chart-container">
          <div className="equity-chart-title">Equity Buildup Over Time</div>
          <svg 
            width="100%" 
            height={chartHeight} 
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="xMidYMid meet"
            className="equity-chart-svg"
          >
            {/* Gradient definition */}
            <defs>
              <linearGradient id="equityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="var(--color-positive)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--color-positive)" stopOpacity="0.05" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = padding.top + graphHeight * (1 - ratio);
              const value = minEquity + equityRange * ratio;
              return (
                <g key={`grid-${ratio}`}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={chartWidth - padding.right}
                    y2={y}
                    stroke="var(--border-muted)"
                    strokeWidth="1"
                    strokeDasharray="4,4"
                  />
                  <text
                    x={padding.left - 10}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="11"
                    fill="var(--text-tertiary)"
                  >
                    {formatCurrency(value)}
                  </text>
                </g>
              );
            })}

            {/* Area fill */}
            <path
              d={generateAreaPath()}
              fill="url(#equityGradient)"
            />

            {/* Line */}
            <path
              d={generatePath()}
              fill="none"
              stroke="var(--color-positive)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data points */}
            {chartData.map((point, index) => {
              const x = padding.left + (index / (chartData.length - 1 || 1)) * graphWidth;
              const y = padding.top + graphHeight - ((point.equity.equityAmount - minEquity) / equityRange) * graphHeight;
              return (
                <circle
                  key={`point-${index}`}
                  cx={x}
                  cy={y}
                  r="5"
                  fill="var(--color-positive)"
                  stroke="white"
                  strokeWidth="2"
                  style={{ cursor: 'pointer' }}
                >
                  <title>
                    {point.year}/{point.month}: {formatCurrency(point.equity.equityAmount)} ({point.equity.equityPercentage.toFixed(1)}%)
                  </title>
                </circle>
              );
            })}

            {/* X-axis labels */}
            {chartData.map((point, index) => {
              if (chartData.length <= 6 || index % Math.ceil(chartData.length / 6) === 0) {
                const x = padding.left + (index / (chartData.length - 1 || 1)) * graphWidth;
                return (
                  <text
                    key={`label-${index}`}
                    x={x}
                    y={chartHeight - padding.bottom + 20}
                    textAnchor="middle"
                    fontSize="11"
                    fill="var(--text-tertiary)"
                  >
                    {new Date(point.year, point.month - 1).toLocaleDateString('en-US', { 
                      month: 'short', 
                      year: '2-digit' 
                    })}
                  </text>
                );
              }
              return null;
            })}
          </svg>
        </div>
      ) : (
        <div className="equity-chart-no-history">
          <p>Add balance entries to see your equity buildup over time.</p>
        </div>
      )}
    </div>
  );
};

export default EquityChart;
