const expenseService = require('../services/expenseService');
const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('../database/db');

/**
 * Create a new expense
 * POST /api/expenses
 */
async function createExpense(req, res) {
  try {
    const expenseData = req.body;
    const createdExpense = await expenseService.createExpense(expenseData);
    res.status(201).json(createdExpense);
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
 * Update an expense by ID
 * PUT /api/expenses/:id
 */
async function updateExpense(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid expense ID' });
    }
    
    const expenseData = req.body;
    const updatedExpense = await expenseService.updateExpense(id, expenseData);
    
    if (!updatedExpense) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    res.status(200).json(updatedExpense);
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
 * GET /api/expenses/summary?year=2024&month=11
 */
async function getSummary(req, res) {
  try {
    const { year, month } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month query parameters are required' });
    }
    
    const summary = await expenseService.getSummary(year, month);
    res.status(200).json(summary);
  } catch (error) {
    res.status(400).json({ error: error.message });
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

    // Stream the database file
    const fileStream = fs.createReadStream(DB_PATH);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming database file:', error);
      res.status(500).json({ error: 'Failed to backup database' });
    });
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createExpense,
  getExpenses,
  updateExpense,
  deleteExpense,
  getSummary,
  getMonthlyGross,
  setMonthlyGross,
  backupDatabase
};
