/**
 * AnomalyDetectionService
 * 
 * Detects unusual spending patterns by comparing expenses against
 * historical baselines. Identifies amount anomalies, daily total anomalies,
 * and new merchant anomalies.
 * 
 * Supports two-action anomaly response (Dismiss / Mark as Expected) with
 * persistent suppression rules for smart learning.
 * 
 * Part of the Spending Patterns & Predictions feature.
 */

const expenseRepository = require('../repositories/expenseRepository');
const budgetService = require('./budgetService');
const dbHelper = require('../utils/dbHelper');
const activityLogService = require('./activityLogService');
const logger = require('../config/logger');
const { detectEventGroups } = require('./eventGroupingDetector');
const { 
  ANALYTICS_CONFIG, 
  ANOMALY_TYPES,
  SEVERITY_LEVELS,
  DETECTION_THRESHOLDS,
  ANOMALY_CLASSIFICATIONS,
  LEGACY_TYPE_MAP,
  BEHAVIOR_PATTERNS,
  CONFIDENCE_LEVELS,
  THROTTLE_CONFIG,
  CLUSTER_LABELS,
  SUPPRESSION_CONFIG,
  CLUSTER_GAP_MULTIPLIER,
  ALERT_TEXT_LIMITS,
  ALERT_TYPE_PRIORITY
} = require('../utils/analyticsConstants');

class AnomalyDetectionService {
  constructor() {
    // Cache for dismissed expense IDs (loaded from database on first use)
    this._dismissedExpenseIdsCache = null;
    // Cache for dismissed anomaly types (category-level, null expenseId)
    this._dismissedAnomalyTypesCache = null;
    // Cache for vendor baselines (computed per detection cycle)
    this._vendorBaselineCache = null;
  }

  /**
   * Convert a classification enum value to a human-readable label.
   * E.g., 'Category_Spending_Spike' → 'Category Spending Spike'
   * Falls back to the raw value if not a string.
   * @param {string} classification - The classification enum value
   * @returns {string} Human-readable label
   * @private
   */
  _classificationLabel(classification) {
    if (!classification || typeof classification !== 'string') return 'unknown';
    return classification.replace(/_/g, ' ');
  }

  /**
   * Resolve the classification for an anomaly action.
   * Prefers expenseDetails.classification, falls back to LEGACY_TYPE_MAP lookup,
   * then to the raw anomalyType.
   * @param {string} anomalyType - The legacy anomaly type
   * @param {Object} [expenseDetails] - Optional expense details that may contain classification
   * @returns {string|null} The resolved classification value
   * @private
   */
  _resolveClassification(anomalyType, expenseDetails) {
    if (expenseDetails && expenseDetails.classification) {
      return expenseDetails.classification;
    }
    if (anomalyType && LEGACY_TYPE_MAP[anomalyType]) {
      return LEGACY_TYPE_MAP[anomalyType];
    }
    return null;
  }

  /**
   * Fire-and-forget activity log helper.
   * Safely calls activityLogService.logEvent and silently catches errors.
   * @private
   */
  _logActivity(...args) {
    try {
      const result = activityLogService.logEvent(...args);
      if (result && typeof result.catch === 'function') {
        result.catch(err => logger.error('Activity log failed:', err));
      }
    } catch (err) {
      logger.error('Activity log failed:', err);
    }
  }

  /**
   * Load dismissed expense IDs from database
   * @returns {Promise<Set<number>>}
   */
  async _loadDismissedExpenseIds() {
    if (this._dismissedExpenseIdsCache !== null) {
      return this._dismissedExpenseIdsCache;
    }

    try {
      const rows = await dbHelper.queryAll('SELECT expense_id, anomaly_type FROM dismissed_anomalies');
      this._dismissedExpenseIdsCache = new Set(
        rows.filter(r => r.expense_id != null).map(r => r.expense_id)
      );
      // Cache category-level dismissals (null expense_id) keyed by anomaly_type
      this._dismissedAnomalyTypesCache = new Set(
        rows.filter(r => r.expense_id == null && r.anomaly_type).map(r => r.anomaly_type)
      );
      logger.debug('Loaded ' + this._dismissedExpenseIdsCache.size + ' dismissed anomalies and ' + this._dismissedAnomalyTypesCache.size + ' dismissed anomaly types from database');
    } catch (err) {
      logger.error('Error loading dismissed anomalies:', err);
      this._dismissedExpenseIdsCache = new Set();
      this._dismissedAnomalyTypesCache = new Set();
    }

    return this._dismissedExpenseIdsCache;
  }

  /**
   * Calculate baseline statistics for a category
   * @param {string} category - The expense category
   * @returns {Promise<{category: string, mean: number, stdDev: number, count: number, monthsWithData: number, hasValidBaseline: boolean, monthlyAverages: Object.<string, number>, transactionCounts: Object.<string, number>}>}
   */
  async calculateCategoryBaseline(category) {
    try {
      const expenses = await expenseRepository.findAll();
      
      if (!expenses || expenses.length === 0) {
        return { category, mean: 0, stdDev: 0, count: 0, monthsWithData: 0, hasValidBaseline: false, monthlyAverages: {}, transactionCounts: {} };
      }

      const categoryExpenses = expenses.filter(e => e.type === category);
      
      if (categoryExpenses.length === 0) {
        return { category, mean: 0, stdDev: 0, count: 0, monthsWithData: 0, hasValidBaseline: false, monthlyAverages: {}, transactionCounts: {} };
      }

      const expensesByMonth = this._groupExpensesByMonth(categoryExpenses);
      const monthsWithData = Object.keys(expensesByMonth).length;

      // Compute monthly totals and transaction counts
      const monthlyAverages = {};
      const transactionCounts = {};
      const monthlyTotals = [];
      for (const [monthKey, monthExpenses] of Object.entries(expensesByMonth)) {
        const monthTotal = parseFloat(monthExpenses.reduce((sum, e) => sum + e.amount, 0).toFixed(2));
        monthlyAverages[monthKey] = monthTotal;
        transactionCounts[monthKey] = monthExpenses.length;
        monthlyTotals.push(monthTotal);
      }

      // mean/stdDev are computed from monthly totals (not per-transaction amounts)
      // so that "You usually spend $X/mo" messages are accurate
      const mean = monthlyTotals.length > 0
        ? monthlyTotals.reduce((sum, t) => sum + t, 0) / monthlyTotals.length
        : 0;
      const squaredDiffs = monthlyTotals.map(t => Math.pow(t - mean, 2));
      const variance = squaredDiffs.length > 0
        ? squaredDiffs.reduce((sum, d) => sum + d, 0) / squaredDiffs.length
        : 0;
      const stdDev = Math.sqrt(variance);

      // Per-transaction stats for amount-level anomaly detection
      const transactionAmounts = categoryExpenses.map(e => e.amount);
      const transactionMean = transactionAmounts.reduce((sum, a) => sum + a, 0) / transactionAmounts.length;
      const txSquaredDiffs = transactionAmounts.map(a => Math.pow(a - transactionMean, 2));
      const txVariance = txSquaredDiffs.reduce((sum, d) => sum + d, 0) / transactionAmounts.length;
      const transactionStdDev = Math.sqrt(txVariance);

      return {
        category,
        mean: parseFloat(mean.toFixed(2)),
        stdDev: parseFloat(stdDev.toFixed(2)),
        transactionMean: parseFloat(transactionMean.toFixed(2)),
        transactionStdDev: parseFloat(transactionStdDev.toFixed(2)),
        count: transactionAmounts.length,
        monthsWithData,
        hasValidBaseline: transactionAmounts.length >= ANALYTICS_CONFIG.MIN_OCCURRENCES_FOR_PATTERN,
        monthlyAverages,
        transactionCounts
      };
    } catch (error) {
      logger.error('Error calculating category baseline:', error);
      throw error;
    }
  }

  /**
   * Group expenses by year-month
   * @param {Array} expenses - Array of expense objects
   * @returns {Object} Object with 'YYYY-MM' keys and expense arrays
   */
  _groupExpensesByMonth(expenses) {
    const grouped = {};
    for (const expense of expenses) {
      const date = new Date(expense.date);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const key = year + '-' + month;
      if (!grouped[key]) { grouped[key] = []; }
      grouped[key].push(expense);
    }
    return grouped;
  }

  /**
   * Detect all types of anomalies in recent expenses
   * @param {Object} options - { lookbackDays: 30 }
   * @returns {Promise<Array<Anomaly>>}
   */
  async detectAnomalies(options = {}) {
    try {
      const lookbackDays = options.lookbackDays || 30;
      const expenses = await expenseRepository.findAll();
      
      if (!expenses || expenses.length === 0) { return []; }

      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);
      const lookbackDateStr = lookbackDate.toISOString().split('T')[0];
      const recentExpenses = expenses.filter(e => e.date >= lookbackDateStr);
      
      if (recentExpenses.length === 0) { return []; }

      // ─── Budget Data Fetch ──────────────────────────────────────────────
      // Clear all caches at start of detection cycle (including dismissed caches
      // so multi-device dismissals are picked up on next detection)
      this._budgetDataCache = undefined;
      this._vendorBaselineCache = null;
      this._dismissedExpenseIdsCache = null;
      this._dismissedAnomalyTypesCache = null;
      let budgetData = null;
      try {
        budgetData = await this._fetchBudgetData();
      } catch (err) {
        logger.warn('Budget data fetch failed at start of detection cycle:', err);
        budgetData = null;
      }

      // ─── Vendor Baseline Computation ────────────────────────────────────
      try {
        this._vendorBaselineCache = this._buildVendorBaselines(expenses);
      } catch (err) {
        logger.error('Vendor baseline computation failed:', err);
        this._vendorBaselineCache = new Map();
      }

      const anomalies = [];

      const amountAnomalies = await this._detectAmountAnomalies(recentExpenses, expenses);
      anomalies.push(...amountAnomalies);

      const dailyAnomalies = await this._detectDailyTotalAnomalies(recentExpenses, expenses);
      anomalies.push(...dailyAnomalies);

      const merchantAnomalies = await this._detectNewMerchantAnomalies(recentExpenses, expenses);
      anomalies.push(...merchantAnomalies);

      // Category spending spike detection
      try {
        const categorySpikes = await this._detectCategorySpendingSpikes(recentExpenses, expenses);
        anomalies.push(...categorySpikes);
      } catch (err) {
        logger.error('Category spending spike detector failed:', err);
      }

      // Frequency spike detection
      try {
        const frequencySpikes = await this._detectFrequencySpikes(recentExpenses, expenses);
        anomalies.push(...frequencySpikes);
      } catch (err) {
        logger.error('Frequency spike detector failed:', err);
      }

      // Recurring expense increase detection
      try {
        const recurringIncreases = await this._detectRecurringExpenseIncreases(recentExpenses, expenses);
        anomalies.push(...recurringIncreases);
      } catch (err) {
        logger.error('Recurring expense increase detector failed:', err);
      }

      // Seasonal deviation detection
      try {
        const seasonalDeviations = await this._detectSeasonalDeviations(recentExpenses, expenses);
        anomalies.push(...seasonalDeviations);
      } catch (err) {
        logger.error('Seasonal deviation detector failed:', err);
      }

      // Behavioral drift detection
      try {
        const behavioralDrift = await this._detectBehavioralDrift(expenses);
        anomalies.push(...behavioralDrift);
      } catch (err) {
        logger.error('Behavioral drift detector failed:', err);
      }

      // New Spending Tier detection
      try {
        const newSpendingTier = this._detectNewSpendingTier(recentExpenses, expenses);
        anomalies.push(...newSpendingTier);
      } catch (err) {
        logger.error('New spending tier detector failed:', err);
      }

      // Vendor frequency spike detection (interval-based)
      try {
        const vendorFrequencySpikes = this._detectVendorFrequencySpikes(recentExpenses, expenses);
        anomalies.push(...vendorFrequencySpikes);
      } catch (err) {
        logger.error('Vendor frequency spike detector failed:', err);
      }

      // ─── ID Assignment Phase ──────────────────────────────────────────
      // Assign globally unique IDs after all detectors have run.
      // Individual detectors use local counters (anomalies.length + 1) or
      // Date.now()-based IDs which can collide once merged.  Overwrite with
      // a simple monotonic sequence so every anomaly has a distinct integer.
      for (let i = 0; i < anomalies.length; i++) {
        anomalies[i].id = i + 1;
      }

      // ─── Enrichment Phase ───────────────────────────────────────────────
      // Build category baseline cache for enrichment
      const baselineCache = {};
      for (const anomaly of anomalies) {
        try {
          // Step 1: Classify
          try {
            this._classifyAnomaly(anomaly, expenses);
          } catch (err) {
            logger.warn('Classification failed for anomaly ' + anomaly.id + ':', err);
            anomaly.classification = anomaly.classification || LEGACY_TYPE_MAP[anomaly.anomalyType] || ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION;
          }

          // Step 2: Build explanation (needs baseline)
          try {
            if (!baselineCache[anomaly.category]) {
              baselineCache[anomaly.category] = await this.calculateCategoryBaseline(anomaly.category);
            }
            anomaly.explanation = this._buildExplanation(anomaly, baselineCache[anomaly.category]);
          } catch (err) {
            logger.warn('Explanation build failed for anomaly ' + anomaly.id + ':', err);
            anomaly.explanation = { typeLabel: '', observedValue: 0, expectedRange: { min: 0, max: 0 }, deviationPercent: 0, comparisonPeriod: '' };
          }

          // Step 3: Build historical context
          try {
            anomaly.historicalContext = this._buildHistoricalContext(anomaly, expenses);
          } catch (err) {
            logger.warn('Historical context build failed for anomaly ' + anomaly.id + ':', err);
            anomaly.historicalContext = { purchaseRank: null, purchaseRankTotal: null, percentile: null, deviationFromAverage: 0, frequency: null };
          }

          // Step 4: Estimate impact
          try {
            anomaly.impactEstimate = this._estimateImpact(anomaly, expenses, budgetData, null);
          } catch (err) {
            logger.warn('Impact estimation failed for anomaly ' + anomaly.id + ':', err);
            anomaly.impactEstimate = { annualizedChange: 0, savingsRateChange: null, budgetImpact: null };
          }

          // Step 5: Assign behavior pattern
          try {
            anomaly.behaviorPattern = this._assignBehaviorPattern(anomaly, expenses, anomalies);
          } catch (err) {
            logger.warn('Behavior pattern assignment failed for anomaly ' + anomaly.id + ':', err);
            anomaly.behaviorPattern = BEHAVIOR_PATTERNS.ONE_TIME_EVENT;
          }

          // Step 6: Score confidence
          try {
            anomaly.confidence = this._scoreConfidence(anomaly, expenses);
          } catch (err) {
            logger.warn('Confidence scoring failed for anomaly ' + anomaly.id + ':', err);
            anomaly.confidence = CONFIDENCE_LEVELS.LOW;
          }
        } catch (err) {
          // Outer catch: if the entire enrichment for this anomaly fails, apply all defaults
          logger.warn('Enrichment pipeline failed for anomaly ' + anomaly.id + ':', err);
          anomaly.classification = anomaly.classification || LEGACY_TYPE_MAP[anomaly.anomalyType] || ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION;
          anomaly.explanation = anomaly.explanation || { typeLabel: '', observedValue: 0, expectedRange: { min: 0, max: 0 }, deviationPercent: 0, comparisonPeriod: '' };
          anomaly.historicalContext = anomaly.historicalContext || { purchaseRank: null, purchaseRankTotal: null, percentile: null, deviationFromAverage: 0, frequency: null };
          anomaly.impactEstimate = anomaly.impactEstimate || { annualizedChange: 0, savingsRateChange: null, budgetImpact: null };
          anomaly.behaviorPattern = anomaly.behaviorPattern || BEHAVIOR_PATTERNS.ONE_TIME_EVENT;
          anomaly.confidence = anomaly.confidence || CONFIDENCE_LEVELS.LOW;
        }
      }

      // ─── Alert_Builder Phase ────────────────────────────────────────────
      // Attach plain-language summary, explanation, typical range, and
      // simplified classification to each anomaly for the frontend card layout.
      const BEHAVIOR_TO_SIMPLIFIED = {
        [BEHAVIOR_PATTERNS.ONE_TIME_EVENT]: 'one_time_event',
        [BEHAVIOR_PATTERNS.RECURRING_CHANGE]: 'recurring_change',
        [BEHAVIOR_PATTERNS.EMERGING_TREND]: 'emerging_pattern'
      };

      for (const anomaly of anomalies) {
        try {
          anomaly.summary = this._buildSummaryText(anomaly);
          anomaly.explanationText = this._buildExplanationText(anomaly, baselineCache[anomaly.category]);
          anomaly.typicalRange = this._buildTypicalRange(anomaly);
          anomaly.simplifiedClassification = BEHAVIOR_TO_SIMPLIFIED[anomaly.behaviorPattern] || 'one_time_event';
        } catch (err) {
          logger.warn('Alert builder failed for anomaly ' + anomaly.id + ':', err);
          anomaly.summary = anomaly.summary || 'Unusual activity detected';
          anomaly.explanationText = anomaly.explanationText || '';
          anomaly.typicalRange = anomaly.typicalRange || null;
          anomaly.simplifiedClassification = anomaly.simplifiedClassification || 'one_time_event';
        }
      }

      // ─── Filtering Phase ──────────────────────────────────────────────
      // Execute in order: cluster aggregation → event grouping → benign pattern suppression →
      // budget-aware suppression → frequency controls → dismissed/suppression rule filtering

      // Step 1: Cluster aggregation
      let filteredAnomalies = anomalies;
      try {
        filteredAnomalies = this._aggregateClusters(filteredAnomalies);
      } catch (err) {
        logger.error('Cluster aggregation failed in pipeline:', err);
      }

      // Step 1b: Event grouping — consolidate 48h event groups after cluster aggregation
      try {
        const { eventGroups, ungrouped } = detectEventGroups(filteredAnomalies);
        filteredAnomalies = [...ungrouped, ...eventGroups.map(g => g.alert)];

        // Log activity for each detected event group
        for (const group of eventGroups) {
          try {
            this._logActivity(
              'event_group_detected',
              'anomaly',
              null,
              'Detected ' + group.theme + ' event: ' + group.transactionCount + ' transactions totaling $' + group.totalAmount.toFixed(2),
              {
                event_theme: group.theme,
                transaction_count: group.transactionCount,
                total_amount: group.totalAmount,
                date_range: { start: group.dateRange.start, end: group.dateRange.end }
              }
            );
          } catch (logErr) {
            logger.warn('Activity log failed for event group:', logErr);
          }
        }
      } catch (err) {
        logger.error('Event grouping failed in pipeline:', err);
        // Continue with ungrouped set on failure
      }

      // Step 2: Benign pattern suppression
      try {
        filteredAnomalies = this._suppressBenignPatterns(filteredAnomalies, expenses);
      } catch (err) {
        logger.error('Benign pattern suppression failed in pipeline:', err);
      }

      // Step 3: Budget-aware suppression
      try {
        filteredAnomalies = this._suppressBudgetCovered(filteredAnomalies, budgetData);
      } catch (err) {
        logger.error('Budget-aware suppression failed in pipeline:', err);
      }

      // Step 3b: Attach budget suggestions to drift alerts
      try {
        filteredAnomalies = this._attachBudgetSuggestions(filteredAnomalies, budgetData);
      } catch (err) {
        logger.error('Budget suggestion attachment failed in pipeline:', err);
      }

      // Step 4: Frequency controls
      try {
        filteredAnomalies = this._applyFrequencyControls(filteredAnomalies);
      } catch (err) {
        logger.error('Frequency controls failed in pipeline:', err);
      }

      // Step 5: Filter out dismissed anomalies
      const dismissedExpenseIds = await this._loadDismissedExpenseIds();
      const dismissedAnomalyTypes = this._dismissedAnomalyTypesCache || new Set();
      filteredAnomalies = filteredAnomalies.filter(a => {
        // Category-level anomalies (null expenseId): filter by anomaly_type
        if (a.expenseId == null) {
          return !dismissedAnomalyTypes.has(a.anomalyType);
        }
        // Transaction-level anomalies: filter by expenseId
        return !dismissedExpenseIds.has(a.expenseId);
      });

      // Step 6: Apply suppression rules to filter out matching anomalies
      try {
        const rules = await this.getSuppressionRules();
        if (rules.length > 0) {
          filteredAnomalies = this._applySuppressionRules(filteredAnomalies, rules);
        }
      } catch (err) {
        logger.error('Error applying suppression rules during anomaly detection:', err);
      }

      // Sort by date descending
      filteredAnomalies.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Re-assign unique IDs after filtering/consolidation (cluster aggregation
      // and event grouping create new objects with potentially colliding IDs)
      for (let i = 0; i < filteredAnomalies.length; i++) {
        filteredAnomalies[i].id = i + 1;
      }

      return filteredAnomalies;
    } catch (error) {
      logger.error('Error detecting anomalies:', error);
      throw error;
    }
  }

