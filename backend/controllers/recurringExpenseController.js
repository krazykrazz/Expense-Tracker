const recurringExpenseService = require('../services/recurringExpenseService');

/**
 * Create a new recurring expense template
 * POST /api/recurring
 */
async function createRecurring(req, res) {
  try {
    const templateData = req.body;
    const createdTemplate = await recurringExpenseService.createRecurring(templateData);
    res.status(201).json(createdTemplate);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Get all recurring expense templates
 * GET /api/recurring
 */
async function getRecurringExpenses(req, res) {
  try {
    const templates = await recurringExpenseService.getRecurringExpenses();
    res.status(200).json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Update a recurring expense template by ID
 * PUT /api/recurring/:id
 */
async function updateRecurring(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid recurring expense ID' });
    }
    
    const templateData = req.body;
    const updatedTemplate = await recurringExpenseService.updateRecurring(id, templateData);
    
    if (!updatedTemplate) {
      return res.status(404).json({ error: 'Recurring expense template not found' });
    }
    
    res.status(200).json(updatedTemplate);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Delete a recurring expense template by ID
 * DELETE /api/recurring/:id
 */
async function deleteRecurring(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid recurring expense ID' });
    }
    
    const deleted = await recurringExpenseService.deleteRecurring(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Recurring expense template not found' });
    }
    
    res.status(200).json({ message: 'Recurring expense template deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Pause or resume a recurring expense template
 * PATCH /api/recurring/:id/pause
 */
async function togglePause(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid recurring expense ID' });
    }
    
    const { paused } = req.body;
    
    if (paused === undefined || paused === null) {
      return res.status(400).json({ error: 'Paused status is required' });
    }
    
    const updatedTemplate = await recurringExpenseService.pauseRecurring(id, paused);
    
    if (!updatedTemplate) {
      return res.status(404).json({ error: 'Recurring expense template not found' });
    }
    
    res.status(200).json(updatedTemplate);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Generate expenses for a specific month
 * POST /api/recurring/generate
 */
async function generateExpenses(req, res) {
  try {
    const { year, month } = req.body;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month are required' });
    }
    
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }
    
    const generatedExpenses = await recurringExpenseService.generateExpensesForMonth(yearNum, monthNum);
    
    res.status(200).json({
      message: `Generated ${generatedExpenses.length} expense(s) for ${year}-${month.toString().padStart(2, '0')}`,
      count: generatedExpenses.length,
      expenses: generatedExpenses
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createRecurring,
  getRecurringExpenses,
  updateRecurring,
  deleteRecurring,
  togglePause,
  generateExpenses
};
