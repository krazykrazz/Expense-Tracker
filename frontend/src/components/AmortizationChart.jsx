/**
 * AmortizationChart Component
 * 
 * Stacked area chart showing principal vs interest over loan life.
 * Displays payment breakdown summary.
 * 
 * Requirements: 5.5, 6.3, 8.4
 */

import { useState, useEffect } from 'react';
import './AmortizationChart.css';
import { formatCurrency } from '../utils/formatters';
import { getAmortizationSchedule } from '../services/loanApi';
import { createLogger } from '../utils/logger';

const logger = createLogger('AmortizationChart');

const AmortizationChart = ({ loanId, currentBalance, currentRate }) => {
  const [schedule, setSchedule] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('cumulative'); // 'cumulative' or 'breakdown'

  useEffect(() => {
    const fetchAmortization = async () => {
      if (!loanId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const data = await getAmortizationSchedule(loanId);
        setSchedule(data?.schedule || []);
        setSummary(data?.summary || null);
      } catch (err) {
        logger.error('Error fetching amortization schedule:', err);
        setError('Failed to load amortization schedule');
      } finally {
        setLoading(false);
      }
    };

    fetchAmortization();
  }, [loanId, currentBalance, currentRate]);

  // Aggregate data by year for cumulative view
  const aggregateByYear = (data) => {
    const yearlyData = {};
    
    data.forEach(entry => {
      const year = new Date(entry.date).getFullYear();
      if (!yearlyData[year]) {
        yearlyData[year] = {
          year,
          principal: 0,
          interest: 0,
          cumulativePrincipal: 0,
          cumulativeInterest: 0
        };
      }
      yearlyData[year].principal += entry.principal;
      yearlyData[year].interest += entry.interest;
    });

    // Calculate cumulative values
    let cumPrincipal = 0;
    let cumInterest = 0;
    
    return Object.values(yearlyData)
      .sort((a, b) => a.year - b.year)
      .map(entry => {
        cumPrincipal += entry.principal;
        cumInterest += entry.interest;
        return {
          ...entry,
          cumulativePrincipal: cumPrincipal,
          cumulativeInterest: cumInterest
        };
      });
  };

  // Aggregate per-period payments by year for breakdown view
  const aggregatePaymentsByYear = (data) => {
    const yearlyData = {};
    
    data.forEach(entry => {
      const year = new Date(entry.date).getFullYear();
      if (!yearlyData[year]) {
        yearlyData[year] = {
          year,
          principal: 0,
          interest: 0,
          payments: 0
        };
      }
      yearlyData[year].principal += entry.principal;
      yearlyData[year].interest += entry.interest;
      yearlyData[year].payments += 1;
    });

    return Object.values(yearlyData).sort((a, b) => a.year - b.year);
  };

  // Get chart data based on view mode
  const getChartData = () => {
    if (schedule.length === 0) return [];
    
    if (viewMode === 'cumulative') {
      return aggregateByYear(schedule);
    }
    
    // For breakdown view, show per-year payment totals (not cumulative)
    return aggregatePaymentsByYear(schedule);
  };

  const chartData = getChartData();

  // Chart dimensions
  const chartWidth = 700;
  const chartHeight = 300;
  const padding = { top: 30, right: 80, bottom: 60, left: 80 };
  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;

  // Calculate scales
  const maxCumulative = chartData.length > 0
    ? viewMode === 'cumulative'
      ? Math.max(...chartData.map(d => d.cumulativePrincipal + d.cumulativeInterest))
      : Math.max(...chartData.map(d => d.principal + d.interest))
    : 0;

  // Generate stacked area paths for cumulative view
  const generateCumulativePaths = () => {
    if (chartData.length === 0) return { principalPath: '', interestPath: '', principalArea: '', interestArea: '', points: [] };

    const points = chartData.map((entry, index) => {
      const x = padding.left + (index / (chartData.length - 1 || 1)) * graphWidth;
      const principalY = padding.top + graphHeight - (entry.cumulativePrincipal / maxCumulative) * graphHeight;
      const totalY = padding.top + graphHeight - ((entry.cumulativePrincipal + entry.cumulativeInterest) / maxCumulative) * graphHeight;
      return { x, principalY, totalY, entry };
    });

    // Principal area (bottom)
    const principalArea = points.map((p, i) => 
      `${i === 0 ? 'M' : 'L'} ${p.x} ${p.principalY}`
    ).join(' ') + 
    ` L ${points[points.length - 1].x} ${padding.top + graphHeight}` +
    ` L ${padding.left} ${padding.top + graphHeight} Z`;

    // Interest area (top, stacked on principal)
    const interestArea = points.map((p, i) => 
      `${i === 0 ? 'M' : 'L'} ${p.x} ${p.totalY}`
    ).join(' ') +
    points.slice().reverse().map(p => ` L ${p.x} ${p.principalY}`).join('') + ' Z';

    // Line paths
    const principalPath = points.map((p, i) => 
      `${i === 0 ? 'M' : 'L'} ${p.x} ${p.principalY}`
    ).join(' ');

    const interestPath = points.map((p, i) => 
      `${i === 0 ? 'M' : 'L'} ${p.x} ${p.totalY}`
    ).join(' ');

    return { principalPath, interestPath, principalArea, interestArea, points };
  };

  // Generate bar chart data for breakdown view
  const generateBreakdownBars = () => {
    if (chartData.length === 0) return [];
    
    const barWidth = Math.min(40, (graphWidth / chartData.length) * 0.7);
    const gap = (graphWidth - barWidth * chartData.length) / (chartData.length + 1);
    
    return chartData.map((entry, index) => {
      const x = padding.left + gap + index * (barWidth + gap);
      const total = entry.principal + entry.interest;
      const totalHeight = (total / maxCumulative) * graphHeight;
      const principalHeight = (entry.principal / maxCumulative) * graphHeight;
      const interestHeight = (entry.interest / maxCumulative) * graphHeight;
      
      return {
        x,
        barWidth,
        principalY: padding.top + graphHeight - principalHeight,
        principalHeight,
        interestY: padding.top + graphHeight - totalHeight,
        interestHeight,
        entry
      };
    });
  };

  const { principalPath, interestPath, principalArea, interestArea, points } = 
    viewMode === 'cumulative' ? generateCumulativePaths() : { principalPath: '', interestPath: '', principalArea: '', interestArea: '', points: [] };
  
  const bars = viewMode === 'breakdown' ? generateBreakdownBars() : [];

  if (loading) {
    return (
      <div className="amortization-chart-section">
        <h4>Amortization Schedule</h4>
        <div className="amortization-loading">Loading amortization schedule...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="amortization-chart-section">
        <h4>Amortization Schedule</h4>
        <div className="amortization-error">{error}</div>
      </div>
    );
  }

  if (!schedule || schedule.length === 0) {
    return (
      <div className="amortization-chart-section">
        <h4>Amortization Schedule</h4>
        <div className="amortization-no-data">
          <p>Unable to generate amortization schedule. Please ensure the mortgage has valid balance and rate information.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="amortization-chart-section">
      <div className="amortization-header">
        <h4>Amortization Schedule</h4>
        <div className="amortization-view-toggle">
          <button 
            className={viewMode === 'cumulative' ? 'active' : ''}
            onClick={() => setViewMode('cumulative')}
            title="Shows total paid over time"
          >
            Cumulative
          </button>
          <button 
            className={viewMode === 'breakdown' ? 'active' : ''}
            onClick={() => setViewMode('breakdown')}
            title="Shows yearly payment breakdown"
          >
            Per Year
          </button>
        </div>
      </div>

      {/* Payment Summary */}
      {summary && (
        <div className="amortization-summary">
          <div className="amortization-stat">
            <span className="amortization-stat-label">Total Principal</span>
            <span className="amortization-stat-value principal">
              {formatCurrency(summary.totalPrincipal)}
            </span>
          </div>
          <div className="amortization-stat">
            <span className="amortization-stat-label">Total Interest</span>
            <span className="amortization-stat-value interest">
              {formatCurrency(summary.totalInterest)}
            </span>
          </div>
          <div className="amortization-stat">
            <span className="amortization-stat-label">Total Cost</span>
            <span className="amortization-stat-value">
              {formatCurrency(summary.totalPrincipal + summary.totalInterest)}
            </span>
          </div>
          <div className="amortization-stat">
            <span className="amortization-stat-label">Payment Amount</span>
            <span className="amortization-stat-value">
              {formatCurrency(summary.paymentAmount)}
            </span>
          </div>
          {summary.estimatedPayoffDate && (
            <div className="amortization-stat">
              <span className="amortization-stat-label">Est. Payoff</span>
              <span className="amortization-stat-value">
                {new Date(summary.estimatedPayoffDate).toLocaleDateString('en-US', {
                  month: 'short',
                  year: 'numeric'
                })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Chart Legend */}
      <div className="amortization-legend">
        <span className="legend-item">
          <span className="legend-color principal"></span>
          Principal
        </span>
        <span className="legend-item">
          <span className="legend-color interest"></span>
          Interest
        </span>
      </div>

      {/* Stacked Area Chart */}
      <div className="amortization-chart-container">
        <svg 
          width="100%" 
          height={chartHeight} 
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="xMidYMid meet"
          className="amortization-chart-svg"
        >
          {/* Gradient definitions */}
          <defs>
            <linearGradient id="principalGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--color-positive)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="var(--color-positive)" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="interestGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--color-negative)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="var(--color-negative)" stopOpacity="0.3" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + graphHeight * (1 - ratio);
            const value = maxCumulative * ratio;
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

          {/* Cumulative view - stacked area chart */}
          {viewMode === 'cumulative' && (
            <>
              {/* Interest area (top layer) */}
              <path
                d={interestArea}
                fill="url(#interestGradient)"
              />

              {/* Principal area (bottom layer) */}
              <path
                d={principalArea}
                fill="url(#principalGradient)"
              />

              {/* Interest line */}
              <path
                d={interestPath}
                fill="none"
                stroke="var(--color-negative)"
                strokeWidth="2"
                strokeLinecap="round"
              />

              {/* Principal line */}
              <path
                d={principalPath}
                fill="none"
                stroke="var(--color-positive)"
                strokeWidth="2"
                strokeLinecap="round"
              />

              {/* X-axis labels */}
              {points && points.map((point, index) => {
                const showLabel = chartData.length <= 10 || index % Math.ceil(chartData.length / 8) === 0;
                if (!showLabel) return null;
                
                return (
                  <text
                    key={`label-${index}`}
                    x={point.x}
                    y={chartHeight - padding.bottom + 20}
                    textAnchor="middle"
                    fontSize="11"
                    fill="var(--text-tertiary)"
                  >
                    {point.entry.year}
                  </text>
                );
              })}

              {/* Data points with tooltips */}
              {points && points.map((point, index) => (
                <g key={`points-${index}`}>
                  <circle
                    cx={point.x}
                    cy={point.totalY}
                    r="4"
                    fill="var(--color-negative)"
                    stroke="white"
                    strokeWidth="2"
                    style={{ cursor: 'pointer' }}
                  >
                    <title>
                      {point.entry.year}
                      {'\n'}Total Paid: {formatCurrency(point.entry.cumulativePrincipal + point.entry.cumulativeInterest)}
                      {'\n'}Interest: {formatCurrency(point.entry.cumulativeInterest)}
                    </title>
                  </circle>
                  <circle
                    cx={point.x}
                    cy={point.principalY}
                    r="4"
                    fill="var(--color-positive)"
                    stroke="white"
                    strokeWidth="2"
                    style={{ cursor: 'pointer' }}
                  >
                    <title>
                      {point.entry.year}
                      {'\n'}Principal: {formatCurrency(point.entry.cumulativePrincipal)}
                    </title>
                  </circle>
                </g>
              ))}
            </>
          )}

          {/* Breakdown view - stacked bar chart */}
          {viewMode === 'breakdown' && bars.map((bar, index) => (
            <g key={`bar-${index}`}>
              {/* Interest bar (top) */}
              <rect
                x={bar.x}
                y={bar.interestY}
                width={bar.barWidth}
                height={bar.interestHeight}
                fill="var(--color-negative)"
                opacity="0.8"
                style={{ cursor: 'pointer' }}
              >
                <title>
                  {bar.entry.year}
                  {'\n'}Interest: {formatCurrency(bar.entry.interest)}
                  {'\n'}({bar.entry.payments} payments)
                </title>
              </rect>
              
              {/* Principal bar (bottom) */}
              <rect
                x={bar.x}
                y={bar.principalY}
                width={bar.barWidth}
                height={bar.principalHeight}
                fill="var(--color-positive)"
                opacity="0.8"
                style={{ cursor: 'pointer' }}
              >
                <title>
                  {bar.entry.year}
                  {'\n'}Principal: {formatCurrency(bar.entry.principal)}
                  {'\n'}({bar.entry.payments} payments)
                </title>
              </rect>
              
              {/* Year label */}
              <text
                x={bar.x + bar.barWidth / 2}
                y={chartHeight - padding.bottom + 20}
                textAnchor="middle"
                fontSize="11"
                fill="var(--text-tertiary)"
              >
                {bar.entry.year}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};

export default AmortizationChart;