  /**
   * Detect amount anomalies using vendor-percentile approach when sufficient
   * vendor history exists, falling back to category-level stdDev otherwise.
   */
  async _detectAmountAnomalies(recentExpenses, allExpenses) {
    const anomalies = [];
    const categoryBaselines = {};
    const vendorCache = this._vendorBaselineCache || new Map();

    for (const expense of recentExpenses) {
      const vendorKey = (expense.place || '').toLowerCase();
      const vendorBaseline = vendorCache.get(vendorKey);

      // Vendor-percentile path: vendor has sufficient history
      if (vendorBaseline && vendorBaseline.transactionCount >= DETECTION_THRESHOLDS.MIN_VENDOR_TRANSACTIONS) {
        if (expense.amount > vendorBaseline.p95) {
          // Check cluster exclusion — if amount falls within a known cluster, skip
          const clusters = this._computeAmountClusters(vendorBaseline.sortedAmounts);
          const insideCluster = clusters.some(c => expense.amount >= c.min && expense.amount <= c.max);
          if (!insideCluster) {
            const ratio = vendorBaseline.p95 > 0 ? (expense.amount - vendorBaseline.p95) / vendorBaseline.p95 : 0;
            const severity = this._calculateSeverity(ratio > 5 ? 5 : ratio > 4 ? 4 : ratio > 3 ? 3.5 : 3.1);
            anomalies.push({
              id: anomalies.length + 1,
              expenseId: expense.id,
              date: expense.date,
              place: expense.place,
              amount: expense.amount,
              category: expense.type,
              anomalyType: ANOMALY_TYPES.AMOUNT,
              reason: 'Amount ' + expense.amount.toFixed(2) + ' exceeds vendor p95 of ' + vendorBaseline.p95.toFixed(2) + ' at "' + expense.place + '"',
              severity,
              categoryAverage: vendorBaseline.medianAmount,
              standardDeviations: parseFloat(ratio.toFixed(2)),
              dismissed: false
            });
          }
        }
        continue;
      }

      // Category-level fallback: insufficient vendor history
      if (!categoryBaselines[expense.type]) {
        categoryBaselines[expense.type] = await this.calculateCategoryBaseline(expense.type);
      }
      const baseline = categoryBaselines[expense.type];
      // Use per-transaction stats for amount-level anomaly detection
      const txMean = baseline.transactionMean != null ? baseline.transactionMean : baseline.mean;
      const txStdDev = baseline.transactionStdDev != null ? baseline.transactionStdDev : baseline.stdDev;
      if (!baseline.hasValidBaseline || txStdDev === 0) { continue; }

      const deviations = (expense.amount - txMean) / txStdDev;

      if (deviations > ANALYTICS_CONFIG.ANOMALY_STD_DEVIATIONS) {
        const severity = this._calculateSeverity(deviations);
        anomalies.push({
          id: anomalies.length + 1,
          expenseId: expense.id,
          date: expense.date,
          place: expense.place,
          amount: expense.amount,
          category: expense.type,
          anomalyType: ANOMALY_TYPES.AMOUNT,
          reason: 'Amount ' + expense.amount.toFixed(2) + ' is ' + deviations.toFixed(1) + ' standard deviations above the category average of ' + txMean.toFixed(2),
          severity,
          categoryAverage: baseline.mean,
          standardDeviations: parseFloat(deviations.toFixed(2)),
          dismissed: false
        });
      }
    }
    return anomalies;
  }

  /**
   * Detect daily total anomalies (days with spending > 2x daily average)
   */
  async _detectDailyTotalAnomalies(recentExpenses, allExpenses) {
    const anomalies = [];
    const dailyTotals = this._calculateDailyTotals(allExpenses);
    const dailyValues = Object.values(dailyTotals);
    if (dailyValues.length === 0) { return []; }

    const dailyAverage = dailyValues.reduce((sum, d) => sum + d, 0) / dailyValues.length;
    const threshold = dailyAverage * ANALYTICS_CONFIG.DAILY_ANOMALY_MULTIPLIER;
    const recentDailyTotals = this._calculateDailyTotals(recentExpenses);

    for (const [date, total] of Object.entries(recentDailyTotals)) {
      if (total > threshold) {
        const dayExpenses = recentExpenses.filter(e => e.date === date);
        const expenseCount = dayExpenses.length;
        const multiplier = total / dailyAverage;
        const severity = this._calculateDailySeverity(multiplier);
        const highestExpense = dayExpenses.reduce((max, e) => e.amount > max.amount ? e : max, dayExpenses[0]);

        anomalies.push({
          id: anomalies.length + 1,
          expenseId: highestExpense.id,
          date: date,
          place: highestExpense.place,
          amount: total,
          category: 'Multiple',
          anomalyType: ANOMALY_TYPES.DAILY_TOTAL,
          reason: expenseCount + ' expense' + (expenseCount > 1 ? 's' : '') + ' totaling ' + total.toFixed(2) + ' (' + multiplier.toFixed(1) + 'x daily avg of ' + dailyAverage.toFixed(2) + ')',
          severity,
          categoryAverage: dailyAverage,
          standardDeviations: multiplier,
          expenseCount: expenseCount,
          dismissed: false
        });
      }
    }
    return anomalies;
  }

  /**
   * Calculate daily spending totals
   */
  _calculateDailyTotals(expenses) {
    const dailyTotals = {};
    for (const expense of expenses) {
      if (!dailyTotals[expense.date]) { dailyTotals[expense.date] = 0; }
      dailyTotals[expense.date] += expense.amount;
    }
    return dailyTotals;
  }

  /**
   * Detect new merchant anomalies (first-time visits with unusually high amounts)
   */
  async _detectNewMerchantAnomalies(recentExpenses, allExpenses) {
    const anomalies = [];
    const firstVisitAmounts = this._calculateFirstVisitAmounts(allExpenses);
    if (firstVisitAmounts.length === 0) { return []; }

    const mean = firstVisitAmounts.reduce((sum, a) => sum + a, 0) / firstVisitAmounts.length;
    const variance = firstVisitAmounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / firstVisitAmounts.length;
    const stdDev = Math.sqrt(variance);
    const threshold = mean + (stdDev * 2);

    const historicalMerchants = new Set();
    const recentDates = new Set(recentExpenses.map(e => e.date));
    for (const expense of allExpenses) {
      if (!recentDates.has(expense.date)) {
        historicalMerchants.add((expense.place || '').toLowerCase());
      }
    }

    for (const expense of recentExpenses) {
      const merchantKey = (expense.place || '').toLowerCase();
      if (historicalMerchants.has(merchantKey)) { continue; }

      const merchantExpenses = recentExpenses.filter(e => (e.place || '').toLowerCase() === merchantKey);
      const firstVisit = merchantExpenses.reduce((first, e) => e.date < first.date ? e : first, merchantExpenses[0]);
      if (expense.id !== firstVisit.id) { continue; }

      if (expense.amount > threshold) {
        const deviations = stdDev > 0 ? (expense.amount - mean) / stdDev : 0;
        const severity = this._calculateSeverity(deviations);
        anomalies.push({
          id: anomalies.length + 1,
          expenseId: expense.id,
          date: expense.date,
          place: expense.place,
          amount: expense.amount,
          category: expense.type,
          anomalyType: ANOMALY_TYPES.NEW_MERCHANT,
          reason: 'First visit to "' + expense.place + '" with amount ' + expense.amount.toFixed(2) + ' exceeds typical first-visit amount of ' + mean.toFixed(2),
          severity,
          categoryAverage: mean,
          standardDeviations: parseFloat(deviations.toFixed(2)),
          dismissed: false
        });
      }
    }
    return anomalies;
  }

