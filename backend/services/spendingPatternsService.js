/**
 * SpendingPatternsService
 * 
 * Analyzes historical expense data to identify recurring patterns,
 * day-of-week spending habits, and seasonal trends.
 * 
 * Part of the Spending Patterns & Predictions feature.
 */

const expenseRepository = require('../repositories/expenseRepository');
const logger = require('../config/logger');
const { 
  ANALYTICS_CONFIG, 
  PATTERN_FREQUENCIES,
  CONFIDENCE_LEVELS 
} = require('../utils/analyticsConstants');

class SpendingPatternsService {
  /**
   * Check if sufficient data exists for pattern analysis
   * @returns {Promise<DataSufficiencyResult>}
   */
  async checkDataSufficiency() {
    try {
      // Get all expenses to analyze date range
      const expenses = await expenseRepository.findAll();
      
      if (!expenses || expenses.length === 0) {
        return {
          hasSufficientData: false,
          monthsOfData: 0,
          requiredMonths: ANALYTICS_CONFIG.MIN_MONTHS_FOR_PATTERNS,
          oldestExpenseDate: null,
          newestExpenseDate: null,
          dataQualityScore: 0,
          availableFeatures: {
            recurringPatterns: false,
            predictions: false,
            seasonalAnalysis: false,
            dayOfWeekAnalysis: false,
            anomalyDetection: false
          },
          missingDataMessage: `No expense data found. Add at least ${ANALYTICS_CONFIG.MIN_MONTHS_FOR_PATTERNS} months of expenses to enable pattern analysis.`
        };
      }

      // Sort expenses by date
      const sortedExpenses = [...expenses].sort((a, b) => 
        new Date(a.date) - new Date(b.date)
      );

      const oldestExpenseDate = sortedExpenses[0].date;
      const newestExpenseDate = sortedExpenses[sortedExpenses.length - 1].date;

      // Calculate months of data
      const monthsOfData = this._calculateMonthsOfData(oldestExpenseDate, newestExpenseDate);
      
      // Calculate data quality score
      const dataQualityScore = this._calculateDataQualityScore(expenses, oldestExpenseDate, newestExpenseDate);

      // Determine available features based on data
      const availableFeatures = {
        recurringPatterns: monthsOfData >= ANALYTICS_CONFIG.MIN_MONTHS_FOR_PATTERNS,
        predictions: monthsOfData >= ANALYTICS_CONFIG.MIN_MONTHS_FOR_PREDICTIONS,
        seasonalAnalysis: monthsOfData >= ANALYTICS_CONFIG.MIN_MONTHS_FOR_SEASONAL,
        dayOfWeekAnalysis: monthsOfData >= ANALYTICS_CONFIG.MIN_MONTHS_FOR_PREDICTIONS,
        anomalyDetection: monthsOfData >= ANALYTICS_CONFIG.MIN_MONTHS_FOR_PATTERNS
      };

      const hasSufficientData = monthsOfData >= ANALYTICS_CONFIG.MIN_MONTHS_FOR_PATTERNS;

      // Generate missing data message if needed
      let missingDataMessage = null;
      if (!hasSufficientData) {
        const monthsNeeded = ANALYTICS_CONFIG.MIN_MONTHS_FOR_PATTERNS - monthsOfData;
        missingDataMessage = `Need ${monthsNeeded} more month${monthsNeeded > 1 ? 's' : ''} of data for pattern analysis. Currently have ${monthsOfData} month${monthsOfData !== 1 ? 's' : ''}.`;
      }

      return {
        hasSufficientData,
        monthsOfData,
        requiredMonths: ANALYTICS_CONFIG.MIN_MONTHS_FOR_PATTERNS,
        oldestExpenseDate,
        newestExpenseDate,
        dataQualityScore,
        availableFeatures,
        missingDataMessage
      };
    } catch (error) {
      logger.error('Error checking data sufficiency:', error);
      throw error;
    }
  }

