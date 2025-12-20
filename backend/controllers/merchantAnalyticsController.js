const merchantAnalyticsService = require('../services/merchantAnalyticsService');
const logger = require('../config/logger');

/**
 * Get top merchants by total spending
 * GET /api/analytics/merchants?period=year&sortBy=total
 */
async function getTopMerchants(req, res) {
  try {
    const { period = 'year', sortBy = 'total', includeFixedExpenses = 'false', year, month } = req.query;
    
    // Validate period parameter
    const validPeriods = ['all', 'year', 'month', '3months'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ 
        error: "Invalid period. Must be 'all', 'year', 'month', or '3months'" 
      });
    }
    
    // Validate sortBy parameter
    const validSortBy = ['total', 'visits', 'average'];
    if (!validSortBy.includes(sortBy)) {
      return res.status(400).json({ 
        error: "Invalid sortBy. Must be 'total', 'visits', or 'average'" 
      });
    }
    
    const filters = { period, includeFixedExpenses: includeFixedExpenses === 'true' };
    if (year) {
      filters.year = parseInt(year);
    }
    if (month) {
      filters.month = parseInt(month);
    }
    
    const merchants = await merchantAnalyticsService.getTopMerchants(filters, sortBy);
    res.json(merchants);
  } catch (error) {
    logger.error('Error getting top merchants:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get detailed statistics for a specific merchant
 * GET /api/analytics/merchants/:name?period=year
 */
async function getMerchantDetails(req, res) {
  try {
    const { name } = req.params;
    const { period = 'year', includeFixedExpenses = 'false', year, month } = req.query;
    
    // Validate period parameter
    const validPeriods = ['all', 'year', 'month', '3months'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ 
        error: "Invalid period. Must be 'all', 'year', 'month', or '3months'" 
      });
    }
    
    const filters = { period, includeFixedExpenses: includeFixedExpenses === 'true' };
    if (year) {
      filters.year = parseInt(year);
    }
    if (month) {
      filters.month = parseInt(month);
    }
    
    const merchantDetails = await merchantAnalyticsService.getMerchantDetails(name, filters);
    
    if (!merchantDetails) {
      return res.status(404).json({ error: 'Merchant not found' });
    }
    
    res.json(merchantDetails);
  } catch (error) {
    logger.error('Error getting merchant details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get monthly spending trend for a merchant
 * GET /api/analytics/merchants/:name/trend?months=12
 */
async function getMerchantTrend(req, res) {
  try {
    const { name } = req.params;
    const { months = 12, includeFixedExpenses = 'false' } = req.query;
    
    // Validate months parameter
    const monthsInt = parseInt(months);
    if (isNaN(monthsInt) || monthsInt < 1 || monthsInt > 60) {
      return res.status(400).json({ 
        error: 'Invalid months parameter. Must be a number between 1 and 60' 
      });
    }
    
    const trendData = await merchantAnalyticsService.getMerchantTrend(name, monthsInt, includeFixedExpenses === 'true');
    res.json(trendData);
  } catch (error) {
    logger.error('Error getting merchant trend:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get all expenses for a specific merchant
 * GET /api/analytics/merchants/:name/expenses?period=year
 */
async function getMerchantExpenses(req, res) {
  try {
    const { name } = req.params;
    const { period = 'year', includeFixedExpenses = 'false', year, month } = req.query;
    
    // Validate period parameter
    const validPeriods = ['all', 'year', 'month', '3months'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ 
        error: "Invalid period. Must be 'all', 'year', 'month', or '3months'" 
      });
    }
    
    const filters = { period, includeFixedExpenses: includeFixedExpenses === 'true' };
    if (year) {
      filters.year = parseInt(year);
    }
    if (month) {
      filters.month = parseInt(month);
    }
    
    const expenses = await merchantAnalyticsService.getMerchantExpenses(name, filters);
    res.json(expenses);
  } catch (error) {
    logger.error('Error getting merchant expenses:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getTopMerchants,
  getMerchantDetails,
  getMerchantTrend,
  getMerchantExpenses
};