  /**
   * Detect category spending spikes — flags when a category's current month total
   * exceeds the historical monthly average by more than CATEGORY_SPIKE_THRESHOLD (50%).
   * @param {Array} recentExpenses - Expenses within the lookback window
   * @param {Array} allExpenses - All historical expenses
   * @returns {Promise<Array<Object>>} Array of raw anomaly objects
   */
  async _detectCategorySpendingSpikes(recentExpenses, allExpenses) {
    try {
      const anomalies = [];

      // Determine current month key from the most recent expense date
      const now = new Date();
      const currentMonthKey = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padStart(2, '0');

      // Group recent expenses by category and compute current month totals
      const currentMonthTotals = {};
      for (const expense of recentExpenses) {
        const expenseDate = new Date(expense.date);
        const expenseMonthKey = expenseDate.getFullYear() + '-' + (expenseDate.getMonth() + 1).toString().padStart(2, '0');
        if (expenseMonthKey !== currentMonthKey) { continue; }
        if (!currentMonthTotals[expense.type]) { currentMonthTotals[expense.type] = 0; }
        currentMonthTotals[expense.type] += expense.amount;
      }

      // Get unique categories that have current month spending
      const categories = Object.keys(currentMonthTotals);

      for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        const currentMonthTotal = currentMonthTotals[category];

        // Build baseline from all expenses for this category
        const categoryExpenses = allExpenses.filter(e => e.type === category);
        const expensesByMonth = this._groupExpensesByMonth(categoryExpenses);

        // Compute monthly totals for historical months (exclude current month)
        const historicalMonthTotals = [];
        for (const [monthKey, monthExpenses] of Object.entries(expensesByMonth)) {
          if (monthKey === currentMonthKey) { continue; }
          const monthTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
          historicalMonthTotals.push(monthTotal);
        }

        // Need at least 1 historical month to compare against
        if (historicalMonthTotals.length === 0) { continue; }

        const historicalAvg = historicalMonthTotals.reduce((sum, t) => sum + t, 0) / historicalMonthTotals.length;

        // Skip if historical average is zero (avoid division by zero)
        if (historicalAvg === 0) { continue; }

        const deviation = (currentMonthTotal - historicalAvg) / historicalAvg;

        if (deviation > DETECTION_THRESHOLDS.CATEGORY_SPIKE_THRESHOLD) {
          const severity = this._calculateCategorySpikeSeverity(deviation);
          anomalies.push({
            id: Date.now() + i,
            expenseId: null,
            date: currentMonthKey + '-01',
            place: category,
            amount: currentMonthTotal,
            category: category,
            anomalyType: 'category_spending_spike',
            classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE,
            severity: severity,
            dismissed: false,
            categoryAverage: parseFloat(historicalAvg.toFixed(2)),
            standardDeviations: 0
          });
        }
      }

      return anomalies;
    } catch (error) {
      logger.error('Category spending spike detector failed:', error);
      return [];
    }
  }

  /**
   * Calculate severity for category spending spikes based on deviation percentage.
   * @param {number} deviation - The fractional deviation (e.g. 0.75 = 75% above avg)
   * @returns {string} Severity level
   * @private
   */
  _calculateCategorySpikeSeverity(deviation) {
    if (deviation >= 2.0) { return SEVERITY_LEVELS.HIGH; }
    if (deviation >= 1.0) { return SEVERITY_LEVELS.MEDIUM; }
    return SEVERITY_LEVELS.LOW;
  }

  /**
   * Detect frequency spikes — flags when a category's current month transaction count
   * exceeds the historical monthly average count by more than FREQUENCY_SPIKE_THRESHOLD (100%).
   * @param {Array} recentExpenses - Expenses within the lookback window
   * @param {Array} allExpenses - All historical expenses
   * @returns {Promise<Array<Object>>} Array of raw anomaly objects
   */
  async _detectFrequencySpikes(recentExpenses, allExpenses) {
    try {
      const anomalies = [];

      // Determine current month key
      const now = new Date();
      const currentMonthKey = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padStart(2, '0');

      // Count current month transactions per category and sum amounts for context
      const currentMonthCounts = {};
      const currentMonthTotals = {};
      for (const expense of recentExpenses) {
        const expenseDate = new Date(expense.date);
        const expenseMonthKey = expenseDate.getFullYear() + '-' + (expenseDate.getMonth() + 1).toString().padStart(2, '0');
        if (expenseMonthKey !== currentMonthKey) { continue; }
        if (!currentMonthCounts[expense.type]) { currentMonthCounts[expense.type] = 0; }
        if (!currentMonthTotals[expense.type]) { currentMonthTotals[expense.type] = 0; }
        currentMonthCounts[expense.type] += 1;
        currentMonthTotals[expense.type] += expense.amount;
      }

      const categories = Object.keys(currentMonthCounts);

      for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        const currentMonthCount = currentMonthCounts[category];
        const currentMonthTotal = currentMonthTotals[category];

        // Build baseline from all expenses for this category
        const categoryExpenses = allExpenses.filter(e => e.type === category);
        const expensesByMonth = this._groupExpensesByMonth(categoryExpenses);

        // Compute monthly transaction counts for historical months (exclude current month)
        const historicalMonthCounts = [];
        for (const [monthKey, monthExpenses] of Object.entries(expensesByMonth)) {
          if (monthKey === currentMonthKey) { continue; }
          historicalMonthCounts.push(monthExpenses.length);
        }

        // Need at least 1 historical month to compare against
        if (historicalMonthCounts.length === 0) { continue; }

        const historicalAvgCount = historicalMonthCounts.reduce((sum, c) => sum + c, 0) / historicalMonthCounts.length;

        // Skip if historical average is zero (avoid division by zero)
        if (historicalAvgCount === 0) { continue; }

        const deviation = (currentMonthCount - historicalAvgCount) / historicalAvgCount;

        if (deviation > DETECTION_THRESHOLDS.FREQUENCY_SPIKE_THRESHOLD) {
          const severity = this._calculateFrequencySpikeSeverity(deviation);
          anomalies.push({
            id: Date.now() + i,
            expenseId: null,
            date: currentMonthKey + '-01',
            place: category,
            amount: parseFloat(currentMonthTotal.toFixed(2)),
            category: category,
            anomalyType: 'frequency_spike',
            classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE,
            severity: severity,
            dismissed: false,
            categoryAverage: parseFloat(historicalAvgCount.toFixed(2)),
            standardDeviations: 0
          });
        }
      }

      return anomalies;
    } catch (error) {
      logger.error('Frequency spike detector failed:', error);
      return [];
    }
  }

  /**
   * Calculate severity for frequency spikes based on deviation percentage.
   * @param {number} deviation - The fractional deviation (e.g. 1.5 = 150% above avg)
   * @returns {string} Severity level
   * @private
   */
  _calculateFrequencySpikeSeverity(deviation) {
    if (deviation >= 3.0) { return SEVERITY_LEVELS.HIGH; }
    if (deviation >= 2.0) { return SEVERITY_LEVELS.MEDIUM; }
    return SEVERITY_LEVELS.LOW;
  }

  /**
   * Detect recurring expense increases — flags when a recurring merchant's most recent
   * amount exceeds the average of the previous 2 occurrences by more than
   * RECURRING_INCREASE_THRESHOLD (20%).
   * @param {Array} recentExpenses - Expenses within the lookback window
   * @param {Array} allExpenses - All historical expenses
   * @returns {Promise<Array<Object>>} Array of raw anomaly objects
   */
  async _detectRecurringExpenseIncreases(recentExpenses, allExpenses) {
    try {
      const anomalies = [];
      const recentIds = new Set(recentExpenses.map(e => e.id));

      // Step 1: Group all expenses by merchant (place field)
      const merchantGroups = {};
      for (const expense of allExpenses) {
        const merchant = expense.place || '';
        if (!merchant) { continue; }
        if (!merchantGroups[merchant]) { merchantGroups[merchant] = []; }
        merchantGroups[merchant].push(expense);
      }

      let index = 0;

      // Step 2: For each merchant with 3+ transactions, sort by date ascending
      for (const merchant of Object.keys(merchantGroups)) {
        const transactions = merchantGroups[merchant];
        if (transactions.length < 3) { continue; }

        transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

        const mostRecent = transactions[transactions.length - 1];

        // Only flag if the most recent transaction is within the lookback window
        if (!recentIds.has(mostRecent.id)) { continue; }

        // Step 3: Find the recurring pattern the most recent transaction belongs to.
        // Use gap-based clustering: sort amounts, split where consecutive values
        // differ by more than 1.8×, then find which cluster the most recent
        // transaction falls into. This separates distinct recurring charges at the
        // same merchant (e.g., a $495 monthly fee vs. $25 one-off purchases).
        // Compare only against the matching cluster's history.
        const patternCluster = this._findRecurringPattern(transactions);

        if (!patternCluster || patternCluster.length < 3) { continue; }

        // The most recent transaction must belong to this pattern
        const mostRecentInCluster = patternCluster[patternCluster.length - 1];
        if (mostRecentInCluster.id !== mostRecent.id) { continue; }

        // Baseline: median of all prior transactions in the same pattern cluster
        const priorAmounts = patternCluster.slice(0, -1).map(t => t.amount).sort((a, b) => a - b);
        const mid = Math.floor(priorAmounts.length / 2);
        const baselineMedian = priorAmounts.length % 2 !== 0
          ? priorAmounts[mid]
          : (priorAmounts[mid - 1] + priorAmounts[mid]) / 2;

        if (baselineMedian === 0) { continue; }

        const deviation = (mostRecent.amount - baselineMedian) / baselineMedian;

        // Step 4: Flag if >20% increase
        if (deviation > DETECTION_THRESHOLDS.RECURRING_INCREASE_THRESHOLD) {
          const severity = this._calculateRecurringIncreaseSeverity(deviation);
          anomalies.push({
            id: Date.now() + index,
            expenseId: mostRecent.id,
            date: mostRecent.date,
            place: merchant,
            amount: mostRecent.amount,
            category: mostRecent.type,
            anomalyType: 'recurring_expense_increase',
            classification: ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE,
            severity: severity,
            dismissed: false,
            categoryAverage: parseFloat(baselineMedian.toFixed(2)),
            standardDeviations: 0
          });
          index++;
        }
      }

      return anomalies;
    } catch (error) {
      logger.error('Recurring expense increase detector failed:', error);
      return [];
    }
  }

  /**
   * Compute a percentile value from a sorted array using linear interpolation.
   * index = (p/100) × (n-1), interpolate between floor and ceil values.
   * @param {Array<number>} sorted - Sorted ascending array of numbers
   * @param {number} p - Percentile (0-100)
   * @returns {number} The interpolated percentile value
   * @private
   */
  _percentile(sorted, p) {
    if (sorted.length === 1) { return sorted[0]; }
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) { return sorted[lower]; }
    const fraction = index - lower;
    return sorted[lower] + fraction * (sorted[upper] - sorted[lower]);
  }

  /**
   * Build vendor-level statistical baselines from all expenses.
   * Groups expenses by place (case-insensitive, lowercase key) and computes
   * percentiles, average amount, average days between transactions, and stores
   * sorted amounts and last transaction date for each vendor.
   * @param {Array} allExpenses - All historical expenses
   * @returns {Map<string, Object>} Map of vendor key to VendorBaseline object
   * @private
   */
  _buildVendorBaselines(allExpenses) {
    const vendorMap = new Map();

    // Group expenses by vendor (case-insensitive)
    for (const expense of allExpenses) {
      const key = (expense.place || '').toLowerCase();
      if (!key) { continue; }
      if (!vendorMap.has(key)) { vendorMap.set(key, []); }
      vendorMap.get(key).push(expense);
    }

    const baselines = new Map();

    for (const [vendor, expenses] of vendorMap) {
      const sortedAmounts = expenses.map(e => e.amount).sort((a, b) => a - b);
      const n = sortedAmounts.length;

      const p25 = this._percentile(sortedAmounts, 25);
      const medianAmount = this._percentile(sortedAmounts, 50);
      const p75 = this._percentile(sortedAmounts, 75);
      const p95 = this._percentile(sortedAmounts, 95);
      const maxAmount = sortedAmounts[n - 1];
      const avgAmount = sortedAmounts.reduce((sum, a) => sum + a, 0) / n;

      // Compute average days between transactions
      let avgDaysBetweenTransactions = null;
      const sortedDates = expenses.map(e => e.date).sort();
      let lastTransactionDate = sortedDates[sortedDates.length - 1];

      if (n >= 2) {
        const earliest = new Date(sortedDates[0]);
        const latest = new Date(sortedDates[sortedDates.length - 1]);
        const daySpan = (latest - earliest) / (1000 * 60 * 60 * 24);
        avgDaysBetweenTransactions = daySpan / (n - 1);
      }

      baselines.set(vendor, {
        vendor,
        transactionCount: n,
        medianAmount,
        p25,
        p75,
        p95,
        maxAmount,
        avgAmount,
        avgDaysBetweenTransactions,
        sortedAmounts,
        lastTransactionDate
      });
    }

    this._vendorBaselineCache = baselines;
    return baselines;
  }

  /**
   * Compute amount-based clusters from a sorted array of amounts.
   * Splits where consecutive values differ by more than CLUSTER_GAP_MULTIPLIER × the previous value.
   * @param {Array<number>} sortedAmounts - Sorted ascending array of amounts
   * @returns {Array<{min: number, max: number}>} Array of cluster range objects
   * @private
   */
  _computeAmountClusters(sortedAmounts) {
    if (!sortedAmounts || sortedAmounts.length === 0) { return []; }

    const clusterRanges = [];
    let rangeStart = sortedAmounts[0];
    let rangeEnd = sortedAmounts[0];

    for (let i = 1; i < sortedAmounts.length; i++) {
      if (rangeEnd > 0 && sortedAmounts[i] > rangeEnd * CLUSTER_GAP_MULTIPLIER) {
        // Gap detected — close current range and start a new one
        clusterRanges.push({ min: rangeStart, max: rangeEnd });
        rangeStart = sortedAmounts[i];
      }
      rangeEnd = sortedAmounts[i];
    }
    clusterRanges.push({ min: rangeStart, max: rangeEnd });

    return clusterRanges;
  }

  /**
   * Find the dominant recurring pattern in a merchant's transactions.
   * Clusters transactions by amount similarity (within 20% tolerance of cluster
   * center) and returns the cluster containing the most recent transaction,
   * provided it has at least 3 members. This isolates the actual recurring charge
   * from one-off purchases at the same merchant.
   * @param {Array} transactions - Sorted by date ascending
   * @returns {Array|null} The cluster containing the most recent transaction, or null
   * @private
   */
  _findRecurringPattern(transactions) {
      if (transactions.length < 3) { return null; }

      // Sort all amounts to find natural cluster boundaries
      const sortedAmounts = transactions.map(t => t.amount).sort((a, b) => a - b);

      // Use extracted cluster computation
      const clusterRanges = this._computeAmountClusters(sortedAmounts);

      // Find which cluster the most recent transaction belongs to
      const mostRecent = transactions[transactions.length - 1];
      let matchingRange = null;
      for (const range of clusterRanges) {
        if (mostRecent.amount >= range.min && mostRecent.amount <= range.max) {
          matchingRange = range;
          break;
        }
      }

      if (!matchingRange) { return null; }

      // Return all transactions that fall within the matching cluster range
      return transactions.filter(t => t.amount >= matchingRange.min && t.amount <= matchingRange.max);
    }


  /**
   * Detect New Spending Tier anomalies — flags when a transaction amount exceeds
   * NEW_SPENDING_TIER_MULTIPLIER × the historical maximum at the same vendor.
   * A transaction can trigger both New_Spending_Tier and Large_Transaction independently.
   * @param {Array} recentExpenses - Expenses within the lookback window
   * @param {Array} allExpenses - All historical expenses
   * @returns {Array<Object>} Array of raw anomaly objects
   * @private
   */
  _detectNewSpendingTier(recentExpenses, allExpenses) {
    const anomalies = [];
    const multiplier = DETECTION_THRESHOLDS.NEW_SPENDING_TIER_MULTIPLIER;

    // Build a map of vendor → prior transactions (excluding current recent expenses)
    // We need all transactions at each vendor for history lookup
    const vendorHistoryMap = new Map();
    for (const expense of allExpenses) {
      const key = (expense.place || '').toLowerCase();
      if (!key) { continue; }
      if (!vendorHistoryMap.has(key)) { vendorHistoryMap.set(key, []); }
      vendorHistoryMap.get(key).push(expense);
    }

    for (const expense of recentExpenses) {
      const vendorKey = (expense.place || '').toLowerCase();
      if (!vendorKey) { continue; }

      const vendorTransactions = vendorHistoryMap.get(vendorKey);
      if (!vendorTransactions) { continue; }

      // Get all prior transactions at this vendor (excluding the current one)
      const priorTransactions = vendorTransactions.filter(e => e.id !== expense.id);

      // Skip vendors with < 2 historical transactions
      if (priorTransactions.length < 2) { continue; }

      // Compute historical max (excluding current transaction)
      const historicalMax = Math.max(...priorTransactions.map(e => e.amount));

      // Skip if historical max is zero or negative (avoid meaningless ratios)
      if (historicalMax <= 0) { continue; }

      // Flag when amount > multiplier × historicalMax
      if (expense.amount > multiplier * historicalMax) {
        const ratio = expense.amount / historicalMax;

        // Assign severity based on ratio
        let severity;
        if (ratio > 10) {
          severity = SEVERITY_LEVELS.HIGH;
        } else if (ratio > 5) {
          severity = SEVERITY_LEVELS.MEDIUM;
        } else {
          severity = SEVERITY_LEVELS.LOW;
        }

        anomalies.push({
          id: Date.now() + anomalies.length,
          expenseId: expense.id,
          date: expense.date,
          place: expense.place,
          amount: expense.amount,
          category: expense.type,
          anomalyType: 'new_spending_tier',
          classification: ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER,
          reason: 'Amount ' + expense.amount.toFixed(2) + ' is ' + ratio.toFixed(1) + 'x the historical max of ' + historicalMax.toFixed(2) + ' at "' + expense.place + '"',
          severity,
          categoryAverage: historicalMax,
          standardDeviations: parseFloat(ratio.toFixed(2)),
          dismissed: false
        });
      }
    }

    return anomalies;
  }

  /**
   * Detect vendor-level frequency spikes — flags when a transaction at a vendor
   * occurs unusually soon based on the vendor's historical average interval.
   * Flags when daysSinceLast < VENDOR_FREQUENCY_SPIKE_RATIO × avgDaysBetweenTransactions.
   * @param {Array} recentExpenses - Expenses within the lookback window
   * @param {Array} allExpenses - All historical expenses
   * @returns {Array<Object>} Array of raw anomaly objects
   * @private
   */
  _detectVendorFrequencySpikes(recentExpenses, allExpenses) {
    const anomalies = [];
    const vendorCache = this._vendorBaselineCache || new Map();
    const ratio = DETECTION_THRESHOLDS.VENDOR_FREQUENCY_SPIKE_RATIO;
    const minTransactions = DETECTION_THRESHOLDS.MIN_VENDOR_TRANSACTIONS_FOR_FREQUENCY;

    // Build a map of vendor → sorted dates for finding last transaction before each recent expense
    const vendorDatesMap = new Map();
    for (const expense of allExpenses) {
      const key = (expense.place || '').toLowerCase();
      if (!key) { continue; }
      if (!vendorDatesMap.has(key)) { vendorDatesMap.set(key, []); }
      vendorDatesMap.get(key).push(expense.date);
    }
    // Sort each vendor's dates ascending
    for (const [key, dates] of vendorDatesMap) {
      vendorDatesMap.set(key, dates.sort());
    }

    for (const expense of recentExpenses) {
      const vendorKey = (expense.place || '').toLowerCase();
      if (!vendorKey) { continue; }

      const vendorBaseline = vendorCache.get(vendorKey);
      if (!vendorBaseline) { continue; }

      // Skip vendors with < MIN_VENDOR_TRANSACTIONS_FOR_FREQUENCY historical transactions
      if (vendorBaseline.transactionCount < minTransactions) { continue; }

      // Skip if no valid average interval
      if (!vendorBaseline.avgDaysBetweenTransactions || vendorBaseline.avgDaysBetweenTransactions <= 0) { continue; }

      // Find the most recent transaction date before this expense at this vendor
      const vendorDates = vendorDatesMap.get(vendorKey) || [];
      const expenseDate = new Date(expense.date);

      // Find the last date strictly before the current expense date
      let lastDate = null;
      for (let i = vendorDates.length - 1; i >= 0; i--) {
        const d = new Date(vendorDates[i]);
        if (d < expenseDate) {
          lastDate = d;
          break;
        }
      }

      if (!lastDate) { continue; }

      // Compute days since last transaction (calendar day difference)
      const daysSinceLast = (expenseDate - lastDate) / (1000 * 60 * 60 * 24);

      // Flag when daysSinceLast < ratio × avgDaysBetweenTransactions
      const threshold = ratio * vendorBaseline.avgDaysBetweenTransactions;
      if (daysSinceLast < threshold) {
        anomalies.push({
          id: Date.now() + anomalies.length,
          expenseId: expense.id,
          date: expense.date,
          place: expense.place,
          amount: expense.amount,
          category: expense.type,
          anomalyType: 'frequency_spike',
          classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE,
          reason: 'Visit to "' + expense.place + '" after ' + daysSinceLast.toFixed(1) + ' days, below threshold of ' + threshold.toFixed(1) + ' days (avg interval: ' + vendorBaseline.avgDaysBetweenTransactions.toFixed(1) + ' days)',
          severity: SEVERITY_LEVELS.LOW,
          categoryAverage: vendorBaseline.avgDaysBetweenTransactions,
          standardDeviations: parseFloat((daysSinceLast / vendorBaseline.avgDaysBetweenTransactions).toFixed(2)),
          dismissed: false
        });
      }
    }

    return anomalies;
  }

  /**
   * Calculate severity for recurring expense increases based on deviation percentage.
   * @param {number} deviation - The fractional deviation (e.g. 0.35 = 35% above avg)
   * @returns {string} Severity level
   * @private
   */
  _calculateRecurringIncreaseSeverity(deviation) {
    if (deviation >= 1.0) { return SEVERITY_LEVELS.HIGH; }
    if (deviation >= 0.5) { return SEVERITY_LEVELS.MEDIUM; }
    return SEVERITY_LEVELS.LOW;
  }

  /**
   * Detect seasonal deviations — flags when a category's current month spending
   * deviates from the same month in the prior year by more than
   * SEASONAL_VARIANCE_THRESHOLD (25%), requiring 12+ months of historical data.
   * @param {Array} recentExpenses - Expenses within the lookback window
   * @param {Array} allExpenses - All historical expenses
   * @returns {Promise<Array<Object>>} Array of raw anomaly objects
   */
  async _detectSeasonalDeviations(recentExpenses, allExpenses) {
    try {
      const anomalies = [];

      // Step 1: Determine current month and year
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const currentMonthKey = currentYear + '-' + currentMonth.toString().padStart(2, '0');
      const priorYearMonthKey = (currentYear - 1) + '-' + currentMonth.toString().padStart(2, '0');

      // Step 2: Group all expenses by category
      const categoryGroups = {};
      for (const expense of allExpenses) {
        if (!categoryGroups[expense.type]) { categoryGroups[expense.type] = []; }
        categoryGroups[expense.type].push(expense);
      }

      const categories = Object.keys(categoryGroups);
      let index = 0;

      for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        const categoryExpenses = categoryGroups[category];

        // Step 3: Use _groupExpensesByMonth to get monthly totals
        const expensesByMonth = this._groupExpensesByMonth(categoryExpenses);
        const monthKeys = Object.keys(expensesByMonth);

        // Step 4: Check if 12+ months of data exist for the category
        if (monthKeys.length < DETECTION_THRESHOLDS.MIN_MONTHS_FOR_SEASONAL) { continue; }

        // Compute current month total
        const currentMonthExpenses = expensesByMonth[currentMonthKey];
        if (!currentMonthExpenses || currentMonthExpenses.length === 0) { continue; }
        const currentMonthTotal = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

        // Step 5: Find the same month from prior year
        const priorYearExpenses = expensesByMonth[priorYearMonthKey];
        if (!priorYearExpenses || priorYearExpenses.length === 0) { continue; }
        const priorYearSameMonthTotal = priorYearExpenses.reduce((sum, e) => sum + e.amount, 0);

        // Avoid division by zero
        if (priorYearSameMonthTotal === 0) { continue; }

        // Step 6: Compute deviation
        const deviation = (currentMonthTotal - priorYearSameMonthTotal) / priorYearSameMonthTotal;

        // Step 7: Flag if deviation > SEASONAL_VARIANCE_THRESHOLD (25%)
        if (deviation > DETECTION_THRESHOLDS.SEASONAL_VARIANCE_THRESHOLD) {
          const severity = this._calculateSeasonalDeviationSeverity(deviation);
          anomalies.push({
            id: Date.now() + index,
            expenseId: null,
            date: currentMonthKey + '-01',
            place: category,
            amount: currentMonthTotal,
            category: category,
            anomalyType: 'seasonal_deviation',
            classification: ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION,
            severity: severity,
            dismissed: false,
            categoryAverage: parseFloat(priorYearSameMonthTotal.toFixed(2)),
            standardDeviations: 0
          });
          index++;
        }
      }

      return anomalies;
    } catch (error) {
      logger.error('Seasonal deviation detector failed:', error);
      return [];
    }
  }

  /**
   * Calculate severity for seasonal deviations based on deviation percentage.
   * @param {number} deviation - The fractional deviation (e.g. 0.50 = 50% above prior year)
   * @returns {string} Severity level
   * @private
   */
  _calculateSeasonalDeviationSeverity(deviation) {
    if (deviation >= 1.0) { return SEVERITY_LEVELS.HIGH; }
    if (deviation >= 0.5) { return SEVERITY_LEVELS.MEDIUM; }
    return SEVERITY_LEVELS.LOW;
  }

  /**
   * Detect behavioral drift — flags when a category's recent 3-month average
   * exceeds the preceding 3-month average by more than DRIFT_THRESHOLD (25%),
   * requiring at least MIN_MONTHS_FOR_DRIFT (6) months of data.
   * Produces at most one drift alert per category per detection run.
   * @param {Array} allExpenses - All historical expenses
   * @returns {Promise<Array<Object>>} Array of raw anomaly objects
   */
  async _detectBehavioralDrift(allExpenses) {
    try {
      const anomalies = [];

      // Step 1: Group all expenses by category
      const categoryGroups = {};
      for (const expense of allExpenses) {
        if (!categoryGroups[expense.type]) { categoryGroups[expense.type] = []; }
        categoryGroups[expense.type].push(expense);
      }

      const categories = Object.keys(categoryGroups);
      let index = 0;

      for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        const categoryExpenses = categoryGroups[category];

        // Step 2: Use _groupExpensesByMonth to get monthly totals
        const expensesByMonth = this._groupExpensesByMonth(categoryExpenses);
        const monthKeys = Object.keys(expensesByMonth).sort();

        // Step 3: Check if 6+ months of data exist
        if (monthKeys.length < DETECTION_THRESHOLDS.MIN_MONTHS_FOR_DRIFT) { continue; }

        // Step 4: Compute recent 3-month average (most recent 3 months with data)
        const recentMonthKeys = monthKeys.slice(-DETECTION_THRESHOLDS.DRIFT_PERIOD_MONTHS);
        if (recentMonthKeys.length < DETECTION_THRESHOLDS.DRIFT_PERIOD_MONTHS) { continue; }

        let recentTotal = 0;
        for (const mk of recentMonthKeys) {
          recentTotal += expensesByMonth[mk].reduce((sum, e) => sum + e.amount, 0);
        }
        const recentAvg = recentTotal / recentMonthKeys.length;

        // Step 5: Compute preceding 3-month average (the 3 months before the recent 3)
        const precedingMonthKeys = monthKeys.slice(
          -(DETECTION_THRESHOLDS.DRIFT_PERIOD_MONTHS * 2),
          -DETECTION_THRESHOLDS.DRIFT_PERIOD_MONTHS
        );
        if (precedingMonthKeys.length < DETECTION_THRESHOLDS.DRIFT_PERIOD_MONTHS) { continue; }

        let precedingTotal = 0;
        for (const mk of precedingMonthKeys) {
          precedingTotal += expensesByMonth[mk].reduce((sum, e) => sum + e.amount, 0);
        }
        const precedingAvg = precedingTotal / precedingMonthKeys.length;

        // Avoid division by zero
        if (precedingAvg === 0) { continue; }

        // Step 6: If recent avg exceeds preceding avg by > DRIFT_THRESHOLD (25%), create drift alert
        const deviation = (recentAvg - precedingAvg) / precedingAvg;

        if (deviation > DETECTION_THRESHOLDS.DRIFT_THRESHOLD) {
          const severity = this._calculateDriftSeverity(deviation);
          const currentMonthKey = recentMonthKeys[recentMonthKeys.length - 1];

          anomalies.push({
            id: Date.now() + index,
            expenseId: null,
            date: currentMonthKey + '-01',
            place: category,
            amount: parseFloat(recentAvg.toFixed(2)),
            category: category,
            anomalyType: 'behavioral_drift',
            classification: ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND,
            severity: severity,
            dismissed: false,
            categoryAverage: parseFloat(precedingAvg.toFixed(2)),
            standardDeviations: 0,
            _driftData: {
              recentPeriodAvg: parseFloat(recentAvg.toFixed(2)),
              precedingPeriodAvg: parseFloat(precedingAvg.toFixed(2)),
              percentageIncrease: parseFloat((deviation * 100).toFixed(2)),
              recentPeriod: { start: recentMonthKeys[0], end: recentMonthKeys[recentMonthKeys.length - 1] },
              precedingPeriod: { start: precedingMonthKeys[0], end: precedingMonthKeys[precedingMonthKeys.length - 1] }
            }
          });
          index++;
        }
      }

      // Step 7: At most one drift alert per category (guaranteed by loop structure)
      return anomalies;
    } catch (error) {
      logger.error('Behavioral drift detector failed:', error);
      return [];
    }
  }

  /**
   * Calculate severity for behavioral drift based on deviation percentage.
   * @param {number} deviation - The fractional deviation (e.g. 0.40 = 40% above preceding avg)
   * @returns {string} Severity level
   * @private
   */
  _calculateDriftSeverity(deviation) {
    if (deviation >= 1.0) { return SEVERITY_LEVELS.HIGH; }
    if (deviation >= 0.5) { return SEVERITY_LEVELS.MEDIUM; }
    return SEVERITY_LEVELS.LOW;
  }

  // ─── Enrichment Pipeline Methods ───────────────────────────────────────

  /**
   * Classify an anomaly into one of 7 ANOMALY_CLASSIFICATIONS values.
   * If the anomaly already has a classification (from new detectors), keep it.
   * If it only has a legacy anomalyType (from existing detectors), map via LEGACY_TYPE_MAP.
   * Preserves the legacy anomalyType field for backward compatibility.
   * @param {Object} anomaly - Raw anomaly object
   * @param {Array} allExpenses - All historical expenses (unused currently, reserved for future)
   * @returns {Object} anomaly with classification field set
   * @private
   */
  _classifyAnomaly(anomaly, allExpenses) {
    // If anomaly already has a classification from a new detector, keep it
    if (anomaly.classification && Object.values(ANOMALY_CLASSIFICATIONS).includes(anomaly.classification)) {
      return anomaly;
    }

    // Map legacy anomalyType to new classification
    if (anomaly.anomalyType && Object.prototype.hasOwnProperty.call(LEGACY_TYPE_MAP, anomaly.anomalyType)) {
      anomaly.classification = LEGACY_TYPE_MAP[anomaly.anomalyType];
    } else {
      // Fallback: default to LARGE_TRANSACTION
      anomaly.classification = ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION;
    }

    return anomaly;
  }

  /**
   * Build a structured explanation object for an anomaly.
   * @param {Object} anomaly - Anomaly object (must have classification, amount, category, categoryAverage)
   * @param {Object} baseline - Category baseline { mean, stdDev, count, monthsWithData }
   * @returns {Object} explanation { typeLabel, observedValue, expectedRange: { min, max }, deviationPercent, comparisonPeriod }
   * @private
   */
  _buildExplanation(anomaly, baseline) {
    // Human-readable labels for each classification
    const classificationLabels = {
      [ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION]: 'Large Transaction',
      [ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE]: 'Category Spending Spike',
      [ANOMALY_CLASSIFICATIONS.NEW_MERCHANT]: 'New Merchant',
      [ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE]: 'Frequency Spike',
      [ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE]: 'Recurring Expense Increase',
      [ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION]: 'Seasonal Deviation',
      [ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND]: 'Emerging Behavior Trend',
      [ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER]: 'New Spending Tier'
    };

    const typeLabel = classificationLabels[anomaly.classification] || '';
    const observedValue = anomaly.amount || 0;

    const mean = baseline && baseline.mean ? baseline.mean : 0;
    const stdDev = baseline && baseline.stdDev ? baseline.stdDev : 0;

    const min = Math.max(0, mean - stdDev);
    const max = mean + stdDev;

    let deviationPercent = 0;
    if (max > 0) {
      deviationPercent = parseFloat((((observedValue - max) / max) * 100).toFixed(2));
    }

    const monthsWithData = baseline && baseline.monthsWithData ? baseline.monthsWithData : 0;
    let comparisonPeriod = '';
    if (monthsWithData >= 12) {
      comparisonPeriod = 'last 12 months';
    } else if (monthsWithData > 0) {
      comparisonPeriod = 'all available data (' + monthsWithData + ' months)';
    }

    return {
      typeLabel,
      observedValue,
      expectedRange: { min: parseFloat(min.toFixed(2)), max: parseFloat(max.toFixed(2)) },
      deviationPercent,
      comparisonPeriod
    };
  }

  /**
   * Build historical context for an anomaly.
   * @param {Object} anomaly - Anomaly object
   * @param {Array} allExpenses - All historical expenses
   * @returns {Object} historicalContext { purchaseRank, purchaseRankTotal, percentile, deviationFromAverage, frequency }
   * @private
   */
  _buildHistoricalContext(anomaly, allExpenses) {
    const context = {
      purchaseRank: null,
      purchaseRankTotal: null,
      percentile: null,
      deviationFromAverage: 0,
      frequency: null
    };

    const category = anomaly.category;
    const classification = anomaly.classification;

    // purchaseRank and purchaseRankTotal: for amount/new_merchant types
    if (classification === ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION ||
        classification === ANOMALY_CLASSIFICATIONS.NEW_MERCHANT) {
      // Get all purchases in same category over last 24 months
      const now = new Date();
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 24);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      const categoryPurchases = allExpenses.filter(
        e => e.type === category && e.date >= cutoffStr
      );

      if (categoryPurchases.length > 0) {
        // Sort amounts descending for ranking
        const sortedAmounts = categoryPurchases.map(e => e.amount).sort((a, b) => b - a);
        // 1-based rank (position in descending order)
        const rank = sortedAmounts.findIndex(a => a <= anomaly.amount) + 1;
        context.purchaseRank = rank;
        context.purchaseRankTotal = sortedAmounts.length;
      }
    }

    // percentile: for category_spending_spike types
    if (classification === ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE) {
      const categoryExpenses = allExpenses.filter(e => e.type === category);
      const expensesByMonth = this._groupExpensesByMonth(categoryExpenses);
      const monthlyTotals = Object.values(expensesByMonth).map(
        monthExps => monthExps.reduce((sum, e) => sum + e.amount, 0)
      );

      if (monthlyTotals.length > 0) {
        const currentMonthTotal = anomaly.amount;
        const countLessOrEqual = monthlyTotals.filter(t => t <= currentMonthTotal).length;
        context.percentile = parseFloat(((countLessOrEqual / monthlyTotals.length) * 100).toFixed(2));
      }
    }

    // deviationFromAverage: percentage deviation from historical average
    const categoryExpensesAll = allExpenses.filter(e => e.type === category);
    if (categoryExpensesAll.length > 0) {
      // For category-level anomalies, use monthly totals; for transaction-level, use amounts
      if (classification === ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE ||
          classification === ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE ||
          classification === ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION ||
          classification === ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND) {
        const expensesByMonth = this._groupExpensesByMonth(categoryExpensesAll);
        const monthlyTotals = Object.values(expensesByMonth).map(
          monthExps => monthExps.reduce((sum, e) => sum + e.amount, 0)
        );
        const avg = monthlyTotals.reduce((sum, t) => sum + t, 0) / monthlyTotals.length;
        if (avg > 0) {
          context.deviationFromAverage = parseFloat((((anomaly.amount - avg) / avg) * 100).toFixed(2));
        }
      } else {
        const amounts = categoryExpensesAll.map(e => e.amount);
        const avg = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
        if (avg > 0) {
          context.deviationFromAverage = parseFloat((((anomaly.amount - avg) / avg) * 100).toFixed(2));
        }
      }
    }

    // frequency: average interval between purchases at merchant/category
    if (classification === ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION ||
        classification === ANOMALY_CLASSIFICATIONS.NEW_MERCHANT ||
        classification === ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE) {
      // Use merchant-level frequency if place is available, else category-level
      let relevantExpenses;
      if (anomaly.place && anomaly.place !== 'Multiple') {
        relevantExpenses = allExpenses.filter(
          e => e.place && e.place.toLowerCase() === anomaly.place.toLowerCase()
        );
      }
      // Fall back to category if not enough merchant data
      if (!relevantExpenses || relevantExpenses.length < 2) {
        relevantExpenses = allExpenses.filter(e => e.type === category);
      }

      if (relevantExpenses.length >= 2) {
        const sortedDates = relevantExpenses
          .map(e => new Date(e.date))
          .sort((a, b) => a - b);
        const firstDate = sortedDates[0];
        const lastDate = sortedDates[sortedDates.length - 1];
        const totalDaySpan = (lastDate - firstDate) / (1000 * 60 * 60 * 24);
        const avgIntervalDays = totalDaySpan / (sortedDates.length - 1);

        if (avgIntervalDays >= 365) {
          const years = Math.round(avgIntervalDays / 365);
          context.frequency = 'approximately once every ' + years + ' year' + (years > 1 ? 's' : '');
        } else if (avgIntervalDays >= 28) {
          const months = Math.round(avgIntervalDays / 30);
          context.frequency = 'approximately once every ' + months + ' month' + (months > 1 ? 's' : '');
        } else if (avgIntervalDays >= 7) {
          const weeks = Math.round(avgIntervalDays / 7);
          context.frequency = 'approximately once every ' + weeks + ' week' + (weeks > 1 ? 's' : '');
        } else {
          const days = Math.round(avgIntervalDays);
          context.frequency = 'approximately once every ' + (days < 1 ? 1 : days) + ' day' + (days > 1 ? 's' : '');
        }
      }
    }

    return context;
  }

  /**
   * Estimate the financial impact of an anomaly.
   * @param {Object} anomaly - Anomaly object
   * @param {Array} allExpenses - All historical expenses
   * @param {Object|null} budgetData - Budget data { byCategory: { [cat]: { limit, spent } } } or null
   * @param {Object|null} incomeData - Income data { monthlyIncome } or null
   * @returns {Object} impactEstimate { annualizedChange, savingsRateChange, budgetImpact }
   * @private
   */
  _estimateImpact(anomaly, allExpenses, budgetData, incomeData) {
    const category = anomaly.category;

    // Compute monthly deviation: anomaly amount minus category average
    const categoryAverage = anomaly.categoryAverage || 0;
    const monthlyDeviation = anomaly.amount - categoryAverage;
    const annualizedChange = parseFloat((monthlyDeviation * 12).toFixed(2));

    // savingsRateChange: when income data available
    let savingsRateChange = null;
    if (incomeData && incomeData.monthlyIncome && incomeData.monthlyIncome > 0) {
      const monthlyIncome = incomeData.monthlyIncome;
      // Compute total monthly spending from all expenses (approximate from recent month)
      const now = new Date();
      const currentMonthKey = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padStart(2, '0');
      const expensesByMonth = this._groupExpensesByMonth(allExpenses);
      const currentMonthExpenses = expensesByMonth[currentMonthKey] || [];
      const currentMonthSpending = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

      const currentSavingsRate = ((monthlyIncome - currentMonthSpending) / monthlyIncome) * 100;
      const projectedSpending = currentMonthSpending + monthlyDeviation;
      const projectedSavingsRate = ((monthlyIncome - projectedSpending) / monthlyIncome) * 100;

      savingsRateChange = parseFloat((currentSavingsRate - projectedSavingsRate).toFixed(2));
    }

    // budgetImpact: when budget exists for category
    let budgetImpact = null;
    if (budgetData && budgetData.byCategory && budgetData.byCategory[category]) {
      const budget = budgetData.byCategory[category];
      const budgetLimit = budget.limit;
      const currentSpent = budget.spent;

      // Compute projected month-end: current daily rate × days in month
      const now = new Date();
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dailyRate = dayOfMonth > 0 ? currentSpent / dayOfMonth : 0;
      const projectedMonthEnd = parseFloat((dailyRate * daysInMonth).toFixed(2));
      const projectedOverage = parseFloat((projectedMonthEnd - budgetLimit).toFixed(2));

      budgetImpact = {
        budgetLimit,
        currentSpent,
        projectedMonthEnd,
        projectedOverage
      };
    }

    return {
      annualizedChange,
      savingsRateChange,
      budgetImpact
    };
  }

  /**
   * Assign a behavior pattern to an anomaly.
   * @param {Object} anomaly - Anomaly object
   * @param {Array} allExpenses - All historical expenses
   * @param {Array} recentAnomalies - All anomalies detected in this cycle
   * @returns {string} One of BEHAVIOR_PATTERNS values
   * @private
   */
  _assignBehaviorPattern(anomaly, allExpenses, recentAnomalies) {
    const category = anomaly.category;
    const classification = anomaly.classification;

    // Recurring_Change: 2+ similar anomalies (same category + classification) in last 3 months
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthsAgoStr = threeMonthsAgo.toISOString().split('T')[0];

    const similarAnomalies = recentAnomalies.filter(a =>
      a !== anomaly &&
      a.category === category &&
      a.classification === classification &&
      a.date >= threeMonthsAgoStr
    );

    if (similarAnomalies.length >= 2) {
      return BEHAVIOR_PATTERNS.RECURRING_CHANGE;
    }

    // Emerging_Trend: behavioral drift detected in same category
    // Check if anomaly itself has _driftData (it's a drift anomaly)
    if (anomaly._driftData) {
      return BEHAVIOR_PATTERNS.EMERGING_TREND;
    }
    // Check if there's a drift anomaly for the same category in recentAnomalies
    const hasDriftForCategory = recentAnomalies.some(a =>
      a !== anomaly &&
      a.category === category &&
      a.classification === ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND
    );
    if (hasDriftForCategory) {
      return BEHAVIOR_PATTERNS.EMERGING_TREND;
    }

    // One_Time_Event: otherwise
    return BEHAVIOR_PATTERNS.ONE_TIME_EVENT;
  }

  /**
   * Score the confidence of an anomaly based on data quantity.
   * @param {Object} anomaly - Anomaly object
   * @param {Array} allExpenses - All historical expenses
   * @returns {string} One of CONFIDENCE_LEVELS values (low, medium, high)
   * @private
   */
  _scoreConfidence(anomaly, allExpenses) {
    const category = anomaly.category;
    const categoryExpenses = allExpenses.filter(e => e.type === category);
    const transactionCount = categoryExpenses.length;
    const expensesByMonth = this._groupExpensesByMonth(categoryExpenses);
    const monthsWithData = Object.keys(expensesByMonth).length;

    // high: 12+ months data AND 10+ transactions
    if (monthsWithData >= 12 && transactionCount >= 10) {
      return CONFIDENCE_LEVELS.HIGH;
    }

    // medium: 6-11 months OR 5-9 transactions
    if ((monthsWithData >= 6 && monthsWithData <= 11) || (transactionCount >= 5 && transactionCount <= 9)) {
      return CONFIDENCE_LEVELS.MEDIUM;
    }

    // low: <6 months AND <5 transactions
    return CONFIDENCE_LEVELS.LOW;
  }

  // ─── Filtering Pipeline Methods ──────────────────────────────────────

  // ─── Alert_Builder Private Methods ─────────────────────────────────
  // Generate plain-language summary, explanation, and typical range strings
  // from enriched anomaly objects. These run after the enrichment phase and
  // attach simplified fields for the frontend Alert_Card layout.

  /**
   * Generate a plain-language summary (≤40 chars) for the anomaly.
   * Maps each of the 8 classification types to a human-readable template.
   * @param {Object} anomaly - Enriched anomaly object
   * @returns {string} Summary text, max 40 characters
   * @private
   */
  _buildSummaryText(anomaly) {
    const maxLen = ALERT_TEXT_LIMITS.SUMMARY_MAX_LENGTH;
    const vendor = anomaly.place || '';
    const category = anomaly.category || '';
    let text;

    switch (anomaly.classification) {
      case ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION:
        text = vendor ? `Large purchase at ${vendor}` : 'Unusual purchase size';
        break;
      case ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER:
        text = vendor ? `New spending level at ${vendor}` : 'New spending level';
        break;
      case ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE:
        text = category ? `${category} spending spike` : 'Category spending spike';
        break;
      case ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE:
        text = vendor ? `Frequent visits to ${vendor}` : `${category} frequency up`;
        break;
      case ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE:
        text = vendor ? `${vendor} cost changed` : 'Subscription price increased';
        break;
      case ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND:
        text = category ? `${category} spending trend shift` : 'Spending trend shift';
        break;
      case ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION:
        text = category ? `${category} seasonal change` : 'Seasonal spending change';
        break;
      case ANOMALY_CLASSIFICATIONS.NEW_MERCHANT:
        text = vendor ? `New merchant: ${vendor}` : 'New merchant detected';
        break;
      default:
        text = 'Unusual activity detected';
    }

    if (text.length > maxLen) {
      text = text.slice(0, maxLen - 1) + '\u2026';
    }
    return text;
  }

  /**
   * Generate a jargon-free explanation (≤120 chars) for the anomaly.
   * References typical spending without standard deviations, percentiles, or z-scores.
   * @param {Object} anomaly - Enriched anomaly object
   * @param {Object} baseline - Category baseline from calculateCategoryBaseline
   * @returns {string} Explanation text, max 120 characters
   * @private
   */
  _buildExplanationText(anomaly, baseline) {
    const maxLen = ALERT_TEXT_LIMITS.EXPLANATION_MAX_LENGTH;
    const vendor = anomaly.place || 'this merchant';
    const category = anomaly.category || 'this category';
    let text = '';

    // Retrieve vendor baseline for vendor-specific explanations
    const vendorKey = (anomaly.place || '').toLowerCase();
    const vendorBaseline = this._vendorBaselineCache && vendorKey
      ? this._vendorBaselineCache.get(vendorKey)
      : null;

    switch (anomaly.classification) {
      case ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION: {
        if (vendorBaseline && vendorBaseline.transactionCount >= 2) {
          const min = Math.round(vendorBaseline.p25);
          const max = Math.round(vendorBaseline.p75);
          text = `Your typical ${vendor} transactions are $${min}\u2013$${max}.`;
        } else {
          text = `This purchase is higher than usual for ${category}.`;
        }
        break;
      }
      case ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE: {
        const avg = baseline && baseline.mean ? Math.round(baseline.mean) : null;
        text = avg
          ? `You usually spend around $${avg}/mo on ${category}.`
          : `${category} spending is higher than usual this month.`;
        break;
      }
      case ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE: {
        const prevAmount = anomaly.categoryAverage;
        text = prevAmount
          ? `This was $${Number(prevAmount).toFixed(2)} last month.`
          : `${vendor} charges have increased recently.`;
        break;
      }
      case ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND: {
        text = `Your ${category} spending has been gradually increasing.`;
        break;
      }
      case ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER: {
        if (vendorBaseline) {
          const ratio = anomaly.amount / vendorBaseline.maxAmount;
          text = ratio > 1
            ? `This is ${ratio.toFixed(1)}\u00d7 more than your usual max at ${vendor}.`
            : `New spending level detected at ${vendor}.`;
        } else {
          text = `New spending level detected at ${vendor}.`;
        }
        break;
      }
      case ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE: {
        if (vendorBaseline && vendorBaseline.avgDaysBetweenTransactions) {
          const days = Math.round(vendorBaseline.avgDaysBetweenTransactions);
          text = `You usually visit ${vendor} about once every ${days} days.`;
        } else {
          text = `You've been visiting ${vendor} more often than usual.`;
        }
        break;
      }
      case ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION: {
        text = `This month's ${category} spending differs from last year.`;
        break;
      }
      case ANOMALY_CLASSIFICATIONS.NEW_MERCHANT: {
        text = `First purchase at ${vendor}.`;
        break;
      }
      default:
        text = '';
    }

    if (text.length > maxLen) {
      text = text.slice(0, maxLen - 1) + '\u2026';
    }
    return text;
  }

  /**
   * Generate a human-readable typical range string, or null.
   * Returns a range for Large_Transaction, Frequency_Spike,
   * Recurring_Expense_Increase, New_Spending_Tier.
   * Returns null for Emerging_Behavior_Trend, Category_Spending_Spike,
   * Seasonal_Deviation, New_Merchant.
   * @param {Object} anomaly - Enriched anomaly object
   * @returns {string|null} Range string like "Typical purchase: $5–$59" or null
   * @private
   */
  _buildTypicalRange(anomaly) {
    const vendorKey = (anomaly.place || '').toLowerCase();
    const vendorBaseline = this._vendorBaselineCache && vendorKey
      ? this._vendorBaselineCache.get(vendorKey)
      : null;

    switch (anomaly.classification) {
      case ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION:
      case ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER: {
        if (vendorBaseline && vendorBaseline.transactionCount >= 2) {
          const min = Math.round(vendorBaseline.p25);
          const max = Math.round(vendorBaseline.p75);
          return `Typical purchase: $${min}\u2013$${max}`;
        }
        return null;
      }
      case ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE: {
        if (vendorBaseline && vendorBaseline.avgDaysBetweenTransactions) {
          const days = Math.round(vendorBaseline.avgDaysBetweenTransactions);
          return `Typical frequency: every ${days} days`;
        }
        return null;
      }
      case ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE: {
        const prevAmount = anomaly.categoryAverage;
        if (prevAmount) {
          return `Previous amount: $${Number(prevAmount).toFixed(2)}`;
        }
        return null;
      }
      case ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND:
      case ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE:
      case ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION:
      case ANOMALY_CLASSIFICATIONS.NEW_MERCHANT:
      default:
        return null;
    }
  }

  // ─── Filtering Pipeline Methods ──────────────────────────────────────

  /**
   * Aggregate anomalies into cluster alerts when 3+ anomalous transactions
   * fall within a 7-day window and share a common category theme.
   * Replaces individual alerts with a single cluster alert per group.
   * @param {Array} anomalies - Enriched anomaly array
   * @returns {Array} New array with clustered anomalies replaced by cluster alerts
   * @private
   */
  _aggregateClusters(anomalies) {
    try {
      if (!anomalies || anomalies.length < THROTTLE_CONFIG.MIN_CLUSTER_SIZE) {
        return anomalies;
      }

      // Category theme groups for cluster label assignment
      const THEME_CATEGORIES = {
        [CLUSTER_LABELS.TRAVEL_EVENT]: ['Transportation', 'Travel', 'Accommodation', 'Hotels', 'Flights', 'Gas', 'Parking', 'Taxi', 'Uber', 'Rental Car'],
        [CLUSTER_LABELS.MOVING_EVENT]: ['Furniture', 'Home', 'Utilities', 'Moving', 'Rent', 'Deposit'],
        [CLUSTER_LABELS.HOME_RENOVATION]: ['Home Improvement', 'Furniture', 'Appliances', 'Hardware', 'Renovation'],
        [CLUSTER_LABELS.HOLIDAY_SPENDING]: ['Gifts', 'Dining', 'Entertainment', 'Decorations', 'Party']
      };

      // Only cluster transaction-level anomalies (those with an expenseId)
      const clusterCandidates = anomalies.filter(a => a.expenseId != null);
      const nonCandidates = anomalies.filter(a => a.expenseId == null);

      if (clusterCandidates.length < THROTTLE_CONFIG.MIN_CLUSTER_SIZE) {
        return anomalies;
      }

      // Sort candidates by date ascending for window scanning
      const sorted = [...clusterCandidates].sort((a, b) => new Date(a.date) - new Date(b.date));

      const clusteredExpenseIds = new Set();
      const clusterAlerts = [];

      // Sliding window: for each anomaly, look ahead within 7-day window
      for (let i = 0; i < sorted.length; i++) {
        if (clusteredExpenseIds.has(sorted[i].expenseId)) { continue; }

        const windowStart = new Date(sorted[i].date);
        const windowEnd = new Date(windowStart);
        windowEnd.setDate(windowEnd.getDate() + THROTTLE_CONFIG.CLUSTER_WINDOW_DAYS);

        // Collect all anomalies within the window from this starting point
        const windowGroup = [sorted[i]];
        for (let j = i + 1; j < sorted.length; j++) {
          if (clusteredExpenseIds.has(sorted[j].expenseId)) { continue; }
          const jDate = new Date(sorted[j].date);
          if (jDate <= windowEnd) {
            windowGroup.push(sorted[j]);
          } else {
            break; // sorted, so no more will be in window
          }
        }

        if (windowGroup.length < THROTTLE_CONFIG.MIN_CLUSTER_SIZE) { continue; }

        // Determine cluster label by matching category theme
        const groupCategories = windowGroup.map(a => a.category);
        const label = this._matchClusterLabel(groupCategories, THEME_CATEGORIES, windowGroup);

        if (!label) { continue; }

        // Build cluster alert
        const expenseIds = windowGroup.map(a => a.expenseId);
        const totalAmount = parseFloat(windowGroup.reduce((sum, a) => sum + a.amount, 0).toFixed(2));
        const dates = windowGroup.map(a => a.date).sort();
        const transactions = windowGroup.map(a => ({
          expenseId: a.expenseId,
          place: a.place,
          amount: a.amount,
          date: a.date
        }));

        // Use the first anomaly as the base for the cluster alert
        const base = windowGroup[0];
        clusterAlerts.push({
          id: Date.now() + clusterAlerts.length,
          expenseId: null,
          date: dates[0],
          place: label.replace(/_/g, ' '),
          amount: totalAmount,
          category: base.category,
          anomalyType: base.anomalyType || 'cluster',
          classification: base.classification || ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
          severity: this._highestSeverity(windowGroup),
          dismissed: false,
          categoryAverage: base.categoryAverage || 0,
          standardDeviations: 0,
          explanation: base.explanation || null,
          historicalContext: base.historicalContext || null,
          impactEstimate: base.impactEstimate || null,
          behaviorPattern: base.behaviorPattern || null,
          confidence: base.confidence || null,
          cluster: {
            label: label,
            totalAmount: totalAmount,
            transactionCount: windowGroup.length,
            dateRange: {
              start: dates[0],
              end: dates[dates.length - 1]
            },
            transactions: transactions
          },
          budgetSuggestion: null
        });

        // Mark all constituent expenseIds as clustered
        for (const eid of expenseIds) {
          clusteredExpenseIds.add(eid);
        }
      }

      // Build result: non-candidates + unclustered candidates + cluster alerts
      const unclustered = clusterCandidates.filter(a => !clusteredExpenseIds.has(a.expenseId));
      return [...nonCandidates, ...unclustered, ...clusterAlerts];
    } catch (error) {
      logger.error('Cluster aggregation failed:', error);
      return anomalies;
    }
  }

  /**
   * Match a group of categories to a cluster label based on theme overlap.
   * Returns the best-matching label, or null if no theme matches.
   * @param {Array<string>} categories - Categories from the anomaly group
   * @param {Object} themeCategories - Map of label → array of category keywords
   * @param {Array} windowGroup - The anomaly group (used for holiday month check)
   * @returns {string|null} Cluster label or null
   * @private
   */
  _matchClusterLabel(categories, themeCategories, windowGroup) {
    const lowerCategories = categories.map(c => (c || '').toLowerCase());

    // Holiday check: if any transaction is in December, prefer Holiday_Spending
    const hasDecember = windowGroup.some(a => {
      const d = new Date(a.date);
      return d.getMonth() === 11; // December = 11
    });

    let bestLabel = null;
    let bestScore = 0;

    for (const [label, themeCats] of Object.entries(themeCategories)) {
      // For Holiday_Spending, require December context
      if (label === CLUSTER_LABELS.HOLIDAY_SPENDING && !hasDecember) { continue; }

      const lowerTheme = themeCats.map(t => t.toLowerCase());
      let matchCount = 0;
      for (const cat of lowerCategories) {
        if (lowerTheme.some(t => cat.includes(t) || t.includes(cat))) {
          matchCount++;
        }
      }

      if (matchCount > bestScore) {
        bestScore = matchCount;
        bestLabel = label;
      }
    }

    // Require at least 2 category matches to form a themed cluster
    // OR if all categories are the same (single-category cluster of 3+)
    const uniqueCategories = [...new Set(lowerCategories)];
    if (bestScore >= 2 || (uniqueCategories.length === 1 && categories.length >= THROTTLE_CONFIG.MIN_CLUSTER_SIZE)) {
      // If single-category cluster didn't match a theme, assign based on category
      if (!bestLabel && uniqueCategories.length === 1) {
        bestLabel = this._labelFromSingleCategory(categories[0], themeCategories);
      }
      return bestLabel;
    }

    return null;
  }

  /**
   * Assign a cluster label for a single-category cluster based on best theme match.
   * @param {string} category - The single category
   * @param {Object} themeCategories - Map of label → array of category keywords
   * @returns {string} Cluster label (defaults to Holiday_Spending as fallback)
   * @private
   */
  _labelFromSingleCategory(category, themeCategories) {
    const lowerCat = (category || '').toLowerCase();
    for (const [label, themeCats] of Object.entries(themeCategories)) {
      if (themeCats.some(t => lowerCat.includes(t.toLowerCase()) || t.toLowerCase().includes(lowerCat))) {
        return label;
      }
    }
    return CLUSTER_LABELS.HOLIDAY_SPENDING;
  }

  /**
   * Return the highest severity from a group of anomalies.
   * @param {Array} anomalies - Array of anomaly objects
   * @returns {string} Highest severity level
   * @private
   */
  _highestSeverity(anomalies) {
    const order = { [SEVERITY_LEVELS.HIGH]: 3, [SEVERITY_LEVELS.MEDIUM]: 2, [SEVERITY_LEVELS.LOW]: 1 };
    let highest = SEVERITY_LEVELS.LOW;
    for (const a of anomalies) {
      if ((order[a.severity] || 0) > (order[highest] || 0)) {
        highest = a.severity;
      }
    }
    return highest;
  }

  /**
   * Suppress anomalies that match known benign patterns:
   * 1. Rare-category suppression: anomalies in RARE_PURCHASE_CATEGORIES with fewer
   *    than MIN_TRANSACTIONS_FOR_RARE historical transactions in that category.
   * 2. Seasonal spike suppression: anomalies matching SEASONAL_SPIKE_MONTHS when the
   *    current month matches and 12+ months of data exist for the category.
   * 3. Cluster-covered suppression: individual anomalies whose expenseId is already
   *    represented in a cluster alert (already handled by cluster aggregation, but
   *    this acts as a safety net).
   * @param {Array} anomalies - Enriched anomaly array (post-clustering)
   * @param {Array} allExpenses - All historical expenses
   * @returns {Array} Filtered anomaly array with benign patterns removed
   * @private
   */
  _suppressBenignPatterns(anomalies, allExpenses) {
    try {
      if (!anomalies || anomalies.length === 0) {
        return anomalies || [];
      }

      // Pre-compute: transaction counts per category from allExpenses
      const categoryCounts = {};
      const categoryMonths = {};
      for (const expense of (allExpenses || [])) {
        const cat = expense.type;
        if (!categoryCounts[cat]) { categoryCounts[cat] = 0; }
        categoryCounts[cat] += 1;

        if (!categoryMonths[cat]) { categoryMonths[cat] = new Set(); }
        const d = new Date(expense.date);
        const mk = d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0');
        categoryMonths[cat].add(mk);
      }

      // Pre-compute: collect expenseIds that are inside cluster alerts
      const clusteredExpenseIds = new Set();
      for (const anomaly of anomalies) {
        if (anomaly.cluster && anomaly.cluster.transactions) {
          for (const t of anomaly.cluster.transactions) {
            clusteredExpenseIds.add(t.expenseId);
          }
        }
      }

      const currentMonth = new Date().getMonth() + 1; // 1-12

      const filtered = anomalies.filter(anomaly => {
        const category = anomaly.category;

        // Rule 1: Rare-category suppression
        if (SUPPRESSION_CONFIG.RARE_PURCHASE_CATEGORIES.includes(category)) {
          const histCount = categoryCounts[category] || 0;
          if (histCount < SUPPRESSION_CONFIG.MIN_TRANSACTIONS_FOR_RARE) {
            logger.debug('Suppressed rare-category anomaly:', { category, histCount });
            return false;
          }
        }

        // Rule 2: Seasonal spike suppression
        if (SUPPRESSION_CONFIG.SEASONAL_SPIKE_MONTHS[category] != null) {
          const spikeMonth = SUPPRESSION_CONFIG.SEASONAL_SPIKE_MONTHS[category];
          const monthsWithData = categoryMonths[category] ? categoryMonths[category].size : 0;
          if (currentMonth === spikeMonth && monthsWithData >= DETECTION_THRESHOLDS.MIN_MONTHS_FOR_SEASONAL) {
            logger.debug('Suppressed seasonal-spike anomaly:', { category, currentMonth, spikeMonth });
            return false;
          }
        }

        // Rule 3: Cluster-covered suppression (safety net)
        // Suppress individual anomalies whose expenseId is already in a cluster
        if (anomaly.expenseId != null && !anomaly.cluster && clusteredExpenseIds.has(anomaly.expenseId)) {
          logger.debug('Suppressed cluster-covered anomaly:', { expenseId: anomaly.expenseId });
          return false;
        }

        // Rule 4: Insufficient vendor history suppression
        // Suppress vendor-level anomalies for vendors with < MIN_VENDOR_TRANSACTIONS_FOR_DETECTION
        // historical transactions. Category-level detections (stdDev fallback, daily totals,
        // new merchant, category spikes) are not affected since they don't rely on vendor baselines.
        const vendorKey = (anomaly.place || '').toLowerCase();
        const vendorCache = this._vendorBaselineCache;
        if (vendorCache && vendorKey) {
          const vendorBaseline = vendorCache.get(vendorKey);
          if (vendorBaseline && vendorBaseline.transactionCount < SUPPRESSION_CONFIG.MIN_VENDOR_TRANSACTIONS_FOR_DETECTION) {
            // Check if this anomaly was produced by a vendor-level detector
            const isVendorLevelAnomaly = anomaly.anomalyType === 'new_spending_tier' ||
              (anomaly.reason && anomaly.reason.includes('vendor p95')) ||
              (anomaly.reason && anomaly.reason.includes('days since last visit'));
            if (isVendorLevelAnomaly) {
              logger.debug('Suppressed insufficient vendor history anomaly:', { vendor: anomaly.place, vendorTxnCount: vendorBaseline.transactionCount, anomalyType: anomaly.anomalyType });
              return false;
            }
          }
        }

        // Rule 5: Low category frequency suppression
        // Suppress anomalies for categories with annual frequency < MIN_CATEGORY_ANNUAL_FREQUENCY
        // Only applies to anomaly types that rely on category baselines (amount, category_spending_spike,
        // frequency spikes). New merchant and daily total anomalies are not affected.
        const categoryBaselineTypes = ['amount', 'category_spending_spike'];
        if (categoryBaselineTypes.includes(anomaly.anomalyType)) {
          const catCount = categoryCounts[category] || 0;
          if (catCount > 0 && (allExpenses || []).length > 0) {
            const catExpenses = (allExpenses || []).filter(e => e.type === category);
            if (catExpenses.length > 0) {
              const dates = catExpenses.map(e => new Date(e.date));
              const earliest = new Date(Math.min(...dates));
              const latest = new Date(Math.max(...dates));
              const msSpan = latest - earliest;
              const yearsSpanned = Math.max(msSpan / (365.25 * 24 * 60 * 60 * 1000), 1);
              const annualFrequency = catCount / yearsSpanned;
              if (annualFrequency < SUPPRESSION_CONFIG.MIN_CATEGORY_ANNUAL_FREQUENCY) {
                logger.debug('Suppressed low category frequency anomaly:', { category, annualFrequency: annualFrequency.toFixed(2) });
                return false;
              }
            }
          }
        }

        return true;
      });

      return filtered;
    } catch (error) {
      logger.error('Benign pattern suppression failed:', error);
      return anomalies;
    }
  }

  /**
   * Fetch budget data for the current month from budgetService.
   * Builds a byCategory lookup with { limit, spent, progress, severity } for each budget.
   * Caches the result on this._budgetDataCache for the detection cycle.
   * On failure, returns null so the pipeline continues without budget integration.
   *
   * @returns {Promise<Object|null>} Budget data with byCategory lookup, or null on failure
   * @private
   */
  async _fetchBudgetData() {
    // Return cached result if already fetched this cycle
    if (this._budgetDataCache !== undefined) {
      return this._budgetDataCache;
    }

    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const budgets = await budgetService.getBudgets(year, month);

      if (!budgets || budgets.length === 0) {
        this._budgetDataCache = null;
        return null;
      }

      const byCategory = {};

      // Build list of last 3 months (current + 2 prior) for critical-month counting
      const last3Months = [];
      for (let offset = 0; offset < 3; offset++) {
        let m = month - offset;
        let y = year;
        while (m < 1) { m += 12; y--; }
        last3Months.push({ year: y, month: m });
      }

      for (const budget of budgets) {
        const spent = await budgetService.getSpentAmount(year, month, budget.category);
        const progress = budgetService.calculateProgress(spent, budget.limit);
        const status = budgetService.calculateBudgetStatus(progress);
        // Map 'safe' status to null severity (only warning/danger/critical are meaningful)
        const severity = status === 'safe' ? null : status;

        // Count how many of the last 3 months had Critical severity for this category
        let criticalMonthsInLast3 = 0;
        for (const period of last3Months) {
          try {
            const periodBudgets = await budgetService.getBudgets(period.year, period.month);
            const periodBudget = periodBudgets && periodBudgets.find(b => b.category === budget.category);
            if (periodBudget) {
              const periodSpent = await budgetService.getSpentAmount(period.year, period.month, budget.category);
              const periodProgress = budgetService.calculateProgress(periodSpent, periodBudget.limit);
              if (periodProgress >= 100) {
                criticalMonthsInLast3++;
              }
            }
          } catch (periodErr) {
            logger.debug('Could not check budget history for ' + budget.category + ' ' + period.year + '-' + period.month + ':', periodErr.message);
          }
        }

        byCategory[budget.category] = {
          limit: budget.limit,
          spent,
          progress,
          severity,
          criticalMonthsInLast3
        };
      }

      this._budgetDataCache = { byCategory };
      return this._budgetDataCache;
    } catch (err) {
      logger.warn('Failed to fetch budget data for anomaly detection:', err);
      this._budgetDataCache = null;
      return null;
    }
  }

  /**
   * Suppress Category_Spending_Spike anomalies when the category's budget
   * progress is >= 90% (Danger or Critical severity), because the budget alert
   * already communicates the overspending condition.
   *
   * Other anomaly types are never suppressed by budget status.
   *
   * @param {Array} anomalies - Enriched anomaly array
   * @param {Object|null} budgetData - Budget data with byCategory lookup, or null
   * @returns {Array} Filtered anomaly array
   * @private
   */
  _suppressBudgetCovered(anomalies, budgetData) {
    try {
      if (!anomalies || anomalies.length === 0) {
        return anomalies || [];
      }

      // When budgetData is null/undefined, no suppression possible
      if (!budgetData || !budgetData.byCategory) {
        return anomalies;
      }

      const filtered = anomalies.filter(anomaly => {
        // Only suppress Category_Spending_Spike classification
        if (anomaly.classification !== ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE) {
          return true;
        }

        const categoryBudget = budgetData.byCategory[anomaly.category];
        if (!categoryBudget) {
          return true;
        }

        // Suppress when budget progress >= 90% (Danger or Critical)
        if (categoryBudget.progress >= 90) {
          logger.debug('Suppressed budget-covered Category_Spending_Spike:', {
            category: anomaly.category,
            progress: categoryBudget.progress,
            severity: categoryBudget.severity
          });
          return false;
        }

        return true;
      });

      return filtered;
    } catch (error) {
      logger.error('Budget-covered suppression failed:', error);
      return anomalies;
    }
  }

  /**
   * Attach budget suggestions to behavioral drift alerts.
   *
   * - For drift alerts in categories with NO budget: attach budgetSuggestion
   *   with type 'create_budget' and suggestedLimit = recent 3-month avg rounded
   *   up to nearest $50.
   * - For drift alerts in categories where the budget reached Critical severity
   *   (progress >= 100%) for 2+ of the last 3 months: attach budgetSuggestion
   *   with type 'adjust_budget', currentLimit, and suggestedLimit.
   *
   * Mutates anomalies in-place and returns the array.
   *
   * @param {Array} anomalies - Enriched anomaly array
   * @param {Object|null} budgetData - Budget data with byCategory lookup, or null
   * @returns {Array} The same anomaly array with budgetSuggestion fields attached
   * @private
   */
  _attachBudgetSuggestions(anomalies, budgetData) {
    try {
      if (!anomalies || anomalies.length === 0) {
        return anomalies || [];
      }

      for (const anomaly of anomalies) {
        // Only process drift alerts
        if (anomaly.classification !== ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND) {
          continue;
        }

        const category = anomaly.category;
        const recentAvg = (anomaly._driftData && anomaly._driftData.recentPeriodAvg) || 0;
        const suggestedLimit = Math.ceil(recentAvg / 50) * 50;

        // Case 1: No budget exists for this category → create_budget
        if (!budgetData || !budgetData.byCategory || !budgetData.byCategory[category]) {
          anomaly.budgetSuggestion = {
            type: 'create_budget',
            suggestedLimit: suggestedLimit,
            currentLimit: null
          };
          continue;
        }

        // Case 2: Budget exists — check if Critical for 2+ of last 3 months
        const categoryBudget = budgetData.byCategory[category];

        if (categoryBudget.criticalMonthsInLast3 >= 2) {
          anomaly.budgetSuggestion = {
            type: 'adjust_budget',
            suggestedLimit: suggestedLimit,
            currentLimit: categoryBudget.limit
          };
        }
      }

      return anomalies;
    } catch (error) {
      logger.error('Budget suggestion attachment failed:', error);
      return anomalies;
    }
  }

  /**
   * Apply alert frequency controls to limit alert volume per category.
   * Enforces three rules in order:
   * 1. Repeat suppression: same category + classification within 30-day window → keep most recent
   * 2. Related merge: same category within 7-day window (not in cluster) → merge into consolidated alert
   * 3. Per-category cap: max 3 alerts per category per calendar month
   * @param {Array} anomalies - Enriched anomaly array (post-suppression)
   * @returns {Array} Filtered/merged anomaly array
   * @private
   */
  _applyFrequencyControls(anomalies) {
    try {
      if (!anomalies || anomalies.length === 0) {
        return anomalies || [];
      }

      let result = [...anomalies];

      // Step 1: Suppress repeat alerts (same category + classification) within 30-day window
      // Keep only the most recent occurrence per (category, classification) pair
      result = this._suppressRepeatAlerts(result);

      // Step 2: Merge related anomalies (same category, 7-day window, not in cluster)
      result = this._mergeRelatedAlerts(result);

      // Step 3: Enforce per-category cap (MAX_ALERTS_PER_CATEGORY_PER_MONTH)
      result = this._enforcePerCategoryCap(result);

      // Step 4: Enforce alert limits (type-priority ordering, per-vendor + global caps)
      result = this._enforceAlertLimits(result);

      return result;
    } catch (error) {
      logger.error('Alert frequency controls failed:', error);
      return anomalies;
    }
  }

  /**
   * Suppress repeat alerts: for anomalies sharing the same category and classification
   * within a 30-day window, keep only the most recent.
   * @param {Array} anomalies
   * @returns {Array}
   * @private
   */
  _suppressRepeatAlerts(anomalies) {
    const suppressionDays = THROTTLE_CONFIG.REPEAT_ALERT_SUPPRESSION_DAYS;
    // Group by (category, classification)
    const groups = {};
    for (const anomaly of anomalies) {
      const key = (anomaly.category || '') + '::' + (anomaly.classification || '');
      if (!groups[key]) { groups[key] = []; }
      groups[key].push(anomaly);
    }

    const kept = [];
    for (const group of Object.values(groups)) {
      if (group.length <= 1) {
        kept.push(...group);
        continue;
      }

      // Sort by date descending (most recent first)
      group.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Keep the most recent, then only keep others outside the suppression window
      const mostRecent = group[0];
      kept.push(mostRecent);
      const mostRecentDate = new Date(mostRecent.date);

      for (let i = 1; i < group.length; i++) {
        const diffMs = mostRecentDate - new Date(group[i].date);
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays > suppressionDays) {
          kept.push(group[i]);
        } else {
          logger.debug('Suppressed repeat alert:', {
            category: group[i].category,
            classification: group[i].classification,
            date: group[i].date,
            withinDays: Math.round(diffDays)
          });
        }
      }
    }

    return kept;
  }

  /**
   * Merge related anomalies: same category within a 7-day window, not part of a cluster,
   * are merged into a single consolidated alert.
   * @param {Array} anomalies
   * @returns {Array}
   * @private
   */
  _mergeRelatedAlerts(anomalies) {
    const mergeWindowDays = THROTTLE_CONFIG.RELATED_ALERT_MERGE_WINDOW_DAYS;

    // Separate cluster alerts from non-cluster alerts
    const clusterAlerts = anomalies.filter(a => a.cluster != null);
    const nonCluster = anomalies.filter(a => a.cluster == null);

    // Group non-cluster alerts by category
    const byCategory = {};
    for (const anomaly of nonCluster) {
      const cat = anomaly.category || 'Unknown';
      if (!byCategory[cat]) { byCategory[cat] = []; }
      byCategory[cat].push(anomaly);
    }

    const merged = [];
    for (const group of Object.values(byCategory)) {
      if (group.length <= 1) {
        merged.push(...group);
        continue;
      }

      // Sort by date ascending for window scanning
      group.sort((a, b) => new Date(a.date) - new Date(b.date));

      const consumed = new Set();
      for (let i = 0; i < group.length; i++) {
        if (consumed.has(i)) { continue; }

        const windowStart = new Date(group[i].date);
        const windowEnd = new Date(windowStart);
        windowEnd.setDate(windowEnd.getDate() + mergeWindowDays);

        // Collect all in the merge window
        const windowGroup = [group[i]];
        for (let j = i + 1; j < group.length; j++) {
          if (consumed.has(j)) { continue; }
          if (new Date(group[j].date) <= windowEnd) {
            windowGroup.push(group[j]);
            consumed.add(j);
          }
        }
        consumed.add(i);

        if (windowGroup.length === 1) {
          merged.push(windowGroup[0]);
          continue;
        }

        // Merge into a consolidated alert using the most recent as base
        windowGroup.sort((a, b) => new Date(b.date) - new Date(a.date));
        const base = windowGroup[0];
        const totalAmount = parseFloat(windowGroup.reduce((sum, a) => sum + a.amount, 0).toFixed(2));
        const dates = windowGroup.map(a => a.date).sort();

        const consolidatedAlert = {
          ...base,
          id: Date.now() + Math.random(),
          amount: totalAmount,
          date: dates[dates.length - 1],
          reason: windowGroup.length + ' related alerts in ' + base.category + ' within ' + mergeWindowDays + '-day window (total: $' + totalAmount.toFixed(2) + ')',
          mergedAlertCount: windowGroup.length,
          mergedDateRange: {
            start: dates[0],
            end: dates[dates.length - 1]
          }
        };

        logger.debug('Merged related alerts:', {
          category: base.category,
          count: windowGroup.length,
          totalAmount: totalAmount,
          dateRange: consolidatedAlert.mergedDateRange
        });

        merged.push(consolidatedAlert);
      }
    }

    return [...merged, ...clusterAlerts];
  }

  /**
   * Enforce per-category cap: no more than MAX_ALERTS_PER_CATEGORY_PER_MONTH per category
   * per calendar month. Keeps the most severe/recent alerts.
   * @param {Array} anomalies
   * @returns {Array}
   * @private
   */
  _enforcePerCategoryCap(anomalies) {
    const maxPerCategory = THROTTLE_CONFIG.MAX_ALERTS_PER_CATEGORY_PER_MONTH;
    const severityOrder = { [SEVERITY_LEVELS.HIGH]: 3, [SEVERITY_LEVELS.MEDIUM]: 2, [SEVERITY_LEVELS.LOW]: 1 };

    // Group by (category, calendar month)
    const groups = {};
    for (const anomaly of anomalies) {
      const cat = anomaly.category || 'Unknown';
      const dateObj = new Date(anomaly.date);
      const monthKey = dateObj.getFullYear() + '-' + (dateObj.getMonth() + 1).toString().padStart(2, '0');
      const key = cat + '::' + monthKey;
      if (!groups[key]) { groups[key] = []; }
      groups[key].push(anomaly);
    }

    const result = [];
    for (const group of Object.values(groups)) {
      if (group.length <= maxPerCategory) {
        result.push(...group);
        continue;
      }

      // Sort by severity desc, then date desc — keep the top N
      group.sort((a, b) => {
        const sevDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
        if (sevDiff !== 0) { return sevDiff; }
        return new Date(b.date) - new Date(a.date);
      });

      const kept = group.slice(0, maxPerCategory);
      const dropped = group.slice(maxPerCategory);

      for (const d of dropped) {
        logger.debug('Dropped alert due to per-category cap:', {
          category: d.category,
          date: d.date,
          severity: d.severity
        });
      }

      result.push(...kept);
    }

    return result;
  }

  /**
   * Enforce a global monthly alert cap across all categories.
  // ─── Alert_Prioritizer ────────────────────────────────────────────────
  // Type-priority ordering with deduplication, per-vendor cap, and global cap.

  /**
   * Enforce alert limits using type-priority ordering.
   * Three steps:
   *   1. Deduplicate same vendor+category+classification in current month
   *   2. Per-vendor cap: max 1 alert per vendor per calendar month
   *   3. Global cap: max 3 alerts per calendar month
   *
   * Prior-month anomalies pass through unaffected by all caps.
   * Selection keeps highest type-priority, then severity, then most recent date.
   *
   * @param {Array} anomalies - Array of anomaly objects
   * @returns {Array} Filtered anomaly array
   * @private
   */
  _enforceAlertLimits(anomalies) {
    if (!anomalies || anomalies.length === 0) {
      return anomalies || [];
    }

    const maxPerMonth = THROTTLE_CONFIG.MAX_ALERTS_PER_MONTH;
    const severityOrder = { [SEVERITY_LEVELS.HIGH]: 3, [SEVERITY_LEVELS.MEDIUM]: 2, [SEVERITY_LEVELS.LOW]: 1 };

    const now = new Date();
    const currentMonthKey = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padStart(2, '0');

    // Partition into current-month and prior-month anomalies
    const currentMonth = [];
    const priorMonths = [];
    for (const anomaly of anomalies) {
      const dateObj = new Date(anomaly.date);
      const monthKey = dateObj.getFullYear() + '-' + (dateObj.getMonth() + 1).toString().padStart(2, '0');
      if (monthKey === currentMonthKey) {
        currentMonth.push(anomaly);
      } else {
        priorMonths.push(anomaly);
      }
    }

    // Comparator: type-priority desc → severity desc → date desc (most recent first)
    const compare = (a, b) => {
      const typeDiff = (ALERT_TYPE_PRIORITY[b.classification] || 0) - (ALERT_TYPE_PRIORITY[a.classification] || 0);
      if (typeDiff !== 0) { return typeDiff; }
      const sevDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      if (sevDiff !== 0) { return sevDiff; }
      return new Date(b.date) - new Date(a.date);
    };

    // Step 1: Deduplicate same vendor+category+classification in current month
    const dedupeGroups = {};
    for (const anomaly of currentMonth) {
      const vendor = (anomaly.place || '').toLowerCase();
      const key = vendor + '::' + (anomaly.category || '') + '::' + (anomaly.classification || '');
      if (!dedupeGroups[key]) { dedupeGroups[key] = []; }
      dedupeGroups[key].push(anomaly);
    }

    let deduped = [];
    for (const group of Object.values(dedupeGroups)) {
      if (group.length <= 1) {
        deduped.push(...group);
        continue;
      }
      group.sort(compare);
      deduped.push(group[0]);
      for (let i = 1; i < group.length; i++) {
        logger.debug('Deduplicated alert (same vendor+category+classification):', {
          place: group[i].place,
          category: group[i].category,
          classification: group[i].classification,
          date: group[i].date
        });
      }
    }

    // Step 2: Per-vendor cap — max 1 alert per vendor per calendar month
    const vendorGroups = {};
    for (const anomaly of deduped) {
      const vendor = (anomaly.place || '').toLowerCase();
      if (!vendorGroups[vendor]) { vendorGroups[vendor] = []; }
      vendorGroups[vendor].push(anomaly);
    }

    let vendorCapped = [];
    for (const group of Object.values(vendorGroups)) {
      if (group.length <= 1) {
        vendorCapped.push(...group);
        continue;
      }
      group.sort(compare);
      vendorCapped.push(group[0]);
      for (let i = 1; i < group.length; i++) {
        logger.debug('Dropped alert due to per-vendor monthly cap:', {
          place: group[i].place,
          category: group[i].category,
          classification: group[i].classification,
          date: group[i].date
        });
      }
    }

    // Step 3: Global cap — max 3 alerts per calendar month
    if (vendorCapped.length <= maxPerMonth) {
      return [...vendorCapped, ...priorMonths];
    }

    vendorCapped.sort(compare);
    const kept = vendorCapped.slice(0, maxPerMonth);
    const dropped = vendorCapped.slice(maxPerMonth);

    for (const d of dropped) {
      logger.debug('Dropped alert due to global monthly cap (type-priority):', {
        place: d.place,
        category: d.category,
        classification: d.classification,
        severity: d.severity,
        date: d.date
      });
    }

    return [...kept, ...priorMonths];
  }

  /**
   * Calculate first-visit amounts for all merchants
   */
  _calculateFirstVisitAmounts(expenses) {
    const merchantFirstVisits = {};
    const sortedExpenses = [...expenses].sort((a, b) => new Date(a.date) - new Date(b.date));
    for (const expense of sortedExpenses) {
      const merchantKey = (expense.place || '').toLowerCase();
      if (!merchantFirstVisits[merchantKey]) {
        merchantFirstVisits[merchantKey] = expense.amount;
      }
    }
    return Object.values(merchantFirstVisits);
  }

  _calculateSeverity(deviations) {
    if (deviations >= 5) { return SEVERITY_LEVELS.HIGH; }
    if (deviations >= 4) { return SEVERITY_LEVELS.MEDIUM; }
    return SEVERITY_LEVELS.LOW;
  }

  _calculateDailySeverity(multiplier) {
    if (multiplier >= 4) { return SEVERITY_LEVELS.HIGH; }
    if (multiplier >= 3) { return SEVERITY_LEVELS.MEDIUM; }
    return SEVERITY_LEVELS.LOW;
  }

  /**
   * Dismiss an anomaly (simple dismiss, no suppression rule).
   * Records dismissal with anomaly_type and action='dismiss'.
   * Logs activity event via fire-and-forget.
   * @param {number} expenseId - The expense ID to dismiss
   * @param {string} [anomalyType] - The type of anomaly
   * @param {Object} [expenseDetails] - Optional expense details for logging
   * @returns {Promise<void>}
   */
  async dismissAnomaly(expenseId, anomalyType, expenseDetails) {
    if (!this._dismissedExpenseIdsCache) {
      this._dismissedExpenseIdsCache = new Set();
    }
    if (!this._dismissedAnomalyTypesCache) {
      this._dismissedAnomalyTypesCache = new Set();
    }

    if (expenseId != null) {
      this._dismissedExpenseIdsCache.add(expenseId);
    } else {
      this._dismissedAnomalyTypesCache.add(anomalyType);
    }

    await dbHelper.execute(
      "INSERT OR IGNORE INTO dismissed_anomalies (expense_id, anomaly_type, action) VALUES (?, ?, 'dismiss')",
      [expenseId || null, anomalyType || null]
    );

    logger.debug('Dismissed anomaly:', { expenseId, anomalyType });

    // Activity log — fire-and-forget
    var details = expenseDetails || {};
    var merchant = details.merchant || details.place || 'Unknown';
    var amount = details.amount || 0;
    var classification = this._resolveClassification(anomalyType, details);
    var classLabel = this._classificationLabel(classification);
    this._logActivity(
      'anomaly_dismissed',
      'anomaly',
      expenseId || null,
      'Dismissed ' + classLabel + ' anomaly for ' + merchant + ' (' + amount + ')',
      { anomaly_type: anomalyType, classification: classification, expense_id: expenseId || null, merchant: merchant, amount: amount }
    );
  }

  /**
   * Mark an anomaly as expected (dismiss + create suppression rule).
   * Records dismissal with action='mark_as_expected'.
   * Creates appropriate suppression rule based on anomaly type.
   * Logs activity event via fire-and-forget.
   * @param {number} expenseId - The expense ID
   * @param {string} anomalyType - The type of anomaly
   * @param {Object} expenseDetails - Expense details { merchant, amount, category, date }
   * @returns {Promise<{suppressionRuleId: number}>}
   */
  async markAsExpected(expenseId, anomalyType, expenseDetails) {
    if (!this._dismissedExpenseIdsCache) {
      this._dismissedExpenseIdsCache = new Set();
    }
    if (!this._dismissedAnomalyTypesCache) {
      this._dismissedAnomalyTypesCache = new Set();
    }

    if (expenseId != null) {
      this._dismissedExpenseIdsCache.add(expenseId);
    } else {
      this._dismissedAnomalyTypesCache.add(anomalyType);
    }

    await dbHelper.execute(
      "INSERT OR IGNORE INTO dismissed_anomalies (expense_id, anomaly_type, action) VALUES (?, ?, 'mark_as_expected')",
      [expenseId || null, anomalyType || null]
    );

    var details = expenseDetails || {};
    var suppressionRuleId = await this._createSuppressionRule(anomalyType, details);

    logger.debug('Marked anomaly as expected:', { expenseId, anomalyType, suppressionRuleId });

    // Activity log — fire-and-forget
    var merchant = details.merchant || details.place || 'Unknown';
    var amount = details.amount || 0;
    var classification = this._resolveClassification(anomalyType, details);
    var classLabel = this._classificationLabel(classification);
    this._logActivity(
      'anomaly_marked_expected',
      'anomaly',
      expenseId || null,
      'Marked ' + classLabel + ' anomaly as expected for ' + merchant + ' (' + amount + ')',
      {
        anomaly_type: anomalyType,
        classification: classification,
        expense_id: expenseId || null,
        merchant: merchant,
        amount: amount,
        suppression_rule_id: suppressionRuleId
      }
    );

    return { suppressionRuleId: suppressionRuleId };
  }

  /**
   * Create a suppression rule based on anomaly type.
   * @param {string} anomalyType - The anomaly type
   * @param {Object} expenseDetails - { merchant, amount, category, date }
   * @returns {Promise<number|null>} The created rule ID
   * @private
   */
  async _createSuppressionRule(anomalyType, expenseDetails) {
    var merchant = expenseDetails.merchant || expenseDetails.place || null;
    var amount = expenseDetails.amount || 0;
    var category = expenseDetails.category || null;
    var date = expenseDetails.date || null;

    var sql, params;

    switch (anomalyType) {
      case ANOMALY_TYPES.AMOUNT:
      case 'amount': {
        var amountMin = amount * 0.8;
        var amountMax = amount * 1.2;
        sql = "INSERT INTO anomaly_suppression_rules (rule_type, merchant_name, amount_min, amount_max) VALUES ('merchant_amount', ?, ?, ?)";
        params = [merchant, amountMin, amountMax];
        break;
      }
      case ANOMALY_TYPES.NEW_MERCHANT:
      case 'new_merchant': {
        sql = "INSERT INTO anomaly_suppression_rules (rule_type, merchant_name, category) VALUES ('merchant_category', ?, ?)";
        params = [merchant, category];
        break;
      }
      case ANOMALY_TYPES.DAILY_TOTAL:
      case 'daily_total': {
        sql = "INSERT INTO anomaly_suppression_rules (rule_type, specific_date) VALUES ('specific_date', ?)";
        params = [date];
        break;
      }
      default: {
        logger.warn('Unknown anomaly type for suppression rule:', anomalyType);
        if (merchant && amount > 0) {
          var fallbackMin = amount * 0.8;
          var fallbackMax = amount * 1.2;
          sql = "INSERT INTO anomaly_suppression_rules (rule_type, merchant_name, amount_min, amount_max) VALUES ('merchant_amount', ?, ?, ?)";
          params = [merchant, fallbackMin, fallbackMax];
        } else {
          return null;
        }
      }
    }

    var result = await dbHelper.execute(sql, params);
    return result.lastID;
  }

  /**
   * Get all active suppression rules.
   * @returns {Promise<Array<Object>>}
   */
  async getSuppressionRules() {
    return await dbHelper.queryAll('SELECT * FROM anomaly_suppression_rules ORDER BY created_at DESC');
  }

  /**
   * Delete a suppression rule by ID.
   * Logs activity event via fire-and-forget.
   * @param {number} ruleId - The rule ID to delete
   * @returns {Promise<{deleted: boolean}>}
   */
  async deleteSuppressionRule(ruleId) {
    var rule = await dbHelper.queryOne('SELECT * FROM anomaly_suppression_rules WHERE id = ?', [ruleId]);

    if (!rule) {
      return { deleted: false };
    }

    await dbHelper.execute('DELETE FROM anomaly_suppression_rules WHERE id = ?', [ruleId]);

    logger.debug('Deleted suppression rule:', { ruleId: ruleId });

    // Activity log — fire-and-forget
    var merchantSuffix = rule.merchant_name ? ' for ' + rule.merchant_name : '';
    this._logActivity(
      'suppression_rule_deleted',
      'suppression_rule',
      ruleId,
      'Deleted ' + rule.rule_type + ' suppression rule' + merchantSuffix,
      {
        rule_type: rule.rule_type,
        merchant_name: rule.merchant_name,
        category: rule.category,
        amount_min: rule.amount_min,
        amount_max: rule.amount_max,
        specific_date: rule.specific_date
      }
    );

    return { deleted: true };
  }

  /**
   * Apply suppression rules to filter out matching anomalies.
   * Uses case-insensitive merchant name comparison and amount range inclusivity.
   * Called internally during detectAnomalies().
   * @param {Array<Object>} anomalies - Detected anomalies
   * @param {Array<Object>} rules - Active suppression rules
   * @returns {Array<Object>} Filtered anomalies (non-matching ones)
   */
  _applySuppressionRules(anomalies, rules) {
    if (!rules || rules.length === 0) { return anomalies; }
    return anomalies.filter(anomaly => {
      var isSuppressed = rules.some(rule => this._ruleMatchesAnomaly(rule, anomaly));
      return !isSuppressed;
    });
  }

  /**
   * Check if a suppression rule matches an anomaly.
   * @private
   */
  _ruleMatchesAnomaly(rule, anomaly) {
    switch (rule.rule_type) {
      case 'merchant_amount': {
        var merchantMatch = rule.merchant_name && anomaly.place &&
          rule.merchant_name.toLowerCase() === anomaly.place.toLowerCase();
        var amountMatch = rule.amount_min != null && rule.amount_max != null &&
          anomaly.amount >= rule.amount_min && anomaly.amount <= rule.amount_max;
        return merchantMatch && amountMatch;
      }
      case 'merchant_category': {
        var mcMerchantMatch = rule.merchant_name && anomaly.place &&
          rule.merchant_name.toLowerCase() === anomaly.place.toLowerCase();
        var categoryMatch = rule.category && anomaly.category &&
          rule.category === anomaly.category;
        return mcMerchantMatch && categoryMatch;
      }
      case 'specific_date': {
        return rule.specific_date && anomaly.date && rule.specific_date === anomaly.date;
      }
      default:
        return false;
    }
  }

  /**
   * Get list of dismissed expense IDs
   * @returns {Promise<Array<number>>}
   */
  async getDismissedAnomalies() {
    var dismissedIds = await this._loadDismissedExpenseIds();
    return Array.from(dismissedIds);
  }

  /**
   * Clear dismissed anomalies (for testing)
   * @returns {Promise<void>}
   */
  async clearDismissedAnomalies() {
    this._dismissedExpenseIdsCache = new Set();
    this._dismissedAnomalyTypesCache = new Set();
    if (process.env.NODE_ENV === 'test') {
      try {
        await dbHelper.execute('DELETE FROM dismissed_anomalies');
      } catch (err) {
        logger.debug('Could not clear dismissed_anomalies table:', err.message);
      }
    }
  }
}

module.exports = new AnomalyDetectionService();
