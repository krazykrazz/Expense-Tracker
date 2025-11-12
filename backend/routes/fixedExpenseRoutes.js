const express = require('express');
const router = express.Router();
const fixedExpenseController = require('../controllers/fixedExpenseController');

// GET /api/fixed-expenses/:year/:month - Get all fixed expense items for a specific month
router.get('/:year/:month', fixedExpenseController.getMonthlyFixedExpenses);

// POST /api/fixed-expenses/carry-forward - Carry forward fixed expenses from previous month
router.post('/carry-forward', fixedExpenseController.carryForwardFixedExpenses);

// POST /api/fixed-expenses - Create a new fixed expense item
router.post('/', fixedExpenseController.createFixedExpense);

// PUT /api/fixed-expenses/:id - Update a fixed expense item by ID
router.put('/:id', fixedExpenseController.updateFixedExpense);

// DELETE /api/fixed-expenses/:id - Delete a fixed expense item by ID
router.delete('/:id', fixedExpenseController.deleteFixedExpense);

module.exports = router;