  /**
   * Calculate the number of months between two dates
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {number} Number of months
   */
  _calculateMonthsOfData(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const yearDiff = end.getFullYear() - start.getFullYear();
    const monthDiff = end.getMonth() - start.getMonth();
    
    // Add 1 because we count both the start and end months
    return Math.max(1, yearDiff * 12 + monthDiff + 1);
  }

  /**
   * Calculate data quality score based on consistency and completeness
   * @param {Array} expenses - Array of expense objects
   * @param {string} startDate - Oldest expense date
   * @param {string} endDate - Newest expense date
   * @returns {number} Quality score 0-100
   */
  _calculateDataQualityScore(expenses, startDate, endDate) {
    if (!expenses || expenses.length === 0) {
      return 0;
    }

    // Get all months in the range
    const monthsInRange = this._getMonthsInRange(startDate, endDate);
    const totalMonths = monthsInRange.length;
    
    if (totalMonths === 0) {
      return 0;
    }

    // Count months with expenses
    const expensesByMonth = this._groupExpensesByMonth(expenses);
    const monthsWithData = Object.keys(expensesByMonth).length;

    // Calculate coverage percentage (months with data / total months)
    const coverageScore = (monthsWithData / totalMonths) * 100;

    // Calculate consistency score (based on expense frequency variance)
    const expenseCounts = Object.values(expensesByMonth).map(e => e.length);
    const avgExpenses = expenseCounts.reduce((a, b) => a + b, 0) / expenseCounts.length;
    
    let consistencyScore = 100;
    if (avgExpenses > 0 && expenseCounts.length > 1) {
      const variance = expenseCounts.reduce((sum, count) => 
        sum + Math.pow(count - avgExpenses, 2), 0) / expenseCounts.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = stdDev / avgExpenses;
      // Lower CV = more consistent = higher score
      consistencyScore = Math.max(0, 100 - (coefficientOfVariation * ANALYTICS_CONFIG.CV_MULTIPLIER));
    }

    // Combined score (weighted average)
    const qualityScore = Math.round((coverageScore * ANALYTICS_CONFIG.COVERAGE_WEIGHT) + (consistencyScore * ANALYTICS_CONFIG.CONSISTENCY_WEIGHT));
    
    return Math.min(100, Math.max(0, qualityScore));
  }

