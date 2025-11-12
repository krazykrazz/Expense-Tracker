const incomeService = require('../services/incomeService');

/**
 * Get all income sources for a specific month
 * GET /api/income/:year/:month
 */
async function getMonthlyIncome(req, res) {
  try {
    const { year, month } = req.params;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month parameters are required' });
    }
    
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || isNaN(monthNum)) {
      return res.status(400).json({ error: 'Year and month must be valid numbers' });
    }
    
    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'Month must be between 1 and 12' });
    }
    
    const result = await incomeService.getMonthlyIncome(yearNum, monthNum);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Create a new income source
 * POST /api/income
 * Body: { year, month, name, amount }
 */
async function createIncomeSource(req, res) {
  try {
    const incomeData = req.body;
    
    if (!incomeData.year || !incomeData.month || !incomeData.name || incomeData.amount === undefined) {
      return res.status(400).json({ error: 'Year, month, name, and amount are required' });
    }
    
    const createdIncome = await incomeService.createIncomeSource(incomeData);
    res.status(201).json(createdIncome);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Update an income source by ID
 * PUT /api/income/:id
 * Body: { name, amount }
 */
async function updateIncomeSource(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid income source ID' });
    }
    
    const incomeData = req.body;
    
    if (!incomeData.name || incomeData.amount === undefined) {
      return res.status(400).json({ error: 'Name and amount are required' });
    }
    
    const updatedIncome = await incomeService.updateIncomeSource(id, incomeData);
    
    if (!updatedIncome) {
      return res.status(404).json({ error: 'Income source not found' });
    }
    
    res.status(200).json(updatedIncome);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Delete an income source by ID
 * DELETE /api/income/:id
 */
async function deleteIncomeSource(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid income source ID' });
    }
    
    const deleted = await incomeService.deleteIncomeSource(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Income source not found' });
    }
    
    res.status(200).json({ message: 'Income source deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Copy income sources from previous month
 * POST /api/income/:year/:month/copy-previous
 */
async function copyFromPreviousMonth(req, res) {
  try {
    const { year, month } = req.params;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month parameters are required' });
    }
    
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || isNaN(monthNum)) {
      return res.status(400).json({ error: 'Year and month must be valid numbers' });
    }
    
    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'Month must be between 1 and 12' });
    }
    
    const copiedSources = await incomeService.copyFromPreviousMonth(yearNum, monthNum);
    
    if (copiedSources.length === 0) {
      return res.status(404).json({ error: 'No income sources found in previous month to copy' });
    }
    
    res.status(201).json({
      message: `Copied ${copiedSources.length} income source(s) from previous month`,
      sources: copiedSources
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

module.exports = {
  getMonthlyIncome,
  createIncomeSource,
  updateIncomeSource,
  deleteIncomeSource,
  copyFromPreviousMonth
};
