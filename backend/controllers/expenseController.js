const expenseService = require('../services/expenseService');
const categorySuggestionService = require('../services/categorySuggestionService');
const { isValid: isValidCategory } = require('../utils/categories');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('../database/db');

/**
 * Generate success message for future expenses creation
 * @param {number} futureCount - Number of future expenses created
 * @param {string} lastDate - Date of the last future expense (YYYY-MM-DD)
 * @returns {string} Success message
 */
function generateFutureExpensesMessage(futureCount, lastDate) {
  if (futureCount === 0) {
    return 'Expense saved';
  }
  
  // Parse the last date to get month name
  const date = new Date(lastDate + 'T00:00:00');
  const monthName = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  
  const monthText = futureCount === 1 ? 'month' : 'months';
  return `Expense saved and added to ${futureCount} future ${monthText} through ${monthName}`;
}

/**
 * Create a new expense
 * POST /api/expenses
 */
async function createExpense(req, res) {
  try {
    const { peopleAllocations, futureMonths, ...expenseData } = req.body;
    
    // Parse futureMonths (default to 0 if not provided)
    const parsedFutureMonths = futureMonths !== undefined ? parseInt(futureMonths, 10) : 0;
    
    let result;
    if (peopleAllocations && peopleAllocations.length > 0) {
      // Create expense with people allocations
      result = await expenseService.createExpenseWithPeople(expenseData, peopleAllocations, parsedFutureMonths);
    } else {
      // Create regular expense without people
      result = await expenseService.createExpense(expenseData, parsedFutureMonths);
    }
    
    // Format response based on whether future expenses were created
    if (parsedFutureMonths > 0 && result.futureExpenses) {
      const lastFutureExpense = result.futureExpenses[result.futureExpenses.length - 1];
      const message = generateFutureExpensesMessage(result.futureExpenses.length, lastFutureExpense.date);
      
      res.status(201).json({
        expense: result.expense,
        futureExpenses: result.futureExpenses,
        message: message
      });
    } else {
      // Backward compatible response for single expense creation
      res.status(201).json(result);
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Get all expenses with optional year/month filtering
 * GET /api/expenses?year=2024&month=11
 */
async function getExpenses(req, res) {
  try {
    const { year, month } = req.query;
    const filters = {};
    
    if (year) {
      filters.year = parseInt(year);
    }
    
    if (month) {
      filters.month = parseInt(month);
    }
    
    const expenses = await expenseService.getExpenses(filters);
    res.status(200).json(expenses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get an expense by ID with people data
 * GET /api/expenses/:id
 */
async function getExpenseWithPeople(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid expense ID' });
    }
    
    const expense = await expenseService.getExpenseWithPeople(id);
    
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    res.status(200).json(expense);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Update an expense by ID
 * PUT /api/expenses/:id
 */
async function updateExpense(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid expense ID' });
    }
    
    const { peopleAllocations, futureMonths, ...expenseData } = req.body;
    
    // Parse futureMonths (default to 0 if not provided)
    const parsedFutureMonths = futureMonths !== undefined ? parseInt(futureMonths, 10) : 0;
    
    let result;
    if (peopleAllocations !== undefined) {
      // Update expense with people allocations (could be empty array to remove all people)
      result = await expenseService.updateExpenseWithPeople(id, expenseData, peopleAllocations, parsedFutureMonths);
    } else {
      // Update regular expense without touching people associations
      result = await expenseService.updateExpense(id, expenseData, parsedFutureMonths);
    }
    
    if (!result) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    // Format response based on whether future expenses were created
    if (parsedFutureMonths > 0 && result.futureExpenses) {
      const lastFutureExpense = result.futureExpenses[result.futureExpenses.length - 1];
      const message = generateFutureExpensesMessage(result.futureExpenses.length, lastFutureExpense.date);
      
      res.status(200).json({
        expense: result.expense,
        futureExpenses: result.futureExpenses,
        message: message
      });
    } else {
      // Backward compatible response for single expense update
      res.status(200).json(result);
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Delete an expense by ID
 * DELETE /api/expenses/:id
 */
async function deleteExpense(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid expense ID' });
    }
    
    const deleted = await expenseService.deleteExpense(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    res.status(200).json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get summary data for a specific month
 * GET /api/expenses/summary?year=2024&month=11&includePrevious=true
 */
async function getSummary(req, res) {
  try {
    const { year, month, includePrevious } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month query parameters are required' });
    }
    
    // Parse year and month as integers
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || isNaN(monthNum)) {
      return res.status(400).json({ error: 'Year and month must be valid numbers' });
    }
    
    // Parse includePrevious as boolean (defaults to false)
    const shouldIncludePrevious = includePrevious === 'true' || includePrevious === '1';
    
    const summary = await expenseService.getSummary(yearNum, monthNum, shouldIncludePrevious);
    res.status(200).json(summary);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Get annual summary data
 * GET /api/expenses/annual-summary?year=2024
 */
async function getAnnualSummary(req, res) {
  try {
    const { year } = req.query;
    
    if (!year) {
      return res.status(400).json({ error: 'Year query parameter is required' });
    }
    
    const summary = await expenseService.getAnnualSummary(parseInt(year));
    res.status(200).json(summary);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Get tax-deductible expenses summary
 * GET /api/expenses/tax-deductible?year=2024&groupByPerson=true
 */
async function getTaxDeductibleSummary(req, res) {
  try {
    const { year, groupByPerson } = req.query;
    
    if (!year) {
      return res.status(400).json({ error: 'Year query parameter is required' });
    }
    
    const shouldGroupByPerson = groupByPerson === 'true' || groupByPerson === '1';
    
    let summary;
    if (shouldGroupByPerson) {
      summary = await expenseService.getTaxDeductibleWithPeople(parseInt(year));
    } else {
      summary = await expenseService.getTaxDeductibleSummary(parseInt(year));
    }
    
    res.status(200).json(summary);
  } catch (error) {
    logger.error('Error fetching tax-deductible summary:', error);
    res.status(500).json({ error: 'Failed to retrieve tax-deductible expenses' });
  }
}

/**
 * Get lightweight tax-deductible summary for YoY comparison
 * GET /api/expenses/tax-deductible/summary?year=2024
 * Returns only totals and counts, not full expense lists
 */
async function getTaxDeductibleYoYSummary(req, res) {
  try {
    const { year } = req.query;
    
    if (!year) {
      return res.status(400).json({ error: 'Year query parameter is required' });
    }
    
    const summary = await expenseService.getTaxDeductibleYoYSummary(parseInt(year));
    res.status(200).json(summary);
  } catch (error) {
    logger.error('Error fetching tax-deductible YoY summary:', error);
    res.status(500).json({ error: 'Failed to retrieve tax-deductible summary' });
  }
}

/**
 * Get monthly gross income
 * GET /api/monthly-gross?year=2024&month=11
 */
async function getMonthlyGross(req, res) {
  try {
    const { year, month } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month query parameters are required' });
    }
    
    const grossAmount = await expenseService.getMonthlyGross(parseInt(year), parseInt(month));
    res.status(200).json({ 
      year: parseInt(year),
      month: parseInt(month),
      grossAmount: grossAmount || 0
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Set monthly gross income
 * POST /api/monthly-gross
 */
async function setMonthlyGross(req, res) {
  try {
    const { year, month, grossAmount } = req.body;
    
    if (!year || !month || grossAmount === undefined || grossAmount === null) {
      return res.status(400).json({ error: 'Year, month, and grossAmount are required' });
    }
    
    const result = await expenseService.setMonthlyGross(
      parseInt(year), 
      parseInt(month), 
      parseFloat(grossAmount)
    );
    
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Backup database
 * GET /api/backup
 * 
 * Creates a complete backup of the SQLite database including:
 * - expenses table (with recurring_id and is_generated fields)
 * - monthly_gross table
 * - recurring_expenses table
 */
async function backupDatabase(req, res) {
  try {
    // Check if database file exists
    if (!fs.existsSync(DB_PATH)) {
      return res.status(404).json({ error: 'Database file not found' });
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `expense-tracker-backup-${timestamp}.db`;

    // Set headers for file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream the database file (includes all tables: expenses, monthly_gross, recurring_expenses)
    const fileStream = fs.createReadStream(DB_PATH);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      logger.error('Error streaming database file:', error);
      res.status(500).json({ error: 'Failed to backup database' });
    });
  } catch (error) {
    logger.error('Backup error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get distinct place names
 * GET /api/expenses/places
 */
async function getDistinctPlaces(req, res) {
  try {
    const places = await expenseService.getDistinctPlaces();
    res.status(200).json(places);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get suggested category for a place
 * GET /api/expenses/suggest-category?place=Walmart
 * 
 * Returns suggestion with confidence and breakdown of all categories for the place.
 * Response format:
 * {
 *   "suggestion": { "category": "Groceries", "confidence": 0.85, "count": 17 },
 *   "breakdown": [{ "category": "Groceries", "count": 17, "lastUsed": "2025-11-25" }, ...]
 * }
 */
async function getSuggestedCategory(req, res) {
  try {
    const { place } = req.query;
    
    if (!place || place.trim() === '') {
      return res.status(400).json({ error: 'Place query parameter is required' });
    }
    
    const suggestion = await categorySuggestionService.getSuggestedCategory(place);
    const breakdown = await categorySuggestionService.getCategoryBreakdown(place);
    
    res.status(200).json({
      suggestion: suggestion,
      breakdown: breakdown
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Update insurance status for a medical expense (quick status update)
 * PATCH /api/expenses/:id/insurance-status
 * 
 * Allows quick status updates without opening the full edit form.
 * Supports transitions: not_claimed → in_progress → paid/denied
 * 
 * @param {Object} req.body - Request body
 * @param {string} req.body.status - New claim status ('not_claimed', 'in_progress', 'paid', 'denied')
 * 
 * _Requirements: 5.1, 5.2, 5.3, 5.4_
 */
async function updateInsuranceStatus(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid expense ID' });
    }
    
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    const updatedExpense = await expenseService.updateInsuranceStatus(id, status);
    
    if (!updatedExpense) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    res.status(200).json(updatedExpense);
  } catch (error) {
    // Handle specific validation errors with 400 status
    if (error.message.includes('Claim status must be one of') ||
        error.message.includes('Insurance fields are only valid') ||
        error.message.includes('not marked as insurance eligible')) {
      return res.status(400).json({ error: error.message });
    }
    
    logger.error('Error updating insurance status:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createExpense,
  getExpenses,
  getExpenseWithPeople,
  updateExpense,
  deleteExpense,
  getSummary,
  getAnnualSummary,
  getTaxDeductibleSummary,
  getTaxDeductibleYoYSummary,
  getMonthlyGross,
  setMonthlyGross,
  backupDatabase,
  getDistinctPlaces,
  getSuggestedCategory,
  updateInsuranceStatus
};
