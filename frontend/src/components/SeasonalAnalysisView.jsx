/**
 * SeasonalAnalysisView Component
 * Displays month-over-month and quarter-over-quarter spending comparisons.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { useState, useEffect } from 'react';
import './SeasonalAnalysisView.css';
import { getSeasonalAnalysis } from '../services/analyticsApi';
import { formatCurrency, getMonthNameShort } from '../utils/formatters';

const QUARTER_NAMES = ['Q1', 'Q2', 'Q3', 'Q4'];

const SeasonalAnalysisView = ({ months = 12 }) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeView, setActiveView] = useState('monthly');

  useEffect(() => {
    fetchAnalysis();
  }, [months]);

  const fetchAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSeasonalAnalysis({ months });
      setAnalysis(data);
    } catch (err) {
      setError('Unable to load seasonal analysis. Please try again.');
      console.error('Error fetching seasonal analysis:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatPercentage = (value) => {
    if (value === null || value === undefined) return '—';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  const getChangeClass = (value) => {
    if (value === null || value === undefined) return '';
    if (value > 10) return 'increase-high';
    if (value > 0) return 'increase';
    if (value < -10) return 'decrease-high';
    if (value < 0) return 'decrease';
    return '';
  };

  const getMaxSpending = (data) => {
    if (!data || data.length === 0) return 1;
    return Math.max(...data.map(d => d.totalSpent || 0));
  };

  if (loading) {
    return (
      <div className="seasonal-loading">
        <div className="seasonal-spinner"></div>
        <p>Analyzing seasonal trends...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="seasonal-error">
        <p>{error}</p>
        <button onClick={fetchAnalysis} className="seasonal-retry-btn">
          Retry
        </button>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="seasonal-empty">
        <p>No seasonal data available.</p>
      </div>
    );
  }

  const maxMonthlySpending = getMaxSpending(analysis.monthlyData);
  const maxQuarterlySpending = getMaxSpending(analysis.quarterlyData);

  return (
    <div className="seasonal-view">
      {/* View Toggle */}
      <div className="seasonal-toggle">
        <button
          className={`seasonal-toggle-btn ${activeView === 'monthly' ? 'active' : ''}`}
          onClick={() => setActiveView('monthly')}
        >
          Monthly
        </button>
        <button
          className={`seasonal-toggle-btn ${activeView === 'quarterly' ? 'active' : ''}`}
          onClick={() => setActiveView('quarterly')}
        >
          Quarterly
        </button>
        <button
          className={`seasonal-toggle-btn ${activeView === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveView('categories')}
        >
          Seasonal Categories
        </button>
      </div>

      {/* Monthly View */}
      {activeView === 'monthly' && (
        <div className="seasonal-section">
          <h3 className="seasonal-section-title">Month-over-Month Comparison</h3>
          
          {/* Chart */}
          <div className="seasonal-chart">
            {analysis.monthlyData?.map((month, index) => (
              <div key={`${month.year}-${month.month}`} className="seasonal-chart-bar-wrapper">
                <div className="seasonal-chart-bar-container">
                  <div
                    className="seasonal-chart-bar"
                    style={{
                      height: `${(month.totalSpent / maxMonthlySpending) * 100}%`
                    }}
                  >
                    <span className="seasonal-chart-value">
                      {formatCurrency(month.totalSpent)}
                    </span>
                  </div>
                </div>
                <div className="seasonal-chart-label">
                  {getMonthNameShort(month.month)}
                  <span className="seasonal-chart-year">{month.year}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Monthly Table */}
          <div className="seasonal-table">
            <div className="seasonal-table-header">
              <span>Month</span>
              <span>Total Spent</span>
              <span>vs Previous Month</span>
              <span>vs Same Month Last Year</span>
            </div>
            {analysis.monthlyData?.map((month) => (
              <div key={`${month.year}-${month.month}`} className="seasonal-table-row">
                <span className="seasonal-table-month">
                  {month.monthName} {month.year}
                </span>
                <span className="seasonal-table-amount">
                  {formatCurrency(month.totalSpent)}
                </span>
                <span className={`seasonal-table-change ${getChangeClass(month.previousMonthChange)}`}>
                  {formatPercentage(month.previousMonthChange)}
                </span>
                <span className={`seasonal-table-change ${getChangeClass(month.sameMonthLastYearChange)}`}>
                  {formatPercentage(month.sameMonthLastYearChange)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quarterly View */}
      {activeView === 'quarterly' && (
        <div className="seasonal-section">
          <h3 className="seasonal-section-title">Quarter-over-Quarter Comparison</h3>
          
          {/* Quarterly Chart */}
          <div className="seasonal-quarterly-chart">
            {analysis.quarterlyData?.map((quarter) => (
              <div key={`${quarter.year}-Q${quarter.quarter}`} className="seasonal-quarter-card">
                <div className="seasonal-quarter-header">
                  <span className="seasonal-quarter-name">
                    {QUARTER_NAMES[quarter.quarter - 1]} {quarter.year}
                  </span>
                  {quarter.previousQuarterChange !== null && (
                    <span className={`seasonal-quarter-change ${getChangeClass(quarter.previousQuarterChange)}`}>
                      {formatPercentage(quarter.previousQuarterChange)}
                    </span>
                  )}
                </div>
                <div className="seasonal-quarter-amount">
                  {formatCurrency(quarter.totalSpent)}
                </div>
                <div className="seasonal-quarter-bar-container">
                  <div
                    className="seasonal-quarter-bar"
                    style={{
                      width: `${(quarter.totalSpent / maxQuarterlySpending) * 100}%`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seasonal Categories View */}
      {activeView === 'categories' && (
        <div className="seasonal-section">
          <h3 className="seasonal-section-title">
            Categories with Seasonal Variation
            <span className="seasonal-section-subtitle">(>25% variance from annual average)</span>
          </h3>
          
          {!analysis.seasonalCategories || analysis.seasonalCategories.length === 0 ? (
            <div className="seasonal-empty-categories">
              <p>No categories with significant seasonal variation detected.</p>
              <p className="seasonal-empty-hint">
                Categories appear here when their monthly spending varies more than 25% from the annual average.
              </p>
            </div>
          ) : (
            <div className="seasonal-categories-list">
              {analysis.seasonalCategories.map((cat, index) => (
                <div key={index} className="seasonal-category-card">
                  <div className="seasonal-category-header">
                    <span className="seasonal-category-name">{cat.category}</span>
                    <span className={`seasonal-category-variance ${cat.varianceFromAnnualAverage > 0 ? 'high' : 'low'}`}>
                      {formatPercentage(cat.varianceFromAnnualAverage)} variance
                    </span>
                  </div>
                  
                  <div className="seasonal-category-months">
                    {cat.peakMonths && cat.peakMonths.length > 0 && (
                      <div className="seasonal-category-peak">
                        <span className="seasonal-category-label">Peak Months:</span>
                        <div className="seasonal-category-month-tags">
                          {cat.peakMonths.map((m) => (
                            <span key={m} className="seasonal-month-tag peak">
                              {getMonthNameShort(m)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {cat.lowMonths && cat.lowMonths.length > 0 && (
                      <div className="seasonal-category-low">
                        <span className="seasonal-category-label">Low Months:</span>
                        <div className="seasonal-category-month-tags">
                          {cat.lowMonths.map((m) => (
                            <span key={m} className="seasonal-month-tag low">
                              {getMonthNameShort(m)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Monthly Pattern Visualization */}
                  <div className="seasonal-category-pattern">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
                      const isPeak = cat.peakMonths?.includes(m);
                      const isLow = cat.lowMonths?.includes(m);
                      return (
                        <div
                          key={m}
                          className={`seasonal-pattern-month ${isPeak ? 'peak' : ''} ${isLow ? 'low' : ''}`}
                          title={getMonthNameShort(m)}
                        >
                          <span className="seasonal-pattern-label">{getMonthNameShort(m).charAt(0)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SeasonalAnalysisView;
