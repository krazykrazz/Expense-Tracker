/**
 * AnomalyDetectionService
 * 
 * Detects unusual spending patterns by comparing expenses against
 * historical baselines. Identifies amount anomalies, daily total anomalies,
 * and new merchant anomalies.
 * 
 * Part of the Spending Patterns & Predictions feature.
 */

const expenseRepository = require('../repositories/expenseRepository');
const { getDatabase } = require('../database/db');
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
   * Load dismissed expense IDs from database
   * @returns {Promise<Set<number>>}
   */
  async _loadDismissedExpenseIds() {
    if (this._dismissedExpenseIdsCache !== null) {
      return this._dismissedExpenseIdsCache;
    }

    // Get database (may be a promise in test mode)
    let db = getDatabase();
    if (db && typeof db.then === 'function') {
      db = await db;
    }

    if (!db || typeof db.get !== 'function') {
      this._dismissedExpenseIdsCache = new Set();
      return this._dismissedExpenseIdsCache;
    }

    return new Promise((resolve) => {
      // Check if table exists first
      db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='dismissed_anomalies'",
        (err, row) => {
          if (err) {
            logger.error('Error checking dismissed_anomalies table:', err);
            // Return empty set on error to avoid breaking anomaly detection
            this._dismissedExpenseIdsCache = new Set();
            return resolve(this._dismissedExpenseIdsCache);
          }

          if (!row) {
            // Table doesn't exist yet (migration not run)
            this._dismissedExpenseIdsCache = new Set();
            return resolve(this._dismissedExpenseIdsCache);
          }

          db.all('SELECT expense_id FROM dismissed_anomalies', (err, rows) => {
            if (err) {
              logger.error('Error loading dismissed anomalies:', err);
              this._dismissedExpenseIdsCache = new Set();
              return resolve(this._dismissedExpenseIdsCache);
            }

            this._dismissedExpenseIdsCache = new Set(rows.map(r => r.expense_id));
            logger.debug(`Loaded ${this._dismissedExpenseIdsCache.size} dismissed anomalies from database`);
            resolve(this._dismissedExpenseIdsCache);
          });
        }
      );
    });
  }

  /**
   * Calculate baseline statistics for a category
   * Excludes months with gaps (no expenses) from calculations
   * @param {string} category - The expense category
   * @returns {Promise<CategoryBaseline>}
   */
  async calculateCategoryBaseline(category) {
    try {
      const expenses = await expenseRepository.findAll();
      
      if (!expenses || expenses.length === 0) {
        return {
          category,
          mean: 0,
          stdDev: 0,
          count: 0,
          monthsWithData: 0,
          hasValidBaseline: false
        };
      }

      // Filter expenses by category
      const categoryExpenses = expenses.filter(e => e.type === category);
      
      if (categoryExpenses.length === 0) {
        return {
          category,
          mean: 0,
          stdDev: 0,
          count: 0,
          monthsWithData: 0,
          hasValidBaseline: false
        };
      }

      // Group expenses by month to identify gaps
      const expensesByMonth = this._groupExpensesByMonth(categoryExpenses);
      const monthsWithData = Object.keys(expensesByMonth).length;

      // Get all amounts from months with data (excluding gap months)
      const amounts = categoryExpenses.map(e => e.amount);
      
      // Calculate mean
      const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
      
      // Calculate standard deviation
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
      const key = `${year}-${month}`;
      
      if (!grouped[key]) {
        grouped[key] = [];
      }
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
      
      if (!expenses || expenses.length === 0) {
        return [];
      }

      // Calculate lookback date
      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);
      const lookbackDateStr = lookbackDate.toISOString().split('T')[0];

      // Filter to recent expenses
      const recentExpenses = expenses.filter(e => e.date >= lookbackDateStr);
      
      if (recentExpenses.length === 0) {
        return [];
      }

      const anomalies = [];

      // Detect amount anomalies
      const amountAnomalies = await this._detectAmountAnomalies(recentExpenses, expenses);
      anomalies.push(...amountAnomalies);

      // Detect daily total anomalies
      const dailyAnomalies = await this._detectDailyTotalAnomalies(recentExpenses, expenses);
      anomalies.push(...dailyAnomalies);

      // Detect new merchant anomalies
      const merchantAnomalies = await this._detectNewMerchantAnomalies(recentExpenses, expenses);
      anomalies.push(...merchantAnomalies);

      // Filter out dismissed anomalies (loaded from database)
      const dismissedExpenseIds = await this._loadDismissedExpenseIds();
      const filteredAnomalies = anomalies.filter(a => !dismissedExpenseIds.has(a.expenseId));

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
   * @param {Array} recentExpenses - Recent expenses to check
   * @param {Array} allExpenses - All expenses for baseline calculation
   * @returns {Promise<Array<Anomaly>>}
   */
  async _detectAmountAnomalies(recentExpenses, allExpenses) {
    const anomalies = [];
    const categoryBaselines = {};

    for (const expense of recentExpenses) {
      // Get or calculate baseline for this category
      if (!categoryBaselines[expense.type]) {
        categoryBaselines[expense.type] = await this.calculateCategoryBaseline(expense.type);
      }
      
      const baseline = categoryBaselines[expense.type];
      
      // Skip if no valid baseline
      if (!baseline.hasValidBaseline || baseline.stdDev === 0) {
        continue;
      }

      // Calculate how many standard deviations from mean
      const deviations = (expense.amount - baseline.mean) / baseline.stdDev;

      // Flag if > 3 standard deviations
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
          reason: `Amount $${expense.amount.toFixed(2)} is ${deviations.toFixed(1)} standard deviations above the category average of $${baseline.mean.toFixed(2)}`,
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
   * @param {Array} recentExpenses - Recent expenses to check
   * @param {Array} allExpenses - All expenses for baseline calculation
   * @returns {Promise<Array<Anomaly>>}
   */
  async _detectDailyTotalAnomalies(recentExpenses, allExpenses) {
    const anomalies = [];

    // Calculate daily average from all expenses
    const dailyTotals = this._calculateDailyTotals(allExpenses);
    const dailyValues = Object.values(dailyTotals);
    
    if (dailyValues.length === 0) {
      return [];
    }

    const dailyAverage = dailyValues.reduce((sum, d) => sum + d, 0) / dailyValues.length;
    const threshold = dailyAverage * ANALYTICS_CONFIG.DAILY_ANOMALY_MULTIPLIER;

    // Calculate daily totals for recent expenses
    const recentDailyTotals = this._calculateDailyTotals(recentExpenses);

    // Check each day against threshold
    for (const [date, total] of Object.entries(recentDailyTotals)) {
      if (total > threshold) {
        // Find the expenses for this day to report
        const dayExpenses = recentExpenses.filter(e => e.date === date);
        const expenseCount = dayExpenses.length;
        const multiplier = total / dailyAverage;
        const severity = this._calculateDailySeverity(multiplier);

        // Create anomaly for the highest expense of the day
        const highestExpense = dayExpenses.reduce((max, e) => 
          e.amount > max.amount ? e : max, dayExpenses[0]);

        anomalies.push({
          id: anomalies.length + 1,
          expenseId: highestExpense.id,
          date: date,
          place: highestExpense.place,
          amount: total,
          category: 'Multiple',
          anomalyType: ANOMALY_TYPES.DAILY_TOTAL,
          reason: `${expenseCount} expense${expenseCount > 1 ? 's' : ''} totaling $${total.toFixed(2)} (${multiplier.toFixed(1)}x daily avg of $${dailyAverage.toFixed(2)})`,
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
   * @param {Array} expenses - Expenses to calculate totals for
   * @returns {Object} Object with date keys and total values
   */
  _calculateDailyTotals(expenses) {
    const dailyTotals = {};
    
    for (const expense of expenses) {
      if (!dailyTotals[expense.date]) {
        dailyTotals[expense.date] = 0;
      }
      dailyTotals[expense.date] += expense.amount;
    }
    
    return dailyTotals;
  }


  /**
   * Detect new merchant anomalies (first-time visits with unusually high amounts)
   * @param {Array} recentExpenses - Recent expenses to check
   * @param {Array} allExpenses - All expenses for baseline calculation
   * @returns {Promise<Array<Anomaly>>}
   */
  async _detectNewMerchantAnomalies(recentExpenses, allExpenses) {
    const anomalies = [];

    // Calculate typical first-visit amount across all merchants
    const firstVisitAmounts = this._calculateFirstVisitAmounts(allExpenses);
    
    if (firstVisitAmounts.length === 0) {
      return [];
    }

    // Calculate mean and std dev of first visit amounts
    const mean = firstVisitAmounts.reduce((sum, a) => sum + a, 0) / firstVisitAmounts.length;
    const variance = firstVisitAmounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / firstVisitAmounts.length;
    const stdDev = Math.sqrt(variance);

    // Threshold: mean + 2 standard deviations (slightly lower than amount anomaly)
    const threshold = mean + (stdDev * 2);

    // Find merchants that appear for the first time in recent expenses
    const historicalMerchants = new Set();
    const recentDates = new Set(recentExpenses.map(e => e.date));
    
    for (const expense of allExpenses) {
      if (!recentDates.has(expense.date)) {
        historicalMerchants.add((expense.place || '').toLowerCase());
      }
    }

    // Check recent expenses for new merchants with high amounts
    for (const expense of recentExpenses) {
      const merchantKey = (expense.place || '').toLowerCase();
      
      // Skip if merchant was seen before recent period
      if (historicalMerchants.has(merchantKey)) {
        continue;
      }

      // Check if this is the first occurrence of this merchant in recent expenses
      const merchantExpenses = recentExpenses.filter(e => 
        (e.place || '').toLowerCase() === merchantKey
      );
      
      // Only flag the first visit
      const firstVisit = merchantExpenses.reduce((first, e) => 
        e.date < first.date ? e : first, merchantExpenses[0]);
      
      if (expense.id !== firstVisit.id) {
        continue;
      }

      // Check if amount exceeds threshold
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
          reason: `First visit to "${expense.place}" with amount $${expense.amount.toFixed(2)} exceeds typical first-visit amount of $${mean.toFixed(2)}`,
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
   * @param {Array} expenses - All expenses
   * @returns {Array<number>} Array of first-visit amounts
   */
  _calculateFirstVisitAmounts(expenses) {
    const merchantFirstVisits = {};
    
    // Sort by date to find first visits
    const sortedExpenses = [...expenses].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    for (const expense of sortedExpenses) {
      const merchantKey = (expense.place || '').toLowerCase();
      
      if (!merchantFirstVisits[merchantKey]) {
        merchantFirstVisits[merchantKey] = expense.amount;
      }
    }

    return Object.values(merchantFirstVisits);
  }

  /**
   * Calculate severity based on standard deviations
   * @param {number} deviations - Number of standard deviations
   * @returns {string} Severity level
   */
  _calculateSeverity(deviations) {
    if (deviations >= 5) {
      return SEVERITY_LEVELS.HIGH;
    } else if (deviations >= 4) {
      return SEVERITY_LEVELS.MEDIUM;
    }
    return SEVERITY_LEVELS.LOW;
  }

  /**
   * Calculate severity for daily anomalies based on multiplier
   * @param {number} multiplier - How many times the daily average
   * @returns {string} Severity level
   */
  _calculateDailySeverity(multiplier) {
    if (multiplier >= 4) {
      return SEVERITY_LEVELS.HIGH;
    } else if (multiplier >= 3) {
      return SEVERITY_LEVELS.MEDIUM;
    }
    return SEVERITY_LEVELS.LOW;
  }

  /**
   * Dismiss an anomaly (mark as expected behavior)
   * Persists to database so it survives container restarts
   * @param {number} expenseId - The expense ID to dismiss
   * @returns {Promise<void>}
   */
  async dismissAnomaly(expenseId) {
    // Update cache immediately
    if (!this._dismissedExpenseIdsCache) {
      this._dismissedExpenseIdsCache = new Set();
    }
    this._dismissedExpenseIdsCache.add(expenseId);

    // Get database (may be a promise in test mode)
    let db = getDatabase();
    if (db && typeof db.then === 'function') {
      db = await db;
    }

    if (!db || typeof db.get !== 'function') {
      logger.debug('Database not available for persisting dismissed anomaly');
      return;
    }

    return new Promise((resolve, reject) => {
      // Check if table exists first
      db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='dismissed_anomalies'",
        (err, row) => {
          if (err) {
            logger.error('Error checking dismissed_anomalies table:', err);
            return reject(err);
          }

          if (!row) {
            // Table doesn't exist yet - create it inline
            db.run(`
              CREATE TABLE IF NOT EXISTS dismissed_anomalies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                expense_id INTEGER NOT NULL,
                dismissed_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(expense_id),
                FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
              )
            `, (err) => {
              if (err) {
                logger.error('Error creating dismissed_anomalies table:', err);
                return reject(err);
              }
              // Now insert
              this._insertDismissedAnomaly(db, expenseId, resolve, reject);
            });
          } else {
            this._insertDismissedAnomaly(db, expenseId, resolve, reject);
          }
        }
      );
    });
  }

  /**
   * Helper to insert dismissed anomaly
   * @private
   */
  _insertDismissedAnomaly(db, expenseId, resolve, reject) {
    db.run(
      'INSERT OR IGNORE INTO dismissed_anomalies (expense_id) VALUES (?)',
      [expenseId],
      (err) => {
        if (err) {
          logger.error('Error dismissing anomaly:', err);
          return reject(err);
        }
        
        // Update cache
        if (this._dismissedExpenseIdsCache) {
          this._dismissedExpenseIdsCache.add(expenseId);
        }
        
        logger.debug('Dismissed anomaly for expense:', expenseId);
        resolve();
      }
    );
  }

  /**
   * Get list of dismissed expense IDs
   * @returns {Promise<Array<number>>}
   */
  async getDismissedAnomalies() {
    const dismissedIds = await this._loadDismissedExpenseIds();
    return Array.from(dismissedIds);
  }

  /**
   * Clear dismissed anomalies (for testing)
   * @returns {Promise<void>}
   */
  async clearDismissedAnomalies() {
    // Clear cache
    this._dismissedExpenseIdsCache = new Set();
    
    // Also clear from database if in test environment
    if (process.env.NODE_ENV === 'test') {
      return new Promise((resolve) => {
        const db = getDatabase();
        
        // Handle both sync and async getDatabase
        const clearTable = (database) => {
          database.run('DELETE FROM dismissed_anomalies', (err) => {
            if (err) {
              logger.debug('Could not clear dismissed_anomalies table (may not exist):', err.message);
            }
            resolve();
          });
        };

        if (db && typeof db.then === 'function') {
          // It's a promise
          db.then(clearTable).catch(() => resolve());
        } else if (db && typeof db.run === 'function') {
          // It's already a database instance
          clearTable(db);
        } else {
          resolve();
        }
      });
    }
  }
}

module.exports = new AnomalyDetectionService();
