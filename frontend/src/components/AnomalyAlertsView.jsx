/**
 * AnomalyAlertsView Component
 * Displays detected spending anomalies with dismiss functionality.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { useState, useEffect } from 'react';
import './AnomalyAlertsView.css';
import { getAnomalies, dismissAnomaly } from '../services/analyticsApi';
import { formatCurrency, formatLocalDate } from '../utils/formatters';

const AnomalyAlertsView = ({ onDismiss }) => {
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dismissing, setDismissing] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchAnomalies();
  }, []);

  const fetchAnomalies = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAnomalies();
      setAnomalies(data || []);
    } catch (err) {
      setError('Unable to load anomalies. Please try again.');
      console.error('Error fetching anomalies:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async (expenseId) => {
    setDismissing(expenseId);
    try {
      await dismissAnomaly(expenseId);
      // Remove from local state
      setAnomalies(prev => prev.filter(a => a.expenseId !== expenseId));
      if (onDismiss) {
        onDismiss(expenseId);
      }
    } catch (err) {
      console.error('Error dismissing anomaly:', err);
      setError('Failed to dismiss anomaly. Please try again.');
    } finally {
      setDismissing(null);
    }
  };

  const getAnomalyTypeLabel = (type) => {
    switch (type) {
      case 'amount': return 'Unusual Amount';
      case 'daily_total': return 'High Daily Spending';
      case 'new_merchant': return 'New Merchant';
      default: return type;
    }
  };

  const getAnomalyTypeIcon = (type) => {
    switch (type) {
      case 'amount': return '💰';
      case 'daily_total': return '📊';
      case 'new_merchant': return '🆕';
      default: return '⚠️';
    }
  };

  const getSeverityClass = (severity) => {
    switch (severity) {
      case 'high': return 'severity-high';
      case 'medium': return 'severity-medium';
      case 'low': return 'severity-low';
      default: return '';
    }
  };

  const getSeverityLabel = (severity) => {
    switch (severity) {
      case 'high': return 'High';
      case 'medium': return 'Medium';
      case 'low': return 'Low';
      default: return severity;
    }
  };

  const filteredAnomalies = anomalies.filter(a => {
    if (filter === 'all') return true;
    return a.anomalyType === filter;
  });

  const anomalyCounts = {
    all: anomalies.length,
    amount: anomalies.filter(a => a.anomalyType === 'amount').length,
    daily_total: anomalies.filter(a => a.anomalyType === 'daily_total').length,
    new_merchant: anomalies.filter(a => a.anomalyType === 'new_merchant').length
  };

  if (loading) {
    return (
      <div className="anomaly-loading">
        <div className="anomaly-spinner"></div>
        <p>Scanning for anomalies...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="anomaly-error">
        <p>{error}</p>
        <button onClick={fetchAnomalies} className="anomaly-retry-btn">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="anomaly-view">
      {/* Summary Stats */}
      <div className="anomaly-summary">
        <div className="anomaly-summary-stat">
          <span className="anomaly-summary-count">{anomalies.length}</span>
          <span className="anomaly-summary-label">Total Anomalies</span>
        </div>
        <div className="anomaly-summary-stat severity-high">
          <span className="anomaly-summary-count">
            {anomalies.filter(a => a.severity === 'high').length}
          </span>
          <span className="anomaly-summary-label">High Severity</span>
        </div>
        <div className="anomaly-summary-stat severity-medium">
          <span className="anomaly-summary-count">
            {anomalies.filter(a => a.severity === 'medium').length}
          </span>
          <span className="anomaly-summary-label">Medium Severity</span>
        </div>
        <div className="anomaly-summary-stat severity-low">
          <span className="anomaly-summary-count">
            {anomalies.filter(a => a.severity === 'low').length}
          </span>
          <span className="anomaly-summary-label">Low Severity</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="anomaly-filters">
        <button
          className={`anomaly-filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({anomalyCounts.all})
        </button>
        <button
          className={`anomaly-filter-btn ${filter === 'amount' ? 'active' : ''}`}
          onClick={() => setFilter('amount')}
        >
          💰 Amount ({anomalyCounts.amount})
        </button>
        <button
          className={`anomaly-filter-btn ${filter === 'daily_total' ? 'active' : ''}`}
          onClick={() => setFilter('daily_total')}
        >
          📊 Daily ({anomalyCounts.daily_total})
        </button>
        <button
          className={`anomaly-filter-btn ${filter === 'new_merchant' ? 'active' : ''}`}
          onClick={() => setFilter('new_merchant')}
        >
          🆕 New Merchant ({anomalyCounts.new_merchant})
        </button>
      </div>

      {/* Anomaly List */}
      {filteredAnomalies.length === 0 ? (
        <div className="anomaly-empty">
          <div className="anomaly-empty-icon">✅</div>
          <p>No anomalies detected!</p>
          <p className="anomaly-empty-hint">
            {filter === 'all'
              ? 'Your spending patterns look normal.'
              : `No ${getAnomalyTypeLabel(filter).toLowerCase()} anomalies found.`}
          </p>
        </div>
      ) : (
        <div className="anomaly-list">
          {filteredAnomalies.map((anomaly) => (
            <div
              key={anomaly.id || anomaly.expenseId}
              className={`anomaly-card ${getSeverityClass(anomaly.severity)}`}
            >
              <div className="anomaly-card-header">
                <div className="anomaly-type">
                  <span className="anomaly-type-icon">
                    {getAnomalyTypeIcon(anomaly.anomalyType)}
                  </span>
                  <span className="anomaly-type-label">
                    {getAnomalyTypeLabel(anomaly.anomalyType)}
                  </span>
                </div>
                <div className={`anomaly-severity ${getSeverityClass(anomaly.severity)}`}>
                  {getSeverityLabel(anomaly.severity)}
                </div>
              </div>

              <div className="anomaly-card-body">
                <div className="anomaly-expense-info">
                  <div className="anomaly-place">
                    {anomaly.anomalyType === 'daily_total' && anomaly.expenseCount > 1
                      ? `${anomaly.expenseCount} expenses on this day`
                      : anomaly.place}
                  </div>
                  <div className="anomaly-meta">
                    <span className="anomaly-date">{formatLocalDate(anomaly.date)}</span>
                    <span className="anomaly-category">{anomaly.category}</span>
                  </div>
                </div>

                <div className="anomaly-amount-section">
                  <div className="anomaly-amount">
                    {formatCurrency(anomaly.amount)}
                  </div>
                  {anomaly.categoryAverage > 0 && (
                    <div className="anomaly-comparison">
                      <span className="anomaly-comparison-label">Category avg:</span>
                      <span className="anomaly-comparison-value">
                        {formatCurrency(anomaly.categoryAverage)}
                      </span>
                    </div>
                  )}
                  {anomaly.standardDeviations > 0 && (
                    <div className="anomaly-deviation">
                      {anomaly.standardDeviations.toFixed(1)}σ above average
                    </div>
                  )}
                </div>
              </div>

              <div className="anomaly-reason">
                <span className="anomaly-reason-icon">ℹ️</span>
                <span className="anomaly-reason-text">{anomaly.reason}</span>
              </div>

              <div className="anomaly-card-actions">
                <button
                  className="anomaly-dismiss-btn"
                  onClick={() => handleDismiss(anomaly.expenseId)}
                  disabled={dismissing === anomaly.expenseId}
                >
                  {dismissing === anomaly.expenseId ? (
                    <>
                      <span className="anomaly-dismiss-spinner"></span>
                      Dismissing...
                    </>
                  ) : (
                    <>
                      <span className="anomaly-dismiss-icon">✓</span>
                      Mark as Expected
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Footer */}
      <div className="anomaly-info">
        <p>
          <strong>Tip:</strong> Dismissing an anomaly teaches the system that this spending is expected.
          Future similar expenses won't be flagged.
        </p>
      </div>
    </div>
  );
};

export default AnomalyAlertsView;
