/**
 * Category definitions for the expense tracking system
 * Single source of truth for all valid expense categories
 */

const CATEGORIES = [
  'Housing',
  'Utilities',
  'Groceries',
  'Dining Out',
  'Insurance',
  'Gas',
  'Vehicle Maintenance',
  'Entertainment',
  'Subscriptions',
  'Recreation Activities',
  'Pet Care',
  'Tax - Medical',
  'Tax - Donation',
  'Other'
];

const BUDGETABLE_CATEGORIES = [
  'Housing',
  'Utilities',
  'Groceries',
  'Dining Out',
  'Insurance',
  'Gas',
  'Vehicle Maintenance',
  'Entertainment',
  'Subscriptions',
  'Recreation Activities',
  'Pet Care',
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
 * Check if a category is valid
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
  isTaxDeductible,
  isBudgetable,
  isValid
};
