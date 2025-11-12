const express = require('express');
const router = express.Router();
const incomeController = require('../controllers/incomeController');

// GET /api/income/:year/:month - Get all income sources for a specific month
router.get('/:year/:month', incomeController.getMonthlyIncome);

// POST /api/income/:year/:month/copy-previous - Copy income sources from previous month
router.post('/:year/:month/copy-previous', incomeController.copyFromPreviousMonth);

// POST /api/income - Create a new income source
router.post('/', incomeController.createIncomeSource);

// PUT /api/income/:id - Update an income source by ID
router.put('/:id', incomeController.updateIncomeSource);

// DELETE /api/income/:id - Delete an income source by ID
router.delete('/:id', incomeController.deleteIncomeSource);

module.exports = router;
