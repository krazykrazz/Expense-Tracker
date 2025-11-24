/**
 * Place Name API Service
 * Handles all API calls related to place name standardization
 */

import { API_ENDPOINTS } from '../config.js';

/**
 * Analyze all place names and return similarity groups
 * @returns {Promise<Object>} { groups: Array, totalGroups: number, totalExpenses: number }
 */
export const analyzePlaceNames = async () => {
  try {
    const response = await fetch(API_ENDPOINTS.PLACE_NAMES_ANALYZE);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to analyze place names');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error analyzing place names:', error);
    throw error;
  }
};

/**
 * Apply standardization changes to place names
 * @param {Array} updates - Array of { from: string[], to: string } objects
 * @returns {Promise<Object>} { success: boolean, updatedCount: number, message: string }
 */
export const standardizePlaceNames = async (updates) => {
  try {
    const response = await fetch(API_ENDPOINTS.PLACE_NAMES_STANDARDIZE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ updates })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to standardize place names');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error standardizing place names:', error);
    throw error;
  }
};
