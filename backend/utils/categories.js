/**
 * Category definitions for the expense tracking system
 * Single source of truth for all valid expense categories
 */

const CATEGORIES = [
  'Clothing',
  'Dining Out',
  'Entertainment',
  'Gas',
  'Groceries',
  'Housing',
  'Insurance',
  'Pet Care',
  'Recreation Activities',
  'Subscriptions',
  'Utilities',
  'Vehicle Maintenance',
  'Other',
  'Tax - Donation',
  'Tax - Medical'
];

const BUDGETABLE_CATEGORIES = [
  'Clothing',
  'Dining Out',
  'Entertainment',
  'Gas',
  'Groceries',
  'Housing',
  'Insurance',
  'Pet Care',
  'Recreation Activities',
  'Subscriptions',
  'Utilities',
  'Vehicle Maintenance',
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
