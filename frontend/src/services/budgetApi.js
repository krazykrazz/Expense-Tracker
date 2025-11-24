/**
 * Budget API Service
 * Handles all API calls related to budget management
 */

import { API_ENDPOINTS } from '../config.js';

/**
 * Get all budgets for a specific month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} { budgets: Array }
 */
export const getBudgets = async (year, month) => {
  try {
    const response = await fetch(`${API_ENDPOINTS.BUDGETS}?year=${year}&month=${month}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to fetch budgets');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching budgets:', error);
    throw error;
  }
};

/**
 * Create a new budget
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {string} category - Budget category (Food, Gas, Other)
 * @param {number} limit - Budget limit amount
 * @returns {Promise<Object>} Created budget object
 */
export const createBudget = async (year, month, category, limit) => {
  try {
    const response = await fetch(API_ENDPOINTS.BUDGETS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ year, month, category, limit })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to create budget');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating budget:', error);
    throw error;
  }
};

/**
 * Update an existing budget limit
 * @param {number} id - Budget ID
 * @param {number} limit - New budget limit amount
 * @returns {Promise<Object>} Updated budget object
 */
export const updateBudget = async (id, limit) => {
  try {
    const response = await fetch(`${API_ENDPOINTS.BUDGETS}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ limit })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to update budget');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating budget:', error);
    throw error;
  }
};

/**
 * Delete a budget
 * @param {number} id - Budget ID
 * @returns {Promise<void>}
 */
export const deleteBudget = async (id) => {
  try {
    const response = await fetch(`${API_ENDPOINTS.BUDGETS}/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to delete budget');
    }
    
    // 204 No Content response has no body
    if (response.status === 204) {
      return;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error deleting budget:', error);
    throw error;
  }
};

/**
 * Get budget summary for a specific month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} Budget summary with totals and progress
 */
export const getBudgetSummary = async (year, month) => {
  try {
    const response = await fetch(`${API_ENDPOINTS.BUDGET_SUMMARY}?year=${year}&month=${month}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to fetch budget summary');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching budget summary:', error);
    throw error;
  }
};

/**
 * Get budget history for a time period
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {number} periodMonths - Number of months to include (3, 6, or 12)
 * @returns {Promise<Object>} Historical budget performance data
 */
export const getBudgetHistory = async (year, month, periodMonths = 6) => {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.BUDGET_HISTORY}?year=${year}&month=${month}&months=${periodMonths}`
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to fetch budget history');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching budget history:', error);
    throw error;
  }
};

/**
 * Copy budgets from one month to another
 * @param {number} sourceYear - Source year
 * @param {number} sourceMonth - Source month (1-12)
 * @param {number} targetYear - Target year
 * @param {number} targetMonth - Target month (1-12)
 * @param {boolean} overwrite - Whether to overwrite existing budgets in target month
 * @returns {Promise<Object>} { copied: number, skipped: number, overwritten: number }
 */
export const copyBudgets = async (sourceYear, sourceMonth, targetYear, targetMonth, overwrite = false) => {
  try {
    const response = await fetch(API_ENDPOINTS.BUDGET_COPY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sourceYear,
        sourceMonth,
        targetYear,
        targetMonth,
        overwrite
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to copy budgets');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error copying budgets:', error);
    throw error;
  }
};

/**
 * Get budget suggestion based on historical spending
 * @param {number} year - Target year
 * @param {number} month - Target month (1-12)
 * @param {string} category - Budget category
 * @returns {Promise<Object>} { category, suggestedAmount, averageSpending, basedOnMonths }
 */
export const getBudgetSuggestion = async (year, month, category) => {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.BUDGET_SUGGEST}?year=${year}&month=${month}&category=${encodeURIComponent(category)}`
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to fetch budget suggestion');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching budget suggestion:', error);
    throw error;
  }
};
