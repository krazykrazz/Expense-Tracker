/**
 * Merchant Analytics API Service
 * Handles all API calls related to merchant analytics and spending insights
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, logApiError } from '../utils/apiClient.js';

/**
 * Get top merchants by total spending
 * @param {string} period - Time period filter ('all', 'year', 'month', '3months')
 * @param {string} sortBy - Sort criteria ('total', 'visits', 'average')
 * @param {Object} options - Additional options { year?, month? }
 * @returns {Promise<Array<MerchantSummary>>} Array of merchant summary objects
 */
export const getTopMerchants = async (period = 'year', sortBy = 'total', options = {}) => {
  try {
    const params = new URLSearchParams();
    params.append('period', period);
    params.append('sortBy', sortBy);
    
    if (options.year) {
      params.append('year', options.year.toString());
    }
    if (options.month) {
      params.append('month', options.month.toString());
    }
    
    const url = `${API_ENDPOINTS.MERCHANT_ANALYTICS}?${params.toString()}`;
    return await apiGet(url, 'fetch top merchants');
  } catch (error) {
    logApiError('fetching top merchants', error);
    throw error;
  }
};

/**
 * Get detailed statistics for a specific merchant
 * @param {string} name - Merchant name
 * @param {string} period - Time period filter ('all', 'year', 'month', '3months')
 * @param {Object} options - Additional options { year?, month? }
 * @returns {Promise<MerchantDetail>} Detailed merchant statistics
 */
export const getMerchantDetails = async (name, period = 'year', options = {}) => {
  try {
    const params = new URLSearchParams();
    params.append('period', period);
    
    if (options.year) {
      params.append('year', options.year.toString());
    }
    if (options.month) {
      params.append('month', options.month.toString());
    }
    
    const url = `${API_ENDPOINTS.MERCHANT_DETAILS(name)}?${params.toString()}`;
    return await apiGet(url, 'fetch merchant details');
  } catch (error) {
    logApiError('fetching merchant details', error);
    throw error;
  }
};

/**
 * Get monthly spending trend for a merchant
 * @param {string} name - Merchant name
 * @param {number} months - Number of months to include (default 12)
 * @returns {Promise<Array<MonthlyTrend>>} Array of monthly trend data
 */
export const getMerchantTrend = async (name, months = 12) => {
  try {
    const params = new URLSearchParams();
    params.append('months', months.toString());
    
    const url = `${API_ENDPOINTS.MERCHANT_TREND(name)}?${params.toString()}`;
    return await apiGet(url, 'fetch merchant trend');
  } catch (error) {
    logApiError('fetching merchant trend', error);
    throw error;
  }
};

/**
 * Get all expenses for a specific merchant
 * @param {string} name - Merchant name
 * @param {string} period - Time period filter ('all', 'year', 'month', '3months')
 * @param {Object} options - Additional options { year?, month? }
 * @returns {Promise<Array<Expense>>} Array of expense objects
 */
export const getMerchantExpenses = async (name, period = 'year', options = {}) => {
  try {
    const params = new URLSearchParams();
    params.append('period', period);
    
    if (options.year) {
      params.append('year', options.year.toString());
    }
    if (options.month) {
      params.append('month', options.month.toString());
    }
    
    const url = `${API_ENDPOINTS.MERCHANT_EXPENSES(name)}?${params.toString()}`;
    return await apiGet(url, 'fetch merchant expenses');
  } catch (error) {
    logApiError('fetching merchant expenses', error);
    throw error;
  }
};

/**
 * Validate period parameter
 * @param {string} period - Period to validate
 * @returns {boolean} True if valid
 */
export const isValidPeriod = (period) => {
  const validPeriods = ['all', 'year', 'month', '3months'];
  return validPeriods.includes(period);
};

/**
 * Validate sortBy parameter
 * @param {string} sortBy - Sort criteria to validate
 * @returns {boolean} True if valid
 */
export const isValidSortBy = (sortBy) => {
  const validSortBy = ['total', 'visits', 'average'];
  return validSortBy.includes(sortBy);
};

/**
 * Get display name for period
 * @param {string} period - Period code
 * @returns {string} Human-readable period name
 */
export const getPeriodDisplayName = (period) => {
  const periodNames = {
    'all': 'All Time',
    'year': 'This Year',
    'month': 'This Month',
    '3months': 'Last 3 Months'
  };
  return periodNames[period] || period;
};

/**
 * Get display name for sort criteria
 * @param {string} sortBy - Sort criteria code
 * @returns {string} Human-readable sort name
 */
export const getSortByDisplayName = (sortBy) => {
  const sortNames = {
    'total': 'Total Spend',
    'visits': 'Visit Count',
    'average': 'Average Spend'
  };
  return sortNames[sortBy] || sortBy;
};