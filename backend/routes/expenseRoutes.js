const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');

// POST /api/expenses - Create a new expense
router.post('/expenses', expenseController.createExpense);

// GET /api/expenses - Get all expenses with optional filtering
router.get('/expenses', expenseController.getExpenses);

// GET /api/expenses/places - Get distinct place names (must be before /:id route)
router.get('/expenses/places', expenseController.getDistinctPlaces);

// GET /api/expenses/summary - Get summary data (must be before /:id route)
router.get('/expenses/summary', expenseController.getSummary);

// GET /api/expenses/annual-summary - Get annual summary data
router.get('/expenses/annual-summary', expenseController.getAnnualSummary);

// GET /api/expenses/tax-deductible - Get tax-deductible expenses summary
router.get('/expenses/tax-deductible', expenseController.getTaxDeductibleSummary);

// PUT /api/expenses/:id - Update an expense by ID
router.put('/expenses/:id', expenseController.updateExpense);

// DELETE /api/expenses/:id - Delete an expense by ID
router.delete('/expenses/:id', expenseController.deleteExpense);

// GET /api/monthly-gross - Get monthly gross income
router.get('/monthly-gross', expenseController.getMonthlyGross);

// POST /api/monthly-gross - Set monthly gross income
router.post('/monthly-gross', expenseController.setMonthlyGross);

// POST /api/import - Import expenses from CSV
router.post('/import', expenseController.upload.single('file'), expenseController.importExpenses);

// GET /api/backup - Download database backup
router.get('/backup', expenseController.backupDatabase);

module.exports = router;
