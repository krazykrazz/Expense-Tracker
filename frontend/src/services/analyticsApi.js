/**
 * Analytics API Service
 * Handles all API calls for Spending Patterns & Predictions analytics
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, logApiError } from '../utils/apiClient.js';

/**
 * Check data sufficiency for analytics features
 * @returns {Promise<DataSufficiencyResult>} Data sufficiency information
 */
export const checkDataSufficiency = async () => {
  try {
    return await apiGet(API_ENDPOINTS.ANALYTICS_DATA_SUFFICIENCY, 'check data sufficiency');
  } catch (error) {
    logApiError('checking data sufficiency', error);
    throw error;
  }
};

/**
 * Get recurring spending patterns
 * @param {Object} options - { minMonths?, toleranceDays?, startDate?, endDate? }
 * @returns {Promise<Array<RecurringPattern>>} Array of recurring patterns
 */
export const getRecurringPatterns = async (options = {}) => {
  try {
    const params = new URLSearchParams();
    
    if (options.minMonths) {
      params.append('minMonths', options.minMonths.toString());
    }
    if (options.toleranceDays) {
      params.append('toleranceDays', options.toleranceDays.toString());
    }
    if (options.startDate) {
      params.append('startDate', options.startDate);
    }
    if (options.endDate) {
      params.append('endDate', options.endDate);
    }
    
    const queryString = params.toString();
    const url = queryString 
      ? `${API_ENDPOINTS.ANALYTICS_PATTERNS}?${queryString}`
      : API_ENDPOINTS.ANALYTICS_PATTERNS;
    
    return await apiGet(url, 'fetch recurring patterns');
  } catch (error) {
    logApiError('fetching recurring patterns', error);
    throw error;
  }
};

/**
 * Get day-of-week spending analysis
 * @param {Object} filters - { startDate?, endDate?, category? }
 * @returns {Promise<DayOfWeekAnalysis>} Day-of-week analysis data
 */
export const getDayOfWeekPatterns = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    
    if (filters.startDate) {
      params.append('startDate', filters.startDate);
    }
    if (filters.endDate) {
      params.append('endDate', filters.endDate);
    }
    if (filters.category) {
      params.append('category', filters.category);
    }
    
    const queryString = params.toString();
    const url = queryString
      ? `${API_ENDPOINTS.ANALYTICS_PATTERNS_DAY_OF_WEEK}?${queryString}`
      : API_ENDPOINTS.ANALYTICS_PATTERNS_DAY_OF_WEEK;
    
    return await apiGet(url, 'fetch day-of-week patterns');
  } catch (error) {
    logApiError('fetching day-of-week patterns', error);
    throw error;
  }
};

/**
 * Get seasonal spending analysis
 * @param {Object} options - { months?, startDate?, endDate? }
 * @returns {Promise<SeasonalAnalysis>} Seasonal analysis data
 */
export const getSeasonalAnalysis = async (options = {}) => {
  try {
    const params = new URLSearchParams();
    
    if (options.months) {
      params.append('months', options.months.toString());
    }
    if (options.startDate) {
      params.append('startDate', options.startDate);
    }
    if (options.endDate) {
      params.append('endDate', options.endDate);
    }
    
    const queryString = params.toString();
    const url = queryString
      ? `${API_ENDPOINTS.ANALYTICS_SEASONAL}?${queryString}`
      : API_ENDPOINTS.ANALYTICS_SEASONAL;
    
    return await apiGet(url, 'fetch seasonal analysis');
  } catch (error) {
    logApiError('fetching seasonal analysis', error);
    throw error;
  }
};

/**
 * Get month-end spending prediction
 * @param {number} year - Year for prediction
 * @param {number} month - Month for prediction (1-12)
 * @param {number} monthlyIncome - Optional monthly income for comparison
 * @returns {Promise<MonthPrediction>} Month prediction data
 */
export const getMonthPrediction = async (year, month, monthlyIncome = null) => {
  try {
    const params = new URLSearchParams();
    
    if (monthlyIncome !== null) {
      params.append('monthlyIncome', monthlyIncome.toString());
    }
    
    const queryString = params.toString();
    const url = queryString
      ? `${API_ENDPOINTS.ANALYTICS_PREDICTIONS(year, month)}?${queryString}`
      : API_ENDPOINTS.ANALYTICS_PREDICTIONS(year, month);
    
    return await apiGet(url, 'fetch month prediction');
  } catch (error) {
    logApiError('fetching month prediction', error);
    throw error;
  }
};

/**
 * Get detected anomalies
 * @param {Object} options - { lookbackDays?, startDate?, endDate? }
 * @returns {Promise<Array<Anomaly>>} Array of detected anomalies
 */
export const getAnomalies = async (options = {}) => {
  try {
    const params = new URLSearchParams();
    
    if (options.lookbackDays) {
      params.append('lookbackDays', options.lookbackDays.toString());
    }
    if (options.startDate) {
      params.append('startDate', options.startDate);
    }
    if (options.endDate) {
      params.append('endDate', options.endDate);
    }
    
    const queryString = params.toString();
    const url = queryString
      ? `${API_ENDPOINTS.ANALYTICS_ANOMALIES}?${queryString}`
      : API_ENDPOINTS.ANALYTICS_ANOMALIES;
    
    return await apiGet(url, 'fetch anomalies');
  } catch (error) {
    logApiError('fetching anomalies', error);
    throw error;
  }
};

/**
 * Dismiss an anomaly (mark as expected behavior)
 * @param {number} expenseId - ID of the expense to dismiss
 * @returns {Promise<void>}
 */
export const dismissAnomaly = async (expenseId) => {
  try {
    return await apiPost(
      API_ENDPOINTS.ANALYTICS_ANOMALY_DISMISS(expenseId),
      {},
      'dismiss anomaly'
    );
  } catch (error) {
    logApiError('dismissing anomaly', error);
    throw error;
  }
};

/**
 * Get all analytics data in a single call (convenience function)
 * @param {number} year - Current year
 * @param {number} month - Current month
 * @param {number} monthlyIncome - Optional monthly income
 * @returns {Promise<Object>} Combined analytics data
 */
export const getAllAnalytics = async (year, month, monthlyIncome = null) => {
  try {
    const [
      dataSufficiency,
      patterns,
      dayOfWeek,
      seasonal,
      prediction,
      anomalies
    ] = await Promise.all([
      checkDataSufficiency(),
      getRecurringPatterns().catch(() => []),
      getDayOfWeekPatterns().catch(() => null),
      getSeasonalAnalysis().catch(() => null),
      getMonthPrediction(year, month, monthlyIncome).catch(() => null),
      getAnomalies().catch(() => [])
    ]);
    
    return {
      dataSufficiency,
      patterns,
      dayOfWeek,
      seasonal,
      prediction,
      anomalies
    };
  } catch (error) {
    logApiError('fetching all analytics', error);
    throw error;
  }
};
