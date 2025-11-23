const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/budgetController');

// GET /api/budgets/summary - Get budget summary (must be before /:id route)
router.get('/summary', budgetController.getBudgetSummary);

// GET /api/budgets/history - Get budget history (must be before /:id route)
router.get('/history', budgetController.getBudgetHistory);

// POST /api/budgets/copy - Copy budgets between months
router.post('/copy', budgetController.copyBudgets);

// GET /api/budgets - Get budgets for a specific month
router.get('/', budgetController.getBudgets);

// POST /api/budgets - Create a new budget
router.post('/', budgetController.createBudget);

// PUT /api/budgets/:id - Update a budget limit
router.put('/:id', budgetController.updateBudget);

// DELETE /api/budgets/:id - Delete a budget
router.delete('/:id', budgetController.deleteBudget);

module.exports = router;
