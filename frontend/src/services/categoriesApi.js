/**
 * Categories API Service
 * Handles fetching expense categories with caching
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, logApiError } from '../utils/apiClient.js';

// Simple in-memory cache for categories
let categoriesCache = null;
let cacheTimestamp = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get expense categories
 * Uses in-memory caching to avoid redundant API calls
 * @param {boolean} forceRefresh - Force refresh from API
 * @returns {Promise<Array>} Array of category strings
 */
export const getCategories = async (forceRefresh = false) => {
  try {
    // Return cached data if valid
    if (!forceRefresh && categoriesCache && cacheTimestamp) {
      const cacheAge = Date.now() - cacheTimestamp;
      if (cacheAge < CACHE_DURATION_MS) {
        return categoriesCache;
      }
    }
    
    const data = await apiGet(API_ENDPOINTS.CATEGORIES, 'fetch categories');
    
    if (data?.categories) {
      categoriesCache = data.categories;
      cacheTimestamp = Date.now();
      return data.categories;
    }
    
    return ['Other']; // Fallback
  } catch (error) {
    logApiError('fetching categories', error);
    // Return cached data on error if available
    if (categoriesCache) {
      return categoriesCache;
    }
    return ['Other']; // Fallback
  }
};

/**
 * Clear the categories cache
 * Call this if categories are modified
 */
export const clearCategoriesCache = () => {
  categoriesCache = null;
  cacheTimestamp = null;
};
