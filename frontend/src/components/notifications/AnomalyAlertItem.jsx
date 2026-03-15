import React, { useState } from 'react';
import { formatCAD as formatCurrency } from '../../utils/formatters';
import './AnomalyAlertItem.css';

/**
 * Displays a single anomaly alert within the NotificationsSection.
 * Two action buttons: "Dismiss" and "Mark as Expected".
 * Both buttons disabled while one action is processing.
 * _Requirements: 8.1, 8.2, 8.4, 8.5, 8.6, 8.7_
 */
const AnomalyAlertItem = ({ anomaly, onDismiss, onMarkExpected }) => {
  const [loading, setLoading] = useState(false);

  if (!anomaly) return null;

  const { merchant, amount, type, reason } = anomaly;

  const getTypeLabel = (anomalyType) => {
    switch (anomalyType) {
      case 'amount': return 'Unusual Amount';
      case 'new_merchant': return 'New Merchant';
      case 'daily_total': return 'High Daily Total';
      default: return anomalyType || 'Anomaly';
    }
  };

  const getTypeIcon = (anomalyType) => {
    switch (anomalyType) {
      case 'amount': return '💰';
      case 'new_merchant': return '🆕';
      case 'daily_total': return '📊';
      default: return '⚠️';
    }
  };

  const handleDismiss = async (e) => {
    e.stopPropagation();
    if (loading || !onDismiss) return;
    setLoading(true);
    try {
      await onDismiss(anomaly);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkExpected = async (e) => {
    e.stopPropagation();
    if (loading || !onMarkExpected) return;
    setLoading(true);
    try {
      await onMarkExpected(anomaly);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="anomaly-alert-item"
      data-testid="anomaly-alert-item"
    >
      <div className="anomaly-alert-content">
        <span className="anomaly-alert-icon" aria-hidden="true">
          {getTypeIcon(type)}
        </span>
        <div className="anomaly-alert-details">
          <div className="anomaly-alert-header-row">
            <span className="anomaly-alert-merchant">{merchant}</span>
            <span className={`anomaly-alert-type-badge anomaly-type-${type || 'default'}`}>
              {getTypeLabel(type)}
            </span>
          </div>
          <div className="anomaly-alert-amount" data-testid="anomaly-amount">
            {formatCurrency(amount)}
          </div>
          {reason && (
            <div className="anomaly-alert-reason" data-testid="anomaly-reason">
              {reason}
            </div>
          )}
          <div className="anomaly-alert-actions">
            <button
              className="anomaly-action-btn anomaly-dismiss-btn"
              onClick={handleDismiss}
              disabled={loading}
              data-testid="anomaly-dismiss-btn"
              aria-label={`Dismiss anomaly for ${merchant}`}
            >
              {loading ? '...' : 'Dismiss'}
            </button>
            <button
              className="anomaly-action-btn anomaly-mark-expected-btn"
              onClick={handleMarkExpected}
              disabled={loading}
              data-testid="anomaly-mark-expected-btn"
              aria-label={`Mark anomaly as expected for ${merchant}`}
            >
              {loading ? '...' : 'Mark as Expected'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnomalyAlertItem;
