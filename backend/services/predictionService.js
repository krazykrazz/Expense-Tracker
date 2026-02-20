/**
 * PredictionService
 * 
 * Calculates end-of-month spending predictions based on current trajectory
 * and historical averages. Provides confidence levels and income comparisons.
 * 
 * Part of the Spending Patterns & Predictions feature.
 */

const expenseRepository = require('../repositories/expenseRepository');
const incomeRepository = require('../repositories/incomeRepository');
const logger = require('../config/logger');
const { 
  ANALYTICS_CONFIG, 
  CONFIDENCE_LEVELS 
} = require('../utils/analyticsConstants');

class PredictionService {
  /**
   * Calculate end-of-month spending prediction
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<MonthPrediction>}
   */
  async getMonthEndPrediction(year, month) {
    try {
      // Get current month's expenses
      const currentMonthExpenses = await expenseRepository.findAll({ year, month });
      
      // Calculate current spending
      const currentSpent = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
      
      // Calculate days elapsed and remaining
      const today = new Date();
      const targetDate = new Date(Date.UTC(year, month - 1, 1));
      const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      
      let daysElapsed;
      if (today.getUTCFullYear() === year && today.getUTCMonth() + 1 === month) {
        // Current month - use actual days elapsed
        daysElapsed = today.getUTCDate();
      } else if (today > targetDate) {
        // Past month - full month elapsed
        daysElapsed = lastDayOfMonth;
      } else {
        // Future month - no days elapsed
        daysElapsed = 0;
      }
      
      const daysRemaining = Math.max(0, lastDayOfMonth - daysElapsed);
      
      // Calculate daily average from current month
      const currentDailyAverage = daysElapsed > 0 ? currentSpent / daysElapsed : 0;
      
      // Get historical monthly average
      const historicalAverage = await this._getHistoricalMonthlyAverage(year, month);
      
      // Calculate predicted total using weighted formula
      const predictedTotal = this._calculatePrediction(
        currentSpent,
        currentDailyAverage,
        daysRemaining,
        daysElapsed,
        historicalAverage,
        lastDayOfMonth
      );
      
      // Get confidence level
      const confidenceLevel = await this.calculateConfidenceLevel(year, month);
      
      // Get monthly income for comparison
      const monthlyIncome = await incomeRepository.getTotalMonthlyGross(year, month);
      const exceedsIncome = monthlyIncome > 0 && predictedTotal > monthlyIncome;
      
      // Get year-over-year comparison
      const yoyComparison = await this._getYearOverYearChange(year, month, predictedTotal);
      
      // Get category breakdown
      const categoryBreakdown = await this._getCategoryBreakdown(
        currentMonthExpenses,
        daysElapsed,
        daysRemaining,
        historicalAverage,
        lastDayOfMonth
      );
      
      return {
        year,
        month,
        currentSpent: parseFloat(currentSpent.toFixed(2)),
        predictedTotal: parseFloat(predictedTotal.toFixed(2)),
        daysElapsed,
        daysRemaining,
        dailyAverage: parseFloat(currentDailyAverage.toFixed(2)),
        historicalMonthlyAverage: parseFloat(historicalAverage.toFixed(2)),
        confidenceLevel,
        exceedsIncome,
        monthlyIncome: parseFloat(monthlyIncome.toFixed(2)),
        yearOverYearChange: yoyComparison,
        categoryBreakdown
      };
    } catch (error) {
      logger.error('Error calculating month-end prediction:', error);
      throw error;
    }
  }

