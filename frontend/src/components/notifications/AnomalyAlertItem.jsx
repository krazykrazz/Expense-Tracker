import React, { useState } from 'react';
import { formatCAD as formatCurrency } from '../../utils/formatters';
import styles from './AnomalyAlertItem.module.css';

/**
 * Displays a single anomaly alert within the NotificationsSection.
 * Supports both legacy (anomalyType/reason) and enriched (classification/explanation/etc) formats.
 * Two action buttons: "Dismiss" and "Mark as Expected".
 * Both buttons disabled while one action is processing.
 * Clicking the card body navigates to the expense in the expense list.
 * _Requirements: 1.5, 2.6, 3.9, 4.6, 5.5, 7.4, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.5, 12.1-12.7, 16.7, 16.8_
 */

/** Classification → CSS class + human-readable label */
const CLASSIFICATION_MAP = {
  Large_Transaction: { style: 'classLargeTransaction', label: 'Large Transaction' },
  Category_Spending_Spike: { style: 'classCategorySpendingSpike', label: 'Category Spike' },
  New_Merchant: { style: 'classNewMerchant', label: 'New Merchant' },
  Frequency_Spike: { style: 'classFrequencySpike', label: 'Frequency Spike' },
  Recurring_Expense_Increase: { style: 'classRecurringExpenseIncrease', label: 'Recurring Increase' },
  Seasonal_Deviation: { style: 'classSeasonalDeviation', label: 'Seasonal' },
  Emerging_Behavior_Trend: { style: 'classEmergingBehaviorTrend', label: 'Emerging Trend' },
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

const AnomalyAlertItem = ({ anomaly, onDismiss, onMarkExpected }) => {
  const [loading, setLoading] = useState(false);
  const [clusterExpanded, setClusterExpanded] = useState(false);

  if (!anomaly) return null;

  const { place, amount, anomalyType, reason, date, category } = anomaly;
  const isEnriched = !!anomaly.classification;
  const isCluster = !!anomaly.cluster;
  const isDrift = !!anomaly._driftData;

  // Badge: use classification if enriched, fall back to legacy anomalyType
  const getBadgeInfo = () => {
    if (isEnriched && CLASSIFICATION_MAP[anomaly.classification]) {
      return CLASSIFICATION_MAP[anomaly.classification];
    }
    return LEGACY_TYPE_MAP[anomalyType] || { style: 'typeDefault', label: anomalyType || 'Anomaly' };
  };

  const badgeInfo = getBadgeInfo();
  const iconType = isEnriched ? anomaly.classification : anomalyType;

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

  const handleClusterToggle = (e) => {
    e.stopPropagation();
    setClusterExpanded((prev) => !prev);
  };

  // Build root className
  const rootClasses = [styles.alertItem];
  if (anomaly.expenseId) rootClasses.push(styles.clickable);
  if (isCluster) rootClasses.push(styles.clusterAlert);
  if (isDrift) rootClasses.push(styles.driftAlert);

  // --- Render action buttons ---
  const renderActions = () => (
    <div className={styles.actions}>
      <button
        className={`${styles.actionBtn} ${styles.dismissBtn}`}
        onClick={handleDismiss}
        disabled={loading}
        data-testid="anomaly-dismiss-btn"
        aria-label={`Dismiss anomaly for ${place || 'unknown'}`}
      >
        {loading ? '...' : 'Dismiss'}
      </button>
      <button
        className={`${styles.actionBtn} ${styles.markExpectedBtn}`}
        onClick={handleMarkExpected}
        disabled={loading}
        data-testid="anomaly-mark-expected-btn"
        aria-label={`Mark anomaly as expected for ${place || 'unknown'}`}
      >
        {loading ? '...' : 'Mark as Expected'}
      </button>
    </div>
  );

  // --- LEGACY LAYOUT (no classification/explanation) ---
  if (!isEnriched) {
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
              {formatCurrency(amount)}
            </div>
            {reason && (
              <div className={styles.reason} data-testid="anomaly-reason">{reason}</div>
            )}
            {renderActions()}
          </div>
        </div>
      </div>
    );
  }

  // --- ENRICHED LAYOUT ---
  const { explanation, historicalContext, impactEstimate, behaviorPattern, confidence } = anomaly;

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
        <span className={styles.icon} aria-hidden="true">{getTypeIcon(iconType)}</span>
        <div className={styles.details}>
          {/* Header */}
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
            {formatCurrency(amount)}
          </div>

          {/* Explanation section */}
          {explanation && (
            <div className={styles.explanationSection} data-testid="anomaly-explanation">
              <span className={styles.sectionLabel}>Why this was flagged</span>
              <div className={styles.sectionValue}>
                Observed: {formatCurrency(explanation.observedValue)} vs Expected: {formatCurrency(explanation.expectedRange?.min)}–{formatCurrency(explanation.expectedRange?.max)}
                {explanation.deviationPercent != null && ` (${explanation.deviationPercent > 0 ? '+' : ''}${explanation.deviationPercent.toFixed(1)}%)`}
              </div>
              {explanation.comparisonPeriod && (
                <div>Compared to: {explanation.comparisonPeriod}</div>
              )}
            </div>
          )}

          {/* Historical context */}
          {historicalContext && (
            <div className={styles.historicalSection} data-testid="anomaly-historical">
              <span className={styles.sectionLabel}>Historical Context</span>
              <div className={styles.sectionValue}>
                {historicalContext.purchaseRank != null && historicalContext.purchaseRankTotal != null && (
                  <span>{historicalContext.purchaseRank === 1 ? 'Largest' : `${historicalContext.purchaseRank}${getOrdinalSuffix(historicalContext.purchaseRank)} largest`} purchase out of {historicalContext.purchaseRankTotal}</span>
                )}
                {historicalContext.percentile != null && (
                  <span>{historicalContext.purchaseRank != null ? ' · ' : ''}{historicalContext.percentile}th percentile</span>
                )}
                {historicalContext.deviationFromAverage != null && (
                  <span>{(historicalContext.purchaseRank != null || historicalContext.percentile != null) ? ' · ' : ''}{historicalContext.deviationFromAverage > 0 ? '+' : ''}{historicalContext.deviationFromAverage.toFixed(1)}% from average</span>
                )}
              </div>
              {historicalContext.frequency && (
                <div>{historicalContext.frequency}</div>
              )}
            </div>
          )}

          {/* Impact estimate */}
          {impactEstimate && (
            <div className={styles.impactSection} data-testid="anomaly-impact">
              <span className={styles.sectionLabel}>Estimated Impact</span>
              <div className={styles.sectionValue}>
                Annualized: {impactEstimate.annualizedChange > 0 ? '+' : ''}{formatCurrency(impactEstimate.annualizedChange)}/yr
                {impactEstimate.savingsRateChange != null && (
                  <span> · Savings rate: {impactEstimate.savingsRateChange > 0 ? '+' : ''}{impactEstimate.savingsRateChange.toFixed(1)}%</span>
                )}
              </div>
              {impactEstimate.budgetImpact && (
                <div>
                  At this pace, {category} will exceed its {formatCurrency(impactEstimate.budgetImpact.budgetLimit)} budget by {formatCurrency(Math.abs(impactEstimate.budgetImpact.projectedOverage))}
                </div>
              )}
            </div>
          )}

          {/* Cluster transactions */}
          {isCluster && anomaly.cluster.transactions && (
            <div className={styles.clusterTransactions} data-testid="anomaly-cluster">
              <div className={styles.clusterHeader}>
                <span>{anomaly.cluster.label?.replace(/_/g, ' ')} — {anomaly.cluster.transactionCount} transactions, {formatCurrency(anomaly.cluster.totalAmount)}</span>
                <button
                  className={styles.clusterToggle}
                  onClick={handleClusterToggle}
                  aria-expanded={clusterExpanded}
                  aria-label={clusterExpanded ? 'Collapse transactions' : 'Expand transactions'}
                >
                  {clusterExpanded ? '▲ Hide' : '▼ Show'} transactions
                </button>
              </div>
              {clusterExpanded && anomaly.cluster.transactions.map((t, i) => (
                <div className={styles.clusterTransaction} key={t.expenseId || i}>
                  <span>{t.place} — {formatDateLocal(t.date)}</span>
                  <span>{formatCurrency(t.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Drift periods */}
          {isDrift && anomaly._driftData && (
            <div className={styles.driftPeriods} data-testid="anomaly-drift">
              Recent: {formatCurrency(anomaly._driftData.recentAvg)}/mo → Previous: {formatCurrency(anomaly._driftData.precedingAvg)}/mo
              {anomaly._driftData.percentageIncrease != null && (
                <span> (+{anomaly._driftData.percentageIncrease.toFixed(1)}%)</span>
              )}
            </div>
          )}

          {/* Budget suggestion */}
          {anomaly.budgetSuggestion && (
            <div className={styles.budgetSuggestion} data-testid="anomaly-budget-suggestion">
              {anomaly.budgetSuggestion.action === 'create_budget'
                ? `Consider creating a budget for ${anomaly.budgetSuggestion.category}: ${formatCurrency(anomaly.budgetSuggestion.suggestedLimit)}/mo`
                : `Consider adjusting a budget for ${anomaly.budgetSuggestion.category}: ${formatCurrency(anomaly.budgetSuggestion.suggestedLimit)}/mo`}
            </div>
          )}

          {/* Legacy reason — only if no explanation */}
          {!explanation && reason && (
            <div className={styles.reason} data-testid="anomaly-reason">{reason}</div>
          )}

          {/* Footer section */}
          <div className={styles.footerSection} data-testid="anomaly-footer">
            <div>
              {behaviorPattern && (
                <span data-testid="anomaly-behavior-pattern">
                  {behaviorPattern.replace(/_/g, ' ')}
                </span>
              )}
              {confidence && (
                <span
                  className={`${styles.confidenceIndicator} ${styles[`confidence${capitalize(confidence)}`] || ''}`}
                  data-testid="anomaly-confidence"
                >
                  {behaviorPattern ? ' · ' : ''}{capitalize(confidence)} confidence
                </span>
              )}
            </div>
            {renderActions()}
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
