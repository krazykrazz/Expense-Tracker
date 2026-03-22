import { useState } from 'react';
import { formatCAD as formatCurrency } from '../../utils/formatters';
import styles from './AnomalyAlertItem.module.css';

/**
 * Displays a single anomaly alert within the NotificationsSection.
 * Simplified card layout: header (vendor + amount), summary, explanation,
 * typical range, badges, details toggle, and "Got it" / "Mute" actions.
 * Supports both legacy (anomalyType/reason) and enriched/simplified formats.
 * Reads simplified fields first, falls back to enriched fields.
 * _Requirements: 4.1–4.8, 5.1–5.4, 6.1–6.6, 7.1–7.6, 14.2, 14.3, 15.1–15.5_
 */

/** Classification → human-readable label (used as summary fallback) */
const CLASSIFICATION_LABELS = {
  Large_Transaction: 'Large Transaction',
  Category_Spending_Spike: 'Category Spike',
  New_Merchant: 'New Merchant',
  Frequency_Spike: 'Frequency Spike',
  Recurring_Expense_Increase: 'Recurring Increase',
  Seasonal_Deviation: 'Seasonal',
  Emerging_Behavior_Trend: 'Emerging Trend',
};

/** Legacy anomalyType → CSS class + label (backward compat) */
const LEGACY_TYPE_MAP = {
  amount: { style: 'typeAmount', label: 'Unusual Amount' },
  new_merchant: { style: 'typeNewMerchant', label: 'New Merchant' },
  daily_total: { style: 'typeDailyTotal', label: 'High Daily Total' },
};

const getTypeIcon = (type) => {
  switch (type) {
    case 'amount': case 'Large_Transaction': return '💰';
    case 'new_merchant': case 'New_Merchant': return '🆕';
    case 'daily_total': return '📊';
    case 'Category_Spending_Spike': case 'Frequency_Spike': return '📈';
    case 'Recurring_Expense_Increase': return '🔄';
    case 'Seasonal_Deviation': return '🌡️';
    case 'Emerging_Behavior_Trend': return '📉';
    default: return '⚠️';
  }
};

