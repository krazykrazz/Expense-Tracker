const expenseRepository = require('../repositories/expenseRepository');

/**
 * Category Suggestion Service
 * Provides intelligent category suggestions based on historical expense data
 */
class CategorySuggestionService {
  _preferSpecificOverOther(frequencyData) {
    if (frequencyData.length <= 1) return frequencyData;
    const specific = frequencyData.filter((item) => item.category !== 'Other');
    if (specific.length === 0) return frequencyData;
    // Only exclude "Other" if a specific category has a strictly higher count
    const otherEntry = frequencyData.find((item) => item.category === 'Other');
    if (!otherEntry) return frequencyData;
    const topSpecificCount = Math.max(...specific.map((s) => s.count));
    if (topSpecificCount > otherEntry.count) return specific;
    return frequencyData;
  }

  /**
   * Get suggested category for a place based on historical data
   * @param {string} place - The place name to get suggestion for
   * @returns {Promise<{category: string|null, confidence: number, count: number}|null>}
   */
  async getSuggestedCategory(place) {
    if (!place || place.trim() === '') {
      return null;
    }

    const frequencyData = await expenseRepository.getCategoryFrequencyByPlace(place);
    
    // No history for this place
    if (!frequencyData || frequencyData.length === 0) {
      return null;
    }

    const suggestionPool = this._preferSpecificOverOther(frequencyData);

    // Calculate total count for confidence score (use ALL entries including Other)
    const totalCount = frequencyData.reduce((sum, item) => sum + item.count, 0);
    
    // Find the most frequent category from the filtered pool
    // If there's a tie, getCategoryFrequencyByPlace already orders by last_used DESC
    const topCategory = suggestionPool[0];
    
    // Check for ties - categories with the same count as the top one
    const tiedCategories = suggestionPool.filter(item => item.count === topCategory.count);
    
    // If there are ties, use the most recently used category
    let selectedCategory = topCategory;
    if (tiedCategories.length > 1) {
      // Sort by last_used date descending to get most recent
      selectedCategory = tiedCategories.sort((a, b) => {
        return new Date(b.last_used) - new Date(a.last_used);
      })[0];
    }

    // Calculate confidence as a ratio (0-1)
    const confidence = totalCount > 0 ? selectedCategory.count / totalCount : 0;

    return {
      category: selectedCategory.category,
      confidence: parseFloat(confidence.toFixed(2)),
      count: selectedCategory.count
    };
  }

  /**
   * Get category frequency breakdown for a place
   * @param {string} place - The place name
   * @returns {Promise<Array<{category: string, count: number, lastUsed: string}>>}
   */
  async getCategoryBreakdown(place) {
    if (!place || place.trim() === '') {
      return [];
    }

    const frequencyData = await expenseRepository.getCategoryFrequencyByPlace(place);
    
    // Transform to match the expected interface
    return frequencyData.map(item => ({
      category: item.category,
      count: item.count,
      lastUsed: item.last_used
    }));
  }
}

module.exports = new CategorySuggestionService();
