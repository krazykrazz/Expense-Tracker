/**
 * Event Grouping Detector
 *
 * Identifies related anomalies within a 48-hour window that match
 * real-world event themes (travel, moving, home purchase, holiday)
 * and consolidates them into single event-level alerts.
 *
 * Runs after cluster aggregation in the detection pipeline,
 * providing a tighter grouping pass for event-level consolidation.
 */

const { EVENT_GROUPING_CONFIG } = require('../utils/analyticsConstants');
const logger = require('../config/logger');

/**
 * Detect event groups among anomalies.
 *
 * @param {Array} anomalies - Enriched anomaly objects with date, category, amount, place, expenseId
 * @returns {{ eventGroups: Array, ungrouped: Array }}
 *   eventGroups — array of EventGroup objects (theme, anomalies, totalAmount, transactionCount, dateRange, alert)
 *   ungrouped  — anomalies not part of any event group
 */
function detectEventGroups(anomalies) {
  if (!Array.isArray(anomalies) || anomalies.length === 0) {
    return { eventGroups: [], ungrouped: [] };
  }

  const windowMs = EVENT_GROUPING_CONFIG.WINDOW_HOURS * 60 * 60 * 1000;
  const minGroupSize = EVENT_GROUPING_CONFIG.MIN_GROUP_SIZE;
  const themes = EVENT_GROUPING_CONFIG.THEMES;

  // Sort by date ascending
  const sorted = [...anomalies].sort((a, b) => new Date(a.date) - new Date(b.date));

  const grouped = new Set(); // expenseIds already assigned to a group
  const eventGroups = [];

  for (let i = 0; i < sorted.length; i++) {
    const anchor = sorted[i];
    if (grouped.has(anchor.expenseId)) continue;

    const anchorTime = new Date(anchor.date).getTime();

    // Collect candidates within the 48-hour window from this anchor
    const candidates = [anchor];
    for (let j = i + 1; j < sorted.length; j++) {
      const other = sorted[j];
      if (grouped.has(other.expenseId)) continue;
      const otherTime = new Date(other.date).getTime();
      if (otherTime - anchorTime > windowMs) break; // sorted, so no more within window
      candidates.push(other);
    }

    if (candidates.length < minGroupSize) continue;

    // Try to match candidates against each theme (first match wins)
    const matchedGroup = _matchTheme(candidates, themes, grouped, minGroupSize);
    if (matchedGroup) {
      eventGroups.push(matchedGroup);
      for (const a of matchedGroup.anomalies) {
        grouped.add(a.expenseId);
      }
    }
  }

  const ungrouped = anomalies.filter(a => !grouped.has(a.expenseId));

  return { eventGroups, ungrouped };
}


/**
 * Try to match a set of candidates against event themes.
 * Returns the first matching EventGroup or null.
 *
 * @param {Array} candidates - anomalies within the 48h window
 * @param {Object} themes - EVENT_GROUPING_CONFIG.THEMES
 * @param {Set} grouped - expenseIds already assigned
 * @param {number} minGroupSize - minimum anomalies to form a group
 * @returns {Object|null} EventGroup or null
 */
function _matchTheme(candidates, themes, grouped, minGroupSize) {
  for (const themeKey of Object.keys(themes)) {
    const theme = themes[themeKey];

    // Month constraint check (e.g., Holiday restricted to December)
    if (theme.monthConstraint != null) {
      const hasValidMonth = candidates.some(a => {
        const month = new Date(a.date).getMonth() + 1; // 1-indexed
        return month === theme.monthConstraint;
      });
      if (!hasValidMonth) continue;
    }

    // Filter candidates whose category matches this theme
    const themeCategories = new Set(theme.categories.map(c => c.toLowerCase()));
    const matching = candidates.filter(a => {
      if (grouped.has(a.expenseId)) return false;
      const cat = (a.category || '').toLowerCase();
      return themeCategories.has(cat);
    });

    if (matching.length >= minGroupSize) {
      return _buildEventGroup(theme.label, matching);
    }
  }
  return null;
}

/**
 * Build an EventGroup object from matched anomalies.
 *
 * @param {string} themeLabel - e.g. 'Travel_Event'
 * @param {Array} anomalies - constituent anomaly objects
 * @returns {Object} EventGroup with theme, anomalies, totalAmount, transactionCount, dateRange, alert
 */
function _buildEventGroup(themeLabel, anomalies) {
  const totalAmount = anomalies.reduce((sum, a) => sum + (a.amount || 0), 0);
  const transactionCount = anomalies.length;

  const dates = anomalies.map(a => a.date).sort();
  const dateRange = { start: dates[0], end: dates[dates.length - 1] };

  const transactions = anomalies.map(a => ({
    expenseId: a.expenseId,
    place: a.place,
    amount: a.amount,
    date: a.date,
    category: a.category
  }));

  // Build an alert object that looks like a regular anomaly so it flows through the pipeline
  const alert = {
    id: 'event_' + themeLabel + '_' + Date.now(),
    expenseId: anomalies[0].expenseId, // use first anomaly's expenseId as anchor
    date: dateRange.end,
    place: themeLabel.replace(/_/g, ' '),
    amount: totalAmount,
    category: anomalies[0].category,
    anomalyType: 'event_group',
    classification: themeLabel,
    severity: _highestSeverity(anomalies),
    reason: themeLabel.replace(/_/g, ' ') + ': ' + transactionCount + ' transactions totaling $' + totalAmount.toFixed(2),
    summary: themeLabel.replace(/_/g, ' '),
    explanationText: transactionCount + ' related transactions ($' + totalAmount.toFixed(2) + ') from ' + dateRange.start + ' to ' + dateRange.end,
    typicalRange: null,
    simplifiedClassification: 'one_time_event',
    confidence: 'medium',
    dismissed: false,
    eventGroup: {
      theme: themeLabel,
      totalAmount,
      transactionCount,
      dateRange,
      transactions
    }
  };

  return {
    theme: themeLabel,
    anomalies,
    totalAmount,
    transactionCount,
    dateRange,
    alert
  };
}

/**
 * Determine the highest severity among a set of anomalies.
 *
 * @param {Array} anomalies
 * @returns {string} 'high', 'medium', or 'low'
 */
function _highestSeverity(anomalies) {
  const order = { high: 3, medium: 2, low: 1 };
  let max = 0;
  let result = 'low';
  for (const a of anomalies) {
    const val = order[(a.severity || 'low').toLowerCase()] || 0;
    if (val > max) {
      max = val;
      result = a.severity;
    }
  }
  return result;
}

module.exports = { detectEventGroups };
