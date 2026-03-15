/**
 * TrendsView Component
 * Consolidated view combining predictions, spending history,
 * recurring patterns, and data quality indicator.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import { useState, useEffect } from 'react';
import './TrendsView.css';
import { getTrends } from '../../services/analyticsApi';
import { formatCurrency, getMonthNameShort } from '../../utils/formatters';

const TrendsView = ({ year, month }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, [year, month]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getTrends(year, month);
      setData(result);
    } catch (err) {
      setError('Unable to load trends data. Please try again.');
      console.error('Error fetching trends:', err);
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
      case 'high': return 'High';
      case 'medium': return 'Medium';
      case 'low': return 'Low';
      default: return level || 'Unknown';
    }
  };

  if (loading) {
    return (
      <div className="trends-view-loading">
        <div className="trends-view-spinner"></div>
        <p>Loading trends...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="trends-view-error">
        <p>{error}</p>
        <button onClick={fetchData} className="trends-view-retry-btn">
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="trends-view-empty">
        <p>No trends data available.</p>
      </div>
    );
  }

  const { prediction, monthlyHistory, recurringPatterns, dataSufficiency, dataQuality } = data;

  // Check if nothing is available
  const nothingAvailable = dataSufficiency &&
    !dataSufficiency.prediction &&
    !dataSufficiency.monthlyHistory &&
    !dataSufficiency.recurringPatterns;

  if (nothingAvailable) {
    return (
      <div className="trends-view">
        {/* Data Quality - always show */}
        {dataQuality && (
          <DataQualityIndicator dataQuality={dataQuality} />
        )}
        <div className="trends-view-empty">
          <p>Not enough data to display trends yet.</p>
          <p className="trends-view-empty-hint">
            Continue tracking expenses to unlock predictions, spending history, and recurring pattern detection.
          </p>
        </div>
      </div>
    );
  }

  const maxHistoryTotal = monthlyHistory && monthlyHistory.length > 0
    ? Math.max(...monthlyHistory.map(m => m.total))
    : 0;

  return (
    <div className="trends-view">
      {/* Data Quality Indicator */}
      {dataQuality && (
        <DataQualityIndicator dataQuality={dataQuality} />
      )}

      {/* End-of-Month Prediction */}
      {dataSufficiency?.prediction && prediction && (
        <div className="trends-view-prediction">
          <h3 className="trends-view-section-title">End-of-Month Prediction</h3>
          <div className="trends-view-prediction-content">
            <div className="trends-view-prediction-main">
              <span className="trends-view-prediction-amount">
                ${formatCurrency(prediction.predictedTotal)}
              </span>
              <span className={`trends-view-prediction-confidence ${getConfidenceClass(prediction.confidenceLevel)}`}>
                {getConfidenceLabel(prediction.confidenceLevel)} confidence
              </span>
            </div>
            <div className="trends-view-prediction-details">
              <div className="trends-view-prediction-detail">
                <span className="trends-view-prediction-label">Current Spent</span>
                <span className="trends-view-prediction-value">${formatCurrency(prediction.currentSpent)}</span>
              </div>
              <div className="trends-view-prediction-detail">
                <span className="trends-view-prediction-label">Days Remaining</span>
                <span className="trends-view-prediction-value">{prediction.daysRemaining}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6-Month Spending History */}
      {dataSufficiency?.monthlyHistory && monthlyHistory && monthlyHistory.length > 0 && (
        <div className="trends-view-history">
          <h3 className="trends-view-section-title">Spending History</h3>
          <div className="trends-view-history-list">
            {monthlyHistory.map((item) => (
              <div key={`${item.year}-${item.month}`} className="trends-view-history-item">
                <span className="trends-view-history-month">
                  {getMonthNameShort(item.month)} {item.year}
                </span>
                <div className="trends-view-history-bar-container">
                  <div
                    className="trends-view-history-bar"
                    style={{ width: maxHistoryTotal > 0 ? `${(item.total / maxHistoryTotal) * 100}%` : '0%' }}
                  />
                </div>
                <span className="trends-view-history-total">${formatCurrency(item.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recurring Patterns */}
      {dataSufficiency?.recurringPatterns && recurringPatterns && recurringPatterns.length > 0 && (
        <div className="trends-view-patterns">
          <h3 className="trends-view-section-title">
            Recurring Patterns
            <span className="trends-view-patterns-count">({recurringPatterns.length})</span>
          </h3>
          <div className="trends-view-patterns-list">
            {recurringPatterns.map((pattern, index) => (
              <div key={`${pattern.merchant}-${index}`} className="trends-view-pattern-item">
                <div className="trends-view-pattern-info">
                  <span className="trends-view-pattern-merchant">{pattern.merchant}</span>
                  <span className="trends-view-pattern-frequency">{pattern.frequency}</span>
                </div>
                <div className="trends-view-pattern-stats">
                  <span className="trends-view-pattern-amount">${formatCurrency(pattern.averageAmount)}</span>
                  <span className="trends-view-pattern-occurrences">{pattern.occurrences}x</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/** Data Quality Indicator sub-component */
const DataQualityIndicator = ({ dataQuality }) => (
  <div className="trends-view-quality">
    <div className="trends-view-quality-header">
      <span className="trends-view-quality-label">Data Quality</span>
      <span className="trends-view-quality-score">{dataQuality.score}%</span>
    </div>
    <div className="trends-view-quality-meter">
      <div
        className="trends-view-quality-fill"
        style={{ width: `${dataQuality.score}%` }}
      />
    </div>
    <span className="trends-view-quality-months">
      {dataQuality.monthsOfData} month{dataQuality.monthsOfData !== 1 ? 's' : ''} of data
    </span>
  </div>
);

export default TrendsView;