const formatDateLocal = (dateStr) => {
  if (!dateStr) return '';
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

/** Map simplifiedClassification to human-readable badge label */
const SIMPLIFIED_CLASSIFICATION_LABELS = {
  one_time_event: 'One-time event',
  emerging_pattern: 'Emerging pattern',
  recurring_change: 'Recurring change',
};

/** Map severity to CSS class name */
const SEVERITY_CLASS_MAP = {
  low: 'severityLow',
  medium: 'severityMedium',
  high: 'severityHigh',
};

const AnomalyAlertItem = ({ anomaly, onDismiss, onMarkExpected }) => {
  const [loading, setLoading] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  if (!anomaly) return null;

  const { place, amount, anomalyType, reason, date, category } = anomaly;
  const detailsPanelId = `anomaly-details-panel-${anomaly.id}`;
  const isEnriched = !!anomaly.classification;

  // Determine if we have simplified fields (from Alert_Builder)
  const hasSimplifiedFields = !!anomaly.summary;

  // --- Derive display values with fallback ---
  // Summary: prefer simplified, fall back to classification label or anomalyType label
  const summaryText = anomaly.summary
    || (isEnriched && CLASSIFICATION_LABELS[anomaly.classification])
    || (LEGACY_TYPE_MAP[anomalyType]?.label)
    || 'Unusual activity detected';

  // Explanation: prefer simplified explanationText, fall back to reason
  const explanationText = anomaly.explanationText || reason || '';

  // Typical range: simplified field only
  const typicalRange = anomaly.typicalRange || null;

  // Severity: prefer severity, fall back to simplifiedSeverity
  const severity = anomaly.severity || anomaly.simplifiedSeverity || null;
  const severityClass = severity ? SEVERITY_CLASS_MAP[severity] : null;

  // Confidence
  const confidence = anomaly.confidence || null;

  // Simplified classification for badges
  const simplifiedClassification = anomaly.simplifiedClassification || null;

  // Context label for ARIA: prefer place, fall back to category
  const ariaContext = place || category || 'unknown';

  // Enriched fields for Details_Panel
  const { explanation, historicalContext, impactEstimate } = anomaly;
  const hasEnrichedDetails = !!(explanation || historicalContext || impactEstimate);

  const handleCardClick = () => {
    if (anomaly.expenseId) {
      window.dispatchEvent(new CustomEvent('scrollToExpense', {
        detail: { expenseId: anomaly.expenseId }
      }));
    }
  };

  const handleGotIt = async (e) => {
    e.stopPropagation();
    if (loading || !onDismiss) return;
    setLoading(true);
    try {
      await onDismiss(anomaly);
    } finally {
      setLoading(false);
    }
  };

  const handleMute = async (e) => {
    e.stopPropagation();
    if (loading || !onMarkExpected) return;
    setLoading(true);
    try {
      await onMarkExpected(anomaly);
    } finally {
      setLoading(false);
    }
  };

  const handleDetailsToggle = (e) => {
    e.stopPropagation();
    setDetailsExpanded((prev) => !prev);
  };

  // Build root className with severity border
  const rootClasses = [styles.alertItem];
  if (anomaly.expenseId) rootClasses.push(styles.clickable);
  if (severityClass && styles[severityClass]) rootClasses.push(styles[severityClass]);

  // --- LEGACY LAYOUT (no classification AND no simplified fields) ---
  if (!isEnriched && !hasSimplifiedFields) {
    const badgeInfo = LEGACY_TYPE_MAP[anomalyType] || { style: 'typeDefault', label: anomalyType || 'Anomaly' };
    return (
      <div
        className={rootClasses.join(' ')}
        data-testid="anomaly-alert-item"
        onClick={handleCardClick}
        role={anomaly.expenseId ? 'button' : undefined}
        tabIndex={anomaly.expenseId ? 0 : undefined}
        onKeyDown={anomaly.expenseId ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(); } } : undefined}
      >
        <div className={styles.content}>
          <span className={styles.icon} aria-hidden="true">{getTypeIcon(anomalyType)}</span>
          <div className={styles.details}>
            <div className={styles.headerRow}>
              <span className={styles.merchant}>{place || 'Unknown'}</span>
              <span className={`${styles.typeBadge} ${styles[badgeInfo.style] || styles.typeDefault}`}>
                {badgeInfo.label}
              </span>
            </div>
            <div className={styles.meta} data-testid="anomaly-meta">
              {date && <span className={styles.date}>{formatDateLocal(date)}</span>}
              {date && category && <span className={styles.separator}>·</span>}
              {category && <span className={styles.category}>{category}</span>}
            </div>
            <div className={styles.amount} data-testid="anomaly-amount">
              {amount != null ? formatCurrency(amount) : '—'}
            </div>
            {reason && (
              <div className={styles.reason} data-testid="anomaly-reason">{reason}</div>
            )}
            {/* Legacy layout uses old action buttons */}
            <div className={styles.actions}>
              <button
                className={`${styles.actionBtn} ${styles.dismissBtn}`}
                onClick={handleGotIt}
                disabled={loading}
                data-testid="anomaly-dismiss-btn"
                aria-label={`Acknowledge alert for ${ariaContext}`}
              >
                {loading ? '...' : 'Dismiss'}
              </button>
              <button
                className={`${styles.actionBtn} ${styles.markExpectedBtn}`}
                onClick={handleMute}
                disabled={loading}
                data-testid="anomaly-mark-expected-btn"
                aria-label={`Mute alerts like this for ${ariaContext}`}
              >
                {loading ? '...' : 'Mark as Expected'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- SIMPLIFIED CARD LAYOUT (enriched or simplified fields present) ---
  return (
    <div
      className={rootClasses.join(' ')}
      data-testid="anomaly-alert-item"
      onClick={handleCardClick}
      role={anomaly.expenseId ? 'button' : undefined}
      tabIndex={anomaly.expenseId ? 0 : undefined}
      onKeyDown={anomaly.expenseId ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(); } } : undefined}
      aria-label={severity ? `Alert for ${ariaContext}. ${capitalize(severity)} severity` : undefined}
    >
      <div className={styles.content}>
        <div className={styles.details}>
          {/* Header: vendor + amount */}
          <div className={styles.headerRow}>
            <span className={styles.merchant}>{place || category || 'Unknown'}</span>
            <span className={styles.amount} data-testid="anomaly-amount">
              {amount != null ? formatCurrency(amount) : '—'}
            </span>
          </div>

          {/* Summary text */}
          <div className={styles.summaryText} data-testid="anomaly-summary">
            {summaryText}
          </div>

          {/* Explanation text */}
          {explanationText && (
            <div className={styles.explanationText} data-testid="anomaly-explanation-text">
              {explanationText}
            </div>
          )}

          {/* Typical range */}
          {typicalRange && (
            <div className={styles.typicalRange} data-testid="anomaly-typical-range">
              {typicalRange}
            </div>
          )}

          {/* Badges: classification + confidence */}
          <div className={styles.badgeRow} data-testid="anomaly-badges">
            {simplifiedClassification && SIMPLIFIED_CLASSIFICATION_LABELS[simplifiedClassification] && (
              <span className={styles.badge} data-testid="anomaly-classification-badge">
                {SIMPLIFIED_CLASSIFICATION_LABELS[simplifiedClassification]}
              </span>
            )}
            {confidence && (
              <span className={styles.badge} data-testid="anomaly-confidence-badge">
                {capitalize(confidence)} confidence
              </span>
            )}
          </div>

          {/* Details toggle */}
          <button
            className={styles.detailsToggle}
            onClick={handleDetailsToggle}
            aria-expanded={detailsExpanded}
            aria-controls={detailsPanelId}
            data-testid="anomaly-details-toggle"
          >
            {detailsExpanded ? '▴ Details' : '▾ Details'}
          </button>

          {/* Details panel (collapsed by default) */}
          {detailsExpanded && (
            <div className={styles.detailsPanel} id={detailsPanelId} role="region" aria-label="Alert details" data-testid="anomaly-details-panel">
              {severity && (
                <div className={styles.severityText} data-testid="anomaly-severity-text">
                  Severity: {capitalize(severity)}
                </div>
              )}
              {hasEnrichedDetails ? (
                <>
                  {explanation && (
                    <div data-testid="anomaly-detail-explanation">
                      {explanation.observedValue != null && (
                        <div>Observed: {formatCurrency(explanation.observedValue)}</div>
                      )}
                      {explanation.expectedRange && (
                        <div>Expected range: {formatCurrency(explanation.expectedRange.min)}–{formatCurrency(explanation.expectedRange.max)}</div>
                      )}
                      {explanation.comparisonPeriod && (
                        <div>Comparison period: {explanation.comparisonPeriod}</div>
                      )}
                      {explanation.sampleSize != null && (
                        <div>Sample size: {explanation.sampleSize}</div>
                      )}
                      {explanation.deviationPercent != null && (
                        <div>Deviation: {Number(explanation.deviationPercent) > 0 ? '+' : ''}{Number(explanation.deviationPercent).toFixed(1)}%</div>
                      )}
                    </div>
                  )}
                  {historicalContext && (
                    <div data-testid="anomaly-detail-historical">
                      {historicalContext.purchaseRank != null && historicalContext.purchaseRankTotal != null && (
                        <div>{historicalContext.purchaseRank === 1 ? 'Largest' : `${historicalContext.purchaseRank}${getOrdinalSuffix(historicalContext.purchaseRank)} largest`} purchase out of {historicalContext.purchaseRankTotal}</div>
                      )}
                      {historicalContext.percentile != null && (
                        <div>{historicalContext.percentile}th percentile</div>
                      )}
                      {historicalContext.deviationFromAverage != null && (
                        <div>{Number(historicalContext.deviationFromAverage) > 0 ? '+' : ''}{Number(historicalContext.deviationFromAverage).toFixed(1)}% from average</div>
                      )}
                    </div>
                  )}
                  {impactEstimate && (
                    <div data-testid="anomaly-detail-impact">
                      <div>Annualized: {impactEstimate.annualizedChange > 0 ? '+' : ''}{formatCurrency(impactEstimate.annualizedChange)}/yr</div>
                      {impactEstimate.savingsRateChange != null && (
                        <div>Savings rate: {Number(impactEstimate.savingsRateChange) > 0 ? '+' : ''}{Number(impactEstimate.savingsRateChange).toFixed(1)}%</div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div data-testid="anomaly-detail-empty">No additional details available</div>
              )}
            </div>
          )}

          {/* Actions: "✓ Got it" primary + "Mute alerts like this" secondary */}
          <div className={styles.actions}>
            <button
              className={styles.gotItBtn}
              onClick={handleGotIt}
              disabled={loading}
              data-testid="anomaly-got-it-btn"
              aria-label={`Acknowledge alert for ${ariaContext}`}
            >
              {loading ? '...' : '✓ Got it'}
            </button>
            <button
              className={styles.muteLink}
              onClick={handleMute}
              disabled={loading}
              data-testid="anomaly-mute-link"
              aria-label={`Mute alerts like this for ${ariaContext}`}
            >
              Mute alerts like this
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Returns ordinal suffix for a number (1→st, 2→nd, 3→rd, etc.) */
function getOrdinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/** Capitalize first letter */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default AnomalyAlertItem;
