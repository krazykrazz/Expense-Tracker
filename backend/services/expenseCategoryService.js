const expenseRepository = require('../repositories/expenseRepository');
const logger = require('../config/logger');

class ExpenseCategoryService {
  /**
   * Get distinct place names from expenses
   * @returns {Promise<Array<string>>} Array of unique place names
   */
  async getDistinctPlaces() {
    return await expenseRepository.getDistinctPlaces();
  }

  /**
   * Get suggested category for a place based on historical data
   * @param {string} place - Place name
   * @returns {Promise<Object>} Suggestion object with category and confidence
   */
  async getSuggestedCategory(place) {
    if (!place || typeof place !== 'string') {
      throw new Error('Place name is required');
    }

    return await expenseRepository.getSuggestedCategory(place.trim());
  }
}

module.exports = new ExpenseCategoryService();
