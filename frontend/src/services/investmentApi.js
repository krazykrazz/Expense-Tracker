/**
 * Investment API Service
 * Handles all API calls related to investment management
 */

import { API_ENDPOINTS } from '../config.js';

/**
 * Get all investments with current values
 * @returns {Promise<Array>} Array of investment objects with current values
 */
export const getAllInvestments = async () => {
  try {
    const response = await fetch(API_ENDPOINTS.INVESTMENTS);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch investments');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching investments:', error);
    throw error;
  }
};

/**
 * Create a new investment
 * @param {Object} investmentData - { name, type, initial_value }
 * @returns {Promise<Object>} Created investment object
 */
export const createInvestment = async (investmentData) => {
  try {
    const response = await fetch(API_ENDPOINTS.INVESTMENTS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(investmentData)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to create investment');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating investment:', error);
    throw error;
  }
};

/**
 * Update an existing investment
 * @param {number} id - Investment ID
 * @param {Object} investmentData - { name, type }
 * @returns {Promise<Object>} Updated investment object
 */
export const updateInvestment = async (id, investmentData) => {
  try {
    const response = await fetch(`${API_ENDPOINTS.INVESTMENTS}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(investmentData)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to update investment');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating investment:', error);
    throw error;
  }
};

/**
 * Delete an investment
 * @param {number} id - Investment ID
 * @returns {Promise<Object>} Success response
 */
export const deleteInvestment = async (id) => {
  try {
    const response = await fetch(`${API_ENDPOINTS.INVESTMENTS}/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to delete investment');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error deleting investment:', error);
    throw error;
  }
};
