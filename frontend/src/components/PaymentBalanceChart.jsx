/**
 * PaymentBalanceChart Component
 * 
 * SVG dual-axis chart showing balance reduction and cumulative payments over time.
 * Displays tooltips with payment details on hover.
 * 
 * Requirements: 7.1, 7.2, 7.3
 */

import { useState } from 'react';
import './PaymentBalanceChart.css';
import { formatCurrency, formatDate } from '../utils/formatters';

const PaymentBalanceChart = ({ 
  payments = [], 
  initialBalance = 0,
  loanName = 'Loan'
}) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // Don't render if no payments
  if (!payments || payments.length === 0) {
    return (
      <div className="payment-balance-chart-section">
        <h4>Balance Over Time</h4>
        <div className="payment-balance-chart-no-data">
          <p>Log payments to see your balance reduction over time.</p>
        </div>
      </div>
    );
  }

  // Prepare chart data - sort payments chronologically (oldest first)
  const sortedPayments = [...payments].sort((a, b) => 
    new Date(a.payment_date) - new Date(b.payment_date)
  );

  // Calculate running balance and cumulative payments for each point
  let cumulativePayments = 0;
  const chartData = sortedPayments.map((payment, index) => {
    cumulativePayments += payment.amount;
    const runningBalance = Math.max(0, initialBalance - cumulativePayments);
    
    return {
      ...payment,
      date: new Date(payment.payment_date),
      runningBalance,
      cumulativePayments,
      index
    };
  });

  // Add starting point (initial balance, no payments)
  const startDate = chartData.length > 0 
    ? new Date(chartData[0].date.getTime() - 30 * 24 * 60 * 60 * 1000) // 30 days before first payment
    : new Date();
  
  const dataWithStart = [
    {
      date: startDate,
      runningBalance: initialBalance,
      cumulativePayments: 0,
      amount: 0,
      isStartPoint: true
    },
    ...chartData
  ];

  // Chart dimensions
  const chartWidth = 600;
  const chartHeight = 280;
  const padding = { top: 30, right: 80, bottom: 50, left: 80 };
  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;

  // Calculate scales
  const maxBalance = Math.max(initialBalance, ...dataWithStart.map(d => d.runningBalance));
  const maxPayments = Math.max(...dataWithStart.map(d => d.cumulativePayments), 1);
  
  // Time scale
  const minDate = dataWithStart[0].date;
  const maxDate = dataWithStart[dataWithStart.length - 1].date;
  const dateRange = maxDate - minDate || 1;

  // Calculate point positions
  const getX = (date) => {
    return padding.left + ((date - minDate) / dateRange) * graphWidth;
  };

  const getBalanceY = (balance) => {
    if (maxBalance === 0) return padding.top + graphHeight;
    return padding.top + graphHeight - (balance / maxBalance) * graphHeight;
  };

  const getPaymentsY = (payments) => {
    if (maxPayments === 0) return padding.top + graphHeight;
    return padding.top + graphHeight - (payments / maxPayments) * graphHeight;
  };

  // Generate paths
  const balancePoints = dataWithStart.map(d => ({
    x: getX(d.date),
    y: getBalanceY(d.runningBalance),
    data: d
  }));

  const paymentsPoints = dataWithStart.map(d => ({
    x: getX(d.date),
    y: getPaymentsY(d.cumulativePayments),
    data: d
  }));

  const balanceLinePath = balancePoints.map((p, i) => 
    `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  ).join(' ');

  const paymentsLinePath = paymentsPoints.map((p, i) => 
    `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  ).join(' ');

  // Area path for balance (fill under line)
  const balanceAreaPath = `${balanceLinePath} L ${balancePoints[balancePoints.length - 1].x} ${padding.top + graphHeight} L ${padding.left} ${padding.top + graphHeight} Z`;

  // Format date for display
  const formatChartDate = (date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  };

  // Calculate percentage paid off
  const totalPaid = chartData.length > 0 ? chartData[chartData.length - 1].cumulativePayments : 0;
  const percentagePaid = initialBalance > 0 ? (totalPaid / initialBalance) * 100 : 0;
  const currentBalance = initialBalance - totalPaid;

  return (
    <div className="payment-balance-chart-section">
      <div className="payment-balance-chart-header">
        <h4>Balance Over Time</h4>
        <div className="payment-balance-chart-summary">
          <div className="chart-summary-stat">
            <span className="chart-summary-label">Paid Off</span>
            <span className="chart-summary-value positive">{percentagePaid.toFixed(1)}%</span>
          </div>
          <div className="chart-summary-stat">
            <span className="chart-summary-label">Remaining</span>
            <span className="chart-summary-value">{formatCurrency(Math.max(0, currentBalance))}</span>
          </div>
        </div>
      </div>

      <div className="payment-balance-chart-legend">
        <span className="legend-item">
          <span className="legend-color balance-color"></span>
          Balance
        </span>
        <span className="legend-item">
          <span className="legend-color payments-color"></span>
          Cumulative Payments
        </span>
      </div>

      <div className="payment-balance-chart-container">
        <svg 
          width="100%" 
          height={chartHeight} 
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="xMidYMid meet"
          className="payment-balance-chart-svg"
        >
          {/* Gradient definitions */}
          <defs>
            <linearGradient id="balanceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="paymentsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--color-positive)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--color-positive)" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Left Y-axis grid lines and labels (Balance) */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + graphHeight * (1 - ratio);
            const value = maxBalance * ratio;
            return (
              <g key={`balance-grid-${ratio}`}>
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
                  fill="var(--color-primary)"
                  className="chart-axis-label"
                >
                  {formatCurrency(value)}
                </text>
              </g>
            );
          })}

          {/* Right Y-axis labels (Cumulative Payments) */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + graphHeight * (1 - ratio);
            const value = maxPayments * ratio;
            return (
              <text
                key={`payments-label-${ratio}`}
                x={chartWidth - padding.right + 10}
                y={y + 4}
                textAnchor="start"
                fontSize="11"
                fill="var(--color-positive-dark)"
                className="chart-axis-label"
              >
                {formatCurrency(value)}
              </text>
            );
          })}

          {/* Balance area fill */}
          <path
            d={balanceAreaPath}
            fill="url(#balanceGradient)"
          />

          {/* Balance line */}
          <path
            d={balanceLinePath}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Cumulative payments line */}
          <path
            d={paymentsLinePath}
            fill="none"
            stroke="var(--color-positive)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6,3"
          />

          {/* Balance data points */}
          {balancePoints.map((point, index) => (
            <circle
              key={`balance-point-${index}`}
              cx={point.x}
              cy={point.y}
              r={hoveredPoint === index ? 7 : 5}
              fill="var(--color-primary)"
              stroke="white"
              strokeWidth="2"
              style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
              onMouseEnter={() => setHoveredPoint(index)}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          ))}

          {/* Cumulative payments data points */}
          {paymentsPoints.slice(1).map((point, index) => (
            <circle
              key={`payments-point-${index}`}
              cx={point.x}
              cy={point.y}
              r={hoveredPoint === index + 1 ? 6 : 4}
              fill="var(--color-positive)"
              stroke="white"
              strokeWidth="2"
              style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
              onMouseEnter={() => setHoveredPoint(index + 1)}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          ))}

          {/* X-axis labels */}
          {dataWithStart.map((point, index) => {
            // Show fewer labels if many data points
            const showLabel = dataWithStart.length <= 8 || 
              index === 0 || 
              index === dataWithStart.length - 1 ||
              index % Math.ceil(dataWithStart.length / 6) === 0;
            
            if (!showLabel) return null;
            
            const x = getX(point.date);
            return (
              <text
                key={`x-label-${index}`}
                x={x}
                y={chartHeight - padding.bottom + 20}
                textAnchor="middle"
                fontSize="11"
                fill="var(--text-tertiary)"
                className="chart-axis-label"
              >
                {formatChartDate(point.date)}
              </text>
            );
          })}

          {/* Axis labels */}
          <text
            x={padding.left - 50}
            y={padding.top + graphHeight / 2}
            textAnchor="middle"
            fontSize="12"
            fill="var(--color-primary)"
            transform={`rotate(-90, ${padding.left - 50}, ${padding.top + graphHeight / 2})`}
            className="chart-axis-title"
          >
            Balance
          </text>
          <text
            x={chartWidth - padding.right + 50}
            y={padding.top + graphHeight / 2}
            textAnchor="middle"
            fontSize="12"
            fill="var(--color-positive-dark)"
            transform={`rotate(90, ${chartWidth - padding.right + 50}, ${padding.top + graphHeight / 2})`}
            className="chart-axis-title"
          >
            Payments
          </text>
        </svg>

        {/* Tooltip */}
        {hoveredPoint !== null && dataWithStart[hoveredPoint] && (
          <div 
            className="payment-balance-chart-tooltip"
            style={{
              left: `${(getX(dataWithStart[hoveredPoint].date) / chartWidth) * 100}%`,
              top: `${(getBalanceY(dataWithStart[hoveredPoint].runningBalance) / chartHeight) * 100}%`
            }}
          >
            <div className="tooltip-date">
              {formatChartDate(dataWithStart[hoveredPoint].date)}
            </div>
            {!dataWithStart[hoveredPoint].isStartPoint && (
              <div className="tooltip-payment">
                <span className="tooltip-label">Payment:</span>
                <span className="tooltip-value positive">
                  {formatCurrency(dataWithStart[hoveredPoint].amount)}
                </span>
              </div>
            )}
            <div className="tooltip-balance">
              <span className="tooltip-label">Balance:</span>
              <span className="tooltip-value">
                {formatCurrency(dataWithStart[hoveredPoint].runningBalance)}
              </span>
            </div>
            <div className="tooltip-cumulative">
              <span className="tooltip-label">Total Paid:</span>
              <span className="tooltip-value positive">
                {formatCurrency(dataWithStart[hoveredPoint].cumulativePayments)}
              </span>
            </div>
            {dataWithStart[hoveredPoint].notes && (
              <div className="tooltip-notes">
                {dataWithStart[hoveredPoint].notes}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentBalanceChart;
