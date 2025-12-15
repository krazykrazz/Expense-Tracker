const { CATEGORIES, BUDGETABLE_CATEGORIES, TAX_DEDUCTIBLE_CATEGORIES } = require('../utils/categories');
const logger = require('../config/logger');

/**
 * Get all valid categories
 * @route GET /api/categories
 */
const getCategories = (req, res) => {
  try {
    res.json({
      categories: CATEGORIES,
      budgetableCategories: BUDGETABLE_CATEGORIES,
      taxDeductibleCategories: TAX_DEDUCTIBLE_CATEGORIES
    });
  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

module.exports = {
  getCategories
};
