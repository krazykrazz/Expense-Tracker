/**
 * Analytics Controller
 * 
 * Handles HTTP requests for the Spending Patterns & Predictions feature.
 * Provides endpoints for patterns, predictions, seasonal analysis, and anomaly detection.
 */

const spendingPatternsService = require('../services/spendingPatternsService');
const predictionService = require('../services/predictionService');
const anomalyDetectionService = require('../services/anomalyDetectionService');
const logger = require('../config/logger');

/**
 * Get data sufficiency information
 * GET /api/analytics/data-sufficiency
 */
async function getDataSufficiency(req, res) {
  try {
    const sufficiency = await spendingPatternsService.checkDataSufficiency();
    
    res.json({
      ...sufficiency,
      metadata: {
        dataQuality: sufficiency.dataQualityScore,
        confidenceLevel: _getConfidenceLevelFromMonths(sufficiency.monthsOfData)
      }
    });
  } catch (error) {
    logger.error('Error getting data sufficiency:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get recurring spending patterns
 * GET /api/analytics/patterns?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
async function getRecurringPatterns(req, res) {
  try {
    const { startDate, endDate, toleranceDays, minOccurrences } = req.query;
    
    // Validate date parameters if provided
    if (startDate && !_isValidDate(startDate)) {
      return res.status(400).json({ error: 'Invalid startDate format. Use YYYY-MM-DD' });
    }
    if (endDate && !_isValidDate(endDate)) {
      return res.status(400).json({ error: 'Invalid endDate format. Use YYYY-MM-DD' });
    }
    
    const options = {};
    if (toleranceDays) {
      const days = parseInt(toleranceDays);
      if (isNaN(days) || days < 0) {
        return res.status(400).json({ error: 'Invalid toleranceDays. Must be a non-negative number' });
      }
      options.toleranceDays = days;
    }
    if (minOccurrences) {
      const occurrences = parseInt(minOccurrences);
      if (isNaN(occurrences) || occurrences < 1) {
        return res.status(400).json({ error: 'Invalid minOccurrences. Must be a positive number' });
      }
      options.minOccurrences = occurrences;
    }
    
    // Get patterns
    let patterns = await spendingPatternsService.getRecurringPatterns(options);
    
    // Apply date filtering if provided
    if (startDate || endDate) {
      patterns = _filterPatternsByDate(patterns, startDate, endDate);
    }
    
    // Get data sufficiency for metadata
    const sufficiency = await spendingPatternsService.checkDataSufficiency();
    
    res.json({
      patterns,
      metadata: {
        dataQuality: sufficiency.dataQualityScore,
        confidenceLevel: _getConfidenceLevelFromMonths(sufficiency.monthsOfData),
        totalPatterns: patterns.length,
        dateRange: { startDate: startDate || null, endDate: endDate || null }
      }
    });
  } catch (error) {
    logger.error('Error getting recurring patterns:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}


/**
 * Get day-of-week spending patterns
 * GET /api/analytics/patterns/day-of-week?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&category=Groceries
 */
async function getDayOfWeekPatterns(req, res) {
  try {
    const { startDate, endDate, category } = req.query;
    
    // Validate date parameters if provided
    if (startDate && !_isValidDate(startDate)) {
      return res.status(400).json({ error: 'Invalid startDate format. Use YYYY-MM-DD' });
    }
    if (endDate && !_isValidDate(endDate)) {
      return res.status(400).json({ error: 'Invalid endDate format. Use YYYY-MM-DD' });
    }
    
    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (category) filters.category = category;
    
    const dayOfWeekData = await spendingPatternsService.getDayOfWeekPatterns(filters);
    
    // Get data sufficiency for metadata
    const sufficiency = await spendingPatternsService.checkDataSufficiency();
    
    res.json({
      ...dayOfWeekData,
      metadata: {
        dataQuality: sufficiency.dataQualityScore,
        confidenceLevel: _getConfidenceLevelFromMonths(sufficiency.monthsOfData),
        filters: { startDate: startDate || null, endDate: endDate || null, category: category || null }
      }
    });
  } catch (error) {
    logger.error('Error getting day-of-week patterns:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get seasonal spending analysis
 * GET /api/analytics/seasonal?months=12
 */
async function getSeasonalAnalysis(req, res) {
  try {
    const { months = 12 } = req.query;
    
    // Validate months parameter
    const monthsInt = parseInt(months);
    if (isNaN(monthsInt) || monthsInt < 1 || monthsInt > 60) {
      return res.status(400).json({ 
        error: 'Invalid months parameter. Must be a number between 1 and 60' 
      });
    }
    
    const seasonalData = await spendingPatternsService.getSeasonalAnalysis(monthsInt);
    
    // Get data sufficiency for metadata
    const sufficiency = await spendingPatternsService.checkDataSufficiency();
    
    res.json({
      ...seasonalData,
      metadata: {
        dataQuality: sufficiency.dataQualityScore,
        confidenceLevel: _getConfidenceLevelFromMonths(sufficiency.monthsOfData),
        monthsAnalyzed: monthsInt
      }
    });
  } catch (error) {
    logger.error('Error getting seasonal analysis:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get month-end prediction
 * GET /api/analytics/predictions/:year/:month
 */
async function getMonthPrediction(req, res) {
  try {
    const { year, month } = req.params;
    
    // Validate year and month
    const yearInt = parseInt(year);
    const monthInt = parseInt(month);
    
    if (isNaN(yearInt) || yearInt < 2000 || yearInt > 2100) {
      return res.status(400).json({ error: 'Invalid year. Must be between 2000 and 2100' });
    }
    if (isNaN(monthInt) || monthInt < 1 || monthInt > 12) {
      return res.status(400).json({ error: 'Invalid month. Must be between 1 and 12' });
    }
    
    const prediction = await predictionService.getMonthEndPrediction(yearInt, monthInt);
    
    // Get data sufficiency for metadata
    const sufficiency = await spendingPatternsService.checkDataSufficiency();
    
    res.json({
      ...prediction,
      metadata: {
        dataQuality: sufficiency.dataQualityScore,
        confidenceLevel: prediction.confidenceLevel
      }
    });
  } catch (error) {
    logger.error('Error getting month prediction:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get historical comparison for predictions
 * GET /api/analytics/predictions/:year/:month/comparison
 */
async function getHistoricalComparison(req, res) {
  try {
    const { year, month } = req.params;
    
    // Validate year and month
    const yearInt = parseInt(year);
    const monthInt = parseInt(month);
    
    if (isNaN(yearInt) || yearInt < 2000 || yearInt > 2100) {
      return res.status(400).json({ error: 'Invalid year. Must be between 2000 and 2100' });
    }
    if (isNaN(monthInt) || monthInt < 1 || monthInt > 12) {
      return res.status(400).json({ error: 'Invalid month. Must be between 1 and 12' });
    }
    
    const comparison = await predictionService.compareToHistorical(yearInt, monthInt);
    
    // Get data sufficiency for metadata
    const sufficiency = await spendingPatternsService.checkDataSufficiency();
    
    res.json({
      ...comparison,
      metadata: {
        dataQuality: sufficiency.dataQualityScore,
        confidenceLevel: comparison.confidenceLevel
      }
    });
  } catch (error) {
    logger.error('Error getting historical comparison:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}


/**
 * Get detected anomalies
 * GET /api/analytics/anomalies?lookbackDays=30&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
async function getAnomalies(req, res) {
  try {
    const { lookbackDays = 30, startDate, endDate } = req.query;
    
    // Validate lookbackDays
    const lookbackInt = parseInt(lookbackDays);
    if (isNaN(lookbackInt) || lookbackInt < 1 || lookbackInt > 365) {
      return res.status(400).json({ 
        error: 'Invalid lookbackDays. Must be a number between 1 and 365' 
      });
    }
    
    // Validate date parameters if provided
    if (startDate && !_isValidDate(startDate)) {
      return res.status(400).json({ error: 'Invalid startDate format. Use YYYY-MM-DD' });
    }
    if (endDate && !_isValidDate(endDate)) {
      return res.status(400).json({ error: 'Invalid endDate format. Use YYYY-MM-DD' });
    }
    
    let anomalies = await anomalyDetectionService.detectAnomalies({ lookbackDays: lookbackInt });
    
    // Apply date filtering if provided
    if (startDate || endDate) {
      anomalies = anomalies.filter(a => {
        if (startDate && a.date < startDate) return false;
        if (endDate && a.date > endDate) return false;
        return true;
      });
    }
    
    // Get data sufficiency for metadata
    const sufficiency = await spendingPatternsService.checkDataSufficiency();
    
    res.json({
      anomalies,
      metadata: {
        dataQuality: sufficiency.dataQualityScore,
        confidenceLevel: _getConfidenceLevelFromMonths(sufficiency.monthsOfData),
        totalAnomalies: anomalies.length,
        lookbackDays: lookbackInt,
        dateRange: { startDate: startDate || null, endDate: endDate || null }
      }
    });
  } catch (error) {
    logger.error('Error getting anomalies:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Dismiss an anomaly
 * POST /api/analytics/anomalies/:expenseId/dismiss
 */
async function dismissAnomaly(req, res) {
  try {
    const { expenseId } = req.params;
    
    // Validate expenseId
    const expenseIdInt = parseInt(expenseId);
    if (isNaN(expenseIdInt) || expenseIdInt < 1) {
      return res.status(400).json({ error: 'Invalid expenseId. Must be a positive number' });
    }
    
    await anomalyDetectionService.dismissAnomaly(expenseIdInt);
    
    res.json({ 
      success: true, 
      message: `Anomaly for expense ${expenseIdInt} dismissed successfully` 
    });
  } catch (error) {
    logger.error('Error dismissing anomaly:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Helper functions

/**
 * Validate date string format (YYYY-MM-DD)
 * @param {string} dateStr - Date string to validate
 * @returns {boolean} True if valid
 */
function _isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return false;
  }
  
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) {
    return false;
  }
  
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date);
}

/**
 * Get confidence level based on months of data
 * @param {number} months - Number of months of data
 * @returns {string} Confidence level
 */
function _getConfidenceLevelFromMonths(months) {
  if (months >= 12) return 'high';
  if (months >= 6) return 'medium';
  return 'low';
}

/**
 * Filter patterns by date range (based on lastOccurrence)
 * @param {Array} patterns - Patterns to filter
 * @param {string} startDate - Start date (inclusive)
 * @param {string} endDate - End date (inclusive)
 * @returns {Array} Filtered patterns
 */
function _filterPatternsByDate(patterns, startDate, endDate) {
  return patterns.filter(p => {
    if (startDate && p.lastOccurrence < startDate) return false;
    if (endDate && p.lastOccurrence > endDate) return false;
    return true;
  });
}

module.exports = {
  getDataSufficiency,
  getRecurringPatterns,
  getDayOfWeekPatterns,
  getSeasonalAnalysis,
  getMonthPrediction,
  getHistoricalComparison,
  getAnomalies,
  dismissAnomaly
};
