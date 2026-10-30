const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/budgetController');
const budgetPlanController = require('../controllers/budgetPlanController');

// GET /api/budgets/plan - Where a month's income goes (must be before /:id route)
router.get('/plan', budgetPlanController.getBudgetPlan);

// Planned savings/investment allocations (not expenses)
router.post('/allocations/copy', budgetPlanController.copyAllocations);
router.get('/allocations', budgetPlanController.getAllocations);
router.post('/allocations', budgetPlanController.createAllocation);
router.put('/allocations/:id', budgetPlanController.updateAllocation);
router.delete('/allocations/:id', budgetPlanController.deleteAllocation);

// GET /api/budgets/summary - Get budget summary (must be before /:id route)
router.get('/summary', budgetController.getBudgetSummary);

// GET /api/budgets/history - Get budget history (must be before /:id route)
router.get('/history', budgetController.getBudgetHistory);

// GET /api/budgets/suggest - Get budget suggestion based on historical spending (must be before /:id route)
router.get('/suggest', budgetController.suggestBudget);

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
