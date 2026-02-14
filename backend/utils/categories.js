/**
 * Category definitions for the expense tracking system
 * Single source of truth for all valid expense categories
 */

const CATEGORIES = [
  'Automotive',
  'Clothing',
  'Dining Out',
  'Entertainment',
  'Gas',
  'Gifts',
  'Groceries',
  'Housing',
  'Insurance',
  'Personal Care',
  'Pet Care',
  'Recreation Activities',
  'Subscriptions',
  'Utilities',
  'Other',
  'Tax - Donation',
  'Tax - Medical'
];

const BUDGETABLE_CATEGORIES = [
  'Automotive',
  'Clothing',
  'Dining Out',
  'Entertainment',
  'Gas',
  'Gifts',
  'Groceries',
  'Housing',
  'Insurance',
  'Personal Care',
  'Pet Care',
  'Recreation Activities',
  'Subscriptions',
  'Utilities',
  'Other'
];

const TAX_DEDUCTIBLE_CATEGORIES = [
  'Tax - Medical',
  'Tax - Donation'
];

/**
 * Check if a category is tax-deductible
 * @param {string} category - The category to check
 * @returns {boolean} True if the category is tax-deductible
 */
function isTaxDeductible(category) {
  return TAX_DEDUCTIBLE_CATEGORIES.includes(category);
}

/**
 * Check if a category can have budgets
 * @param {string} category - The category to check
 * @returns {boolean} True if the category is budgetable
 */
function isBudgetable(category) {
  return BUDGETABLE_CATEGORIES.includes(category);
}

/**
 * Legacy category names that should be auto-mapped to current names.
 * Used when restoring older database backups that contain renamed categories.
 */
const LEGACY_CATEGORY_MAP = {
  'Vehicle Maintenance': 'Automotive'
};

/**
 * Normalize a category name, mapping legacy names to current ones.
 * @param {string} category - The category to normalize
 * @returns {string} The normalized category name
 */
function normalizeCategory(category) {
  return LEGACY_CATEGORY_MAP[category] || category;
}

/**
 * Check if a category is valid (including legacy names that can be normalized)
 * @param {string} category - The category to check
 * @returns {boolean} True if the category is in the approved list
 */
function isValid(category) {
  return CATEGORIES.includes(category);
}

module.exports = {
  CATEGORIES,
  BUDGETABLE_CATEGORIES,
  TAX_DEDUCTIBLE_CATEGORIES,
  LEGACY_CATEGORY_MAP,
  normalizeCategory,
  isTaxDeductible,
  isBudgetable,
  isValid
};