  /**
   * Get all year-month combinations in a date range
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Array<string>} Array of 'YYYY-MM' strings
   */
  _getMonthsInRange(startDate, endDate) {
    const months = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    
    while (current <= endMonth) {
      const year = current.getFullYear();
      const month = (current.getMonth() + 1).toString().padStart(2, '0');
      months.push(`${year}-${month}`);
      current.setMonth(current.getMonth() + 1);
    }
    
    return months;
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
   * Identify recurring expense patterns
   * @param {Object} options - { minMonths: 3, toleranceDays: 3 }
   * @returns {Promise<Array<RecurringPattern>>}
   */
  async getRecurringPatterns(options = {}) {
    try {
      const toleranceDays = options.toleranceDays || ANALYTICS_CONFIG.PATTERN_TOLERANCE_DAYS;
      const minOccurrences = options.minOccurrences || ANALYTICS_CONFIG.MIN_OCCURRENCES_FOR_PATTERN;

      // Check data sufficiency first
      const sufficiency = await this.checkDataSufficiency();
      if (!sufficiency.availableFeatures.recurringPatterns) {
        return [];
      }

      // Get all expenses
      const expenses = await expenseRepository.findAll();
      if (!expenses || expenses.length === 0) {
        return [];
      }

      // Group expenses by merchant (place)
      const expensesByMerchant = this._groupExpensesByMerchant(expenses);
      
      const patterns = [];

      for (const [merchantName, merchantExpenses] of Object.entries(expensesByMerchant)) {
        // Need at least minOccurrences to detect a pattern
        if (merchantExpenses.length < minOccurrences) {
          continue;
        }

        // Sort by date
        const sortedExpenses = [...merchantExpenses].sort((a, b) => 
          new Date(a.date) - new Date(b.date)
        );

        // Detect frequency pattern
        const frequencyResult = this._detectFrequency(sortedExpenses, toleranceDays);
        
        if (frequencyResult && frequencyResult.occurrenceCount >= minOccurrences) {
          // Calculate amount statistics
          const amounts = sortedExpenses.map(e => e.amount);
          const averageAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
          const minAmount = Math.min(...amounts);
          const maxAmount = Math.max(...amounts);

          // Get the most common category
          const categoryCount = {};
          sortedExpenses.forEach(e => {
            categoryCount[e.type] = (categoryCount[e.type] || 0) + 1;
          });
          const category = Object.entries(categoryCount)
            .sort((a, b) => b[1] - a[1])[0][0];

          // Calculate next expected date
          const lastExpense = sortedExpenses[sortedExpenses.length - 1];
          const nextExpected = this._calculateNextExpected(lastExpense.date, frequencyResult.frequency);

          // Calculate confidence based on consistency
          const confidence = this._calculatePatternConfidence(sortedExpenses, frequencyResult);

          patterns.push({
            merchantName,
            category,
            frequency: frequencyResult.frequency,
            averageAmount: parseFloat(averageAmount.toFixed(2)),
            amountVariance: {
              min: parseFloat(minAmount.toFixed(2)),
              max: parseFloat(maxAmount.toFixed(2))
            },
            occurrenceCount: frequencyResult.occurrenceCount,
            lastOccurrence: lastExpense.date,
            nextExpected,
            confidence
          });
        }
      }

      // Sort by occurrence count descending
      patterns.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

      return patterns;
    } catch (error) {
      logger.error('Error getting recurring patterns:', error);
      throw error;
    }
  }

  /**
   * Group expenses by merchant name
   * @param {Array} expenses - Array of expense objects
   * @returns {Object} Object with merchant names as keys
   */
  _groupExpensesByMerchant(expenses) {
    // Use Object.create(null) to avoid prototype pollution issues
    const grouped = Object.create(null);
    
    for (const expense of expenses) {
      const merchant = expense.place || 'Unknown';
      if (!grouped[merchant]) {
        grouped[merchant] = [];
      }
      grouped[merchant].push(expense);
    }
    
    return grouped;
  }

  /**
   * Detect the frequency pattern of expenses
   * @param {Array} sortedExpenses - Expenses sorted by date
   * @param {number} toleranceDays - Tolerance in days for matching
   * @returns {Object|null} Frequency result or null
   */
  _detectFrequency(sortedExpenses, toleranceDays) {
    if (sortedExpenses.length < 2) {
      return null;
    }

    // Calculate intervals between consecutive expenses
    const intervals = [];
    for (let i = 1; i < sortedExpenses.length; i++) {
      const prevDate = new Date(sortedExpenses[i - 1].date);
      const currDate = new Date(sortedExpenses[i].date);
      const daysDiff = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));
      intervals.push(daysDiff);
    }

    // Check for weekly pattern (7 days ± tolerance)
    const weeklyMatches = intervals.filter(d => Math.abs(d - ANALYTICS_CONFIG.WEEKLY_INTERVAL) <= toleranceDays).length;
    if (weeklyMatches >= intervals.length * ANALYTICS_CONFIG.PATTERN_MATCH_THRESHOLD) {
      return {
        frequency: PATTERN_FREQUENCIES.WEEKLY,
        occurrenceCount: sortedExpenses.length,
        avgInterval: ANALYTICS_CONFIG.WEEKLY_INTERVAL
      };
    }

