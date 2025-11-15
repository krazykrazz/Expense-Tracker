import { API_ENDPOINTS } from '../config.js';

/**
 * Get all income sources for a specific month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} { sources: Array, total: number }
 */
export const getMonthlyIncomeSources = async (year, month) => {
  try {
    const response = await fetch(`/api/income/${year}/${month}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch income sources');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching monthly income sources:', error);
    throw error;
  }
};

/**
 * Create a new income source
 * @param {Object} data - { year, month, name, amount }
 * @returns {Promise<Object>} Created income source
 */
export const createIncomeSource = async (data) => {
  try {
    const response = await fetch('/api/income', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to create income source');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating income source:', error);
    throw error;
  }
};

/**
 * Update an income source
 * @param {number} id - Income source ID
 * @param {Object} data - { name, amount }
 * @returns {Promise<Object>} Updated income source
 */
export const updateIncomeSource = async (id, data) => {
  try {
    const response = await fetch(`/api/income/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to update income source');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating income source:', error);
    throw error;
  }
};

/**
 * Delete an income source
 * @param {number} id - Income source ID
 * @returns {Promise<Object>} Success response
 */
export const deleteIncomeSource = async (id) => {
  try {
    const response = await fetch(`/api/income/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to delete income source');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error deleting income source:', error);
    throw error;
  }
};

/**
 * Carry forward income sources from previous month
 * @param {number} year - Target year
 * @param {number} month - Target month (1-12)
 * @returns {Promise<Object>} { sources: Array, count: number }
 */
export const carryForwardIncomeSources = async (year, month) => {
  try {
    const response = await fetch(`/api/income/${year}/${month}/copy-previous`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to carry forward income sources');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error carrying forward income sources:', error);
    throw error;
  }
};
