const express = require('express');
const router = express.Router();
const recurringExpenseController = require('../controllers/recurringExpenseController');

// POST /api/recurring - Create a new recurring expense template
router.post('/recurring', recurringExpenseController.createRecurring);

// GET /api/recurring - Get all recurring expense templates
router.get('/recurring', recurringExpenseController.getRecurringExpenses);

// POST /api/recurring/generate - Generate expenses for a specific month (must be before /:id route)
router.post('/recurring/generate', recurringExpenseController.generateExpenses);

// PUT /api/recurring/:id - Update a recurring expense template by ID
router.put('/recurring/:id', recurringExpenseController.updateRecurring);

// PATCH /api/recurring/:id/pause - Pause or resume a recurring expense template
router.patch('/recurring/:id/pause', recurringExpenseController.togglePause);

// DELETE /api/recurring/:id - Delete a recurring expense template by ID
router.delete('/recurring/:id', recurringExpenseController.deleteRecurring);

module.exports = router;
