const placeNameRepository = require('../repositories/placeNameRepository');

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Levenshtein distance
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  
  // Create a 2D array for dynamic programming
  const dp = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  
  // Initialize first row and column
  for (let i = 0; i <= len1; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    dp[0][j] = j;
  }
  
  // Fill the dp table
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1,     // insertion
          dp[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }
  
  return dp[len1][len2];
}

/**
 * Normalize a string for comparison
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 */
function normalizeString(str) {
  if (!str) return '';
  
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' '); // Replace multiple spaces with single space
}

/**
 * Calculate similarity score between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score between 0 and 1
 */
function calculateSimilarity(str1, str2) {
  const normalized1 = normalizeString(str1);
  const normalized2 = normalizeString(str2);
  
  // Exact match after normalization
  if (normalized1 === normalized2) {
    return 1.0;
  }
  
  // Check if one string contains the other
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return 0.9;
  }
  
  // Remove punctuation for additional comparison
  const noPunct1 = normalized1.replace(/[^\w\s]/g, '');
  const noPunct2 = normalized2.replace(/[^\w\s]/g, '');
  
  if (noPunct1 === noPunct2) {
    return 0.95;
  }
  
  // Calculate Levenshtein distance
  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);
  
  // Convert distance to similarity score (0 to 1)
  const similarity = 1 - (distance / maxLength);
  
  // Apply threshold for small distances
  if (distance <= 2) {
    return Math.max(similarity, 0.85);
  }
  
  return similarity;
}

/**
 * Check if two place names are similar based on threshold
 * @param {string} name1 - First place name
 * @param {string} name2 - Second place name
 * @param {number} threshold - Similarity threshold (default 0.8)
 * @returns {boolean} True if names are similar
 */
function areSimilar(name1, name2, threshold = 0.8) {
  return calculateSimilarity(name1, name2) >= threshold;
}

/**
 * Group similar place names using clustering algorithm
 * @param {Array} placeNames - Array of {place: string, count: number}
 * @returns {Array} Array of similarity groups
 */
function groupSimilarNames(placeNames) {
  const groups = [];
  const processed = new Set();
  
  // Sort by count descending to prioritize frequent names
  const sortedNames = [...placeNames].sort((a, b) => b.count - a.count);
  
  for (const placeName of sortedNames) {
    if (processed.has(placeName.place)) {
      continue;
    }
    
    // Start a new group with this place name
    const group = {
      variations: [{ name: placeName.place, count: placeName.count }],
      totalCount: placeName.count
    };
    
    processed.add(placeName.place);
    
    // Find all similar names
    for (const otherName of sortedNames) {
      if (processed.has(otherName.place)) {
        continue;
      }
      
      // Check if this name is similar to any name in the current group
      const isSimilarToGroup = group.variations.some(v => 
        areSimilar(v.name, otherName.place)
      );
      
      if (isSimilarToGroup) {
        group.variations.push({ name: otherName.place, count: otherName.count });
        group.totalCount += otherName.count;
        processed.add(otherName.place);
      }
    }
    
    // Only include groups with more than one variation
    if (group.variations.length > 1) {
      // Sort variations by count descending
      group.variations.sort((a, b) => b.count - a.count);
      
      // Set suggested canonical name (most frequent)
      group.suggestedCanonical = group.variations[0].name;
      
      // Generate unique ID for the group
      group.id = `group-${groups.length + 1}`;
      
      groups.push(group);
    }
  }
  
  // Sort groups by total count descending
  groups.sort((a, b) => b.totalCount - a.totalCount);
  
  return groups;
}

/**
 * Analyze all place names and return similarity groups
 * @returns {Promise<Object>} Analysis result with similarity groups
 */
async function analyzePlaceNames() {
  // Get all place names with their counts
  const placeNames = await placeNameRepository.getAllPlaceNames();
  
  // Group similar names using fuzzy matching
  const groups = groupSimilarNames(placeNames);
  
  return {
    groups,
    totalGroups: groups.length,
    totalExpenses: placeNames.reduce((sum, p) => sum + p.count, 0)
  };
}

/**
 * Validate standardization update payload
 * @param {Array} updates - Array of {from: string[], to: string} objects
 * @throws {Error} If validation fails
 */
function validateUpdates(updates) {
  if (!Array.isArray(updates)) {
    throw new Error('Updates must be an array');
  }
  
  if (updates.length === 0) {
    throw new Error('Updates array cannot be empty');
  }
  
  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    
    if (!update || typeof update !== 'object') {
      throw new Error(`Update at index ${i} must be an object`);
    }
    
    if (!Array.isArray(update.from)) {
      throw new Error(`Update at index ${i}: 'from' must be an array`);
    }
    
    if (update.from.length === 0) {
      throw new Error(`Update at index ${i}: 'from' array cannot be empty`);
    }
    
    if (typeof update.to !== 'string') {
      throw new Error(`Update at index ${i}: 'to' must be a string`);
    }
    
    if (update.to.trim() === '') {
      throw new Error(`Update at index ${i}: 'to' cannot be empty or whitespace`);
    }
    
    // Validate all 'from' values are strings
    for (let j = 0; j < update.from.length; j++) {
      if (typeof update.from[j] !== 'string') {
        throw new Error(`Update at index ${i}: 'from[${j}]' must be a string`);
      }
      if (update.from[j].trim() === '') {
        throw new Error(`Update at index ${i}: 'from[${j}]' cannot be empty or whitespace`);
      }
    }
  }
}

/**
 * Apply standardization changes to place names with transaction support
 * @param {Array} updates - Array of {from: string[], to: string} objects
 * @returns {Promise<Object>} Result with update count
 */
async function standardizePlaceNames(updates) {
  // Validate the update payload
  validateUpdates(updates);
  
  // Use transaction-based update for atomic operation
  const totalUpdated = await placeNameRepository.updatePlaceNamesTransaction(updates);

  return {
    success: true,
    updatedCount: totalUpdated,
    message: `Successfully standardized ${totalUpdated} expense record${totalUpdated !== 1 ? 's' : ''}`
  };
}

module.exports = {
  analyzePlaceNames,
  standardizePlaceNames,
  // Export for testing
  levenshteinDistance,
  normalizeString,
  calculateSimilarity,
  areSimilar,
  groupSimilarNames,
  validateUpdates
};
