const budgetService = require('../services/budgetService');

/**
 * Get budgets for a specific month
 * GET /api/budgets?year=2025&month=11
 */
async function getBudgets(req, res) {
  try {
    const { year, month } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ 
        error: {
          code: 'INVALID_DATE',
          message: 'Year and month query parameters are required'
        }
      });
    }
    
    const budgets = await budgetService.getBudgets(year, month);
    
    // Add spent amounts to each budget
    const budgetsWithSpent = await Promise.all(
      budgets.map(async (budget) => {
        const spent = await budgetService.getSpentAmount(budget.year, budget.month, budget.category);
        return {
          ...budget,
          spent
        };
      })
    );
    
    res.status(200).json({ budgets: budgetsWithSpent });
  } catch (error) {
    if (error.message.includes('Invalid year or month')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DATE',
          message: error.message
        }
      });
    }
    res.status(500).json({ 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
}

/**
 * Create a new budget
 * POST /api/budgets
 * Body: { year, month, category, limit }
 */
async function createBudget(req, res) {
  try {
    const { year, month, category, limit } = req.body;
    
    // Validate required fields
    if (!year || !month || !category || limit === undefined || limit === null) {
      return res.status(400).json({ 
        error: {
          code: 'INVALID_REQUEST',
          message: 'Year, month, category, and limit are required'
        }
      });
    }
    
    const createdBudget = await budgetService.createBudget(year, month, category, limit);
    res.status(201).json(createdBudget);
  } catch (error) {
    // Handle specific error types
    if (error.message.includes('Budget limit must be a positive number')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_BUDGET_AMOUNT',
          message: error.message,
          details: {
            field: 'limit',
            constraint: 'must be > 0'
          }
        }
      });
    }
    
    if (error.message.includes('Budget can only be set for')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_CATEGORY',
          message: error.message
        }
      });
    }
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: {
          code: 'DUPLICATE_BUDGET',
          message: error.message
        }
      });
    }
    
    if (error.message.includes('Invalid year or month')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DATE',
          message: error.message
        }
      });
    }
    
    res.status(400).json({ 
      error: {
        code: 'INVALID_REQUEST',
        message: error.message
      }
    });
  }
}

/**
 * Update a budget limit
 * PUT /api/budgets/:id
 * Body: { limit }
 */
async function updateBudget(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ 
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid budget ID'
        }
      });
    }
    
    const { limit } = req.body;
    
    if (limit === undefined || limit === null) {
      return res.status(400).json({ 
        error: {
          code: 'INVALID_REQUEST',
          message: 'Limit is required'
        }
      });
    }
    
    const updatedBudget = await budgetService.updateBudget(id, limit);
    res.status(200).json(updatedBudget);
  } catch (error) {
    if (error.message.includes('Budget limit must be a positive number')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_BUDGET_AMOUNT',
          message: error.message,
          details: {
            field: 'limit',
            constraint: 'must be > 0'
          }
        }
      });
    }
    
    if (error.message === 'Budget not found') {
      return res.status(404).json({
        error: {
          code: 'BUDGET_NOT_FOUND',
          message: error.message
        }
      });
    }
    
    res.status(400).json({ 
      error: {
        code: 'INVALID_REQUEST',
        message: error.message
      }
    });
  }
}

/**
 * Delete a budget
 * DELETE /api/budgets/:id
 */
async function deleteBudget(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ 
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid budget ID'
        }
      });
    }
    
    await budgetService.deleteBudget(id);
    res.status(204).send();
  } catch (error) {
    if (error.message === 'Budget not found') {
      return res.status(404).json({
        error: {
          code: 'BUDGET_NOT_FOUND',
          message: error.message
        }
      });
    }
    
    res.status(500).json({ 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
}

/**
 * Get budget summary for a specific month
 * GET /api/budgets/summary?year=2025&month=11
 */
async function getBudgetSummary(req, res) {
  try {
    const { year, month } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ 
        error: {
          code: 'INVALID_DATE',
          message: 'Year and month query parameters are required'
        }
      });
    }
    
    const summary = await budgetService.getBudgetSummary(year, month);
    res.status(200).json(summary);
  } catch (error) {
    if (error.message.includes('Invalid year or month')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DATE',
          message: error.message
        }
      });
    }
    
    res.status(500).json({ 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
}

/**
 * Get budget history for a time period
 * GET /api/budgets/history?year=2025&month=11&months=6
 */
async function getBudgetHistory(req, res) {
  try {
    const { year, month, months } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ 
        error: {
          code: 'INVALID_DATE',
          message: 'Year and month query parameters are required'
        }
      });
    }
    
    const periodMonths = months ? parseInt(months) : 6;
    
    const history = await budgetService.getBudgetHistory(year, month, periodMonths);
    res.status(200).json(history);
  } catch (error) {
    if (error.message.includes('Invalid year or month')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DATE',
          message: error.message
        }
      });
    }
    
    if (error.message.includes('Period must be')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: error.message
        }
      });
    }
    
    res.status(500).json({ 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
}

/**
 * Copy budgets from one month to another
 * POST /api/budgets/copy
 * Body: { sourceYear, sourceMonth, targetYear, targetMonth, overwrite }
 */
async function copyBudgets(req, res) {
  try {
    const { sourceYear, sourceMonth, targetYear, targetMonth, overwrite } = req.body;
    
    // Validate required fields
    if (!sourceYear || !sourceMonth || !targetYear || !targetMonth) {
      return res.status(400).json({ 
        error: {
          code: 'INVALID_REQUEST',
          message: 'sourceYear, sourceMonth, targetYear, and targetMonth are required'
        }
      });
    }
    
    const result = await budgetService.copyBudgets(
      sourceYear, 
      sourceMonth, 
      targetYear, 
      targetMonth, 
      overwrite || false
    );
    
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'NO_BUDGETS_TO_COPY') {
      return res.status(400).json({
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    
    if (error.code === 'COPY_CONFLICT') {
      return res.status(409).json({
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    
    if (error.message.includes('Invalid year or month')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DATE',
          message: error.message
        }
      });
    }
    
    res.status(400).json({ 
      error: {
        code: 'INVALID_REQUEST',
        message: error.message
      }
    });
  }
}

/**
 * Get budget suggestion based on historical spending
 * GET /api/budgets/suggest?year=2025&month=11&category=Groceries
 */
async function suggestBudget(req, res) {
  try {
    const { year, month, category } = req.query;
    
    // Validate required fields
    if (!year || !month || !category) {
      return res.status(400).json({ 
        error: {
          code: 'INVALID_REQUEST',
          message: 'Year, month, and category query parameters are required'
        }
      });
    }
    
    const suggestion = await budgetService.suggestBudgetAmount(year, month, category);
    res.status(200).json(suggestion);
  } catch (error) {
    if (error.message.includes('Invalid year or month')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DATE',
          message: error.message
        }
      });
    }
    
    if (error.message.includes('Budget can only be set for')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_CATEGORY',
          message: error.message
        }
      });
    }
    
    res.status(500).json({ 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
}

module.exports = {
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetSummary,
  getBudgetHistory,
  copyBudgets,
  suggestBudget
};
