import React, { useState } from 'react';
import { formatCAD as formatCurrency } from '../../utils/formatters';
import './AnomalyAlertItem.css';

/**
 * Displays a single anomaly alert within the NotificationsSection.
 * Two action buttons: "Dismiss" and "Mark as Expected".
 * Both buttons disabled while one action is processing.
 * Clicking the card body navigates to the expense in the expense list.
 * Backend fields: expenseId, date, place, amount, category, anomalyType, reason, severity
 * _Requirements: 8.1, 8.2, 8.4, 8.5, 8.6, 8.7_
 */
const AnomalyAlertItem = ({ anomaly, onDismiss, onMarkExpected }) => {
  const [loading, setLoading] = useState(false);

  if (!anomaly) return null;

  const { place, amount, anomalyType, reason, date, category } = anomaly;

  const getTypeLabel = (type) => {
    switch (type) {
      case 'amount': return 'Unusual Amount';
      case 'new_merchant': return 'New Merchant';
      case 'daily_total': return 'High Daily Total';
      default: return type || 'Anomaly';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'amount': return '💰';
      case 'new_merchant': return '🆕';
      case 'daily_total': return '📊';
      default: return '⚠️';
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const handleCardClick = () => {
    if (anomaly.expenseId) {
      window.dispatchEvent(new CustomEvent('scrollToExpense', {
        detail: { expenseId: anomaly.expenseId }
      }));
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
      className={`anomaly-alert-item ${anomaly.expenseId ? 'anomaly-clickable' : ''}`}
      data-testid="anomaly-alert-item"
      onClick={handleCardClick}
      role={anomaly.expenseId ? 'button' : undefined}
      tabIndex={anomaly.expenseId ? 0 : undefined}
      onKeyDown={anomaly.expenseId ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(); } } : undefined}
    >
      <div className="anomaly-alert-content">
        <span className="anomaly-alert-icon" aria-hidden="true">
          {getTypeIcon(anomalyType)}
        </span>
        <div className="anomaly-alert-details">
          <div className="anomaly-alert-header-row">
            <span className="anomaly-alert-merchant">{place || 'Unknown'}</span>
            <span className={`anomaly-alert-type-badge anomaly-type-${anomalyType || 'default'}`}>
              {getTypeLabel(anomalyType)}
            </span>
          </div>
          <div className="anomaly-alert-meta" data-testid="anomaly-meta">
            {date && <span className="anomaly-alert-date">{formatDate(date)}</span>}
            {date && category && <span className="anomaly-alert-separator">·</span>}
            {category && <span className="anomaly-alert-category">{category}</span>}
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
              aria-label={`Dismiss anomaly for ${place || 'unknown'}`}
            >
              {loading ? '...' : 'Dismiss'}
            </button>
            <button
              className="anomaly-action-btn anomaly-mark-expected-btn"
              onClick={handleMarkExpected}
              disabled={loading}
              data-testid="anomaly-mark-expected-btn"
              aria-label={`Mark anomaly as expected for ${place || 'unknown'}`}
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