  /**
   * Calculate prediction using weighted formula
   * Weights historical data more heavily when fewer days have elapsed
   * @private
   */
  _calculatePrediction(currentSpent, dailyAverage, daysRemaining, daysElapsed, historicalAverage, totalDays) {
    if (daysElapsed === 0) {
      // No data yet - use historical average
      return historicalAverage;
    }
    
    if (daysRemaining === 0) {
      // Month is complete - return actual spending
      return currentSpent;
    }
    
    // Calculate trajectory-based prediction
    const trajectoryPrediction = currentSpent + (dailyAverage * daysRemaining);
    
    // If we don't have historical data, use trajectory only
    if (historicalAverage === 0) {
      return trajectoryPrediction;
    }
    
    // Calculate historical daily average
    const historicalDailyAverage = historicalAverage / totalDays;
    const historicalPrediction = currentSpent + (historicalDailyAverage * daysRemaining);
    
    // Weight based on days elapsed
    // Early in month (< EARLY_MONTH_DAYS): weight historical more heavily
    // Later in month: weight current trajectory more heavily
    let trajectoryWeight;
    if (daysElapsed < ANALYTICS_CONFIG.EARLY_MONTH_DAYS) {
      // Early month: historical gets more weight
      // At day 1: trajectory weight = 0.2, at day 6: trajectory weight = 0.4
      trajectoryWeight = 0.2 + (daysElapsed / ANALYTICS_CONFIG.EARLY_MONTH_DAYS) * 0.2;
    } else {
      // Later in month: trajectory gets progressively more weight
      // At day 7: 0.5, at end of month: approaching 1.0
      const progressAfterEarly = (daysElapsed - ANALYTICS_CONFIG.EARLY_MONTH_DAYS) / 
                                  (totalDays - ANALYTICS_CONFIG.EARLY_MONTH_DAYS);
      trajectoryWeight = 0.5 + (progressAfterEarly * 0.5);
    }
    
    const historicalWeight = 1 - trajectoryWeight;
    
    return (trajectoryPrediction * trajectoryWeight) + (historicalPrediction * historicalWeight);
  }

  /**
   * Get historical monthly average (excluding current month)
   * @private
   */
  async _getHistoricalMonthlyAverage(currentYear, currentMonth) {
    try {
      const allExpenses = await expenseRepository.findAll();
      
      if (!allExpenses || allExpenses.length === 0) {
        return 0;
      }
      
      // Group expenses by month, excluding current month
      const monthlyTotals = {};
      
      for (const expense of allExpenses) {
        const date = new Date(expense.date);
        const expYear = date.getUTCFullYear();
        const expMonth = date.getUTCMonth() + 1;
        
        // Skip current month
        if (expYear === currentYear && expMonth === currentMonth) {
          continue;
        }
        
        const key = `${expYear}-${expMonth}`;
        if (!monthlyTotals[key]) {
          monthlyTotals[key] = 0;
        }
        monthlyTotals[key] += expense.amount;
      }
      
      const totals = Object.values(monthlyTotals);
      if (totals.length === 0) {
        return 0;
      }
      
      return totals.reduce((a, b) => a + b, 0) / totals.length;
    } catch (error) {
      logger.error('Error calculating historical average:', error);
      return 0;
    }
  }

  /**
   * Calculate confidence level based on months of available data
   * High (12+ months), Medium (6-11 months), Low (<6 months)
   * @param {number} year - Year
   * @param {number} month - Month
   * @returns {Promise<'low'|'medium'|'high'>}
   */
  async calculateConfidenceLevel(year, month) {
    try {
      const allExpenses = await expenseRepository.findAll();
      
      if (!allExpenses || allExpenses.length === 0) {
        return CONFIDENCE_LEVELS.LOW;
      }
      
      // Count unique months with data (excluding current month)
      const uniqueMonths = new Set();
      
      for (const expense of allExpenses) {
        const date = new Date(expense.date);
        const expYear = date.getUTCFullYear();
        const expMonth = date.getUTCMonth() + 1;
        
        // Skip current month
        if (expYear === year && expMonth === month) {
          continue;
        }
        
        uniqueMonths.add(`${expYear}-${expMonth}`);
      }
      
      const monthsOfData = uniqueMonths.size;
      
      if (monthsOfData >= ANALYTICS_CONFIG.CONFIDENCE_HIGH_MONTHS) {
        return CONFIDENCE_LEVELS.HIGH;
      } else if (monthsOfData >= ANALYTICS_CONFIG.CONFIDENCE_MEDIUM_MONTHS) {
        return CONFIDENCE_LEVELS.MEDIUM;
      } else {
        return CONFIDENCE_LEVELS.LOW;
      }
    } catch (error) {
      logger.error('Error calculating confidence level:', error);
      return CONFIDENCE_LEVELS.LOW;
    }
  }

