const loanBalanceService = require('../services/loanBalanceService');

/**
 * Get balance history for a loan
 * GET /api/loan-balances/:loanId
 */
async function getBalanceHistory(req, res) {
  try {
    const loanId = parseInt(req.params.loanId);
    
    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const balanceHistory = await loanBalanceService.getBalanceHistory(loanId);
    res.status(200).json(balanceHistory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get balance entry for a specific month
 * GET /api/loan-balances/:loanId/:year/:month
 */
async function getBalanceForMonth(req, res) {
  try {
    const loanId = parseInt(req.params.loanId);
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    
    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    if (isNaN(year) || isNaN(month)) {
      return res.status(400).json({ error: 'Year and month must be valid numbers' });
    }
    
    if (month < 1 || month > 12) {
      return res.status(400).json({ error: 'Month must be between 1 and 12' });
    }
    
    const balanceEntry = await loanBalanceService.getBalanceForMonth(loanId, year, month);
    
    if (!balanceEntry) {
      return res.status(404).json({ error: 'Balance entry not found for specified month' });
    }
    
    res.status(200).json(balanceEntry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Create or update a balance entry
 * POST /api/loan-balances
 * Body: { loan_id, year, month, remaining_balance, rate }
 */
async function createOrUpdateBalance(req, res) {
  try {
    const balanceData = req.body;
    
    if (!balanceData.loan_id || !balanceData.year || !balanceData.month || 
        balanceData.remaining_balance === undefined || balanceData.rate === undefined) {
      return res.status(400).json({ 
        error: 'loan_id, year, month, remaining_balance, and rate are required' 
      });
    }
    
    const result = await loanBalanceService.createOrUpdateBalance(balanceData);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Update a balance entry by ID
 * PUT /api/loan-balances/:id
 * Body: { remaining_balance, rate }
 */
async function updateBalance(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid balance entry ID' });
    }
    
    const balanceData = req.body;
    
    if (balanceData.remaining_balance === undefined || balanceData.rate === undefined) {
      return res.status(400).json({ error: 'remaining_balance and rate are required' });
    }
    
    const updatedBalance = await loanBalanceService.updateBalance(id, balanceData);
    
    if (!updatedBalance) {
      return res.status(404).json({ error: 'Balance entry not found' });
    }
    
    res.status(200).json(updatedBalance);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Delete a balance entry by ID
 * DELETE /api/loan-balances/:id
 */
async function deleteBalance(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid balance entry ID' });
    }
    
    const deleted = await loanBalanceService.deleteBalance(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Balance entry not found' });
    }
    
    res.status(200).json({ message: 'Balance entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getBalanceHistory,
  getBalanceForMonth,
  createOrUpdateBalance,
  updateBalance,
  deleteBalance
};
