import { useState, useEffect } from 'react';
import './MerchantDetailView.css';
import { getMerchantDetails, getMerchantTrend } from '../services/merchantAnalyticsApi';
import { formatCurrency, formatDate } from '../utils/formatters';

const MerchantDetailView = ({ merchantName, period, includeFixedExpenses, isOpen, onClose, onViewExpenses }) => {
  const [merchantDetails, setMerchantDetails] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch merchant details and trend data when component opens
  useEffect(() => {
    if (isOpen && merchantName) {
      fetchMerchantData();
    }
  }, [isOpen, merchantName, period, includeFixedExpenses]);

  const fetchMerchantData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch both details and trend data in parallel
      const [detailsData, trendDataResult] = await Promise.all([
        getMerchantDetails(merchantName, period, includeFixedExpenses),
        getMerchantTrend(merchantName, 12, includeFixedExpenses)
      ]);
      
      setMerchantDetails(detailsData);
      setTrendData(trendDataResult || []);
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to load merchant details. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error fetching merchant data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewAllExpenses = () => {
    if (onViewExpenses) {
      onViewExpenses(merchantName);
    }
  };

  const handleClose = () => {
    // Reset state
    setMerchantDetails(null);
    setTrendData([]);
    setError(null);
    
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="merchant-detail-overlay" onClick={handleClose}>
      <div className="merchant-detail-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="merchant-detail-header">
          <button className="merchant-detail-back-button" onClick={handleClose}>
            ← Back to Analytics
          </button>
          <h2>
            {merchantName}
            {merchantDetails && (
              <span className="merchant-detail-category-badge">
                {merchantDetails.primaryCategory}
              </span>
            )}
          </h2>
          <button className="merchant-detail-close" onClick={handleClose}>✕</button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="merchant-detail-error">
            <div>{error}</div>
            <button 
              className="merchant-detail-error-retry-button" 
              onClick={fetchMerchantData}
            >
              Retry
            </button>
          </div>
        )}

        <div className="merchant-detail-content">
          {loading ? (
            <div className="merchant-detail-loading">Loading merchant details...</div>
          ) : merchantDetails ? (
            <>
              {/* Merchant Summary Card */}
              <div className="merchant-summary-card">
                <h3>Spending Summary</h3>
                <div className="merchant-summary-grid">
                  <div className="merchant-summary-item">
                    <span className="merchant-summary-label">Total Spent:</span>
                    <span className="merchant-summary-value merchant-total-spent">
                      {formatCurrency(merchantDetails.totalSpend)}
                    </span>
                  </div>
                  
                  <div className="merchant-summary-item">
                    <span className="merchant-summary-label">Total Visits:</span>
                    <span className="merchant-summary-value">
                      {merchantDetails.visitCount}
                    </span>
                  </div>
                  
                  <div className="merchant-summary-item">
                    <span className="merchant-summary-label">Average per Visit:</span>
                    <span className="merchant-summary-value">
                      {formatCurrency(merchantDetails.averageSpend)}
                    </span>
                  </div>
                  
                  <div className="merchant-summary-item">
                    <span className="merchant-summary-label">% of Total Expenses:</span>
                    <span className="merchant-summary-value">
                      {merchantDetails.percentOfTotal.toFixed(1)}%
                    </span>
                  </div>
                  
                  <div className="merchant-summary-item">
                    <span className="merchant-summary-label">First Visit:</span>
                    <span className="merchant-summary-value">
                      {formatDate(merchantDetails.firstVisit)}
                    </span>
                  </div>
                  
                  <div className="merchant-summary-item">
                    <span className="merchant-summary-label">Last Visit:</span>
                    <span className="merchant-summary-value">
                      {formatDate(merchantDetails.lastVisit)}
                    </span>
                  </div>
                  
                  <div className="merchant-summary-item">
                    <span className="merchant-summary-label">Avg Days Between Visits:</span>
                    <span className="merchant-summary-value">
                      {merchantDetails.avgDaysBetweenVisits !== null 
                        ? `${Math.round(merchantDetails.avgDaysBetweenVisits)} days`
                        : 'N/A'
                      }
                    </span>
                  </div>
                  
                  <div className="merchant-summary-item">
                    <span className="merchant-summary-label">Primary Payment Method:</span>
                    <span className="merchant-summary-value">
                      {merchantDetails.primaryPaymentMethod}
                    </span>
                  </div>
                </div>

                {/* View All Expenses Button */}
                <div className="merchant-summary-actions">
                  <button
                    className="merchant-view-expenses-button"
                    onClick={handleViewAllExpenses}
                  >
                    📋 View All Expenses
                  </button>
                </div>
              </div>

              {/* Spending Trend Chart */}
              {trendData.length > 0 && (
                <div className="merchant-chart-section">
                  <div className="merchant-chart-header">
                    <h3>Monthly Spending Trend</h3>
                    <div className="merchant-chart-subtitle">
                      Last 12 months of spending at {merchantName}
                    </div>
                  </div>
                  <div className="merchant-line-chart">
                    {(() => {
                      // Data is already in chronological order (oldest first) from backend
                      const chartData = [...trendData];
                      const maxAmount = Math.max(...chartData.map(entry => entry.amount), 1);
                      const minAmount = Math.min(...chartData.map(entry => entry.amount));
                      
                      const chartWidth = 700;
                      const chartHeight = 250;
                      const padding = { top: 20, right: 60, bottom: 60, left: 80 };
                      const graphWidth = chartWidth - padding.left - padding.right;
                      const graphHeight = chartHeight - padding.top - padding.bottom;
                      
                      // Calculate points for spending line
                      const spendingPoints = chartData.map((entry, index) => {
                        const x = padding.left + (index / (chartData.length - 1 || 1)) * graphWidth;
                        const y = padding.top + graphHeight - ((entry.amount - minAmount) / (maxAmount - minAmount || 1)) * graphHeight;
                        return { x, y, entry };
                      });
                      
                      // Create path
                      const spendingLinePath = spendingPoints.map((point, index) => 
                        `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
                      ).join(' ');
                      
                      const areaPath = `${spendingLinePath} L ${spendingPoints[spendingPoints.length - 1].x} ${chartHeight - padding.bottom} L ${padding.left} ${chartHeight - padding.bottom} Z`;
                      
                      return (
                        <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet">
                          {/* Y-axis grid lines */}
                          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                            const y = padding.top + graphHeight * (1 - ratio);
                            const value = minAmount + (maxAmount - minAmount) * ratio;
                            return (
                              <g key={`spending-${ratio}`}>
                                <line
                                  x1={padding.left}
                                  y1={y}
                                  x2={chartWidth - padding.right}
                                  y2={y}
                                  stroke="#e0e0e0"
                                  strokeWidth="1"
                                />
                                <text
                                  x={padding.left - 10}
                                  y={y + 4}
                                  textAnchor="end"
                                  fontSize="11"
                                  fill="#2196f3"
                                >
                                  {formatCurrency(value)}
                                </text>
                              </g>
                            );
                          })}
                          
                          {/* Area under spending line */}
                          <path
                            d={areaPath}
                            fill="url(#merchantGradient)"
                            opacity="0.2"
                          />
                          
                          {/* Spending line */}
                          <path
                            d={spendingLinePath}
                            fill="none"
                            stroke="#2196f3"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          
                          {/* Data points */}
                          {spendingPoints.map((point, index) => (
                            <circle
                              key={`spending-${index}`}
                              cx={point.x}
                              cy={point.y}
                              r="5"
                              fill="#2196f3"
                              stroke="white"
                              strokeWidth="2"
                              style={{ cursor: 'pointer' }}
                            >
                              <title>
                                {point.entry.monthName}: {formatCurrency(point.entry.amount)}
                                {point.entry.changePercent !== null && (
                                  ` (${point.entry.changePercent >= 0 ? '+' : ''}${point.entry.changePercent.toFixed(1)}%)`
                                )}
                              </title>
                            </circle>
                          ))}
                          
                          {/* X-axis labels */}
                          {spendingPoints.map((point, index) => {
                            if (chartData.length <= 6 || index % 2 === 0) {
                              return (
                                <text
                                  key={index}
                                  x={point.x}
                                  y={chartHeight - padding.bottom + 20}
                                  textAnchor="middle"
                                  fontSize="11"
                                  fill="#666"
                                >
                                  {point.entry.monthName.split(' ')[0]}
                                </text>
                              );
                            }
                            return null;
                          })}
                          
                          {/* Month-over-month change indicators */}
                          {spendingPoints.map((point, index) => {
                            if (point.entry.changePercent !== null && Math.abs(point.entry.changePercent) > 0) {
                              return (
                                <text
                                  key={`change-${index}`}
                                  x={point.x}
                                  y={point.y - 15}
                                  textAnchor="middle"
                                  fontSize="10"
                                  fill={point.entry.changePercent >= 0 ? "#4caf50" : "#f44336"}
                                  fontWeight="bold"
                                >
                                  {point.entry.changePercent >= 0 ? '+' : ''}{point.entry.changePercent.toFixed(0)}%
                                </text>
                              );
                            }
                            return null;
                          })}
                          
                          {/* Gradient definition */}
                          <defs>
                            <linearGradient id="merchantGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="#2196f3" stopOpacity="0.5" />
                              <stop offset="100%" stopColor="#2196f3" stopOpacity="0.1" />
                            </linearGradient>
                          </defs>
                        </svg>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Category Breakdown */}
              {merchantDetails.categoryBreakdown && merchantDetails.categoryBreakdown.length > 0 && (
                <div className="merchant-breakdown-section">
                  <h3>Category Breakdown</h3>
                  <div className="merchant-breakdown-list">
                    {merchantDetails.categoryBreakdown.map((category) => (
                      <div key={category.category} className="merchant-breakdown-item">
                        <div className="merchant-breakdown-info">
                          <span className="merchant-breakdown-name">{category.category}</span>
                          <span className="merchant-breakdown-count">({category.count} visits)</span>
                        </div>
                        <div className="merchant-breakdown-values">
                          <span className="merchant-breakdown-amount">
                            {formatCurrency(category.amount)}
                          </span>
                          <span className="merchant-breakdown-percentage">
                            {category.percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="merchant-breakdown-bar">
                          <div 
                            className="merchant-breakdown-bar-fill"
                            style={{ width: `${category.percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Method Breakdown */}
              {merchantDetails.paymentMethodBreakdown && merchantDetails.paymentMethodBreakdown.length > 0 && (
                <div className="merchant-breakdown-section">
                  <h3>Payment Method Breakdown</h3>
                  <div className="merchant-breakdown-list">
                    {merchantDetails.paymentMethodBreakdown.map((method) => (
                      <div key={method.method} className="merchant-breakdown-item">
                        <div className="merchant-breakdown-info">
                          <span className="merchant-breakdown-name">{method.method}</span>
                          <span className="merchant-breakdown-count">({method.count} visits)</span>
                        </div>
                        <div className="merchant-breakdown-values">
                          <span className="merchant-breakdown-amount">
                            {formatCurrency(method.amount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            !loading && (
              <div className="merchant-detail-empty">
                No details available for this merchant.
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default MerchantDetailView;