/**
 * Analytics API Service
 * Handles all API calls for Spending Patterns & Predictions analytics
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, apiDelete, logApiError } from '../utils/apiClient.js';

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
    
    const response = await apiGet(url, 'fetch anomalies');
    // API returns { anomalies: [], metadata: {...} }, extract anomalies array
    return response?.anomalies || [];
  } catch (error) {
    logApiError('fetching anomalies', error);
    throw error;
  }
};

/**
 * Dismiss an anomaly (mark as expected behavior)
 * @param {number} expenseId - ID of the expense to dismiss
 * @param {string} anomalyType - Type of anomaly being dismissed
 * @returns {Promise<void>}
 */
export const dismissAnomaly = async (expenseId, anomalyType) => {
  try {
    return await apiPost(
      API_ENDPOINTS.ANALYTICS_ANOMALY_DISMISS(expenseId),
      { anomalyType },
      'dismiss anomaly'
    );
  } catch (error) {
    logApiError('dismissing anomaly', error);
    throw error;
  }
};

/**
 * Get monthly summary data for a given year/month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<MonthlySummaryResponse>} Monthly summary data
 */
export const getMonthlySummary = async (year, month) => {
  try {
    return await apiGet(API_ENDPOINTS.ANALYTICS_MONTHLY_SUMMARY(year, month), 'fetch monthly summary');
  } catch (error) {
    logApiError('fetching monthly summary', error);
    throw error;
  }
};

/**
 * Get consolidated trends data for a given year/month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<TrendsResponse>} Trends data
 */
export const getTrends = async (year, month) => {
  try {
    return await apiGet(API_ENDPOINTS.ANALYTICS_TRENDS(year, month), 'fetch trends');
  } catch (error) {
    logApiError('fetching trends', error);
    throw error;
  }
};

/**
 * Get activity insights for a given year/month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<ActivityInsightsResponse>} Activity insights data
 */
export const getActivityInsights = async (year, month) => {
  try {
    return await apiGet(API_ENDPOINTS.ANALYTICS_ACTIVITY_INSIGHTS(year, month), 'fetch activity insights');
  } catch (error) {
    logApiError('fetching activity insights', error);
    throw error;
  }
};

/**
 * Mark an anomaly as expected (dismiss + create suppression rule)
 * @param {number} expenseId - ID of the expense
 * @param {string} anomalyType - Type of anomaly
 * @param {Object} expenseDetails - Details of the expense for rule creation
 * @returns {Promise<Object>} Result with suppression rule info
 */
export const markAnomalyAsExpected = async (expenseId, anomalyType, expenseDetails) => {
  try {
    return await apiPost(
      API_ENDPOINTS.ANALYTICS_ANOMALY_MARK_EXPECTED(expenseId),
      { anomalyType, expenseDetails },
      'mark anomaly as expected'
    );
  } catch (error) {
    logApiError('marking anomaly as expected', error);
    throw error;
  }
};

/**
 * Get all active suppression rules
 * @returns {Promise<Array<SuppressionRule>>} Array of suppression rules
 */
export const getSuppressionRules = async () => {
  try {
    return await apiGet(API_ENDPOINTS.ANALYTICS_SUPPRESSION_RULES, 'fetch suppression rules');
  } catch (error) {
    logApiError('fetching suppression rules', error);
    throw error;
  }
};

/**
 * Delete a suppression rule by ID
 * @param {number} ruleId - ID of the rule to delete
 * @returns {Promise<void>}
 */
export const deleteSuppressionRule = async (ruleId) => {
  try {
    return await apiDelete(API_ENDPOINTS.ANALYTICS_SUPPRESSION_RULE_BY_ID(ruleId), 'delete suppression rule');
  } catch (error) {
    logApiError('deleting suppression rule', error);
    throw error;
  }
};
