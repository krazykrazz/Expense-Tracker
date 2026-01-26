/**
 * PredictionsView Component
 * Displays end-of-month spending predictions with confidence indicators.
 * Requirements: 2.1, 2.3, 2.4, 2.5
 */

import { useState, useEffect } from 'react';
import './PredictionsView.css';
import { getMonthPrediction } from '../services/analyticsApi';
import { formatCurrency, getMonthNameLong } from '../utils/formatters';

const PredictionsView = ({ year, month, monthlyIncome, budgetAlerts }) => {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPrediction();
  }, [year, month, monthlyIncome]);

  const fetchPrediction = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMonthPrediction(year, month, monthlyIncome);
      setPrediction(data);
    } catch (err) {
      setError('Unable to load predictions. Please try again.');
      console.error('Error fetching prediction:', err);
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceClass = (level) => {
    switch (level) {
      case 'high': return 'confidence-high';
      case 'medium': return 'confidence-medium';
      case 'low': return 'confidence-low';
      default: return '';
    }
  };

  const getConfidenceLabel = (level) => {
    switch (level) {
      case 'high': return 'High Confidence';
      case 'medium': return 'Medium Confidence';
      case 'low': return 'Low Confidence';
      default: return 'Unknown';
    }
  };

  const formatPercentage = (value) => {
    if (value === null || value === undefined) return 'N/A';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="predictions-loading">
        <div className="predictions-spinner"></div>
        <p>Calculating predictions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="predictions-error">
        <p>{error}</p>
        <button onClick={fetchPrediction} className="predictions-retry-btn">
          Retry
        </button>
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className="predictions-empty">
        <p>No prediction data available.</p>
      </div>
    );
  }

  const progressPercent = prediction.daysElapsed > 0
    ? (prediction.daysElapsed / (prediction.daysElapsed + prediction.daysRemaining)) * 100
    : 0;

  return (
    <div className="predictions-view">
      {/* Main Prediction Card */}
      <div className="predictions-main-card">
        <div className="predictions-header">
          <h3>{getMonthNameLong(month)} {year} Prediction</h3>
          <span className={`predictions-confidence ${getConfidenceClass(prediction.confidenceLevel)}`}>
            {getConfidenceLabel(prediction.confidenceLevel)}
          </span>
        </div>

        {/* Predicted Total */}
        <div className="predictions-total">
          <div className="predictions-total-label">Predicted End-of-Month Total</div>
          <div className="predictions-total-amount">
            ${formatCurrency(prediction.predictedTotal)}
          </div>
        </div>

        {/* Warnings */}
        {prediction.exceedsIncome && (
          <div className="predictions-warning income-warning">
            <span className="predictions-warning-icon">⚠️</span>
            <span>Predicted spending exceeds monthly income</span>
          </div>
        )}

        {prediction.yearOverYearChange !== null && prediction.yearOverYearChange > 20 && (
          <div className="predictions-warning yoy-warning">
            <span className="predictions-warning-icon">📈</span>
            <span>
              {formatPercentage(prediction.yearOverYearChange)} higher than {getMonthNameLong(month)} last year
            </span>
          </div>
        )}

        {/* Progress Bar */}
        <div className="predictions-progress">
          <div className="predictions-progress-header">
            <span>Month Progress</span>
            <span>{prediction.daysElapsed} of {prediction.daysElapsed + prediction.daysRemaining} days</span>
          </div>
          <div className="predictions-progress-bar">
            <div
              className="predictions-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="predictions-stats">
          <div className="predictions-stat">
            <span className="predictions-stat-label">Current Spent</span>
            <span className="predictions-stat-value">
              ${formatCurrency(prediction.currentSpent)}
            </span>
          </div>
          <div className="predictions-stat">
            <span className="predictions-stat-label">Daily Average</span>
            <span className="predictions-stat-value">
              ${formatCurrency(prediction.dailyAverage)}
            </span>
          </div>
          <div className="predictions-stat">
            <span className="predictions-stat-label">Historical Avg</span>
            <span className="predictions-stat-value">
              ${formatCurrency(prediction.historicalMonthlyAverage)}
            </span>
          </div>
          <div className="predictions-stat">
            <span className="predictions-stat-label">Days Remaining</span>
            <span className="predictions-stat-value">
              {prediction.daysRemaining}
            </span>
          </div>
        </div>

        {/* Year-over-Year Comparison */}
        {prediction.yearOverYearChange !== null && (
          <div className="predictions-yoy">
            <span className="predictions-yoy-label">vs Same Month Last Year:</span>
            <span className={`predictions-yoy-value ${prediction.yearOverYearChange > 0 ? 'increase' : 'decrease'}`}>
              {formatPercentage(prediction.yearOverYearChange)}
            </span>
          </div>
        )}
      </div>

      {/* Budget Integration */}
      {budgetAlerts && budgetAlerts.length > 0 && (
        <div className="predictions-budget-section">
          <h4>Budget Status</h4>
          <div className="predictions-budget-alerts">
            {budgetAlerts.map((alert, index) => (
              <div
                key={index}
                className={`predictions-budget-alert ${alert.status}`}
              >
                <span className="predictions-budget-category">{alert.category}</span>
                <span className="predictions-budget-percent">{alert.percentUsed}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {prediction.categoryBreakdown && prediction.categoryBreakdown.length > 0 && (
        <div className="predictions-categories">
          <h4>Category Breakdown</h4>
          <div className="predictions-category-list">
            {prediction.categoryBreakdown
              .sort((a, b) => b.predicted - a.predicted)
              .slice(0, 10)
              .map((cat, index) => (
                <div key={index} className="predictions-category-item">
                  <div className="predictions-category-header">
                    <span className="predictions-category-name">{cat.category}</span>
                    <span className="predictions-category-predicted">
                      ${formatCurrency(cat.predicted)}
                    </span>
                  </div>
                  <div className="predictions-category-bar-container">
                    <div
                      className="predictions-category-current"
                      style={{
                        width: `${(cat.currentSpent / (cat.predicted || 1)) * 100}%`
                      }}
                    />
                  </div>
                  <div className="predictions-category-meta">
                    <span>Current: ${formatCurrency(cat.currentSpent)}</span>
                    <span>Remaining: ${formatCurrency(Math.max(0, cat.predicted - cat.currentSpent))}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Income Comparison */}
      {monthlyIncome && (
        <div className="predictions-income-comparison">
          <h4>Income Comparison</h4>
          <div className="predictions-income-bar">
            <div className="predictions-income-labels">
              <span>Predicted: ${formatCurrency(prediction.predictedTotal)}</span>
              <span>Income: ${formatCurrency(monthlyIncome)}</span>
            </div>
            <div className="predictions-income-visual">
              <div
                className={`predictions-income-spent ${prediction.exceedsIncome ? 'exceeds' : ''}`}
                style={{
                  width: `${Math.min((prediction.predictedTotal / monthlyIncome) * 100, 100)}%`
                }}
              />
              {prediction.exceedsIncome && (
                <div
                  className="predictions-income-overflow"
                  style={{
                    width: `${((prediction.predictedTotal - monthlyIncome) / monthlyIncome) * 100}%`
                  }}
                />
              )}
            </div>
            <div className="predictions-income-savings">
              {prediction.exceedsIncome ? (
                <span className="predictions-deficit">
                  Deficit: ${formatCurrency(prediction.predictedTotal - monthlyIncome)}
                </span>
              ) : (
                <span className="predictions-surplus">
                  Projected Savings: ${formatCurrency(monthlyIncome - prediction.predictedTotal)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PredictionsView;