    // Check for bi-weekly pattern (14 days ± tolerance)
    const biWeeklyMatches = intervals.filter(d => Math.abs(d - ANALYTICS_CONFIG.BI_WEEKLY_INTERVAL) <= toleranceDays).length;
    if (biWeeklyMatches >= intervals.length * ANALYTICS_CONFIG.PATTERN_MATCH_THRESHOLD) {
      return {
        frequency: PATTERN_FREQUENCIES.BI_WEEKLY,
        occurrenceCount: sortedExpenses.length,
        avgInterval: ANALYTICS_CONFIG.BI_WEEKLY_INTERVAL
      };
    }

    // Check for monthly pattern (28-31 days ± tolerance)
    const monthlyMatches = intervals.filter(d => d >= ANALYTICS_CONFIG.MONTHLY_INTERVAL_MIN - toleranceDays && d <= ANALYTICS_CONFIG.MONTHLY_INTERVAL_MAX + toleranceDays).length;
    if (monthlyMatches >= intervals.length * ANALYTICS_CONFIG.PATTERN_MATCH_THRESHOLD) {
      return {
        frequency: PATTERN_FREQUENCIES.MONTHLY,
        occurrenceCount: sortedExpenses.length,
        avgInterval: ANALYTICS_CONFIG.MONTHLY_INTERVAL_AVG
      };
    }

