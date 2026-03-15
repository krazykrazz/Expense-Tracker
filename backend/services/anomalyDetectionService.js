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
const dbHelper = require('../utils/dbHelper');
const activityLogService = require('./activityLogService');
const logger = require('../config/logger');
const { 
  ANALYTICS_CONFIG, 
  ANOMALY_TYPES,
  SEVERITY_LEVELS 
} = require('../utils/analyticsConstants');

class AnomalyDetectionService {
  constructor() {
    // Cache for dismissed expense IDs (loaded from database on first use)
    this._dismissedExpenseIdsCache = null;
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
      const rows = await dbHelper.queryAll('SELECT expense_id FROM dismissed_anomalies');
      this._dismissedExpenseIdsCache = new Set(rows.map(r => r.expense_id));
      logger.debug('Loaded ' + this._dismissedExpenseIdsCache.size + ' dismissed anomalies from database');
    } catch (err) {
      logger.error('Error loading dismissed anomalies:', err);
      this._dismissedExpenseIdsCache = new Set();
    }

    return this._dismissedExpenseIdsCache;
  }

  /**
   * Calculate baseline statistics for a category
   * @param {string} category - The expense category
   * @returns {Promise<CategoryBaseline>}
   */
  async calculateCategoryBaseline(category) {
    try {
      const expenses = await expenseRepository.findAll();
      
      if (!expenses || expenses.length === 0) {
        return { category, mean: 0, stdDev: 0, count: 0, monthsWithData: 0, hasValidBaseline: false };
      }

      const categoryExpenses = expenses.filter(e => e.type === category);
      
      if (categoryExpenses.length === 0) {
        return { category, mean: 0, stdDev: 0, count: 0, monthsWithData: 0, hasValidBaseline: false };
      }

      const expensesByMonth = this._groupExpensesByMonth(categoryExpenses);
      const monthsWithData = Object.keys(expensesByMonth).length;
      const amounts = categoryExpenses.map(e => e.amount);
      const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
      const squaredDiffs = amounts.map(a => Math.pow(a - mean, 2));
      const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / amounts.length;
      const stdDev = Math.sqrt(variance);

      return {
        category,
        mean: parseFloat(mean.toFixed(2)),
        stdDev: parseFloat(stdDev.toFixed(2)),
        count: amounts.length,
        monthsWithData,
        hasValidBaseline: amounts.length >= ANALYTICS_CONFIG.MIN_OCCURRENCES_FOR_PATTERN
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

      const anomalies = [];

      const amountAnomalies = await this._detectAmountAnomalies(recentExpenses, expenses);
      anomalies.push(...amountAnomalies);

      const dailyAnomalies = await this._detectDailyTotalAnomalies(recentExpenses, expenses);
      anomalies.push(...dailyAnomalies);

      const merchantAnomalies = await this._detectNewMerchantAnomalies(recentExpenses, expenses);
      anomalies.push(...merchantAnomalies);

      // Filter out dismissed anomalies
      const dismissedExpenseIds = await this._loadDismissedExpenseIds();
      let filteredAnomalies = anomalies.filter(a => !dismissedExpenseIds.has(a.expenseId));

      // Apply suppression rules to filter out matching anomalies
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
      return filteredAnomalies;
    } catch (error) {
      logger.error('Error detecting anomalies:', error);
      throw error;
    }
  }

  /**
   * Detect amount anomalies (expenses > 3 standard deviations from category average)
   */
  async _detectAmountAnomalies(recentExpenses, allExpenses) {
    const anomalies = [];
    const categoryBaselines = {};

    for (const expense of recentExpenses) {
      if (!categoryBaselines[expense.type]) {
        categoryBaselines[expense.type] = await this.calculateCategoryBaseline(expense.type);
      }
      const baseline = categoryBaselines[expense.type];
      if (!baseline.hasValidBaseline || baseline.stdDev === 0) { continue; }

      const deviations = (expense.amount - baseline.mean) / baseline.stdDev;

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
          reason: 'Amount ' + expense.amount.toFixed(2) + ' is ' + deviations.toFixed(1) + ' standard deviations above the category average of ' + baseline.mean.toFixed(2),
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
    this._dismissedExpenseIdsCache.add(expenseId);

    await dbHelper.execute(
      "INSERT OR IGNORE INTO dismissed_anomalies (expense_id, anomaly_type, action) VALUES (?, ?, 'dismiss')",
      [expenseId, anomalyType || null]
    );

    logger.debug('Dismissed anomaly for expense:', { expenseId, anomalyType });

    // Activity log — fire-and-forget
    var details = expenseDetails || {};
    var merchant = details.merchant || details.place || 'Unknown';
    var amount = details.amount || 0;
    this._logActivity(
      'anomaly_dismissed',
      'anomaly',
      expenseId,
      'Dismissed ' + (anomalyType || 'unknown') + ' anomaly for ' + merchant + ' (' + amount + ')',
      { anomaly_type: anomalyType, expense_id: expenseId, merchant: merchant, amount: amount }
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
    this._dismissedExpenseIdsCache.add(expenseId);

    await dbHelper.execute(
      "INSERT OR IGNORE INTO dismissed_anomalies (expense_id, anomaly_type, action) VALUES (?, ?, 'mark_as_expected')",
      [expenseId, anomalyType || null]
    );

    var details = expenseDetails || {};
    var suppressionRuleId = await this._createSuppressionRule(anomalyType, details);

    logger.debug('Marked anomaly as expected:', { expenseId, anomalyType, suppressionRuleId });

    // Activity log — fire-and-forget
    var merchant = details.merchant || details.place || 'Unknown';
    var amount = details.amount || 0;
    this._logActivity(
      'anomaly_marked_expected',
      'anomaly',
      expenseId,
      'Marked ' + (anomalyType || 'unknown') + ' anomaly as expected for ' + merchant + ' (' + amount + ')',
      {
        anomaly_type: anomalyType,
        expense_id: expenseId,
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