  /**
   * Get year-over-year change percentage
   * @private
   */
  async _getYearOverYearChange(year, month, predictedTotal) {
    try {
      // Get same month last year
      const lastYearExpenses = await expenseRepository.findAll({ 
        year: year - 1, 
        month 
      });
      
      if (!lastYearExpenses || lastYearExpenses.length === 0) {
        return null;
      }
      
      const lastYearTotal = lastYearExpenses.reduce((sum, e) => sum + e.amount, 0);
      
      if (lastYearTotal === 0) {
        return predictedTotal > 0 ? 100 : 0;
      }
      
      const change = ((predictedTotal - lastYearTotal) / lastYearTotal) * 100;
      return parseFloat(change.toFixed(2));
    } catch (error) {
      logger.error('Error calculating YoY change:', error);
      return null;
    }
  }

  /**
   * Get category breakdown with predictions
   * @private
   */
  async _getCategoryBreakdown(currentExpenses, daysElapsed, daysRemaining, historicalAverage, totalDays) {
    // Group current expenses by category
    const categoryTotals = {};
    
    for (const expense of currentExpenses) {
      const category = expense.type;
      if (!categoryTotals[category]) {
        categoryTotals[category] = 0;
      }
      categoryTotals[category] += expense.amount;
    }
    
    // Calculate predictions for each category
    const breakdown = [];
    
    for (const [category, currentSpent] of Object.entries(categoryTotals)) {
      const dailyAverage = daysElapsed > 0 ? currentSpent / daysElapsed : 0;
      const predicted = daysRemaining > 0 
        ? currentSpent + (dailyAverage * daysRemaining)
        : currentSpent;
      
      breakdown.push({
        category,
        currentSpent: parseFloat(currentSpent.toFixed(2)),
        predicted: parseFloat(predicted.toFixed(2))
      });
    }
    
    // Sort by predicted amount descending
    breakdown.sort((a, b) => b.predicted - a.predicted);
    
    return breakdown;
  }

  /**
   * Compare prediction to historical same-month data
   * @param {number} year - Year
   * @param {number} month - Month
   * @returns {Promise<HistoricalComparison>}
   */
  async compareToHistorical(year, month) {
    try {
      // Get current prediction
      const prediction = await this.getMonthEndPrediction(year, month);
      
      // Get same month from previous years
      const historicalData = [];
      const allExpenses = await expenseRepository.findAll();
      
      // Group by year for the same month
      const yearlyTotals = {};
      
      for (const expense of allExpenses) {
        const date = new Date(expense.date);
        const expYear = date.getUTCFullYear();
        const expMonth = date.getUTCMonth() + 1;
        
        if (expMonth === month && expYear !== year) {
          if (!yearlyTotals[expYear]) {
            yearlyTotals[expYear] = 0;
          }
          yearlyTotals[expYear] += expense.amount;
        }
      }
      
      // Convert to array
      for (const [yr, total] of Object.entries(yearlyTotals)) {
        historicalData.push({
          year: parseInt(yr),
          total: parseFloat(total.toFixed(2))
        });
      }
      
      // Sort by year descending
      historicalData.sort((a, b) => b.year - a.year);
      
      // Get monthly income
      const monthlyIncome = await incomeRepository.getTotalMonthlyGross(year, month);
      
      // Calculate warnings
      const exceedsIncome = monthlyIncome > 0 && prediction.predictedTotal > monthlyIncome;
      
      // Check YoY variance (>20% above same month last year)
      let yoyWarning = false;
      if (historicalData.length > 0) {
        const lastYearData = historicalData.find(h => h.year === year - 1);
        if (lastYearData && lastYearData.total > 0) {
          const variance = (prediction.predictedTotal - lastYearData.total) / lastYearData.total;
          yoyWarning = variance > ANALYTICS_CONFIG.YOY_WARNING_THRESHOLD;
        }
      }
      
      return {
        currentPrediction: prediction.predictedTotal,
        monthlyIncome,
        exceedsIncome,
        yearOverYearChange: prediction.yearOverYearChange,
        yoyWarning,
        historicalSameMonth: historicalData,
        confidenceLevel: prediction.confidenceLevel
      };
    } catch (error) {
      logger.error('Error comparing to historical:', error);
      throw error;
    }
  }
}

module.exports = new PredictionService();