    return null;
  }

  /**
   * Calculate the next expected date based on frequency
   * @param {string} lastDate - Last occurrence date
   * @param {string} frequency - Pattern frequency
   * @returns {string} Next expected date (YYYY-MM-DD)
   */
  _calculateNextExpected(lastDate, frequency) {
    const date = new Date(lastDate);
    
    switch (frequency) {
      case PATTERN_FREQUENCIES.WEEKLY:
        date.setDate(date.getDate() + ANALYTICS_CONFIG.WEEKLY_INTERVAL);
        break;
      case PATTERN_FREQUENCIES.BI_WEEKLY:
        date.setDate(date.getDate() + ANALYTICS_CONFIG.BI_WEEKLY_INTERVAL);
        break;
      case PATTERN_FREQUENCIES.MONTHLY:
        date.setMonth(date.getMonth() + 1);
        break;
    }
    
    return date.toISOString().split('T')[0];
  }

  /**
   * Calculate confidence score for a pattern
   * @param {Array} expenses - Expenses in the pattern
   * @param {Object} frequencyResult - Detected frequency result
   * @returns {number} Confidence score 0-100
   */
  _calculatePatternConfidence(expenses, frequencyResult) {
    if (expenses.length < 2) {
      return 0;
    }

    // Factor 1: Number of occurrences (more = higher confidence)
    const occurrenceScore = Math.min(100, (expenses.length / ANALYTICS_CONFIG.OCCURRENCE_DIVISOR) * 100);

    // Factor 2: Amount consistency
    const amounts = expenses.map(e => e.amount);
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const amountVariance = amounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / amounts.length;
    const amountStdDev = Math.sqrt(amountVariance);
    const amountCV = avgAmount > 0 ? amountStdDev / avgAmount : 1;
    const amountScore = Math.max(0, 100 - (amountCV * 100));

    // Combined score
    const confidence = Math.round((occurrenceScore * ANALYTICS_CONFIG.OCCURRENCE_WEIGHT) + (amountScore * ANALYTICS_CONFIG.AMOUNT_CONSISTENCY_WEIGHT));
    
    return Math.min(100, Math.max(0, confidence));
  }


  /**
   * Get day-of-week spending analysis
   * @param {Object} filters - { startDate, endDate, category? }
   * @returns {Promise<DayOfWeekAnalysis>}
   */
  async getDayOfWeekPatterns(filters = {}) {
    try {
      // Get all expenses (or filtered by date range)
      let expenses = await expenseRepository.findAll();
      
      if (!expenses || expenses.length === 0) {
        return this._emptyDayOfWeekAnalysis();
      }

      // Apply date filters
      if (filters.startDate) {
        expenses = expenses.filter(e => e.date >= filters.startDate);
      }
      if (filters.endDate) {
        expenses = expenses.filter(e => e.date <= filters.endDate);
      }

      // Apply category filter
      if (filters.category) {
        expenses = expenses.filter(e => e.type === filters.category);
      }

      if (expenses.length === 0) {
        return this._emptyDayOfWeekAnalysis();
      }

      // Group expenses by day of week
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayData = {};
      const dayCounts = {}; // Count of unique dates per day

      for (let i = 0; i < 7; i++) {
        dayData[i] = {
          expenses: [],
          uniqueDates: new Set()
        };
        dayCounts[i] = 0;
      }

      for (const expense of expenses) {
        // Parse date as UTC to avoid timezone issues
        const [year, month, day] = expense.date.split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        const dayIndex = date.getUTCDay();
        dayData[dayIndex].expenses.push(expense);
        dayData[dayIndex].uniqueDates.add(expense.date);
      }

      // Calculate totals and averages
      let totalSpend = 0;
      const days = [];

      for (let i = 0; i < 7; i++) {
        const dayExpenses = dayData[i].expenses;
        const uniqueDateCount = dayData[i].uniqueDates.size;
        const dayTotal = dayExpenses.reduce((sum, e) => sum + e.amount, 0);
        totalSpend += dayTotal;

        // Calculate average per occurrence of that day
        const averageSpend = uniqueDateCount > 0 ? dayTotal / uniqueDateCount : 0;

        // Get top categories for this day
        const categoryTotals = {};
        for (const expense of dayExpenses) {
          categoryTotals[expense.type] = (categoryTotals[expense.type] || 0) + expense.amount;
        }
        const topCategories = Object.entries(categoryTotals)
          .map(([category, amount]) => ({ category, amount: parseFloat(amount.toFixed(2)) }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, ANALYTICS_CONFIG.TOP_CATEGORIES_LIMIT);

        days.push({
          dayName: dayNames[i],
          dayIndex: i,
          averageSpend: parseFloat(averageSpend.toFixed(2)),
          transactionCount: dayExpenses.length,
          percentOfWeeklyTotal: 0, // Will be calculated after
          isHighSpendingDay: false, // Will be calculated after
          topCategories
        });
      }

      // Calculate weekly average and percentages
      const weeklyAverage = totalSpend / 7;
      const highSpendingThreshold = weeklyAverage * (1 + ANALYTICS_CONFIG.HIGH_SPENDING_DAY_THRESHOLD);

      for (const day of days) {
        day.percentOfWeeklyTotal = totalSpend > 0 
          ? parseFloat(((day.averageSpend / (totalSpend / 7)) * 100 / 7).toFixed(2))
          : 0;
        // Recalculate based on total for the day vs weekly average
        const dayTotal = day.averageSpend * (dayData[day.dayIndex].uniqueDates.size || 1);
        day.isHighSpendingDay = day.averageSpend > highSpendingThreshold;
      }

      // Find highest and lowest spending days
      const sortedBySpend = [...days].sort((a, b) => b.averageSpend - a.averageSpend);
      const highestSpendingDay = sortedBySpend[0].dayName;
      const lowestSpendingDay = sortedBySpend[sortedBySpend.length - 1].dayName;

      return {
        days,
        weeklyAverage: parseFloat(weeklyAverage.toFixed(2)),
        highestSpendingDay,
        lowestSpendingDay
      };
    } catch (error) {
      logger.error('Error getting day-of-week patterns:', error);
      throw error;
    }
  }

  /**
   * Return empty day-of-week analysis structure
   * @returns {DayOfWeekAnalysis}
   */
  _emptyDayOfWeekAnalysis() {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return {
      days: dayNames.map((name, index) => ({
        dayName: name,
        dayIndex: index,
        averageSpend: 0,
        transactionCount: 0,
        percentOfWeeklyTotal: 0,
        isHighSpendingDay: false,
        topCategories: []
      })),
      weeklyAverage: 0,
      highestSpendingDay: 'Sunday',
      lowestSpendingDay: 'Sunday'
    };
  }


  /**
   * Get seasonal spending analysis
   * @param {number} months - Number of months to analyze (default 12)
   * @returns {Promise<SeasonalAnalysis>}
   */
  async getSeasonalAnalysis(months = 12) {
    try {
      // Get all expenses
      const expenses = await expenseRepository.findAll();
      
      if (!expenses || expenses.length === 0) {
        return this._emptySeasonalAnalysis();
      }

      // Calculate date range for analysis
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months + 1);
      startDate.setDate(1);

      // Filter expenses to the analysis period
      const filteredExpenses = expenses.filter(e => {
        const expenseDate = new Date(e.date);
        return expenseDate >= startDate && expenseDate <= endDate;
      });

      if (filteredExpenses.length === 0) {
        return this._emptySeasonalAnalysis();
      }

      // Group expenses by month
      const monthlyData = this._calculateMonthlyData(filteredExpenses, months);
      
      // Calculate quarter data
      const quarterlyData = this._calculateQuarterlyData(monthlyData);
      
      // Identify seasonal categories
      const seasonalCategories = this._identifySeasonalCategories(filteredExpenses);

      return {
        monthlyData,
        quarterlyData,
        seasonalCategories
      };
    } catch (error) {
      logger.error('Error getting seasonal analysis:', error);
      throw error;
    }
  }

  /**
   * Calculate monthly spending data with comparisons
   * @param {Array} expenses - Filtered expenses
   * @param {number} months - Number of months to include
   * @returns {Array} Monthly data array
   */
  _calculateMonthlyData(expenses, months) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    // Group expenses by year-month
    const expensesByMonth = this._groupExpensesByMonth(expenses);
    
    // Generate complete month range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months + 1);
    startDate.setDate(1);
    
    const monthlyData = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      const year = current.getFullYear();
      const month = current.getMonth() + 1;
      const key = `${year}-${month.toString().padStart(2, '0')}`;
      
      const monthExpenses = expensesByMonth[key] || [];
      const totalSpent = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
      
      monthlyData.push({
        year,
        month,
        monthName: monthNames[month - 1],
        totalSpent: parseFloat(totalSpent.toFixed(2)),
        previousMonthChange: null, // Will be calculated after
        sameMonthLastYearChange: null // Will be calculated after
      });
      
      current.setMonth(current.getMonth() + 1);
    }

    // Calculate month-over-month changes
    for (let i = 1; i < monthlyData.length; i++) {
      const current = monthlyData[i];
      const previous = monthlyData[i - 1];
      
      if (previous.totalSpent > 0) {
        current.previousMonthChange = parseFloat(
          (((current.totalSpent - previous.totalSpent) / previous.totalSpent) * 100).toFixed(2)
        );
      } else if (current.totalSpent > 0) {
        current.previousMonthChange = 100;
      } else {
        current.previousMonthChange = 0;
      }
    }

    // Calculate same-month-last-year changes
    for (const current of monthlyData) {
      const lastYear = monthlyData.find(m => 
        m.year === current.year - 1 && m.month === current.month
      );
      
      if (lastYear && lastYear.totalSpent > 0) {
        current.sameMonthLastYearChange = parseFloat(
          (((current.totalSpent - lastYear.totalSpent) / lastYear.totalSpent) * 100).toFixed(2)
        );
      } else if (lastYear && current.totalSpent > 0) {
        current.sameMonthLastYearChange = 100;
      }
    }

    return monthlyData;
  }

  /**
   * Calculate quarterly spending data
   * @param {Array} monthlyData - Monthly data array
   * @returns {Array} Quarterly data array
   */
  _calculateQuarterlyData(monthlyData) {
    // Group months into quarters
    const quarterMap = {};
    
    for (const month of monthlyData) {
      const quarter = Math.ceil(month.month / 3);
      const key = `${month.year}-Q${quarter}`;
      
      if (!quarterMap[key]) {
        quarterMap[key] = {
          year: month.year,
          quarter,
          totalSpent: 0
        };
      }
      quarterMap[key].totalSpent += month.totalSpent;
    }

    // Convert to array and sort
    const quarterlyData = Object.values(quarterMap)
      .map(q => ({
        year: q.year,
        quarter: q.quarter,
        totalSpent: parseFloat(q.totalSpent.toFixed(2)),
        previousQuarterChange: null
      }))
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.quarter - b.quarter;
      });

    // Calculate quarter-over-quarter changes
    for (let i = 1; i < quarterlyData.length; i++) {
      const current = quarterlyData[i];
      const previous = quarterlyData[i - 1];
      
      if (previous.totalSpent > 0) {
        current.previousQuarterChange = parseFloat(
          (((current.totalSpent - previous.totalSpent) / previous.totalSpent) * 100).toFixed(2)
        );
      } else if (current.totalSpent > 0) {
        current.previousQuarterChange = 100;
      } else {
        current.previousQuarterChange = 0;
      }
    }

    return quarterlyData;
  }

  /**
   * Identify categories with significant seasonal variation
   * @param {Array} expenses - Expenses to analyze
   * @returns {Array} Seasonal categories
   */
  _identifySeasonalCategories(expenses) {
    // Group expenses by category and month
    const categoryMonthData = {};
    
    for (const expense of expenses) {
      const category = expense.type;
      const date = new Date(expense.date);
      const month = date.getMonth() + 1;
      
      if (!categoryMonthData[category]) {
        categoryMonthData[category] = {};
      }
      if (!categoryMonthData[category][month]) {
        categoryMonthData[category][month] = 0;
      }
      categoryMonthData[category][month] += expense.amount;
    }

    const seasonalCategories = [];
    const varianceThreshold = ANALYTICS_CONFIG.SEASONAL_VARIANCE_THRESHOLD;

    for (const [category, monthData] of Object.entries(categoryMonthData)) {
      const monthlyAmounts = Object.values(monthData);
      
      if (monthlyAmounts.length < 2) {
        continue;
      }

      // Calculate annual average
      const annualAverage = monthlyAmounts.reduce((a, b) => a + b, 0) / 12;
      
      if (annualAverage === 0) {
        continue;
      }

      // Find months with significant variance
      const peakMonths = [];
      const lowMonths = [];
      let maxVariance = 0;

      for (const [monthStr, amount] of Object.entries(monthData)) {
        const month = parseInt(monthStr);
        const variance = (amount - annualAverage) / annualAverage;
        
        if (Math.abs(variance) > maxVariance) {
          maxVariance = Math.abs(variance);
        }

        if (variance > varianceThreshold) {
          peakMonths.push(month);
        } else if (variance < -varianceThreshold) {
          lowMonths.push(month);
        }
      }

      // Only include if there's significant seasonal variation
      if (maxVariance > varianceThreshold) {
        seasonalCategories.push({
          category,
          varianceFromAnnualAverage: parseFloat((maxVariance * 100).toFixed(2)),
          peakMonths: peakMonths.sort((a, b) => a - b),
          lowMonths: lowMonths.sort((a, b) => a - b)
        });
      }
    }

    // Sort by variance descending
    seasonalCategories.sort((a, b) => b.varianceFromAnnualAverage - a.varianceFromAnnualAverage);

    return seasonalCategories;
  }

  /**
   * Return empty seasonal analysis structure
   * @returns {SeasonalAnalysis}
   */
  _emptySeasonalAnalysis() {
    return {
      monthlyData: [],
      quarterlyData: [],
      seasonalCategories: []
    };
  }
}

module.exports = new SpendingPatternsService();
