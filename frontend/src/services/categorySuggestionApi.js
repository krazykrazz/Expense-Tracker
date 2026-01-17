/**
 * Category Suggestion API Service
 * Handles API calls for intelligent category suggestions based on place history
 */

import { API_ENDPOINTS } from '../config.js';
import { createLogger } from '../utils/logger';

const logger = createLogger('CategorySuggestionApi');

/**
 * Fetch category suggestion for a place based on historical data
 * @param {string} place - The place name to get suggestion for
 * @returns {Promise<{category: string|null, confidence: number}|null>} Suggestion or null on error
 */
export const fetchCategorySuggestion = async (place) => {
  // Return null for empty or whitespace-only place names
  if (!place || !place.trim()) {
    return null;
  }

  try {
    const response = await fetch(
      `${API_ENDPOINTS.SUGGEST_CATEGORY}?place=${encodeURIComponent(place.trim())}`
    );

    if (!response.ok) {
      // Graceful degradation - return null on error
      logger.warn('Category suggestion API returned error:', response.status);
      return null;
    }

    const data = await response.json();
    
    // Return the suggestion object with category and confidence
    return data.suggestion || null;
  } catch (error) {
    // Graceful degradation - log error and return null
    logger.warn('Error fetching category suggestion:', error.message);
    return null;
  }
};
