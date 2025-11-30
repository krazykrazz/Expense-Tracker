/**
 * Investment Value API Service
 * Handles all API calls related to investment value tracking
 */

import { API_ENDPOINTS } from '../config.js';

/**
 * Get value history for a specific investment
 * @param {number} investmentId - Investment ID
 * @returns {Promise<Array>} Array of value entries with calculated changes
 */
export const getValueHistory = async (investmentId) => {
  try {
    const response = await fetch(`${API_ENDPOINTS.INVESTMENT_VALUES}/${investmentId}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch value history');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching value history:', error);
    throw error;
  }
};

/**
 * Get value entry for a specific investment and month
 * @param {number} investmentId - Investment ID
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} Value entry object
 */
export const getValueForMonth = async (investmentId, year, month) => {
  try {
    const response = await fetch(`${API_ENDPOINTS.INVESTMENT_VALUES}/${investmentId}/${year}/${month}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch value for month');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching value for month:', error);
    throw error;
  }
};

/**
 * Create or update a value entry
 * @param {Object} valueData - { investment_id, year, month, value }
 * @returns {Promise<Object>} Created or updated value entry
 */
export const createOrUpdateValue = async (valueData) => {
  try {
    const response = await fetch(API_ENDPOINTS.INVESTMENT_VALUES, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(valueData)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to create or update value');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating or updating value:', error);
    throw error;
  }
};

/**
 * Delete a value entry
 * @param {number} id - Value entry ID
 * @returns {Promise<Object>} Success response
 */
export const deleteValue = async (id) => {
  try {
    const response = await fetch(`${API_ENDPOINTS.INVESTMENT_VALUES}/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to delete value entry');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error deleting value entry:', error);
    throw error;
  }
};
